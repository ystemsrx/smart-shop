import sys
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import auth  # noqa: E402


def oidc_settings():
    return replace(
        auth.settings,
        oidc_issuer="https://auth.example.test/realms/lazycampus",
        oidc_client_id="smart-shop",
        oidc_client_secret="client-secret",
        oidc_redirect_uri="https://api.example.test/auth/oidc/callback",
        oidc_frontend_url="https://shop.example.test",
        oidc_admin_role="smart-shop-admin",
        oidc_admin_username="local-admin",
    )


class OidcAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_authorization_uses_pkce_and_cookie_bound_state(self):
        metadata = {"authorization_endpoint": "https://idp.example.test/auth"}
        with (
            patch.object(auth, "settings", oidc_settings()),
            patch.object(auth, "_get_oidc_metadata", AsyncMock(return_value=metadata)),
        ):
            target, state_cookie = await auth.AuthManager.create_oidc_authorization("/orders")

        params = parse_qs(urlparse(target).query)
        self.assertEqual(params["code_challenge_method"], ["S256"])
        self.assertEqual(params["redirect_uri"], ["https://api.example.test/auth/oidc/callback"])
        self.assertNotEqual(params["state"][0], state_cookie)

        payload = auth.AuthManager.decode_oidc_state(params["state"][0], state_cookie)
        self.assertEqual(payload["redirect"], "/orders")
        self.assertTrue(payload["verifier"])

        with self.assertRaises(auth.AuthError):
            auth.AuthManager.decode_oidc_state("different-state", state_cookie)

    async def test_logout_uses_registered_frontend_redirect(self):
        metadata = {"end_session_endpoint": "https://idp.example.test/logout"}
        with (
            patch.object(auth, "settings", oidc_settings()),
            patch.object(auth, "_get_oidc_metadata", AsyncMock(return_value=metadata)),
        ):
            target = await auth.AuthManager.create_oidc_logout_url()

        params = parse_qs(urlparse(target).query)
        self.assertEqual(params["client_id"], ["smart-shop"])
        self.assertEqual(
            params["post_logout_redirect_uri"],
            ["https://shop.example.test/login"],
        )


class OidcAccountLinkTests(unittest.TestCase):
    def test_existing_student_is_linked_without_replacing_business_data(self):
        claims = {
            "sub": "keycloak-user-id",
            "student_number": "20260001",
            "identity_id": "identity-id",
            "id_number": "500000000000000000",
            "name": "测试用户",
        }
        existing = {
            "id": "20260001",
            "user_id": 18,
            "name": "原有名称",
            "created_at": "2026-01-01 00:00:00",
            "id_status": 1,
        }
        linked = {**existing, "name": "测试用户", "id_number": claims["id_number"]}
        with (
            patch.object(auth, "settings", oidc_settings()),
            patch.object(auth.UserDB, "get_user_by_keycloak_sub", return_value=None),
            patch.object(auth.UserDB, "get_user", return_value=existing),
            patch.object(auth.UserDB, "create_user") as create_user,
            patch.object(auth.UserDB, "link_oidc_identity", return_value=linked) as link_identity,
        ):
            result = auth.AuthManager.login_oidc(claims)

        create_user.assert_not_called()
        link_identity.assert_called_once_with(
            "20260001",
            "keycloak-user-id",
            "identity-id",
            "500000000000000000",
            "测试用户",
        )
        self.assertEqual(result["user"]["id"], "20260001")
        self.assertTrue(result["access_token"])

    def test_admin_role_maps_to_configured_local_admin(self):
        claims = {
            "sub": "keycloak-admin-id",
            "preferred_username": "platform-admin",
            "resource_access": {"smart-shop": {"roles": ["smart-shop-admin"]}},
        }
        admin_record = {
            "id": "local-admin",
            "name": "平台管理员",
            "role": "super_admin",
        }
        with (
            patch.object(auth, "settings", oidc_settings()),
            patch.object(auth.AdminDB, "get_admin", return_value=admin_record) as get_admin,
        ):
            result = auth.AuthManager.login_oidc(claims)

        get_admin.assert_called_once_with("local-admin")
        self.assertEqual(result["admin"]["id"], "local-admin")


if __name__ == "__main__":
    unittest.main()
