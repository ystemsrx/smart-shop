import sys
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
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
        oidc_idp_hint="campus",
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
        self.assertFalse(payload["upgrade"])
        self.assertFalse(payload["passive"])
        self.assertTrue(payload["verifier"])

        with self.assertRaises(auth.AuthError):
            auth.AuthManager.decode_oidc_state("different-state", state_cookie)

    async def test_handoff_is_forwarded_without_changing_the_callback(self):
        metadata = {"authorization_endpoint": "https://idp.example.test/auth"}
        handoff = f"lc1.{'a' * 43}"
        with (
            patch.object(auth, "settings", oidc_settings()),
            patch.object(auth, "_get_oidc_metadata", AsyncMock(return_value=metadata)),
        ):
            target, state_cookie = await auth.AuthManager.create_oidc_authorization(
                "/orders",
                handoff,
            )

        params = parse_qs(urlparse(target).query)
        self.assertEqual(params["login_hint"], [handoff])
        self.assertEqual(params["kc_idp_hint"], ["campus"])
        payload = auth.AuthManager.decode_oidc_state(params["state"][0], state_cookie)
        self.assertTrue(payload["upgrade"])

    async def test_oidc_can_be_left_unconfigured(self):
        disabled = replace(
            oidc_settings(),
            oidc_issuer=None,
            oidc_client_id=None,
            oidc_client_secret=None,
            oidc_redirect_uri=None,
            oidc_frontend_url=None,
            oidc_idp_hint=None,
        )
        with patch.object(auth, "settings", disabled):
            self.assertFalse(auth.AuthManager.oidc_enabled())
            with self.assertRaises(auth.AuthError):
                await auth.AuthManager.create_oidc_authorization("/c")

    async def test_passive_authorization_uses_silent_broker_probe(self):
        metadata = {"authorization_endpoint": "https://idp.example.test/auth"}
        with (
            patch.object(auth, "settings", oidc_settings()),
            patch.object(auth, "_get_oidc_metadata", AsyncMock(return_value=metadata)),
        ):
            target, state_cookie = await auth.AuthManager.create_oidc_authorization(
                "/orders",
                passive=True,
            )

        params = parse_qs(urlparse(target).query)
        self.assertNotIn("prompt", params)
        self.assertEqual(params["kc_idp_hint"], ["campus"])
        self.assertEqual(params["login_hint"], [auth.OIDC_PASSIVE_LOGIN_HINT])
        payload = auth.AuthManager.decode_oidc_state(params["state"][0], state_cookie)
        self.assertTrue(payload["passive"])
        self.assertFalse(payload["upgrade"])

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


class LoginApiFailureTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def client_returning(response):
        client = AsyncMock()
        client.__aenter__.return_value = client
        client.post.return_value = response
        return client

    async def test_unavailable_response_is_not_treated_as_bad_credentials(self):
        client = self.client_returning(
            Mock(status_code=503, text='{"code":"CAMPUS_AUTH_UNAVAILABLE"}')
        )
        with (
            patch.object(auth, "LOGIN_API", "https://login.example.test"),
            patch.object(auth.httpx, "AsyncClient", return_value=client),
        ):
            with self.assertRaises(auth.AuthError) as raised:
                await auth.AuthManager.verify_login("20260001", "value")

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.message, "认证服务暂时不可用，请稍后重试")

    async def test_unauthorized_response_remains_a_credential_rejection(self):
        client = self.client_returning(Mock(status_code=401, text=""))
        with (
            patch.object(auth, "LOGIN_API", "https://login.example.test"),
            patch.object(auth.httpx, "AsyncClient", return_value=client),
        ):
            result = await auth.AuthManager.verify_login("20260001", "value")

        self.assertIsNone(result)

    async def test_identity_bridge_read_timeout_is_thirty_seconds(self):
        client = self.client_returning(Mock(status_code=401, text=""))
        with (
            patch.object(auth, "LOGIN_API", "https://login.example.test"),
            patch.object(
                auth.httpx,
                "AsyncClient",
                return_value=client,
            ) as async_client,
        ):
            await auth.AuthManager.verify_login("20260001", "value")

        timeout = async_client.call_args.kwargs["timeout"]
        self.assertEqual(timeout.read, 30.0)
        self.assertEqual(timeout.connect, 10.0)
        self.assertEqual(timeout.write, 10.0)
        self.assertEqual(timeout.pool, 10.0)


class LoginRouteFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_unavailable_login_service_is_reported_as_unavailable(self):
        from fastapi import Response

        from app.routes import auth as auth_route
        from app.schemas import LoginRequest

        with (
            patch.object(
                auth_route.CaptchaService,
                "should_require_login_captcha",
                AsyncMock(return_value=False),
            ),
            patch.object(auth_route.AuthManager, "login_admin", return_value=None),
            patch.object(
                auth_route.AuthManager,
                "login_user",
                AsyncMock(
                    side_effect=auth.AuthError(
                        "认证服务暂时不可用，请稍后重试",
                        503,
                    )
                ),
            ),
        ):
            result = await auth_route.login(
                Mock(),
                LoginRequest(student_id="20260001", password="value"),
                Response(),
            )

        self.assertFalse(result["success"])
        self.assertEqual(result["code"], 503)
        self.assertEqual(result["message"], "认证服务暂时不可用，请稍后重试")


class TransparentUpgradeTests(unittest.IsolatedAsyncioTestCase):
    def local_user(self):
        return {
            "id": "20260001",
            "name": "测试用户",
            "created_at": "2026-01-01 00:00:00",
            "id_number": "500000000000000000",
            "id_status": 1,
        }

    async def test_local_login_stays_successful_when_upgrade_is_unavailable(self):
        with (
            patch.object(auth, "settings", oidc_settings()),
            patch.object(auth, "LOGIN_API", "https://login.example.test"),
            patch.object(auth.UserDB, "get_user", return_value=self.local_user()),
            patch.object(auth.UserDB, "verify_user", return_value=self.local_user()),
            patch.object(
                auth.AuthManager,
                "verify_login",
                AsyncMock(
                    side_effect=auth.AuthError(
                        "认证服务暂时不可用，请稍后重试",
                        503,
                    )
                ),
            ) as verify_login,
        ):
            result = await auth.AuthManager.login_user("20260001", "value")

        self.assertEqual(result["user"]["id"], "20260001")
        self.assertNotIn("_sso_handoff", result)
        verify_login.assert_awaited_once_with(
            "20260001",
            "value",
            create_sso_handoff=True,
        )

    async def test_required_external_login_propagates_unavailable_service(self):
        unavailable = auth.AuthError("认证服务暂时不可用，请稍后重试", 503)
        with (
            patch.object(auth, "settings", oidc_settings()),
            patch.object(auth, "LOGIN_API", "https://login.example.test"),
            patch.object(auth.UserDB, "get_user", return_value=None),
            patch.object(auth.UserDB, "verify_user", return_value=None),
            patch.object(
                auth.AuthManager,
                "verify_login",
                AsyncMock(side_effect=unavailable),
            ),
        ):
            with self.assertRaises(auth.AuthError) as raised:
                await auth.AuthManager.login_user("20260001", "value")

        self.assertIs(raised.exception, unavailable)

    async def test_disabled_oidc_does_not_add_an_external_login_dependency(self):
        disabled = replace(
            oidc_settings(),
            oidc_issuer=None,
            oidc_client_id=None,
            oidc_client_secret=None,
            oidc_redirect_uri=None,
            oidc_frontend_url=None,
            oidc_idp_hint=None,
        )
        with (
            patch.object(auth, "settings", disabled),
            patch.object(auth, "LOGIN_API", "https://login.example.test"),
            patch.object(auth.UserDB, "get_user", return_value=self.local_user()),
            patch.object(auth.UserDB, "verify_user", return_value=self.local_user()),
            patch.object(auth.AuthManager, "verify_login", AsyncMock()) as verify_login,
        ):
            result = await auth.AuthManager.login_user("20260001", "value")

        self.assertEqual(result["user"]["id"], "20260001")
        verify_login.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
