"""
Hash-based image serving route.
Provides /items/{hash}.webp endpoint that resolves hash to physical path.
"""
import mimetypes
import os
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from database import ImageLookupDB, PaymentQrDB
from ..context import ITEMS_DIR, PUBLIC_DIR, STATIC_CACHE_MAX_AGE, logger

router = APIRouter(tags=["images"])

# Match hash12.webp pattern
HASH_PATTERN = re.compile(r"^([a-f0-9]{12})\.webp$", re.IGNORECASE)
PAYMENT_FILENAME_PATTERN = re.compile(r"^[0-9A-Za-z._-]+\.(webp|png|jpg|jpeg|gif)$", re.IGNORECASE)


def _resolve_public_file_path(image_path: str):
    if not image_path:
        return None
    normalized = str(image_path).strip().replace("\\", "/")
    if not normalized:
        return None
    if normalized.startswith("/public/"):
        relative = normalized[len("/public/"):]
    elif normalized.startswith("public/"):
        relative = normalized[len("public/"):]
    elif normalized.startswith("/"):
        relative = normalized[1:]
    else:
        relative = normalized
    target = os.path.normpath(os.path.join(PUBLIC_DIR, relative))
    public_root = os.path.normpath(PUBLIC_DIR)
    if not target.startswith(public_root):
        return None
    return target


@router.get("/payment/{filename}")
async def serve_payment_qr_by_filename(filename: str):
    """
    Serve payment QR image by filename.
    Frontend only exposes /payment/{filename}, while DB stores absolute web path.
    """
    normalized = (filename or "").strip()
    if not normalized or ".." in normalized or "/" in normalized or "\\" in normalized:
        raise HTTPException(status_code=404, detail="图片不存在")
    if not PAYMENT_FILENAME_PATTERN.fullmatch(normalized):
        raise HTTPException(status_code=404, detail="图片不存在")

    db_image_path = PaymentQrDB.get_image_path_by_filename(normalized)
    if db_image_path:
        physical_path = _resolve_public_file_path(db_image_path)
        if physical_path and os.path.exists(physical_path):
            media_type = mimetypes.guess_type(physical_path)[0] or "image/webp"
            return FileResponse(
                physical_path,
                media_type=media_type,
                headers={"Cache-Control": f"public, max-age={STATIC_CACHE_MAX_AGE}, immutable"},
            )

    payment_root = os.path.normpath(os.path.join(PUBLIC_DIR, "payment-qrs"))
    if os.path.isdir(payment_root):
        for current_root, _, files in os.walk(payment_root):
            if normalized in files:
                candidate = os.path.normpath(os.path.join(current_root, normalized))
                if candidate.startswith(payment_root) and os.path.exists(candidate):
                    media_type = mimetypes.guess_type(candidate)[0] or "image/webp"
                    return FileResponse(
                        candidate,
                        media_type=media_type,
                        headers={"Cache-Control": f"public, max-age={STATIC_CACHE_MAX_AGE}, immutable"},
                    )

    raise HTTPException(status_code=404, detail="图片不存在")


@router.get("/items/{image_path:path}")
async def serve_image(image_path: str):
    """
    Serve product images by hash or legacy path.
    
    New format: /items/{hash12}.webp
    The hash is looked up in image_lookup table to find physical path.
    
    Legacy format: /items/{category}/{filename}.webp
    Falls back to direct file serving for backward compatibility.
    """
    # Try to match hash-based path (e.g., "abc123def456.webp")
    match = HASH_PATTERN.match(image_path)
    if match:
        file_hash = match.group(1)
        
        # Look up in database
        lookup = ImageLookupDB.get_by_hash(file_hash)
        if lookup:
            physical_path = os.path.normpath(os.path.join(ITEMS_DIR, lookup["physical_path"]))
            items_root = os.path.normpath(ITEMS_DIR)
            
            # Security check
            if not physical_path.startswith(items_root):
                raise HTTPException(status_code=404, detail="图片不存在")
            
            if os.path.exists(physical_path):
                return FileResponse(
                    physical_path,
                    media_type="image/webp",
                    headers={
                        "Cache-Control": f"public, max-age={STATIC_CACHE_MAX_AGE}, immutable"
                    }
                )
        
        # If hash not in database, try direct physical path lookup
        # (for cases where hash is in the path itself)
        direct_path = os.path.normpath(os.path.join(ITEMS_DIR, image_path))
        items_root = os.path.normpath(ITEMS_DIR)
        if direct_path.startswith(items_root) and os.path.exists(direct_path):
            return FileResponse(
                direct_path,
                media_type="image/webp",
                headers={
                    "Cache-Control": f"public, max-age={STATIC_CACHE_MAX_AGE}, immutable"
                }
            )
        
        raise HTTPException(status_code=404, detail="图片不存在")
    
    # Legacy path format (e.g., "饮料/可乐_123.webp")
    # Serve directly from items directory
    file_path = os.path.normpath(os.path.join(ITEMS_DIR, image_path))
    items_root = os.path.normpath(ITEMS_DIR)
    
    # Security check
    if not file_path.startswith(items_root):
        raise HTTPException(status_code=404, detail="图片不存在")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="图片不存在")
    
    # Determine media type
    media_type = "image/webp"
    if file_path.lower().endswith(".png"):
        media_type = "image/png"
    elif file_path.lower().endswith(".jpg") or file_path.lower().endswith(".jpeg"):
        media_type = "image/jpeg"
    
    return FileResponse(
        file_path,
        media_type=media_type,
        headers={
            "Cache-Control": f"public, max-age={STATIC_CACHE_MAX_AGE}, immutable"
        }
    )
