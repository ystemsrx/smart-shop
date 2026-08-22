export const SSO_SUPPRESSION_STORAGE_KEY =
  "smart-shop:skip-passive-sso-once";

const getSessionStorage = () => {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch (_err) {
    return null;
  }
};

export const suppressNextPassiveSso = (storage = getSessionStorage()) => {
  if (!storage) return false;

  try {
    storage.setItem(SSO_SUPPRESSION_STORAGE_KEY, "1");
    return true;
  } catch (_err) {
    return false;
  }
};

export const consumePassiveSsoSuppression = (
  storage = getSessionStorage(),
) => {
  if (!storage) return false;

  try {
    const suppressed = storage.getItem(SSO_SUPPRESSION_STORAGE_KEY) === "1";
    if (suppressed) {
      storage.removeItem(SSO_SUPPRESSION_STORAGE_KEY);
    }
    return suppressed;
  } catch (_err) {
    return false;
  }
};
