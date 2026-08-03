# AGENTS.md

Instructions for AI coding agents working on this repo. Read this before
changing anything.

*(Cursor also reads `.cursorrules` and `.cursor/rules/*.mdc`. This file is the
single source of truth — if you create either of those, point them here.)*

---

## What this is

**تشفير** — an Arabic online adaptation of the board game Decrypto, phone-first.
Two teams of 2–4. Each team has four secret keywords numbered 1–4. Each round an
"encryptor" gets a 3-digit code and writes three clues pointing at their own
team's keywords. Their team tries to read it; the other team tries to intercept.

Stack: React 18 + Vite + TypeScript + Tailwind, Firebase (Firestore + anonymous
Auth + Hosting). **No backend.** The game engine runs in the browser.

---

## Hard constraints — do not violate without asking the user

### 1. No Cloud Functions. Ever.

This project deliberately has no server. Cloud Functions require Firebase's Blaze
plan, which requires a credit card; the user chose to stay on the free Spark
plan. The engine was ported from Cloud Functions into `src/lib/engine.ts`.

**Do not** suggest, scaffold, or add a `functions/` directory. If something seems
to need a server, it doesn't — read `src/lib/engine.ts` to see how it's done in a
transaction instead.

### 2. Every state change is a Firestore transaction with an idempotency guard

Four phones race to end the same phase. Without the guard, the round scores
twice and the game breaks. The pattern in `advancePhase`:

```ts
if (fromPhase && (room.phase !== fromPhase || room.round !== fromRound)) return;
```

The caller says what it thinks it's advancing *from*. If someone already
advanced, this is a no-op. **Never remove this.** Never replace a transaction
with a plain `updateDoc` in the phase machine.

### 3. Reads before writes inside a transaction

Firestore rejects a `tx.get()` that happens after any `tx.set()`/`tx.update()`.
This already caused one total-failure bug — `dealRound` looped
`get → set` per team and every game died at the first round transition.

If you add a transaction, gather **all** reads first, then write.

### 4. RTL ordering is load-bearing

A code is *ordered*: first, second, third. Under `dir="rtl"` the first slot is on
the **right**. Nothing in the codebase flips anything — DOM order is the truth
and `dir="rtl"` does the rest.

- **Never** add `flex-row-reverse` or `space-x-reverse` to the cartouche.
- Use logical CSS properties only: `ms-`/`me-`/`ps-`/`pe-`, `inset-inline-start`.
  Never `ml-`/`mr-`/`left`/`right`.
- Every slot prints its ordinal (`الأول`/`الثاني`/`الثالث`) via `data-ord`.
  Keep it — it's the guard against a silent inversion.

### 5. Digits are always 0–9

Arabic-Indic numerals (٠١٢٣٤) were explicitly rejected by the user. There is no
setting. Don't reintroduce one.

### 6. Arabic text comparison must be normalised

`src/lib/arabic.ts` strips tashkeel and folds أ إ آ → ا, ة → ه, ى → ي. Without it
"الأسد" and "الاسد" compare as different strings and every duplicate-clue check
silently passes. Any new text comparison goes through `normalizeAr` or
`normalizeKey`.

### 7. Don't "fix" the trust model

A player's browser deals the cards. The host's device sees all eight keywords at
deal time; any player can read the current round's code from devtools. **This is
intentional** — see the Trust model section of `README.md`. The user was asked
and said cheating doesn't matter for a game among friends.

Do not add encryption, obfuscation, or server-side dealing to "fix" it.

---

## Deploying

The user has a Firebase project already. Full walkthrough in `SETUP.md`.

```bash
npm install
cp .env.example .env          # user fills in six VITE_FB_* values

firebase login
firebase use --add            # pick the project

firebase deploy --only firestore:rules
npm run build
firebase deploy --only hosting
```

**Prerequisites the user must do in the console (you cannot):**

1. **Authentication → Sign-in method → Anonymous → enable.** Without this the app
   hangs on a loading dot forever with no error. This is the single most common
   setup failure.
2. **Firestore Database → Create** (production mode). The region choice is
   permanent.

---

## Testing

```bash
npm test              # 36 assertions + 300 simulated games, ~30s
npm run test:sim      # simulator only
npm run test:units    # rule edge cases
npm run test:contention  # teammates fighting over one submission
```

`test/sim/run.mjs` compiles `src/lib/{engine,rules,words,arabic}.ts` to CommonJS
against a stubbed Firebase web SDK in `test/sim/stubs/`, then runs the harness.
No emulator, no network.

The stub deliberately throws on a read-after-write inside a transaction. There's
a negative-control test proving that detector fires, so "all invariants held"
actually means something.

**Run `npm test` after any change to `src/lib/engine.ts` or `src/lib/rules.ts`.**

### One suite is known-stale

`test/rules.test.mjs` tests `firestore.rules` against the Firestore emulator. It
was written against the older, stricter server-side rules. Several assertions
**will fail** now, correctly — the rules are deliberately permissive because
clients do the writing.

Don't delete it. Update it to match the current rules, keeping these three
assertions, which are still true and still matter:

- a team's keywords are unreadable to the other team
- `final/keys` is unreadable until `room.phase == 'over'`
- non-members can't read the room at all

---

## Layout of the code

```
src/lib/engine.ts     the game engine — every state transition
src/lib/rules.ts      pure logic: codes, scoring, win/lose/tiebreak. No Firebase.
src/lib/hooks.ts      live Firestore subscriptions, countdown, phase driver
src/lib/arabic.ts     normalisation + ordinal labels
src/lib/words.ts      ~300 curated Arabic keywords
src/screens/          Home, Lobby, Game (shell), phases, tabs
src/components/       Header, KeysStrip, Cartouche, ClueGrid, ui
firestore.rules       what's still enforced at the database layer
prototype.html        clickable mock of all 16 views — the design reference
```

`src/lib/rules.ts` has zero Firebase imports on purpose. Keep it that way; it's
what makes the 300-game simulator possible.

---

## Things that will look like bugs but aren't

| Looks wrong | Why it's right |
|---|---|
| No interception in round 1 | Official rule — no prior clues to reason from |
| Your team guessing correctly earns nothing | Correct. It only avoids the penalty. That asymmetry is the game |
| The encryptor can hit "send" but can't touch the decrypt slots | Intended. They're locked out of decrypting, not out of ending the turn |
| Any single teammate can submit for the whole team | Explicit user decision — arguing happens out loud, not in the UI |
| Games sometimes run past round 8 | Sudden death on a points tie, capped at maxRounds + 4 |
| `permission-denied` reading `final/keys` mid-game | Correct. Sealed until the game ends |
| The `away` counter fires when a phone notification appears | Known. Durations are shown so a 2s blip reads differently from 40s |

---

## Known gaps

- **No screen has ever been rendered from the actual React.** Everything
  typechecks and the engine is heavily tested, but expect spacing to need nudging
  on a real device. The sticky offsets in `GuessPhase` assume the keys strip is
  collapsed.
- **`public/manifest.webmanifest` has an empty `icons` array.** Add PWA icons.
- **`test/rules.test.mjs` is stale** — see above.
- **Mid-game disconnects are deliberately unhandled.** A player who leaves is
  gone; the table restarts or ends. Don't build reconnection logic without
  asking.

---

## Style

Match what's there. Tailwind utilities inline, no CSS modules. Arabic strings
live inline in the components, not in a translation layer — there's one language.
Comments explain *why*, not *what*, and there are few of them; the ones that
exist mark decisions that would otherwise look arbitrary. Keep that ratio.
