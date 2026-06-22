"""Digital Human pipeline - optimized for talking head videos."""

import os
import asyncio
from worker.pipelines import BasePipeline, pipeline_registry
from worker.context import PipelineContext
from worker.avatar_provider import resolve_avatar_adapter
from worker.stage1_parser import parse_template
from worker.human_assets import resolve_human_assets_on_segments
from worker.stage3_video_gen import generate_segment_videos
from worker.stage4_ffmpeg import assemble_final_video


class DigitalHumanPipeline(BasePipeline):
    name = "digital_human"
    description = "数字人口播：跳过场景图生成，直接用数字人视频"

    async def setup(self, ctx: PipelineContext):
        os.makedirs(ctx.work_dir, exist_ok=True)

    async def parse(self, ctx: PipelineContext):
        result = await asyncio.to_thread(
            parse_template, ctx.dsl, ctx.variables
        )
        ctx.segments = result["segments"]
        ctx.overlays = result["overlays"]
        ctx.total_duration = result["total_duration"]
        ctx.resolved_variables = result["resolved_variables"]

        # Force enable digital human on all segments
        for seg in ctx.segments:
            if hasattr(seg, 'get'):
                seg.setdefault("digital_human", {})
                seg["digital_human"]["enabled"] = True

    async def generate_scenes(self, ctx: PipelineContext):
        import asyncio

        ctx.report_progress("scene_gen", 15, "数字人模式：解析数字人素材...")
        human_photos = ctx.digital_human or {}
        await asyncio.to_thread(
            resolve_human_assets_on_segments,
            ctx.segments,
            human_photos,
            ctx.work_dir,
            ctx.server_base_url,
        )
        ctx.report_progress("scene_gen", 25, "数字人素材就绪")

    async def generate_videos(self, ctx: PipelineContext):
        adapter = resolve_avatar_adapter(ctx.server_base_url)
        voice_clone_id = ctx.digital_human.get("voice_clone_id", "")
        human_photos = ctx.digital_human or {}
        voice_sample_url = ctx.digital_human.get("voice_sample_url", "")
        await asyncio.to_thread(
            generate_segment_videos,
            ctx.segments, ctx.dsl.get("globalConfig", {}),
            voice_clone_id, human_photos, ctx.work_dir,
            ctx.server_base_url, ctx.on_progress, voice_sample_url,
            avatar_adapter=adapter,
            digital_human_id=ctx.digital_human.get("id", ""),
            **ctx.stage_kwargs(),
        )

    async def assemble(self, ctx: PipelineContext) -> str:
        output_path = os.path.join(ctx.work_dir, "final.mp4")
        await asyncio.to_thread(
            assemble_final_video,
            ctx.segments, ctx.overlays,
            ctx.dsl.get("globalConfig", {}),
            ctx.work_dir, output_path, ctx.on_progress,
            job_logger=ctx.job_logger,
            resolved_variables=ctx.resolved_variables,
        )
        return output_path


pipeline_registry.register("digital_human", DigitalHumanPipeline())
