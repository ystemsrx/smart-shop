import assert from "node:assert/strict";
import test from "node:test";

import { getPassiveSsoFrameResult } from "../../utils/passiveSso.mjs";

const SHOP_ORIGIN = "https://shop.example.test";

test("ignores identity-provider and invalid frame URLs", () => {
  assert.equal(
    getPassiveSsoFrameResult(
      "https://auth.example.test/realms/shop/login",
      SHOP_ORIGIN,
    ),
    null,
  );
  assert.equal(getPassiveSsoFrameResult("about:blank", SHOP_ORIGIN), null);
});

test("finishes without redirect when passive SSO finds no session", () => {
  assert.deepEqual(
    getPassiveSsoFrameResult(
      "https://shop.example.test/login?sso_checked=1&redirect=%2Fc",
      SHOP_ORIGIN,
    ),
    { status: "anonymous" },
  );
  assert.deepEqual(
    getPassiveSsoFrameResult(
      "https://shop.example.test/login?oidc_error=1",
      SHOP_ORIGIN,
    ),
    { status: "anonymous" },
  );
});

test("does not accept an unmarked login page as a completed probe", () => {
  assert.equal(
    getPassiveSsoFrameResult("https://shop.example.test/login", SHOP_ORIGIN),
    null,
  );
});

test("returns the same-origin target after passive SSO succeeds", () => {
  assert.deepEqual(
    getPassiveSsoFrameResult(
      "https://shop.example.test/c/thread-1?source=sso#latest",
      SHOP_ORIGIN,
    ),
    {
      status: "authenticated",
      redirect: "/c/thread-1?source=sso#latest",
    },
  );
});
