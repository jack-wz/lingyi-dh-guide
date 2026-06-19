"""HyperFrames template pipeline — renders editor DSL via shared TS composer + hyperframes CLI."""

import json
import os
import shutil
import subprocess
from pathlib import Path

from worker.pipelines import BasePipeline, pipeline_registry
from worker.context import PipelineContext

_GUIDE_ROOT = Path(__file__).resolve().parents[3]
_COMPOSER_SCRIPT = _GUIDE_ROOT / "scripts" / "write_hf_composition.ts"


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


class HyperFramesTemplatePipeline(BasePipeline):
    name = "hyperframes_template"
    description = "HyperFrames 模板：使用 HTML composition 渲染当前编辑器图层"

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
        lint = _run_hyperframes(["lint", "."], ctx.work_dir)
        if lint.returncode != 0:
            raise RuntimeError(f"HyperFrames lint failed: {(lint.stderr or lint.stdout).strip()}")
        inspect = _run_hyperframes(["inspect", ".", "--json"], ctx.work_dir)
        if inspect.returncode != 0:
            raise RuntimeError(f"HyperFrames inspect failed: {(inspect.stderr or inspect.stdout).strip()}")

    async def assemble(self, ctx: PipelineContext) -> str:
        output_path = os.path.join(ctx.work_dir, "final.mp4")
        fps = int(ctx.dsl.get("globalConfig", {}).get("fps") or 30)
        ctx.report_progress("assemble", 80, "正在使用 HyperFrames 渲染最终视频...")
        render = _run_hyperframes(
            ["render", "--input", "index.html", "--output", output_path, "--fps", str(fps)],
            ctx.work_dir,
        )
        if render.returncode != 0:
            raise RuntimeError(f"HyperFrames render failed: {(render.stderr or render.stdout).strip()}")
        if not os.path.exists(output_path):
            raise RuntimeError("HyperFrames render finished without output file")
        return output_path


pipeline_registry.register("hyperframes_template", HyperFramesTemplatePipeline())