import hashlib
import json
import math
import secrets
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple

from fastapi import Request
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from config import get_settings
from database import get_db_connection
from ..context import PUBLIC_DIR, logger

try:
    import redis.asyncio as redis_async
    from redis.exceptions import RedisError
except Exception:  # pragma: no cover - 依赖未安装时由运行时报错提示
    redis_async = None

    class RedisError(Exception):
        pass


settings = get_settings()

CHALLENGE_TTL_SECONDS = 120
PASS_TOKEN_TTL_SECONDS = 300
LOGIN_WINDOW_SECONDS = 60
LOGIN_ATTEMPT_THRESHOLD = 5
CHALLENGE_RATE_WINDOW_SECONDS = 120
CHALLENGE_RATE_LIMIT = 20

SLIDER_WIDTH = 320
SLIDER_HEIGHT = 160
PUZZLE_WIDTH = 60
PUZZLE_SIZE_VARIANCE = 12
PUZZLE_MIN_WIDTH = 44
PUZZLE_MAX_WIDTH = 72
PUZZLE_MIN_MARGIN = 8
PUZZLE_SHAPES = ("circle", "triangle", "rhombus", "square")
PUZZLE_ROTATE_MIN_DEG = -32
PUZZLE_ROTATE_MAX_DEG = 32
PUZZLE_FREE_ROTATE_SHAPES = {"triangle", "rhombus"}
OFFSET_TOLERANCE = 6
MIN_VERIFY_DURATION_MS = 220
MAX_VERIFY_DURATION_MS = 20000
MAX_ABS_Y = 120
MIN_TRAIL_POINTS = 3
MAX_TRAIL_POINTS = 200
MIN_TRAIL_DELTA_X = 80

ALLOWED_SCENES = {"login", "register"}
CAPTCHA_STATS_TABLE = "captcha_verify_stats"

CAPTCHA_ROOT_DIR = Path(PUBLIC_DIR) / "captcha"
CAPTCHA_GENERATED_DIR = CAPTCHA_ROOT_DIR / "generated"
CAPTCHA_ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}
CAPTCHA_EXCLUDE_PREFIXES = {"puzzle-", "bg-", "slot-", "piece-"}
CAPTCHA_GENERATED_NAME_SUFFIXES = ("-bg.webp", "-puzzle.png")
CAPTCHA_BG_WEBP_QUALITY = 86
CAPTCHA_GENERATED_CLEANUP_INTERVAL_SECONDS = 30
CAPTCHA_GENERATED_MAX_AGE_SECONDS = CHALLENGE_TTL_SECONDS + 30

_challenge_store: Dict[str, Dict[str, Any]] = {}
_attempt_store: Dict[str, Deque[float]] = {}
_challenge_rate_store: Dict[str, Deque[float]] = {}
_pass_token_store: Dict[str, Dict[str, Any]] = {}
_login_captcha_required_store: Dict[str, float] = {}
_store_lock = threading.Lock()


class CaptchaError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class CaptchaService:
    _redis_client = None
    _redis_lock = threading.Lock()
    _last_generated_cleanup_at = 0.0

    @staticmethod
    def normalize_scene(scene: Optional[str]) -> str:
        value = str(scene or "login").strip().lower()
        if value not in ALLOWED_SCENES:
            raise CaptchaError("无效的验证码场景", 400)
        return value

    @staticmethod
    def _safe_device_id(request: Request) -> Optional[str]:
        value = (request.headers.get("x-device-id") or "").strip()
        if not value:
            return None
        if 16 <= len(value) <= 128 and all(ch.isalnum() or ch in {"-", "_"} for ch in value):
            return value
        return None

    @classmethod
    def resolve_client_key(cls, request: Request) -> str:
        device_id = cls._safe_device_id(request)
        if device_id:
            digest = hashlib.sha256(device_id.encode("utf-8")).hexdigest()
            return f"did:{digest}"

        forwarded_for = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        ip = forwarded_for or (request.client.host if request.client else "")
        user_agent = request.headers.get("user-agent") or ""
        raw = f"{ip}|{user_agent}"
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        return f"ipua:{digest}"

    @staticmethod
    def _cleanup_challenges(now: float) -> None:
        expired_ids = [cid for cid, payload in _challenge_store.items() if payload.get("expires_at", 0) <= now]
        for cid in expired_ids:
            payload = _challenge_store.pop(cid, None)
            if not payload:
                continue
            CaptchaService._remove_challenge_files(payload)

    @staticmethod
    def _remove_file(path_value: Optional[str]) -> None:
        if not path_value:
            return
        try:
            Path(path_value).unlink(missing_ok=True)
        except Exception:
            pass

    @classmethod
    def _remove_challenge_files(cls, payload: Optional[Dict[str, Any]]) -> None:
        if not payload:
            return
        cls._remove_file(payload.get("bg_path"))
        cls._remove_file(payload.get("puzzle_path"))

    @staticmethod
    def _is_generated_captcha_file(path: Path) -> bool:
        if not path.is_file():
            return False
        if path.suffix.lower() not in {".png", ".webp"}:
            return False
        return any(path.name.endswith(suffix) for suffix in CAPTCHA_GENERATED_NAME_SUFFIXES)

    @classmethod
    def _cleanup_generated_files_locked(cls, now: float, force: bool = False) -> int:
        if not force and now - cls._last_generated_cleanup_at < CAPTCHA_GENERATED_CLEANUP_INTERVAL_SECONDS:
            return 0
        cls._last_generated_cleanup_at = now

        if not CAPTCHA_GENERATED_DIR.exists():
            return 0

        active_files: set[str] = set()
        for payload in _challenge_store.values():
            for key in ("bg_path", "puzzle_path"):
                value = str(payload.get(key) or "").strip()
                if value:
                    active_files.add(value)

        removed = 0
        try:
            for file_path in CAPTCHA_GENERATED_DIR.iterdir():
                if not cls._is_generated_captcha_file(file_path):
                    continue
                full_path = str(file_path)
                if full_path in active_files:
                    continue
                if force:
                    stale = True
                else:
                    try:
                        stale = (now - file_path.stat().st_mtime) > CAPTCHA_GENERATED_MAX_AGE_SECONDS
                    except Exception:
                        stale = True
                if stale:
                    file_path.unlink(missing_ok=True)
                    removed += 1
        except Exception:
            return removed
        return removed

    @classmethod
    def cleanup_generated_images(cls, force: bool = False) -> int:
        now = time.time()
        with _store_lock:
            cls._cleanup_challenges(now)
            return cls._cleanup_generated_files_locked(now, force=force)

    @classmethod
    def _evict_client_challenges_locked(cls, client_key: str, scene: str) -> int:
        removed = 0
        challenge_ids = [
            cid
            for cid, payload in _challenge_store.items()
            if payload.get("client_key") == client_key and payload.get("scene") == scene
        ]
        for cid in challenge_ids:
            payload = _challenge_store.pop(cid, None)
            if not payload:
                continue
            cls._remove_challenge_files(payload)
            removed += 1
        return removed

    @staticmethod
    def _cleanup_login_attempts(now: float) -> None:
        stale_keys: List[str] = []
        for key, dq in _attempt_store.items():
            while dq and now - dq[0] > LOGIN_WINDOW_SECONDS:
                dq.popleft()
            if not dq:
                stale_keys.append(key)
        for key in stale_keys:
            _attempt_store.pop(key, None)

    @staticmethod
    def _cleanup_challenge_rate_attempts(now: float) -> None:
        stale_keys: List[str] = []
        for key, dq in _challenge_rate_store.items():
            while dq and now - dq[0] > CHALLENGE_RATE_WINDOW_SECONDS:
                dq.popleft()
            if not dq:
                stale_keys.append(key)
        for key in stale_keys:
            _challenge_rate_store.pop(key, None)

    @staticmethod
    def _cleanup_pass_tokens(now: float) -> None:
        expired_tokens = [token for token, payload in _pass_token_store.items() if payload.get("expires_at", 0) <= now]
        for token in expired_tokens:
            _pass_token_store.pop(token, None)

    @staticmethod
    def _list_background_candidates() -> List[Path]:
        try:
            if not CAPTCHA_ROOT_DIR.exists():
                return []
            candidates: List[Path] = []
            for item in CAPTCHA_ROOT_DIR.iterdir():
                if not item.is_file():
                    continue
                ext = item.suffix.lower()
                stem = item.stem.lower()
                if ext not in CAPTCHA_ALLOWED_EXTS:
                    continue
                if any(stem.startswith(prefix) for prefix in CAPTCHA_EXCLUDE_PREFIXES):
                    continue
                candidates.append(item)
            return sorted(candidates)
        except Exception:
            return []

    @staticmethod
    def _rand_int(min_value: int, max_value: int) -> int:
        if max_value <= min_value:
            return int(min_value)
        return int(min_value + secrets.randbelow(max_value - min_value + 1))

    @staticmethod
    def _rotate_points(
        points: List[Tuple[float, float]],
        angle_deg: float,
        center: Tuple[float, float],
    ) -> List[Tuple[float, float]]:
        radians = math.radians(float(angle_deg))
        cos_v = math.cos(radians)
        sin_v = math.sin(radians)
        cx, cy = center
        rotated: List[Tuple[float, float]] = []
        for x, y in points:
            dx = x - cx
            dy = y - cy
            rx = cx + dx * cos_v - dy * sin_v
            ry = cy + dx * sin_v + dy * cos_v
            rotated.append((rx, ry))
        return rotated

    @classmethod
    def _build_shape_assets(
        cls,
        shape: str,
        piece_size: int,
        rotation_deg: float,
    ) -> Tuple[Image.Image, Image.Image]:
        mask = Image.new("L", (piece_size, piece_size), 0)
        border = Image.new("RGBA", (piece_size, piece_size), (255, 255, 255, 0))
        draw_mask = ImageDraw.Draw(mask)
        draw_border = ImageDraw.Draw(border)

        line_width = max(2, int(round(piece_size * 0.06)))
        inset = max(line_width + 1, int(round(piece_size * 0.10)))
        center = (piece_size / 2.0, piece_size / 2.0)
        half = max(4.0, (piece_size - 2.0 * inset) / 2.0)
        border_color = (255, 255, 255, 175)

        if shape == "circle":
            bounds = (
                float(inset),
                float(inset),
                float(piece_size - inset),
                float(piece_size - inset),
            )
            draw_mask.ellipse(bounds, fill=255)
            draw_border.ellipse(bounds, outline=border_color, width=line_width)
            return mask, border

        if shape == "triangle":
            raw_points = [
                (center[0], center[1] - half),
                (center[0] + half * 0.92, center[1] + half * 0.80),
                (center[0] - half * 0.92, center[1] + half * 0.80),
            ]
        elif shape == "rhombus":
            raw_points = [
                (center[0], center[1] - half * 0.76),
                (center[0] + half, center[1]),
                (center[0], center[1] + half * 0.76),
                (center[0] - half, center[1]),
            ]
        else:
            raw_points = [
                (center[0] - half, center[1] - half),
                (center[0] + half, center[1] - half),
                (center[0] + half, center[1] + half),
                (center[0] - half, center[1] + half),
            ]

        rotated = cls._rotate_points(raw_points, rotation_deg, center)
        draw_mask.polygon(rotated, fill=255)
        draw_border.polygon(rotated, outline=border_color, width=line_width)
        return mask, border

    @classmethod
    def _build_piece_profile(cls) -> Dict[str, Any]:
        size_delta = cls._rand_int(-PUZZLE_SIZE_VARIANCE, PUZZLE_SIZE_VARIANCE)
        puzzle_width = max(PUZZLE_MIN_WIDTH, min(PUZZLE_MAX_WIDTH, PUZZLE_WIDTH + size_delta))

        shape = secrets.choice(PUZZLE_SHAPES)
        shape_angle = cls._rand_int(0, 359) if shape in PUZZLE_FREE_ROTATE_SHAPES else 0
        base_rotation = cls._rand_int(PUZZLE_ROTATE_MIN_DEG, PUZZLE_ROTATE_MAX_DEG)
        rotation_deg = float((shape_angle + base_rotation) % 360)

        min_x = PUZZLE_MIN_MARGIN
        max_x = max(min_x, SLIDER_WIDTH - puzzle_width - PUZZLE_MIN_MARGIN)
        min_y = PUZZLE_MIN_MARGIN
        max_y = max(min_y, SLIDER_HEIGHT - puzzle_width - PUZZLE_MIN_MARGIN)

        expected_x = cls._rand_int(min_x, max_x)
        expected_y = cls._rand_int(min_y, max_y)

        return {
            "puzzle_width": int(puzzle_width),
            "shape": shape,
            "rotation_deg": rotation_deg,
            "expected_x": int(expected_x),
            "expected_y": int(expected_y),
        }

    @classmethod
    def _render_captcha_images(cls, source_path: Path, challenge_id: str, profile: Dict[str, Any]) -> Dict[str, str]:
        CAPTCHA_GENERATED_DIR.mkdir(parents=True, exist_ok=True)
        bg_file = CAPTCHA_GENERATED_DIR / f"{challenge_id}-bg.webp"
        puzzle_file = CAPTCHA_GENERATED_DIR / f"{challenge_id}-puzzle.png"

        piece_size = int(profile["puzzle_width"])
        expected_x = int(profile["expected_x"])
        expected_y = int(profile["expected_y"])
        shape = str(profile["shape"])
        rotation_deg = float(profile["rotation_deg"])

        with Image.open(source_path) as image:
            base = image.convert("RGB").resize((SLIDER_WIDTH, SLIDER_HEIGHT), Image.Resampling.LANCZOS)
            shape_mask, shape_border = cls._build_shape_assets(shape, piece_size, rotation_deg)
            puzzle_piece_crop = base.crop(
                (
                    expected_x,
                    expected_y,
                    expected_x + piece_size,
                    expected_y + piece_size,
                )
            ).convert("RGBA")

            puzzle_strip = Image.new("RGBA", (piece_size, SLIDER_HEIGHT), (255, 255, 255, 0))
            puzzle_alpha = Image.new("L", (piece_size, SLIDER_HEIGHT), 0)
            puzzle_strip.paste(puzzle_piece_crop, (0, expected_y))
            puzzle_alpha.paste(shape_mask, (0, expected_y))
            puzzle_strip.putalpha(puzzle_alpha)

            # 给拼图加一点对比度，避免在浅色图上不明显
            puzzle_strip = ImageEnhance.Contrast(puzzle_strip).enhance(1.15)
            border_alpha = shape_border.getchannel("A")
            glow_radius = max(1, int(round(piece_size * 0.08)))
            glow_alpha = border_alpha.filter(ImageFilter.GaussianBlur(radius=glow_radius)).point(
                lambda value: int(value * 0.52)
            )

            piece_glow_tile = Image.new("RGBA", (piece_size, piece_size), (255, 255, 255, 0))
            piece_glow_tile.putalpha(glow_alpha)
            piece_glow_canvas = Image.new("RGBA", (piece_size, SLIDER_HEIGHT), (255, 255, 255, 0))
            piece_glow_canvas.paste(piece_glow_tile, (0, expected_y), piece_glow_tile)
            puzzle_strip.alpha_composite(piece_glow_canvas)

            piece_border_canvas = Image.new("RGBA", (piece_size, SLIDER_HEIGHT), (255, 255, 255, 0))
            piece_border_canvas.paste(shape_border, (0, expected_y), shape_border)
            puzzle_strip.alpha_composite(piece_border_canvas)

            shaded_bg = base.copy().convert("RGBA")
            slot_glow = Image.new("RGBA", (piece_size, piece_size), (255, 255, 255, 0))
            slot_glow.putalpha(glow_alpha)
            shaded_bg.alpha_composite(slot_glow, (expected_x, expected_y))

            slot_overlay = Image.new("RGBA", (piece_size, piece_size), (24, 24, 24, 0))
            slot_alpha = shape_mask.point(lambda value: int(value * 0.36))
            slot_overlay.putalpha(slot_alpha)
            shaded_bg.alpha_composite(slot_overlay, (expected_x, expected_y))
            shaded_bg.alpha_composite(shape_border, (expected_x, expected_y))

            shaded_bg.convert("RGB").save(
                bg_file,
                format="WEBP",
                quality=CAPTCHA_BG_WEBP_QUALITY,
                method=6,
            )
            puzzle_strip.save(puzzle_file, format="PNG", optimize=True)

        return {
            "bg_path": str(bg_file),
            "puzzle_path": str(puzzle_file),
            "bg_url": f"/public/captcha/generated/{bg_file.name}",
            "puzzle_url": f"/public/captcha/generated/{puzzle_file.name}",
        }

    @classmethod
    async def _enforce_challenge_rate_limit(cls, client_key: str) -> None:
        count_after: Optional[int] = None
        try:
            redis_client = await cls._get_redis()
            key = cls._challenge_rate_limit_key(client_key)
            count_after = int(await redis_client.incr(key))
            if count_after == 1:
                await redis_client.expire(key, CHALLENGE_RATE_WINDOW_SECONDS)
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, captcha challenge rate limiting downgraded to memory: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, captcha challenge rate limiting downgraded to memory: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to read captcha challenge rate limit from Redis, downgraded to memory: {exc}")

        if count_after is None:
            now = time.time()
            with _store_lock:
                cls._cleanup_challenge_rate_attempts(now)
                history = _challenge_rate_store.get(client_key)
                if history is None:
                    history = deque()
                    _challenge_rate_store[client_key] = history
                history.append(now)
                while len(history) > 200:
                    history.popleft()
                count_after = len(history)

        if int(count_after) > CHALLENGE_RATE_LIMIT:
            raise CaptchaError("获取验证码过于频繁，请稍后再试", 429)

    @classmethod
    async def create_challenge(cls, request: Request, scene: Optional[str]) -> Dict[str, Any]:
        scene_value = cls.normalize_scene(scene)
        client_key = cls.resolve_client_key(request)
        await cls._enforce_challenge_rate_limit(client_key)

        now = time.time()
        challenge_id = secrets.token_urlsafe(24)
        expires_at = now + CHALLENGE_TTL_SECONDS
        candidates = cls._list_background_candidates()
        if not candidates:
            raise CaptchaError("验证码背景图片不存在，请先上传到 public/captcha/", 500)

        selected_image = secrets.choice(candidates)
        profile = cls._build_piece_profile()
        rendered = cls._render_captcha_images(selected_image, challenge_id, profile)

        challenge = {
            "challenge_id": challenge_id,
            "scene": scene_value,
            "client_key": client_key,
            "expected_x": float(profile["expected_x"]),
            "expected_y": float(profile["expected_y"]),
            "puzzle_width": int(profile["puzzle_width"]),
            "shape": profile["shape"],
            "rotation_deg": float(profile["rotation_deg"]),
            "bg_url": rendered["bg_url"],
            "puzzle_url": rendered["puzzle_url"],
            "bg_path": rendered["bg_path"],
            "puzzle_path": rendered["puzzle_path"],
            "created_at": now,
            "expires_at": expires_at,
        }

        stored_in_redis = False
        try:
            redis_client = await cls._get_redis()
            challenge_key = cls._challenge_key(challenge_id)
            scene_key = cls._challenge_client_scene_key(client_key, scene_value)
            old_challenge_id = await redis_client.get(scene_key)
            pipeline = redis_client.pipeline()
            pipeline.setex(challenge_key, CHALLENGE_TTL_SECONDS, json.dumps(challenge))
            pipeline.setex(scene_key, CHALLENGE_TTL_SECONDS, challenge_id)
            await pipeline.execute()
            stored_in_redis = True

            if old_challenge_id and old_challenge_id != challenge_id:
                old_payload = await cls._pop_challenge_from_redis(str(old_challenge_id))
                cls._remove_challenge_files(old_payload)
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, captcha challenge storage downgraded to memory: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, captcha challenge storage downgraded to memory: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to write captcha challenge to Redis, downgraded to memory: {exc}")

        with _store_lock:
            cls._cleanup_challenges(now)
            cls._evict_client_challenges_locked(client_key, scene_value)
            if not stored_in_redis:
                _challenge_store[challenge_id] = challenge
            cls._cleanup_generated_files_locked(now)

        return {
            "challenge_id": challenge_id,
            "scene": scene_value,
            "expires_in": CHALLENGE_TTL_SECONDS,
            "slider": {
                "width": SLIDER_WIDTH,
                "height": SLIDER_HEIGHT,
                "puzzle_width": int(profile["puzzle_width"]),
                "min_duration_ms": MIN_VERIFY_DURATION_MS,
            },
            "bg_url": rendered["bg_url"],
            "puzzle_url": rendered["puzzle_url"],
        }

    @classmethod
    def _set_login_captcha_required_fallback(cls, client_key: str) -> None:
        with _store_lock:
            _login_captcha_required_store[client_key] = time.time()

    @classmethod
    def _is_login_captcha_required_fallback(cls, client_key: str) -> bool:
        with _store_lock:
            return client_key in _login_captcha_required_store

    @classmethod
    def _clear_login_captcha_required_fallback(cls, client_key: str) -> None:
        with _store_lock:
            _login_captcha_required_store.pop(client_key, None)
            _attempt_store.pop(client_key, None)

    @classmethod
    async def _set_login_captcha_required(cls, client_key: str) -> None:
        cls._set_login_captcha_required_fallback(client_key)
        try:
            redis_client = await cls._get_redis()
            await redis_client.set(cls._login_captcha_required_key(client_key), "1")
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, login captcha lock downgraded to memory: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, login captcha lock downgraded to memory: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to write login captcha lock to Redis, downgraded to memory: {exc}")

    @classmethod
    async def _is_login_captcha_required(cls, client_key: str) -> bool:
        try:
            redis_client = await cls._get_redis()
            marker = await redis_client.get(cls._login_captcha_required_key(client_key))
            if marker:
                cls._set_login_captcha_required_fallback(client_key)
                return True
            cls._clear_login_captcha_required_fallback(client_key)
            return False
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, login captcha lock check downgraded to memory: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, login captcha lock check downgraded to memory: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to read login captcha lock from Redis, downgraded to memory: {exc}")
        return cls._is_login_captcha_required_fallback(client_key)

    @classmethod
    async def _clear_login_captcha_required(cls, client_key: str) -> None:
        cls._clear_login_captcha_required_fallback(client_key)
        try:
            redis_client = await cls._get_redis()
            pipeline = redis_client.pipeline()
            pipeline.delete(cls._login_captcha_required_key(client_key))
            pipeline.delete(cls._login_attempt_key(client_key))
            await pipeline.execute()
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, login captcha unlock downgraded to memory: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, login captcha unlock downgraded to memory: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to clear login captcha lock in Redis, downgraded to memory: {exc}")

    @classmethod
    def _record_login_attempt_fallback(cls, client_key: str) -> Tuple[int, int]:
        now = time.time()
        with _store_lock:
            cls._cleanup_login_attempts(now)
            history = _attempt_store.get(client_key)
            if history is None:
                history = deque()
                _attempt_store[client_key] = history
            count_before = len(history)
            history.append(now)
            while len(history) > 200:
                history.popleft()
            count_after = len(history)
            return count_before, count_after

    @classmethod
    async def _record_login_attempt(cls, client_key: str) -> Tuple[int, int]:
        try:
            redis_client = await cls._get_redis()
            key = cls._login_attempt_key(client_key)
            count_after = int(await redis_client.incr(key))
            if count_after == 1:
                await redis_client.expire(key, LOGIN_WINDOW_SECONDS)
            return max(0, count_after - 1), count_after
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, login attempt counting downgraded to memory: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, login attempt counting downgraded to memory: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to count login attempts in Redis, downgraded to memory: {exc}")
        return cls._record_login_attempt_fallback(client_key)

    @classmethod
    async def should_require_login_captcha(cls, request: Request) -> bool:
        client_key = cls.resolve_client_key(request)
        if await cls._is_login_captcha_required(client_key):
            return True

        _count_before, count_after = await cls._record_login_attempt(client_key)
        # 触发阈值后，对该设备持续强制验证码，直到验证成功消费凭证后解锁。
        if count_after >= (LOGIN_ATTEMPT_THRESHOLD + 1):
            await cls._set_login_captcha_required(client_key)
            return True
        return False

    @staticmethod
    def _coerce_trail(trail: Any) -> List[Tuple[float, float]]:
        if not isinstance(trail, list):
            return []
        result: List[Tuple[float, float]] = []
        for point in trail[:MAX_TRAIL_POINTS]:
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                continue
            try:
                x = float(point[0])
                y = float(point[1])
            except (TypeError, ValueError):
                continue
            if not (x == x and y == y):  # NaN guard
                continue
            result.append((x, y))
        return result

    @classmethod
    def _validate_behavior(cls, verify_payload: Dict[str, Any], expected_x: float) -> Dict[str, float]:
        try:
            x = float(verify_payload.get("x", 0))
            slider_offset_x = float(verify_payload.get("slider_offset_x", x))
            y = float(verify_payload.get("y", 0))
            duration = float(verify_payload.get("duration", 0))
        except (TypeError, ValueError):
            raise CaptchaError("验证码参数格式错误", 400)

        trail = cls._coerce_trail(verify_payload.get("trail"))
        if len(trail) < MIN_TRAIL_POINTS:
            raise CaptchaError("验证码轨迹数据不足", 400)

        if duration < MIN_VERIFY_DURATION_MS or duration > MAX_VERIFY_DURATION_MS:
            raise CaptchaError("验证码行为异常，请重试", 400)

        if abs(y) > MAX_ABS_Y:
            raise CaptchaError("验证码行为异常，请重试", 400)

        delta_x = trail[-1][0] - trail[0][0]
        if delta_x <= 0:
            raise CaptchaError("验证码行为异常，请重试", 400)

        # 轨迹是指针绝对坐标，靠左目标位时真实拖动距离会显著小于 80px；
        # 因此按目标位移自适应最小轨迹距离，避免出现“理论上无法通过”的挑战。
        adaptive_min_delta_x = max(5.0, min(float(MIN_TRAIL_DELTA_X), max(0.0, expected_x - OFFSET_TOLERANCE)))
        if delta_x < adaptive_min_delta_x:
            raise CaptchaError("验证码行为异常，请重试", 400)

        positive_steps = 0
        for idx in range(1, len(trail)):
            if trail[idx][0] - trail[idx - 1][0] > 0:
                positive_steps += 1
        if positive_steps < max(1, int(len(trail) * 0.4)):
            raise CaptchaError("验证码行为异常，请重试", 400)

        position_candidates = [x, slider_offset_x]
        min_delta = min(abs(pos - expected_x) for pos in position_candidates)
        if min_delta > OFFSET_TOLERANCE:
            raise CaptchaError("验证码校验失败，请重试", 400)
        return {"x": x, "slider_offset_x": slider_offset_x, "duration": duration}

    @staticmethod
    def _compute_beat_percent(total_users: int, slower_users: int) -> float:
        if total_users <= 1:
            return 100.0
        value = (slower_users / total_users) * 100.0
        return round(max(0.0, min(100.0, value)), 2)

    @classmethod
    def _record_latest_duration(cls, client_key: str, duration_ms: float) -> Dict[str, Any]:
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {CAPTCHA_STATS_TABLE} (
                        client_key TEXT PRIMARY KEY,
                        last_duration_ms REAL NOT NULL,
                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                cursor.execute(
                    f"""
                    INSERT INTO {CAPTCHA_STATS_TABLE} (client_key, last_duration_ms, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(client_key) DO UPDATE SET
                        last_duration_ms = excluded.last_duration_ms,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (client_key, float(duration_ms)),
                )
                cursor.execute(f"SELECT COUNT(*) FROM {CAPTCHA_STATS_TABLE}")
                total_users = int(cursor.fetchone()[0] or 0)
                cursor.execute(
                    f"SELECT COUNT(*) FROM {CAPTCHA_STATS_TABLE} WHERE last_duration_ms > ?",
                    (float(duration_ms),),
                )
                slower_users = int(cursor.fetchone()[0] or 0)
                conn.commit()
                return {
                    "duration_seconds": round(float(duration_ms) / 1000.0, 2),
                    "beat_percent": cls._compute_beat_percent(total_users, slower_users),
                    "total_users": total_users,
                }
        except Exception as exc:
            logger.error(f"Failed to write captcha metrics: {exc}")
            raise CaptchaError("验证码统计服务异常，请稍后重试", 500)

    @classmethod
    async def _get_redis(cls):
        if redis_async is None:
            raise CaptchaError("Redis依赖未安装", 500)
        if cls._redis_client is not None:
            return cls._redis_client
        with cls._redis_lock:
            if cls._redis_client is None:
                cls._redis_client = redis_async.from_url(settings.redis_url, decode_responses=True)
        return cls._redis_client

    @staticmethod
    def _pass_token_key(token: str) -> str:
        return f"captcha:pass:{token}"

    @staticmethod
    def _challenge_key(challenge_id: str) -> str:
        return f"captcha:challenge:{challenge_id}"

    @staticmethod
    def _challenge_client_scene_key(client_key: str, scene: str) -> str:
        return f"captcha:challenge:client:{client_key}:{scene}"

    @staticmethod
    def _login_attempt_key(client_key: str) -> str:
        return f"captcha:login:attempts:{client_key}"

    @staticmethod
    def _login_captcha_required_key(client_key: str) -> str:
        return f"captcha:login:required:{client_key}"

    @staticmethod
    def _challenge_rate_limit_key(client_key: str) -> str:
        return f"captcha:challenge:rate:{client_key}"

    @staticmethod
    def _deserialize_payload(payload_raw: Optional[str]) -> Optional[Dict[str, Any]]:
        if not payload_raw:
            return None
        try:
            payload = json.loads(payload_raw)
            if isinstance(payload, dict):
                return payload
        except Exception:
            return None
        return None

    @classmethod
    async def _pop_challenge_from_redis(cls, challenge_id: str) -> Optional[Dict[str, Any]]:
        redis_client = await cls._get_redis()
        payload_raw: Optional[str] = None
        challenge_key = cls._challenge_key(challenge_id)
        try:
            payload_raw = await redis_client.execute_command("GETDEL", challenge_key)
        except RedisError:
            pipeline = redis_client.pipeline()
            pipeline.get(challenge_key)
            pipeline.delete(challenge_key)
            result = await pipeline.execute()
            payload_raw = result[0] if result else None
        payload = cls._deserialize_payload(payload_raw)
        if payload:
            client_key = str(payload.get("client_key") or "").strip()
            scene = str(payload.get("scene") or "").strip()
            if client_key and scene:
                scene_key = cls._challenge_client_scene_key(client_key, scene)
                current_id = await redis_client.get(scene_key)
                if current_id == challenge_id:
                    await redis_client.delete(scene_key)
        return payload

    @classmethod
    async def _get_challenge_from_redis(cls, challenge_id: str) -> Optional[Dict[str, Any]]:
        redis_client = await cls._get_redis()
        payload_raw = await redis_client.get(cls._challenge_key(challenge_id))
        return cls._deserialize_payload(payload_raw)

    @classmethod
    async def _delete_challenge_from_redis(cls, challenge: Dict[str, Any]) -> None:
        redis_client = await cls._get_redis()
        challenge_id = str(challenge.get("challenge_id") or "").strip()
        client_key = str(challenge.get("client_key") or "").strip()
        scene = str(challenge.get("scene") or "").strip()
        if challenge_id:
            await redis_client.delete(cls._challenge_key(challenge_id))
        if client_key and scene:
            scene_key = cls._challenge_client_scene_key(client_key, scene)
            current_id = await redis_client.get(scene_key)
            if current_id == challenge_id:
                await redis_client.delete(scene_key)

    @classmethod
    def _set_pass_token_fallback(cls, token: str, payload: Dict[str, Any]) -> None:
        now = time.time()
        with _store_lock:
            cls._cleanup_pass_tokens(now)
            _pass_token_store[token] = {
                "client_key": payload.get("client_key"),
                "scene": payload.get("scene"),
                "issued_at": payload.get("issued_at"),
                "expires_at": now + PASS_TOKEN_TTL_SECONDS,
            }

    @classmethod
    def _consume_pass_token_fallback(cls, token: str) -> Optional[Dict[str, Any]]:
        now = time.time()
        with _store_lock:
            cls._cleanup_pass_tokens(now)
            payload = _pass_token_store.pop(token, None)
        if not payload:
            return None
        if payload.get("expires_at", 0) <= now:
            return None
        return payload

    @classmethod
    async def _issue_pass_token(cls, client_key: str, scene: str) -> str:
        token = secrets.token_urlsafe(32)
        payload = {
            "client_key": client_key,
            "scene": scene,
            "issued_at": int(time.time()),
        }
        issued_in_redis = False
        try:
            redis_client = await cls._get_redis()
            await redis_client.setex(cls._pass_token_key(token), PASS_TOKEN_TTL_SECONDS, json.dumps(payload))
            issued_in_redis = True
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, captcha token storage downgraded to memory: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, captcha token storage downgraded to memory: {exc}")

        if not issued_in_redis:
            cls._set_pass_token_fallback(token, payload)
        return token

    @classmethod
    async def verify_challenge_and_issue_token(
        cls,
        request: Request,
        challenge_id: str,
        scene: Optional[str],
        verify_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not challenge_id:
            raise CaptchaError("challenge_id不能为空", 400)

        client_key = cls.resolve_client_key(request)
        now = time.time()
        challenge: Optional[Dict[str, Any]] = None
        try:
            challenge = await cls._pop_challenge_from_redis(challenge_id)
            if challenge:
                with _store_lock:
                    _challenge_store.pop(challenge_id, None)
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, captcha challenge read downgraded to memory: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, captcha challenge read downgraded to memory: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to read captcha challenge from Redis, downgraded to memory: {exc}")

        if challenge is None:
            with _store_lock:
                cls._cleanup_challenges(now)
                challenge = _challenge_store.pop(challenge_id, None)
                cls._cleanup_generated_files_locked(now)

        if not challenge:
            raise CaptchaError("验证码已失效，请刷新后重试", 410)

        cls._remove_challenge_files(challenge)
        with _store_lock:
            cls._cleanup_generated_files_locked(now)

        expected_scene = cls.normalize_scene(scene or challenge.get("scene"))
        if challenge.get("scene") != expected_scene:
            raise CaptchaError("验证码场景不匹配", 400)
        if challenge.get("client_key") != client_key:
            raise CaptchaError("验证码客户端不匹配，请重新验证", 403)
        if challenge.get("expires_at", 0) <= now:
            raise CaptchaError("验证码已过期，请重试", 410)

        metrics = cls._validate_behavior(verify_payload, float(challenge.get("expected_x", 0.0)))
        pass_token = await cls._issue_pass_token(client_key, expected_scene)

        duration_seconds = round(float(metrics["duration"]) / 1000.0, 2)
        beat_percent: Optional[float] = None
        try:
            stat = cls._record_latest_duration(client_key, metrics["duration"])
            duration_seconds = float(stat.get("duration_seconds", duration_seconds))
            beat_percent_raw = stat.get("beat_percent")
            beat_percent = float(beat_percent_raw) if beat_percent_raw is not None else None
        except CaptchaError as exc:
            logger.warning(f"Captcha metrics write failed, returning fallback result: {exc.message}")
        except Exception as exc:
            logger.warning(f"Captcha metrics write failed, returning fallback result: {exc}")

        summary_text = f"{duration_seconds:.2f}秒完成"
        if beat_percent is not None:
            summary_text = f"{duration_seconds:.2f}秒完成，打败了{beat_percent:.2f}%用户"

        return {
            "captcha_token": pass_token,
            "expires_in": PASS_TOKEN_TTL_SECONDS,
            "duration_seconds": duration_seconds,
            "beat_percent": beat_percent,
            "summary_text": summary_text,
        }

    @classmethod
    async def consume_pass_token(cls, request: Request, pass_token: Optional[str], scene: str) -> None:
        if not pass_token:
            raise CaptchaError("请先完成滑块验证码", 429)
        scene_value = cls.normalize_scene(scene)
        key = cls._pass_token_key(str(pass_token).strip())
        token_value = str(pass_token).strip()

        payload: Optional[Dict[str, Any]] = None
        try:
            redis_client = await cls._get_redis()
            payload_raw: Optional[str] = None
            try:
                payload_raw = await redis_client.execute_command("GETDEL", key)
            except RedisError:
                pipeline = redis_client.pipeline()
                pipeline.get(key)
                pipeline.delete(key)
                result = await pipeline.execute()
                payload_raw = result[0] if result else None
            if payload_raw:
                payload = json.loads(payload_raw)
                with _store_lock:
                    _pass_token_store.pop(token_value, None)
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, consuming captcha token from memory fallback: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, consuming captcha token from memory fallback: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to parse captcha token from Redis, consuming from memory fallback: {exc}")

        if payload is None:
            payload = cls._consume_pass_token_fallback(token_value)

        if not payload:
            raise CaptchaError("验证码凭证无效或已过期，请重新验证", 429)

        client_key = cls.resolve_client_key(request)
        if payload.get("client_key") != client_key:
            raise CaptchaError("验证码凭证与当前设备不匹配", 403)
        if payload.get("scene") != scene_value:
            raise CaptchaError("验证码凭证场景不匹配", 403)
        if scene_value == "login":
            await cls._clear_login_captcha_required(client_key)

    @classmethod
    async def discard_challenge(cls, request: Request, challenge_id: Optional[str], scene: Optional[str]) -> bool:
        token = str(challenge_id or "").strip()
        if not token:
            return False

        client_key = cls.resolve_client_key(request)
        now = time.time()

        challenge: Optional[Dict[str, Any]] = None
        try:
            challenge = await cls._get_challenge_from_redis(token)
        except CaptchaError as exc:
            logger.warning(f"Redis unavailable, captcha challenge discard downgraded to memory: {exc.message}")
        except RedisError as exc:
            logger.warning(f"Redis connection error, captcha challenge discard downgraded to memory: {exc}")
        except Exception as exc:
            logger.warning(f"Failed to read captcha challenge from Redis for discard, downgraded to memory: {exc}")

        if challenge:
            expected_scene = cls.normalize_scene(scene or challenge.get("scene"))
            if challenge.get("scene") != expected_scene:
                raise CaptchaError("验证码场景不匹配", 400)
            if challenge.get("client_key") != client_key:
                raise CaptchaError("验证码客户端不匹配，请重新验证", 403)
            try:
                await cls._delete_challenge_from_redis(challenge)
            except CaptchaError as exc:
                logger.warning(f"Redis unavailable while deleting captcha challenge: {exc.message}")
                return False
            except RedisError as exc:
                logger.warning(f"Redis connection error while deleting captcha challenge: {exc}")
                return False
            except Exception as exc:
                logger.warning(f"Failed to delete captcha challenge in Redis: {exc}")
                return False

            with _store_lock:
                _challenge_store.pop(token, None)
                cls._cleanup_generated_files_locked(now)
            cls._remove_challenge_files(challenge)
            return True

        with _store_lock:
            cls._cleanup_challenges(now)
            challenge = _challenge_store.get(token)
            if not challenge:
                cls._cleanup_generated_files_locked(now)
                return False

            expected_scene = cls.normalize_scene(scene or challenge.get("scene"))
            if challenge.get("scene") != expected_scene:
                raise CaptchaError("验证码场景不匹配", 400)
            if challenge.get("client_key") != client_key:
                raise CaptchaError("验证码客户端不匹配，请重新验证", 403)

            payload = _challenge_store.pop(token, None)
            cls._remove_challenge_files(payload)
            cls._cleanup_generated_files_locked(now)
            return payload is not None
