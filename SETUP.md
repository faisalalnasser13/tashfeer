# Firebase setup

Everything here runs on the **free Spark plan**. No card, no billing account,
no Cloud Functions. Should take about ten minutes.

---

## 1. Create the project

Go to <https://console.firebase.google.com> → **Add project**.

Or reuse an existing one — this needs only Firestore, Auth, and Hosting, all
of which are free.

- Name it anything (`tashfeer`, `tashfeer-prod`).
- Google Analytics: **off**. You don't need it and it adds a consent surface.

## 2. Turn on anonymous sign-in

Console → **Build** → **Authentication** → **Get started** → **Sign-in method**
→ **Anonymous** → enable → save.

There are no accounts or passwords in this game. Every player gets an anonymous
uid persisted in `localStorage`, which is what lets a refresh drop you back into
your seat instead of kicking you out.

Skip this and the app hangs on a loading dot forever.

## 3. Create Firestore

Console → **Build** → **Firestore Database** → **Create database**.

- **Production mode** (locks everything down; our rules file opens exactly what's
  needed and nothing more).
- **Location**: pick the region closest to your players. `europe-west1` for
  Europe/North Africa, `me-central1` or `europe-west1` for the Gulf,
  `us-central1` for the Americas.

This choice is **permanent** — you can't move a Firestore database later without
recreating the project. Worth ten seconds of thought.

## 4. Register a web app

Console → **Project overview** → the **`</>`** icon → nickname `web` → register.
Do **not** tick Firebase Hosting there; the CLI handles it.

You'll get a config block. Copy the six values into a new `.env` file at the
project root:

```
VITE_FB_API_KEY=AIza...
VITE_FB_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FB_PROJECT_ID=your-project
VITE_FB_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FB_MSG_SENDER_ID=123456789
VITE_FB_APP_ID=1:123456789:web:abc123
```

There's a template at `.env.example`.

> These six values are **not secrets**. They ship inside every web bundle and
> are visible to anyone who opens devtools. What protects your data is
> `firestore.rules`, not key secrecy. (A *service account JSON* is a different
> thing entirely — never commit or share one of those.)

## 5. Install and deploy

```bash
npm install -g firebase-tools
firebase login
cd tashfeer

npm install
firebase use --add          # pick your project, alias it "default"
```

Deploy in this order, checking each step:

```bash
firebase deploy --only firestore:rules   # rules first
npm run build
firebase deploy --only hosting
```

Your game is at `https://your-project.web.app`.

## 6. First run

Open it on two phones, or one phone and a desktop browser in a private window
(two anonymous sessions). You need **four players minimum**, two per team — the
server refuses to start otherwise.

On a phone, use the browser's **Add to Home Screen**. The manifest makes it
launch full-screen with no address bar.

---

## Local development

```bash
firebase emulators:start              # terminal 1
VITE_USE_EMULATOR=1 npm run dev       # terminal 2
```

Then open `http://<your-lan-ip>:5173` on your phone — Vite is configured with
`host: true` so it's reachable from the network. No deploys needed to iterate.

---

## When it breaks

| Symptom | Cause |
|---|---|
| Stuck on a loading dot | Anonymous sign-in not enabled (step 3) |
| `permission-denied` reading anything | Rules not deployed — run step 7.1 |
| Room code works but keywords never load | Rules deployed but `private/{team}` denied; run `npm run test:rules` |
| Blank page after hosting deploy | Deployed without `npm run build`, so `dist/` was stale |
| `permission-denied` on `final/keys` | Expected before the game ends — the reveal is sealed until then |

For anything else, the browser console shows the error — the whole engine runs
there, so there are no server logs to hunt through.

---

## What I can and can't do from here

I have **no network access to Google's servers**, so I can't reach your project,
deploy anything, or run the emulators. That's a hard limit, not a preference.

What actually works well: you run the commands, and when something fails you
paste back the terminal output or the browser console error. Those tell me exactly what's wrong and I fix the code. Every
failure mode in the table above is diagnosable from output alone.

Safe to paste: the six `VITE_FB_*` values, terminal output, function logs,
console errors, screenshots.

**Never paste**: a service account JSON, anything from
`Project settings → Service accounts → Generate new private key`, or an OAuth
refresh token. None of those are needed for any of this.
