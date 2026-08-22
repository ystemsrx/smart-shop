import assert from "node:assert/strict";
import test from "node:test";

import {
  SSO_SUPPRESSION_STORAGE_KEY,
  consumePassiveSsoSuppression,
  suppressNextPassiveSso,
} from "../../utils/ssoSuppression.mjs";

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
};

test("logout suppression is consumed exactly once", () => {
  const storage = createStorage();

  assert.equal(suppressNextPassiveSso(storage), true);
  assert.equal(storage.getItem(SSO_SUPPRESSION_STORAGE_KEY), "1");
  assert.equal(consumePassiveSsoSuppression(storage), true);
  assert.equal(storage.getItem(SSO_SUPPRESSION_STORAGE_KEY), null);
  assert.equal(consumePassiveSsoSuppression(storage), false);
});

test("unavailable browser storage leaves passive SSO enabled", () => {
  assert.equal(suppressNextPassiveSso(null), false);
  assert.equal(consumePassiveSsoSuppression(null), false);
});
