import mimetypes
import os

from fastapi import APIRouter, HTTPException
from starlette.responses import FileResponse

from auth import success_response
from ..context import PUBLIC_DIR, STATIC_CACHE_MAX_AGE


router = APIRouter()


@router.get("/healthz")
async def health_check():
    """健康检查。"""
    return success_response("服务运行正常")


@router.get("/logo.{extension}")
async def serve_logo(extension: str):
    """返回公共目录下的 logo 文件。"""
    filename = f"logo.{extension}"
    file_path = os.path.join(PUBLIC_DIR, filename)
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    media_type = mimetypes.guess_type(file_path)[0]
    return FileResponse(
        file_path,
        media_type=media_type,
        headers={
            "Cache-Control": f"public, max-age={STATIC_CACHE_MAX_AGE}, immutable",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@router.get("/payment_qr_{payment_id}.{extension}")
async def serve_payment_qr(payment_id: str, extension: str):
    """返回公共目录下的收款码文件。"""
    filename = f"payment_qr_{payment_id}.{extension}"
    file_path = os.path.join(PUBLIC_DIR, filename)
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    media_type = mimetypes.guess_type(file_path)[0]
    return FileResponse(
        file_path,
        media_type=media_type,
        headers={
            "Cache-Control": f"public, max-age={STATIC_CACHE_MAX_AGE}, immutable",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@router.get("/{filename}.txt")
async def serve_txt_files(filename: str):
    """返回公共目录下的文本文件。"""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    full_filename = f"{filename}.txt"
    file_path = os.path.join(PUBLIC_DIR, full_filename)
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        file_path,
        media_type="text/plain",
        headers={
            "Cache-Control": f"public, max-age={STATIC_CACHE_MAX_AGE}, immutable",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )
