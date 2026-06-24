// ===== db.js =====
const DB_NAME = "FieldScanOfflineDB";
const STORE_NAME = "syncQueue";
const SNAG_PHOTO_STORE = "snagPhotos";

let dbPromise = null;

function openQueueDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      if (!db.objectStoreNames.contains(SNAG_PHOTO_STORE))
        db.createObjectStore(SNAG_PHOTO_STORE, { keyPath: "snagId" });
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = (e) => {
      dbPromise = null;
      reject(e.target.error);
    };
  });
  return dbPromise;
}

async function queueOfflineRequest(action, data) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ action, data, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueuedRequests() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueuedRequest(id) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveSnagPhotosLocally(snagId, photoDataString) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAG_PHOTO_STORE, "readwrite");
    tx.objectStore(SNAG_PHOTO_STORE).put({
      snagId,
      photoData: photoDataString,
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getSnagPhotosLocally(snagId) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(SNAG_PHOTO_STORE, "readonly")
      .objectStore(SNAG_PHOTO_STORE)
      .get(snagId);
    req.onsuccess = () => resolve(req.result ? req.result.photoData : "");
    req.onerror = () => reject(req.error);
  });
}

async function deleteSnagPhotosLocally(snagId) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAG_PHOTO_STORE, "readwrite");
    tx.objectStore(SNAG_PHOTO_STORE).delete(snagId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}