"""Resolve local / localhost asset URLs to KIE-accessible public URLs."""

from __future__ import annotations

import os
from urllib.parse import urlparse

from worker.config import RENDERS_DIR, UPLOADS_DIR


def local_path_from_asset_url(url: str, server_base_url: str = "") -> str:
    if not url:
        return ""
    if url.startswith("/uploads/"):
        local = os.path.join(UPLOADS_DIR, url[len("/uploads/"):])
        return local if os.path.exists(local) else ""
    if url.startswith("/renders/"):
        local = os.path.join(RENDERS_DIR, url[len("/renders/"):])
        return local if os.path.exists(local) else ""
    if url.startswith(("http://", "https://")):
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if host in {"localhost", "127.0.0.1", "0.0.0.0"} and parsed.path.startswith("/uploads/"):
            local = os.path.join(UPLOADS_DIR, parsed.path[len("/uploads/"):])
            return local if os.path.exists(local) else ""
        if host in {"localhost", "127.0.0.1", "0.0.0.0"} and parsed.path.startswith("/renders/"):
            local = os.path.join(RENDERS_DIR, parsed.path[len("/renders/"):])
            return local if os.path.exists(local) else ""
        if server_base_url and parsed.path:
            base = urlparse(server_base_url)
            if parsed.netloc == base.netloc and parsed.path.startswith("/uploads/"):
                local = os.path.join(UPLOADS_DIR, parsed.path[len("/uploads/"):])
                return local if os.path.exists(local) else ""
    return ""


def is_public_http_url(url: str) -> bool:
    if not url.startswith(("http://", "https://")):
        return False
    host = (urlparse(url).hostname or "").lower()
    return host not in {"localhost", "127.0.0.1", "0.0.0.0", ""}


def resolve_kie_input_url(url: str, kie_client, server_base_url: str = "") -> str:
    """Return a URL KIE can download, uploading local files when needed."""
    if not url:
        return ""
    if is_public_http_url(url):
        return url

    local_path = local_path_from_asset_url(url, server_base_url)
    if not local_path:
        if url.startswith(("http://", "https://")):
            return url
        return ""

    uploaded = kie_client.upload_local_file(local_path)
    return uploaded or ""