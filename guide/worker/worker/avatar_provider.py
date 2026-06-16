"""Resolve avatar (lip-sync) provider from config.json or environment."""

from __future__ import annotations

import os

from worker.avatar_adapter import avatar_registry
from worker.config import get_avatar_provider


def resolve_avatar_adapter(server_base_url: str = ""):
    """Instantiate the configured talking-head adapter (wavespeed | kie)."""
    provider = get_avatar_provider()
    return avatar_registry.get(provider, server_base_url=server_base_url)