/**
 * In-memory Firestore stub for the game simulator.
 * Rejects a tx.get() after any write — same constraint as real Firestore.
 */

const store = new Map();
let currentUid = null;

class FieldValue {
  constructor(kind, payload) {
    this._kind = kind;
    this._payload = payload;
  }
}

function deleteField() {
  return new FieldValue("delete");
}
function arrayUnion(...values) {
  return new FieldValue("arrayUnion", values);
}
function increment(n) {
  return new FieldValue("increment", n);
}

function pathOf(ref) {
  return ref._path;
}

function deepClone(v) {
  if (v == null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(deepClone);
  const out = {};
  for (const [k, val] of Object.entries(v)) out[k] = deepClone(val);
  return out;
}

function applyUpdate(target, data) {
  for (const [key, val] of Object.entries(data)) {
    if (key.includes(".")) {
      const parts = key.split(".");
      let cur = target;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
        cur = cur[p];
      }
      const last = parts[parts.length - 1];
      if (val instanceof FieldValue && val._kind === "delete") delete cur[last];
      else cur[last] = resolveField(cur[last], val);
    } else if (val instanceof FieldValue && val._kind === "delete") {
      delete target[key];
    } else {
      target[key] = resolveField(target[key], val);
    }
  }
}

function resolveField(prev, val) {
  if (!(val instanceof FieldValue)) return deepClone(val);
  if (val._kind === "arrayUnion") {
    const base = Array.isArray(prev) ? [...prev] : [];
    for (const v of val._payload) {
      if (!base.includes(v)) base.push(v);
    }
    return base;
  }
  if (val._kind === "increment") {
    return (typeof prev === "number" ? prev : 0) + val._payload;
  }
  if (val._kind === "delete") return undefined;
  return deepClone(val);
}

function makeSnap(ref) {
  const path = pathOf(ref);
  const data = store.get(path);
  return {
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : data),
    id: path.split("/").pop(),
    ref,
  };
}

function DocRef(path) {
  return { _path: path, id: path.split("/").pop(), path };
}

function ColRef(path) {
  return { _path: path, _collection: true };
}

function doc(_db, ...segments) {
  if (segments.length === 1 && typeof segments[0] === "string" && segments[0].includes("/")) {
    return DocRef(segments[0]);
  }
  // doc(db, col, id) or doc(db, col, id, sub, id2, ...)
  // also doc(collectionRef, id)
  if (segments[0] && segments[0]._collection) {
    return DocRef(`${segments[0]._path}/${segments[1]}`);
  }
  return DocRef(segments.join("/"));
}

function collection(_db, ...segments) {
  if (segments[0] && segments[0]._path && !segments[0]._collection) {
    // collection(docRef, name)
    return ColRef(`${segments[0]._path}/${segments[1]}`);
  }
  return ColRef(segments.join("/"));
}

async function getDoc(ref) {
  return makeSnap(ref);
}

async function getDocs(colRef) {
  const prefix = colRef._path + "/";
  const docs = [];
  for (const [k, v] of store.entries()) {
    if (!k.startsWith(prefix)) continue;
    const rest = k.slice(prefix.length);
    if (rest.includes("/")) continue; // only immediate children
    const ref = DocRef(k);
    docs.push({
      id: rest,
      data: () => v,
      ref,
      exists: () => true,
    });
  }
  return { docs, empty: docs.length === 0, size: docs.length };
}

async function deleteDoc(ref) {
  store.delete(pathOf(ref));
}

async function setDoc(ref, data, opts = {}) {
  const path = pathOf(ref);
  if (opts.merge && store.has(path)) {
    const cur = store.get(path);
    applyUpdate(cur, data);
  } else {
    store.set(path, deepClone(data));
  }
}

async function updateDoc(ref, data) {
  const path = pathOf(ref);
  if (!store.has(path)) throw new Error(`No document to update: ${path}`);
  applyUpdate(store.get(path), data);
}

class Transaction {
  constructor() {
    this._written = false;
    this._ops = [];
  }
  async get(ref) {
    if (this._written) {
      throw new Error("TRANSACTION ORDER VIOLATION: read after write");
    }
    return makeSnap(ref);
  }
  set(ref, data, opts = {}) {
    this._written = true;
    this._ops.push({ type: "set", ref, data, opts });
  }
  update(ref, data) {
    this._written = true;
    this._ops.push({ type: "update", ref, data });
  }
  delete(ref) {
    this._written = true;
    this._ops.push({ type: "delete", ref });
  }
  async _commit() {
    for (const op of this._ops) {
      if (op.type === "set") {
        const path = pathOf(op.ref);
        if (op.opts.merge && store.has(path)) applyUpdate(store.get(path), op.data);
        else store.set(path, deepClone(op.data));
      } else if (op.type === "update") {
        const path = pathOf(op.ref);
        if (!store.has(path)) throw new Error(`No document to update: ${path}`);
        applyUpdate(store.get(path), op.data);
      } else if (op.type === "delete") {
        store.delete(pathOf(op.ref));
      }
    }
  }
}

async function runTransaction(_db, fn) {
  // Retry a few times like Firestore; our stub is single-threaded so once is enough.
  const tx = new Transaction();
  const result = await fn(tx);
  await tx._commit();
  return result;
}

function writeBatch(_db) {
  const ops = [];
  return {
    set(ref, data, opts = {}) {
      ops.push({ type: "set", ref, data, opts });
      return this;
    },
    update(ref, data) {
      ops.push({ type: "update", ref, data });
      return this;
    },
    delete(ref) {
      ops.push({ type: "delete", ref });
      return this;
    },
    async commit() {
      for (const op of ops) {
        if (op.type === "set") {
          const path = pathOf(op.ref);
          if (op.opts.merge && store.has(path)) applyUpdate(store.get(path), op.data);
          else store.set(path, deepClone(op.data));
        } else if (op.type === "update") {
          const path = pathOf(op.ref);
          if (!store.has(path)) throw new Error(`No document to update: ${path}`);
          applyUpdate(store.get(path), op.data);
        } else if (op.type === "delete") {
          store.delete(pathOf(op.ref));
        }
      }
    },
  };
}

function getFirestore() {
  return { _stub: true };
}

function __setUser(uid) {
  currentUid = uid;
}
function __getUser() {
  return currentUid;
}
function __reset() {
  store.clear();
  currentUid = null;
}

module.exports = {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  writeBatch,
  getFirestore,
  deleteField,
  arrayUnion,
  increment,
  __setUser,
  __getUser,
  __reset,
  __store: store,
};
