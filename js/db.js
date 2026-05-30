// IndexedDB-Zugriffsschicht für ICEkalt.
// Zwei Object-Stores: "ingredients" und "recipes".
// Rezeptbilder werden als Blob direkt im Datensatz (Feld "image") gespeichert.

const DB_NAME = 'icekalt';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('ingredients')) {
        const s = db.createObjectStore('ingredients', { keyPath: 'id', autoIncrement: true });
        s.createIndex('name', 'name', { unique: false });
        s.createIndex('category', 'category', { unique: false });
      }
      if (!db.objectStoreNames.contains('recipes')) {
        const s = db.createObjectStore('recipes', { keyPath: 'id', autoIncrement: true });
        s.createIndex('name', 'name', { unique: false });
        s.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        let result;
        Promise.resolve(fn(os)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  getAll(store) {
    return tx(store, 'readonly', (os) => reqToPromise(os.getAll()));
  },
  get(store, id) {
    return tx(store, 'readonly', (os) => reqToPromise(os.get(id)));
  },
  count(store) {
    return tx(store, 'readonly', (os) => reqToPromise(os.count()));
  },
  async put(store, value) {
    const now = Date.now();
    if (!value.createdAt) value.createdAt = now;
    value.updatedAt = now;
    return tx(store, 'readwrite', (os) => reqToPromise(os.put(value)));
  },
  remove(store, id) {
    return tx(store, 'readwrite', (os) => reqToPromise(os.delete(id)));
  },
  clear(store) {
    return tx(store, 'readwrite', (os) => reqToPromise(os.clear()));
  },
};

// ---- Beispieldaten beim ersten Start, damit die App nicht leer ist. ----
const SEED_INGREDIENTS = [
  // name, category, fat, sugars, msnf, otherSolids, pod, pac (alle Mengen in g)
  { name: 'Vollmilch 3,5%', category: 'Milchprodukte', fat: 3.5, sugars: 0, msnf: 9, otherSolids: 0, pod: 0, pac: 0 },
  { name: 'Milch 3,8%',     category: 'Milchprodukte', fat: 3.8, sugars: 0, msnf: 8.8, otherSolids: 0, pod: 0, pac: 0 },
  { name: 'Sahne 35%',      category: 'Milchprodukte', fat: 35,  sugars: 0, msnf: 5.5, otherSolids: 0, pod: 0, pac: 0 },
  { name: 'Sahne 30%',      category: 'Milchprodukte', fat: 30,  sugars: 0, msnf: 6.0, otherSolids: 0, pod: 0, pac: 0 },
  { name: 'Magermilchpulver', category: 'Milchprodukte', fat: 1, sugars: 0, msnf: 96, otherSolids: 0, pod: 0, pac: 0 },
  { name: 'Saccharose (Zucker)', category: 'Zucker', fat: 0, sugars: 100, msnf: 0, otherSolids: 0, pod: 100, pac: 100 },
  { name: 'Dextrose', category: 'Zucker', fat: 0, sugars: 100, msnf: 0, otherSolids: 0, pod: 70, pac: 190 },
  { name: 'Glukosesirup DE60', category: 'Zucker', fat: 0, sugars: 80, msnf: 0, otherSolids: 0, pod: 50, pac: 110 },
  { name: 'Glukose DE21 (atomisiert)', category: 'Zucker', fat: 0, sugars: 95, msnf: 0, otherSolids: 0, pod: 22, pac: 45 },
  { name: 'Eigelb', category: 'Sonstiges', fat: 31, sugars: 0, msnf: 0, otherSolids: 17, pod: 0, pac: 0 },
  { name: 'Johannisbrotkernmehl', category: 'Zusatzstoffe', fat: 0, sugars: 0, msnf: 0, otherSolids: 90, pod: 0, pac: 0 },
  { name: 'Guarkernmehl', category: 'Zusatzstoffe', fat: 0, sugars: 0, msnf: 0, otherSolids: 90, pod: 0, pac: 0 },
  { name: 'Inulin', category: 'Zusatzstoffe', fat: 0, sugars: 0, msnf: 0, otherSolids: 95, pod: 10, pac: 0 },
  { name: 'Salz', category: 'Sonstiges', fat: 0, sugars: 0, msnf: 0, otherSolids: 100, nacl: 100, pod: 0, pac: 0 },
  { name: 'Glycerin (E422)', category: 'Zusatzstoffe', fat: 0, sugars: 0, msnf: 0, otherSolids: 100, glycerol: 100, pod: 0, pac: 0 },
];

export async function seedIfEmpty() {
  const n = await db.count('ingredients');
  if (n > 0) return;
  for (const ing of SEED_INGREDIENTS) {
    await db.put('ingredients', { ...ing });
  }
}

// ---- Export / Import (Backup). Bilder werden als Base64 mitgesichert. ----
async function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportData() {
  const ingredients = await db.getAll('ingredients');
  const recipes = await db.getAll('recipes');
  for (const r of recipes) {
    if (r.image instanceof Blob) r.image = await blobToDataUrl(r.image);
  }
  return { version: 1, exportedAt: new Date().toISOString(), ingredients, recipes };
}

export async function importData(data, { replace = false } = {}) {
  if (!data || !Array.isArray(data.ingredients) || !Array.isArray(data.recipes)) {
    throw new Error('Ungültiges Backup-Format');
  }
  if (replace) {
    await db.clear('ingredients');
    await db.clear('recipes');
  }
  for (const ing of data.ingredients) {
    delete ing.id;
    await db.put('ingredients', ing);
  }
  for (const r of data.recipes) {
    delete r.id;
    if (typeof r.image === 'string' && r.image.startsWith('data:')) {
      r.image = await dataUrlToBlob(r.image);
    }
    await db.put('recipes', r);
  }
}
