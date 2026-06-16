"""Asset-driven pipeline: generate a video from a list of uploaded assets.

Each asset becomes a segment. If narration text is missing, an LLM is asked to
draft short narration based on the asset description/filename.
"""

import os
import asyncio

from worker.pipelines import BasePipeline, pipeline_registry
from worker.context import PipelineContext
from worker.ai_clients.llm_client import LLMClient
from worker.avatar_provider import resolve_avatar_adapter
from worker.stage1_parser import parse_template
from worker.stage2_scene_gen import generate_scene_images
from worker.stage3_video_gen import generate_segment_videos
from worker.stage4_ffmpeg import assemble_final_video


class AssetDrivenPipeline(BasePipeline):
    name = "asset_driven"
    description = "素材驱动：根据上传的素材列表自动生成口播视频"

    async def setup(self, ctx: PipelineContext):
        os.makedirs(ctx.work_dir, exist_ok=True)

    async def parse(self, ctx: PipelineContext):
        meta = ctx.dsl.get("meta", {})
        asset_urls = ctx.dsl.get("globalConfig", {}).get("asset_urls", [])
        if not isinstance(asset_urls, list) or not asset_urls:
            asset_urls = meta.get("asset_urls", [])

        template_segments = ctx.dsl.get("segments", [])
        base_segment = template_segments[0] if template_segments else {}

        if asset_urls:
            new_segments = []
            llm = LLMClient()
            for i, url in enumerate(asset_urls[:20]):
                seg = {**(base_segment or {})}
                narration = seg.get("narration_text", "")
                if not narration:
                    try:
                        filename = url.split("/")[-1].split("?")[0]
                        draft = await asyncio.to_thread(
                            llm.generate_json,
                            (
                                "你是一位短视频口播文案助手。根据素材文件名/URL，生成一段 30-80 字的简短口播文案。"
                                "输出严格 JSON：{\"narration\": string, \"scene_description\": string}"
                            ),
                            f"素材 URL：{url}\n文件名：{filename}",
                        )
                        narration = draft.get("narration", "") if isinstance(draft, dict) else ""
                        seg["scene_description"] = draft.get("scene_description", seg.get("scene_description", ""))
                    except Exception as e:
                        print(f"[AssetDriven] LLM draft failed for asset {url}: {e}")
                        narration = ""

                new_segments.append({
                    **seg,
                    "id": f"asset-{i + 1}",
                    "index": i,
                    "type": "narration",
                    "narration_text": narration or f"素材 {i + 1}",
                    "duration_sec": seg.get("duration_sec", 5),
                    "scene_image_url": url if url.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")) else seg.get("scene_image_url", ""),
                    "scene_description": seg.get("scene_description", f"素材 {i + 1}"),
                    "diagnostics": ["由素材驱动流水线生成"],
                    "digital_human": {**(seg.get("digital_human") or {}), "enabled": True},
                })
            ctx.dsl["segments"] = new_segments

        result = await asyncio.to_thread(parse_template, ctx.dsl, ctx.variables)
        ctx.segments = result["segments"]
        ctx.overlays = result["overlays"]
        ctx.total_duration = result["total_duration"]
        ctx.resolved_variables = result["resolved_variables"]
        ctx.report_progress("parsing", 20, f"素材驱动生成 {len(ctx.segments)} 个分镜")

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


pipeline_registry.register("asset_driven", AssetDrivenPipeline())
