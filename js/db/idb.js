// Petite surcouche Promise d'IndexedDB (base « shot-timer »).

const DB_NAME = 'shot-timer';
const DB_VERSION = 1;
export const STORES = ['shooters', 'exercises', 'sessions', 'strings'];

let dbPromise = null;

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
  });
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const name of ['shooters', 'exercises', 'sessions']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('strings')) {
        const s = db.createObjectStore('strings', { keyPath: 'id' });
        s.createIndex('sessionId', 'sessionId');
        s.createIndex('shooterId', 'shooterId');
        s.createIndex('exerciseId', 'exerciseId');
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      // Une autre version de l'app ouverte demande une mise à jour : on libère la base.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Base bloquée : fermez les autres onglets de l\'app'));
  });
  return dbPromise;
}

export async function getAll(store) {
  const db = await openDB();
  return req(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, id) {
  const db = await openDB();
  return req(db.transaction(store).objectStore(store).get(id));
}

export async function getByIndex(store, index, value) {
  const db = await openDB();
  return req(db.transaction(store).objectStore(store).index(index).getAll(value));
}

export async function countByIndex(store, index, value) {
  const db = await openDB();
  return req(db.transaction(store).objectStore(store).index(index).count(value));
}

export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await done(tx);
  return value;
}

export async function del(store, id) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await done(tx);
}

// Remplace tout le contenu des stores donnés, en une seule transaction (tout ou rien).
export async function replaceAll(data) {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) {
    const os = tx.objectStore(name);
    os.clear();
    for (const item of data[name] || []) os.put(item);
  }
  await done(tx);
}

export async function dumpAll() {
  const out = {};
  for (const name of STORES) out[name] = await getAll(name);
  return out;
}
