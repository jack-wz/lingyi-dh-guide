"""Avatar-talk pipeline: talking-head centric generation using AvatarAdapter.

This pipeline is functionally close to digital_human but routes talking-head
generation through the unified AvatarAdapter interface (inspired by OpenTalking),
making it easier to swap WaveSpeed/SadTalker/Synthesia providers later.
"""

import os
import asyncio

from worker.pipelines import BasePipeline, pipeline_registry
from worker.context import PipelineContext
from worker.avatar_provider import resolve_avatar_adapter
from worker.config import get_avatar_provider
from worker.stage1_parser import parse_template
from worker.stage3_video_gen import generate_segment_videos
from worker.stage4_ffmpeg import assemble_final_video


class AvatarTalkPipeline(BasePipeline):
    name = "avatar_talk"
    description = "数字人对口播：通过 AvatarAdapter 统一接口生成唇形同步视频"

    async def setup(self, ctx: PipelineContext):
        os.makedirs(ctx.work_dir, exist_ok=True)

    async def parse(self, ctx: PipelineContext):
        result = await asyncio.to_thread(parse_template, ctx.dsl, ctx.variables)
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
        # Avatar talk can optionally skip scene images and composite avatar over
        # a solid or blurred background; here we keep scene generation so the
        # fallback composition still works.
        ctx.report_progress("scene_gen", 25, "AvatarTalk：跳过场景图生成，使用数字人直接合成")

    async def generate_videos(self, ctx: PipelineContext):
        provider = get_avatar_provider()
        adapter = resolve_avatar_adapter(ctx.server_base_url)
        print(f"[AvatarTalk] Using avatar provider: {provider}")

        voice_clone_id = ctx.digital_human.get("voice_clone_id", "")
        human_photos = ctx.digital_human or {}
        voice_sample_url = ctx.digital_human.get("voice_sample_url", "")
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


pipeline_registry.register("avatar_talk", AvatarTalkPipeline())
