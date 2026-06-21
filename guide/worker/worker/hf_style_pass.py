"""HyperFrames style overlay pass — preview/CI only; delivery uses FFmpeg single path (stage4)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from worker.context import PipelineContext
from worker.subtitle_styles import is_hyperframes_subtitle_style

_GUIDE_ROOT = Path(__file__).resolve().parents[2]
_COMPOSER_SCRIPT = _GUIDE_ROOT / "scripts" / "write_hf_composition.ts"
_HYPERFRAMES_JSON = _GUIDE_ROOT / "compositions" / "hyperframes.json"
_LINT_IGNORE_CODES = frozenset({
    "gsap_timeline_not_registered",
    "font_family_without_font_face",
})

HF_TRANSITION_TYPES = frozenset({
    "hf-dissolve",
    "hf-push",
    "hf-push-left",
    "hf-push-right",
    "hf-push-up",
    "hf-push-down",
    "hf-wipe",
    "hf-wipe-left",
    "hf-wipe-right",
    "hf-zoom",
    "hf-circle-reveal",
})


def _local_bin(name: str) -> Path:
    return _GUIDE_ROOT / "node_modules" / ".bin" / name


def _cli_cmd(tool: str, *args: str) -> list[str]:
    local = _local_bin(tool)
    if local.exists():
        return [str(local), *args]
    return ["npx", tool, *args]


def _run_cmd(args: list[str], cwd: str, timeout: int = 300):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def _run_hyperframes(args: list[str], cwd: str):
    return _run_cmd(_cli_cmd("hyperframes", *args), cwd=cwd)


def _parse_lint_json(stdout: str) -> dict:
    text = (stdout or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        if start < 0:
            raise
        return json.loads(text[start:])


def _lint_blocking_errors(work_dir: str) -> list[str]:
    lint = _run_hyperframes(["lint", ".", "--json"], work_dir)
    if lint.returncode == 0:
        return []
    try:
        payload = _parse_lint_json(lint.stdout or "")
    except json.JSONDecodeError:
        detail = (lint.stderr or lint.stdout or "HyperFrames lint failed").strip()
        return [detail]
    findings = payload.get("findings") or []
    errors: list[str] = []
    for finding in findings:
        if finding.get("severity") != "error":
            continue
        code = str(finding.get("code") or "")
        if code in _LINT_IGNORE_CODES:
            continue
        errors.append(str(finding.get("message") or code or "HyperFrames lint error"))
    if errors:
        return errors
    if int(payload.get("errorCount") or 0) > 0 and not findings:
        return ["HyperFrames lint reported errors"]
    return []


def _link_static_assets(work_dir: str) -> None:
    from worker.config import DATA_DIR, UPLOADS_DIR

    work = Path(work_dir)
    uploads_link = work / "uploads"
    if not uploads_link.exists() and Path(UPLOADS_DIR).is_dir():
        uploads_link.symlink_to(UPLOADS_DIR, target_is_directory=True)

    brand_fonts_src = Path(DATA_DIR) / "brand-fonts"
    brand_fonts_link = work / "brand-fonts"
    if brand_fonts_src.is_dir() and not brand_fonts_link.exists():
        brand_fonts_link.symlink_to(brand_fonts_src, target_is_directory=True)


def dsl_uses_hf_subtitles(dsl: dict) -> bool:
    for seg in dsl.get("segments") or []:
        subtitle = seg.get("subtitle") or {}
        if not subtitle.get("enabled"):
            continue
        if not str(seg.get("narration_text") or "").strip():
            continue
        if is_hyperframes_subtitle_style(str(subtitle.get("style_id") or "")):
            return True
    return False


def dsl_uses_hf_transitions(dsl: dict) -> bool:
    for seg in dsl.get("segments") or []:
        trans_type = str((seg.get("transition") or {}).get("type") or "").strip()
        if trans_type in HF_TRANSITION_TYPES:
            return True
    return False


def dsl_uses_hf_global_overlays(dsl: dict) -> bool:
    overlays = (dsl.get("globalConfig") or {}).get("hf_overlays") or []
    for item in overlays:
        if item.get("enabled") is False:
            continue
        if str(item.get("type") or "").startswith("hf-"):
            return True
    return False


def dsl_needs_hf_style_pass(dsl: dict) -> bool:
    return (
        dsl_uses_hf_subtitles(dsl)
        or dsl_uses_hf_transitions(dsl)
        or dsl_uses_hf_global_overlays(dsl)
    )


def _write_style_layer_composition(ctx: PipelineContext, base_video_basename: str):
    dsl_path = Path(ctx.work_dir) / "dsl.json"
    dsl_path.write_text(json.dumps(ctx.dsl, ensure_ascii=False), encoding="utf-8")
    variables_path = Path(ctx.work_dir) / "variables.json"
    variables_path.write_text(
        json.dumps(ctx.variables or {}, ensure_ascii=False),
        encoding="utf-8",
    )
    if not _COMPOSER_SCRIPT.exists():
        raise RuntimeError(f"Missing composer script: {_COMPOSER_SCRIPT}")
    result = _run_cmd(
        _cli_cmd(
            "tsx",
            str(_COMPOSER_SCRIPT),
            str(dsl_path),
            ctx.work_dir,
            str(variables_path),
            base_video_basename,
        ),
        cwd=str(_GUIDE_ROOT),
    )
    if result.returncode != 0:
        raise RuntimeError(f"HyperFrames style composition failed: {(result.stderr or result.stdout).strip()}")
    index_path = Path(ctx.work_dir) / "index.html"
    if not index_path.exists():
        raise RuntimeError("Style-layer composer finished without index.html")
    if _HYPERFRAMES_JSON.exists():
        shutil.copy2(_HYPERFRAMES_JSON, Path(ctx.work_dir) / "hyperframes.json")


def apply_hf_style_pass(ctx: PipelineContext, base_video_path: str, output_path: str) -> str:
    """Overlay HF captions/transitions/VFX on an FFmpeg-assembled base video."""
    if not os.path.exists(base_video_path):
        raise RuntimeError(f"HF style pass base video missing: {base_video_path}")
    if not shutil.which("npx"):
        raise RuntimeError("npx is not available for HyperFrames style pass")

    base_name = os.path.basename(base_video_path)
    ctx.report_progress("assemble", 88, "正在叠加 HyperFrames 动效样式层...")
    _write_style_layer_composition(ctx, base_name)
    _link_static_assets(ctx.work_dir)
    lint_errors = _lint_blocking_errors(ctx.work_dir)
    if lint_errors:
        raise RuntimeError(f"HyperFrames style lint failed: {'; '.join(lint_errors[:3])}")

    fps = int(ctx.dsl.get("globalConfig", {}).get("fps") or 30)
    render = _run_hyperframes(
        ["render", ".", "-o", output_path, "-f", str(fps), "-q", "draft"],
        ctx.work_dir,
    )
    if render.returncode != 0:
        raise RuntimeError(f"HyperFrames style render failed: {(render.stderr or render.stdout).strip()}")
    if not os.path.exists(output_path):
        raise RuntimeError("HyperFrames style render finished without output file")
    return output_path