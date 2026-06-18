"""Pipeline base class using Template Method pattern (inspired by Pixelle-Video).

Subclasses override specific steps to customize behavior.
The base class defines the lifecycle:
    setup -> parse -> generate_scenes -> generate_videos -> assemble -> finalize
"""

import asyncio
import os
import time
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from worker.context import PipelineContext


class BasePipeline(ABC):
    """Abstract base pipeline with Template Method lifecycle."""

    name: str = "base"
    description: str = ""

    async def __call__(self, ctx: "PipelineContext") -> str:
        """Execute the full pipeline lifecycle."""
        start_time = time.time()

        log = ctx.job_logger
        try:
            ctx.report_progress("setup", 2, "初始化任务环境...")
            if log:
                log.stage_begin("Pipeline", f"setup — {self.name}")
            await self.setup(ctx)
            if log:
                log.stage_end("Pipeline", "setup 完成")

            ctx.report_progress("parsing", 5, "解析模板...")
            if log:
                log.stage_begin("Stage1", "解析模板与变量")
            await self.parse(ctx)
            if log:
                log.stage_end("Stage1", f"解析完成，{len(ctx.segments)} 个分镜")

            ctx.report_progress("scene_gen", 15, "生成场景图...")
            await self.generate_scenes(ctx)

            ctx.report_progress("video_gen", 40, "生成分镜视频...")
            await self.generate_videos(ctx)

            ctx.report_progress("assemble", 80, "组装最终视频...")
            if log:
                log.stage_begin("Stage4", "FFmpeg 组装与字幕烧录")
            output = await self.assemble(ctx)
            if log:
                log.stage_end("Stage4", f"成片输出 → {output}")

            ctx.report_progress("validate", 96, "校验字幕/TTS/贴纸时间轴...")
            if log:
                log.stage_begin("Validate", "时间轴校验")
            await self.validate_timeline(ctx, output)
            if log:
                log.stage_end("Validate", "时间轴校验通过")

            ctx.report_progress("completed", 100, "视频生成完成!")

            elapsed = time.time() - start_time
            if log:
                log.info("Pipeline", "END", f"流水线完成，耗时 {elapsed:.1f}s")
            await self.finalize(ctx, output, elapsed)

            return output

        except Exception as e:
            if log:
                log.error("Pipeline", "FAILED", str(e))
            ctx.report_progress("failed", 0, f"失败: {str(e)}")
            raise

    @abstractmethod
    async def setup(self, ctx: "PipelineContext"):
        """Create task directory and prepare resources."""
        os.makedirs(ctx.work_dir, exist_ok=True)

    @abstractmethod
    async def parse(self, ctx: "PipelineContext"):
        """Parse DSL, resolve variables, compute timeline."""

    @abstractmethod
    async def generate_scenes(self, ctx: "PipelineContext"):
        """Generate scene images via AI."""

    @abstractmethod
    async def generate_videos(self, ctx: "PipelineContext"):
        """Generate per-segment video clips (TTS + video)."""

    @abstractmethod
    async def assemble(self, ctx: "PipelineContext") -> str:
        """Assemble final video from clips."""

    async def validate_timeline(self, ctx: "PipelineContext", output_path: str):
        """Verify clip/TTS/subtitle alignment after assembly."""
        from worker.config import get_pipeline_config
        from worker.timeline_sync import validate_job_after_assembly

        cfg = get_pipeline_config()
        await asyncio.to_thread(
            validate_job_after_assembly,
            ctx.work_dir,
            job_id=ctx.task_id,
            strict=cfg["timeline_validate_strict"],
            enabled=cfg["timeline_validate"],
        )

    async def finalize(self, ctx: "PipelineContext", output_path: str, elapsed: float):
        """Post-completion hook. Override for custom behavior."""
        ctx.output_path = output_path


class PipelineRegistry:
    """Registry for pipeline implementations (inspired by Pixelle-Video)."""

    def __init__(self):
        self._pipelines: dict[str, BasePipeline] = {}

    def register(self, key: str, pipeline: BasePipeline):
        self._pipelines[key] = pipeline

    def get(self, key: str) -> BasePipeline:
        if key not in self._pipelines:
            available = ", ".join(self._pipelines.keys())
            raise ValueError(f"Unknown pipeline '{key}'. Available: {available}")
        return self._pipelines[key]

    def list_pipelines(self) -> list[dict]:
        return [
            {"key": k, "name": p.name, "description": p.description}
            for k, p in self._pipelines.items()
        ]


# Global registry instance
pipeline_registry = PipelineRegistry()
