import { resolveImageUrl } from './urls';

const DB_NAME = 'smart-shop-images';
const STORE_NAME = 'productImages';
const DB_VERSION = 1;

// 获取原始图片URL（不包括cached_image_url，避免获取到blob URL）
function getOriginalImageUrl(product) {
  if (!product) return '';
  const src =
    product.image_url ||
    product.img_url ||
    product.image ||
    product.imgPath ||
    product.img_path ||
    '';
  return resolveImageUrl(src);
}

const isClient = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

function openDatabase() {
  if (!isClient) return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'productId' });
        store.createIndex('hash', 'hash', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function runRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getRecord(db, productId) {
  if (!db) return null;
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return runRequest(store.get(productId)).catch(() => null);
}

async function saveRecord(db, record) {
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(record);
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function pruneMissingProducts(db, validIds) {
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const cursorRequest = store.openCursor();

  cursorRequest.onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) return;
    if (!validIds.has(cursor.primaryKey)) {
      cursor.delete();
    }
    cursor.continue();
  };

  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function getImageHash(product = {}) {
  // 优先使用服务器提供的图片哈希
  const serverHash = product.image_hash || product.img_hash || product.imageHash;
  if (serverHash) return serverHash;
  
  // 如果没有服务器哈希，使用图片路径生成一个简单的哈希作为缓存key
  // 这样即使旧数据没有哈希也能缓存，图片路径变化时会更新缓存
  const imgPath = product.img_path || '';
  if (imgPath) {
    // 简单的字符串哈希：路径+更新时间(如果有)
    const updateTime = product.updated_at || '';
    return `path:${imgPath}:${updateTime}`;
  }
  
  return '';
}

export async function syncProductImageCache(products = []) {
  if (!isClient) return { urls: {} };

  const db = await openDatabase();
  if (!db) return { urls: {} };

  const productIds = new Set(products.map((p) => p.id).filter(Boolean));
  await pruneMissingProducts(db, productIds);

  const urls = {};

  for (const product of products) {
    const productId = product.id;
    const hash = getImageHash(product);
    const imageUrl = getOriginalImageUrl(product);

    if (!productId || !hash || !imageUrl) continue;

    try {
      const existing = await getRecord(db, productId);
      if (existing && existing.hash === hash && existing.blob) {
        urls[productId] = URL.createObjectURL(existing.blob);
        continue;
      }

      const response = await fetch(imageUrl, { credentials: 'include' });
      if (!response.ok) throw new Error(`图片获取失败: ${response.status}`);
      const blob = await response.blob();

      await saveRecord(db, {
        productId,
        hash,
        blob,
        storedAt: Date.now(),
        imageUrl,
      });

      urls[productId] = URL.createObjectURL(blob);
    } catch (err) {
      console.error('同步图片缓存失败', err);
    }
  }

  return { urls };
}
