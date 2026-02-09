const DEVICE_ID_STORAGE_KEY = 'lazy_shop_device_id_v1';

function createRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 32; i += 1) {
    result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return result;
}

export function getDeviceId() {
  if (typeof window === 'undefined') return '';
  try {
    const cached = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (cached && /^[A-Za-z0-9_-]{16,128}$/.test(cached)) {
      return cached;
    }
    const nextId = createRandomId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch (_err) {
    return '';
  }
}

