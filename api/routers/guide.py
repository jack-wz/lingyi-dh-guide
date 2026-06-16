"""Reverse-proxy guide-platform REST API through Pixelle-Video FastAPI."""

from __future__ import annotations

import os
from typing import Iterable

import httpx
from fastapi import APIRouter, Request, Response
from loguru import logger

from api.guide.manager import guide_manager

router = APIRouter(tags=["guide"])

GUIDE_UPSTREAM = os.getenv("GUIDE_INTERNAL_URL", guide_manager.internal_api_url).rstrip("/")
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}


def _filtered_headers(headers: Iterable[tuple[str, str]]) -> dict[str, str]:
    return {k: v for k, v in headers if k.lower() not in HOP_BY_HOP}


async def _proxy(request: Request, target_path: str) -> Response:
    url = f"{GUIDE_UPSTREAM}{target_path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"
    body = await request.body()
    headers = _filtered_headers(request.headers.items())
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=10.0)) as client:
            upstream = await client.request(
                request.method,
                url,
                headers=headers,
                content=body,
            )
    except httpx.RequestError as exc:
        logger.error(f"Guide proxy error {target_path}: {exc}")
        return Response(content=f'{{"error":"guide upstream unavailable"}}', status_code=502, media_type="application/json")

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=_filtered_headers(upstream.headers.items()),
        media_type=upstream.headers.get("content-type"),
    )


@router.get("/guide/health")
async def guide_health():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{GUIDE_UPSTREAM}/api/health")
            return res.json()
    except httpx.RequestError as exc:
        return {"status": "down", "error": str(exc), "upstream": GUIDE_UPSTREAM}


@router.api_route("/templates", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@router.api_route("/templates/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_templates(request: Request, path: str = ""):
    suffix = f"/{path}" if path else ""
    return await _proxy(request, f"/api/templates{suffix}")


@router.api_route("/digital-humans", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@router.api_route("/digital-humans/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_digital_humans(request: Request, path: str = ""):
    suffix = f"/{path}" if path else ""
    return await _proxy(request, f"/api/digital-humans{suffix}")


@router.api_route("/uploads", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@router.api_route("/uploads/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_uploads_api(request: Request, path: str = ""):
    suffix = f"/{path}" if path else ""
    return await _proxy(request, f"/api/uploads{suffix}")


@router.api_route("/renders", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@router.api_route("/renders/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_renders(request: Request, path: str = ""):
    suffix = f"/{path}" if path else ""
    return await _proxy(request, f"/api/renders{suffix}")


@router.api_route("/hyperframes", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@router.api_route("/hyperframes/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_hyperframes(request: Request, path: str = ""):
    suffix = f"/{path}" if path else ""
    return await _proxy(request, f"/api/hyperframes{suffix}")


@router.api_route("/config", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@router.api_route("/config/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_config(request: Request, path: str = ""):
    suffix = f"/{path}" if path else ""
    return await _proxy(request, f"/api/config{suffix}")


@router.api_route("/assets", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@router.api_route("/assets/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_assets(request: Request, path: str = ""):
    suffix = f"/{path}" if path else ""
    return await _proxy(request, f"/api/assets{suffix}")


@router.api_route("/tasks", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@router.api_route("/tasks/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_tasks(request: Request, path: str = ""):
    suffix = f"/{path}" if path else ""
    return await _proxy(request, f"/api/tasks{suffix}")


@router.api_route("/ops", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
@router.api_route("/ops/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_ops(request: Request, path: str = ""):
    suffix = f"/{path}" if path else ""
    return await _proxy(request, f"/api/ops{suffix}")