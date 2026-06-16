"""Standard pipeline - wraps existing 4-stage logic into Pipeline pattern."""

import os
import asyncio
from worker.pipelines import BasePipeline, pipeline_registry
from worker.context import PipelineContext
from worker.stage1_parser import parse_template
from worker.stage2_scene_gen import generate_scene_images
from worker.stage3_video_gen import generate_segment_videos
from worker.stage4_ffmpeg import assemble_final_video
from worker.avatar_provider import resolve_avatar_adapter


class StandardPipeline(BasePipeline):
    name = "standard"
    description = "标准视频生成：模板解析 → 场景图 → 分镜视频 → FFmpeg 组装"

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

    async def generate_scenes(self, ctx: PipelineContext):
        human_photos = ctx.digital_human or {}
        resolved_script = {
            "segments": ctx.segments,
            "globalConfig": ctx.dsl.get("globalConfig", {}),
            "overlays": ctx.overlays,
            "total_duration": ctx.total_duration,
            "resolved_variables": ctx.resolved_variables,
        }
        await asyncio.to_thread(
            generate_scene_images,
            resolved_script, human_photos, ctx.work_dir,
            ctx.server_base_url, ctx.on_progress
        )

    async def generate_videos(self, ctx: PipelineContext):
        voice_clone_id = ctx.digital_human.get("voice_clone_id", "")
        human_photos = ctx.digital_human or {}
        voice_sample_url = ctx.digital_human.get("voice_sample_url", "")
        adapter = resolve_avatar_adapter(ctx.server_base_url)
        await asyncio.to_thread(
            generate_segment_videos,
            ctx.segments, ctx.dsl.get("globalConfig", {}),
            voice_clone_id, human_photos, ctx.work_dir,
            ctx.server_base_url, ctx.on_progress, voice_sample_url,
            avatar_adapter=adapter,
        )

    async def assemble(self, ctx: PipelineContext) -> str:
        output_path = os.path.join(ctx.work_dir, "final.mp4")
        await asyncio.to_thread(
            assemble_final_video,
            ctx.segments, ctx.overlays,
            ctx.dsl.get("globalConfig", {}),
            ctx.work_dir, output_path, ctx.on_progress
        )
        return output_path


# Register on import
pipeline_registry.register("standard", StandardPipeline())
