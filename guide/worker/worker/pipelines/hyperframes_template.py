"""HyperFrames template pipeline — renders editor DSL via shared TS composer + hyperframes CLI."""

import asyncio
import json
import os
import shutil
import subprocess
from pathlib import Path

from worker.pipelines import BasePipeline, pipeline_registry
from worker.context import PipelineContext

_GUIDE_ROOT = Path(__file__).resolve().parents[3]
_COMPOSER_SCRIPT = _GUIDE_ROOT / "scripts" / "write_hf_composition.ts"
_HYPERFRAMES_JSON = _GUIDE_ROOT / "compositions" / "hyperframes.json"
# Guide-native adapters register per-clip GSAP timelines; HF lint still flags missing root timeline.
_LINT_IGNORE_CODES = frozenset({
    "gsap_timeline_not_registered",
    "font_family_without_font_face",
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
    """Expose guide/data/uploads under work_dir so HF lint/render resolve /uploads/* src."""
    from worker.config import DATA_DIR, UPLOADS_DIR

    work = Path(work_dir)
    uploads_link = work / "uploads"
    if not uploads_link.exists() and Path(UPLOADS_DIR).is_dir():
        uploads_link.symlink_to(UPLOADS_DIR, target_is_directory=True)

    brand_fonts_src = Path(DATA_DIR) / "brand-fonts"
    brand_fonts_link = work / "brand-fonts"
    if brand_fonts_src.is_dir() and not brand_fonts_link.exists():
        brand_fonts_link.symlink_to(brand_fonts_src, target_is_directory=True)


def _write_composition(ctx: PipelineContext):
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
        ),
        cwd=str(_GUIDE_ROOT),
    )
    if result.returncode != 0:
        raise RuntimeError(f"HyperFrames composition failed: {(result.stderr or result.stdout).strip()}")
    index_path = Path(ctx.work_dir) / "index.html"
    if not index_path.exists():
        raise RuntimeError("Composer finished without index.html")
    if _HYPERFRAMES_JSON.exists():
        shutil.copy2(_HYPERFRAMES_JSON, Path(ctx.work_dir) / "hyperframes.json")


def _validate_hyperframes_output(ctx: PipelineContext, output_path: str) -> None:
    from worker.utils import get_duration

    if not os.path.exists(output_path):
        raise RuntimeError(f"HyperFrames output missing: {output_path}")
    duration = get_duration(output_path)
    if duration <= 0:
        raise RuntimeError("HyperFrames final.mp4 unreadable or zero duration")
    expected = sum(float(seg.get("duration_sec") or 0) for seg in (ctx.dsl.get("segments") or []))
    if expected > 0 and abs(duration - expected) > 1.5:
        raise RuntimeError(
            f"HyperFrames duration {duration:.2f}s differs from DSL {expected:.2f}s"
        )


class HyperFramesTemplatePipeline(BasePipeline):
    name = "hyperframes_template"
    description = "HyperFrames 模板：使用 HTML composition 渲染当前编辑器图层"

    async def validate_timeline(self, ctx: PipelineContext, output_path: str):
        await asyncio.to_thread(_validate_hyperframes_output, ctx, output_path)

    async def setup(self, ctx: PipelineContext):
        os.makedirs(ctx.work_dir, exist_ok=True)

    async def parse(self, ctx: PipelineContext):
        ctx.report_progress("parsing", 10, "正在生成 HyperFrames composition...")
        from worker.config import _load_json
        from worker.whisper_aligner import apply_whisper_subtitle_timings

        segments = ctx.dsl.get("segments") or []
        if segments:
            apply_whisper_subtitle_timings(segments, work_dir=ctx.work_dir, config=_load_json())
            ctx.dsl["segments"] = segments
        _write_composition(ctx)
        ctx.resolved_variables = {}
        ctx.segments = ctx.dsl.get("segments", [])
        ctx.overlays = []
        ctx.total_duration = sum(float(seg.get("duration_sec") or 0) for seg in ctx.segments)

    async def generate_scenes(self, ctx: PipelineContext):
        ctx.report_progress("scene_gen", 25, "HyperFrames：跳过 AI 场景图生成")

    async def generate_videos(self, ctx: PipelineContext):
        ctx.report_progress("video_gen", 40, "正在校验 HyperFrames composition...")
        if not shutil.which("npx"):
            raise RuntimeError("npx is not available. Install Node.js and ensure `npx` is on PATH.")
        _link_static_assets(ctx.work_dir)
        lint_errors = _lint_blocking_errors(ctx.work_dir)
        if lint_errors:
            raise RuntimeError(f"HyperFrames lint failed: {'; '.join(lint_errors[:3])}")

    async def assemble(self, ctx: PipelineContext) -> str:
        output_path = os.path.join(ctx.work_dir, "final.mp4")
        fps = int(ctx.dsl.get("globalConfig", {}).get("fps") or 30)
        ctx.report_progress("assemble", 80, "正在使用 HyperFrames 渲染最终视频...")
        render = _run_hyperframes(
            ["render", ".", "-o", output_path, "-f", str(fps), "-q", "draft"],
            ctx.work_dir,
        )
        if render.returncode != 0:
            raise RuntimeError(f"HyperFrames render failed: {(render.stderr or render.stdout).strip()}")
        if not os.path.exists(output_path):
            raise RuntimeError("HyperFrames render finished without output file")
        return output_path


pipeline_registry.register("hyperframes_template", HyperFramesTemplatePipeline())