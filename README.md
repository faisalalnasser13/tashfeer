# تشفير — Tashfeer

An Arabic online adaptation of **Decrypto** (Le Scorpion Masqué), built for phones.
Two teams, four secret keywords each, eight rounds. Get your code across to your
own team without the other side catching it.

---

## Running it

You need a Firebase project on the **Blaze** plan (Cloud Functions require it).

```bash
# 1. client
npm install
cp .env.example .env      # fill in from Firebase console → Project settings

# 2. functions
cd functions && npm install && npm run build && cd ..

# 3. Firebase
firebase login
firebase use --add        # pick your project
firebase deploy           # rules + functions + hosting
```

Local development:

```bash
firebase emulators:start          # terminal 1
VITE_USE_EMULATOR=1 npm run dev   # terminal 2
```

In the Firebase console, enable **Anonymous** sign-in under Authentication →
Sign-in method. Nothing else is required — there are no accounts, no passwords.

### Tests

```bash
npm test                # 36 assertions + 300 simulated games
npm run test:contention # what happens when teammates disagree
npm run test:rules      # security rules, needs the emulator
```

**`test/sim/`** compiles the *real* engine against a stubbed Firebase web SDK
(`test/sim/stubs/`) and plays complete games end to end — no emulator, no
network. `node test/sim/run.mjs` handles the compile step. The fake transaction deliberately rejects a read that happens after a
write, which is how the original `dealRound` bug was caught: it failed on 100% of
games at the first round transition.

`sim.js` plays 300 games across eight configurations (accurate teams, sloppy
teams, silent encryptors, 4-a-side, the readiness path, short games) and asserts:
codes are valid permutations that never repeat, the encryptor rotates, round 1
never awards an interception, a silent encryptor always costs their own team and
can never be intercepted, final scores reconcile against the round log, and the
declared winner matches the rules engine.

`contention.mjs` covers the shared draft, which is where every
disagreement funnels: a tug-of-war never produces a duplicated digit, one
team's argument is invisible to the other, sending freezes the numbers, a
second tap doesn't steal credit from the first sender, and an edit landing
after the deadline can't rewrite the result. It also checks that guess
sheets survive the round boundary and stay inside one team.

`rules.mjs` covers the specific edges: keyword-as-clue is blocked even with a
definite article prefix, respelled repeats are caught by normalisation, stale
`advancePhase` calls are ignored rather than replayed, and a half-ready table
doesn't advance.

**`test/rules.test.mjs`** needs the Firestore emulator and covers `firestore.rules`
— the file where a mistake is invisible in the UI while the opposing team reads
your keywords out of the browser console. Run it before every deploy that touches
the rules:

```bash
npm i -D @firebase/rules-unit-testing
npm run test:rules
```

---

## Trust model

There are **no Cloud Functions**. The whole engine runs in the browser
(`src/lib/engine.ts`), which is what keeps this on Firebase's free Spark
plan — no billing account, no card.

The cost is that a player's browser deals the cards. Concretely:

- The **host's device** picks all eight keywords at the start. It never
  displays the opposing team's four, but a host who opens devtools during
  the deal could read them.
- Each round's **encryptor draws their own code** on their own device, so
  no other browser — not even the host's — ever holds it.
- **Scoring reads both codes**, so any player's device can read the
  opponent's code for the current round if they go looking in devtools.

What the rules still enforce, because it costs nothing:

- only signed-in players who are in a room can read anything at all
- a team's four keywords are unreadable to the other team through the SDK
- the final eight-word reveal sits in `final/keys`, which rules refuse to
  serve until `phase == 'over'`

What is **not** enforced any more: the encryptor being locked out of their
own team's decryption. That is now a UI guard only.

None of this leaks into anyone's face during normal play. It all requires
someone deliberately opening a console mid-game. For a group of friends
that is the right trade; if you ever want it airtight, the engine is
already written as pure transactions and would port to a serverless
function with the transport layer swapped.

## Correctness is still enforced

Cheating is a social problem; **races are a bug**. Four phones trying to
score the same round would double-award tokens. Every state change is a
Firestore transaction with an idempotency guard — it re-reads the room and
bails if someone already advanced — so the first caller wins and the rest
are no-ops. The test suite covers this directly.

## How the data is laid out

Firestore rules are **per document, not per field**. That single fact determines
the entire schema. If both teams' keywords lived in the room document, any player
could read the opponent's words with the SDK regardless of what the UI renders.

```
rooms/{roomId}                    public state — phase, round, scores,
                                  published clues, players. No secrets.
      /final/keys                 all 8 keywords, sealed until phase=='over'
      /private/{team}             the team's 4 keywords + used clues
                                  read: members of that team only
      /secret/{team}_r{n}         that round's code
                                  read: that round's encryptor only
      /secret/deck_{team}         upcoming codes — readable by nobody
      /drafts/{team}_r{n}         the shared live draft
                                  read/write: members of that team
      /rounds/{n}                 finished round record, public to the table
      /away/{n}_{uid}             who left the screen
```

Clients write to all of these — see the trust model above.

---

## The round loop

```
lobby → keys → encrypt → guess → reveal → roundEnd ─┐
                  ↑                                  │
                  └──────────────────────────────────┘
                                                  → over
```

Both teams do everything **simultaneously** — both encryptors write at once, both
clue sets publish at once, everyone decrypts and intercepts at once, both reveal
together. The physical game resolves one team fully before the other; doing that
online leaves half the table watching a spinner twice a round.

**Round 1 has no interception.** That's the official rule — there are no prior
clues to reason from — and the tab is disabled with an explanation.

### Scoring

- **اختراق** — you read the opponent's code correctly. Two of these wins.
- **خلل** — your own team misread you. Two of these loses.

Your team understanding you earns nothing; it only avoids the penalty. That
asymmetry is the whole game.

Tangled endings (both teams decisive at once, a team both winning and losing, or
the round limit) fall through to points, `اختراق − خلل`. A points tie starts
**sudden death** rounds until someone pulls ahead, capped at four extra rounds.

### Submitting

Anyone on the team can move the numbers, and **anyone can send**. There is
no confirmation round and no per-player ready flag: the first tap ends the
team's turn and freezes the numbers. Arguing about whether you're ready is
a conversation to have out loud, not a mechanic to model.

The send button stays disabled until every slot is filled, which is the
only guard against a mis-tap. Once both teams have sent, the phase
advances immediately rather than waiting out the clock.

### Guess sheets

Each player keeps a running theory about the opponent's four words at
`rooms/{id}/guesses/{uid}` — their own to edit, readable by their whole
team, and kept for the entire game rather than reset each round.

They surface on the opponent's grid in the intercept tab. Collapsed, a
lane shows your own theory as its heading, with **متفقون** if everyone who
wrote something wrote the same thing, or a count of how many distinct
opinions exist if not. Tapping the lane opens your input and lists your
teammates' guesses by name. That keeps the useful signal — my theory, does
the team agree — visible at a glance without spending four lanes' worth of
space on names.

### Timers

`phaseEndsAt` is an absolute server timestamp. Clients count down against it, so a
backgrounded phone catches up instantly instead of drifting further behind every
round. When the clock runs out, the **host fires immediately and everyone else
fires two seconds later as a backstop** — a locked host phone can't freeze the
table. The server ignores duplicates. Phases can also end early once everyone is
ready, which is what moves the game along when the timer is switched off.

---

## Arabic notes

**Ordered sequences are the main hazard.** A code is first-second-third, and in
RTL the first slot belongs on the right. Nothing in the code flips anything —
document order is the truth and `dir="rtl"` does the rest — but every slot also
prints its ordinal (الأول / الثاني / الثالث), so a stray `flex-row-reverse` can't
silently invert the game.

**Normalisation** (`src/lib/arabic.ts`) strips tashkeel and folds أ إ آ → ا,
ة → ه, ى → ي before comparing clues. Without it "الأسد" and "الاسد" read as
different strings and every duplicate check fails.

**Digits** are always 0–9. Arabic-Indic numerals (٠١٢٣٤) are not offered:
they read as decorative in a game where a misread digit costs the round,
and usage splits regionally.

**Keywords** live in `functions/src/words.ts` — about 300 concrete, pan-Arab MSA
nouns. The curation rules are documented at the top of that file. Keep them if
you extend it: abstract words make clueing miserable.

---

## On the anti-cheat display

`useAwayTracker` records leaving the page during the encrypt and guess phases —
tab switch, app switch, screen lock — and shows a per-round tally to everyone.

**Screenshots are not detectable from a web page.** No browser exposes an event
for them; that API exists only in native iOS and Android apps. What this tracks
is the thing that's both detectable and the actual cheating route, since looking
a word up means leaving the page. A phone notification will trip it too, so
durations are shown alongside counts and the copy stays teasing rather than
accusatory.

---

## Deliberately not handled

Per the brief:

- **Mid-game disconnects.** A player who leaves is simply gone; the table decides
  whether to restart or end. Whatever is in the draft at timeout is submitted, and
  a missing clue set is an automatic خلل.
- **Illegal clues** (spelling hints, letter counts, positions). Unautomatable —
  left to the players.
- **Three-player games.** The official variant is a different game. Two per team
  is enforced server-side.

---

Adapted from Decrypto, designed by Thomas Dagenais-Lespérance, published by
Le Scorpion Masqué. This is a fan implementation of the rules, not affiliated.
