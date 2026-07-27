/** Stand-in for src/lib/firebase.ts when the engine runs under the sim. */
const fs = require("./firestore.cjs");

const db = fs.getFirestore();
const auth = {
  get currentUser() {
    const uid = fs.__getUser();
    return uid ? { uid } : null;
  },
};

module.exports = { db, auth, app: {}, ensureAuth: async () => auth.currentUser };
