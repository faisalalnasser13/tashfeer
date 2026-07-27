import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MSG_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);

// `npm run dev` with the emulators running picks them up automatically.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === "1") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/** Resolves once we have an anonymous session. Persists across reloads. */
export function ensureAuth(): Promise<User> {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (u) => {
        if (u) {
          stop();
          resolve(u);
        } else {
          signInAnonymously(auth).catch(reject);
        }
      },
      reject
    );
  });
}

// The game engine runs in the browser — see engine.ts. Re-exported here
// so every screen keeps importing `api` from the same place it always did.
export { api, errText } from "./engine";
