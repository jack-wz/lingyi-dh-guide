"""AI full-auto pipeline: generates script and scenes from a topic or script.

This pipeline uses an LLM to produce a complete segment list with narration
and scene descriptions, then reuses the standard video generation stages.
"""

import os
import asyncio
import json

from worker.pipelines import BasePipeline, pipeline_registry
from worker.context import PipelineContext
from worker.ai_clients.llm_client import LLMClient
from worker.stage1_parser import parse_template
from worker.human_assets import resolve_human_assets_on_segments
from worker.stage2_scene_gen import generate_scene_images
from worker.stage3_video_gen import generate_segment_videos
from worker.avatar_provider import resolve_avatar_adapter
from worker.stage4_ffmpeg import assemble_final_video


class AIFullAutoPipeline(BasePipeline):
    name = "ai_full_auto"
    description = "AI 全自动：根据主题/脚本自动生成口播文案、场景描述并渲染"

    async def setup(self, ctx: PipelineContext):
        os.makedirs(ctx.work_dir, exist_ok=True)

    async def parse(self, ctx: PipelineContext):
        # Determine input mode from DSL meta or fall back to topic
        meta = ctx.dsl.get("meta", {})
        input_mode = meta.get("input_mode", "topic")
        topic = meta.get("topic", "")
        script_text = meta.get("script_text", "")

        llm = LLMClient()

        if input_mode == "topic":
            ctx.report_progress("parsing", 3, "LLM 正在根据主题生成脚本...")
            generated = await asyncio.to_thread(
                llm.generate_json,
                (
                    "你是一位短视频编导。根据用户给出的主题，生成一段适合数字人口播的短视频脚本。"
                    "输出严格 JSON：{\"title\": string, \"segments\": [{\"narration\": string, \"scene_description\": string, \"shot\": string, \"duration_sec\": number}]}. "
                    "segments 长度 3-6 个，每个 narration 控制在 80-180 个中文字符，duration_sec 按语速估算。"
                ),
                f"主题：{topic or '产品短视频'}",
            )
        elif input_mode == "script":
            ctx.report_progress("parsing", 3, "LLM 正在拆分脚本并补充场景...")
            generated = await asyncio.to_thread(
                llm.generate_json,
                (
                    "你是一位短视频编导。用户会给定一段完整脚本，请将其拆分为适合数字人口播的分镜。"
                    "每个分镜包含 narration（口语化口播文案，可基于原文微调）、scene_description（画面描述）、shot（镜头建议）、duration_sec（时长）。"
                    "输出严格 JSON：{\"title\": string, \"segments\": [{\"narration\", \"scene_description\", \"shot\", \"duration_sec\"}]}."
                ),
                f"脚本：{script_text}",
            )
        else:
            # template mode should not normally hit this pipeline, but handle gracefully
            generated = {"title": meta.get("name", ""), "segments": []}

        segments_data = generated.get("segments", []) if isinstance(generated, dict) else []

        if not segments_data:
            raise RuntimeError("LLM 未返回有效的分镜脚本")

        # Materialize DSL from generated segments
        template_segments = ctx.dsl.get("segments", [])
        base_segment = template_segments[0] if template_segments else {}
        global_config = ctx.dsl.get("globalConfig", {}) or {}
        dh_id = (ctx.dsl.get("meta") or {}).get("digital_human_id") or ctx.digital_human.get("id", "")
        default_subtitle = {
            "enabled": True,
            "style_id": global_config.get("subtitle_style")
            or (global_config.get("brand_pack") or {}).get("subtitleStyle")
            or (base_segment.get("subtitle") or {}).get("style_id")
            or "default",
            "position": "bottom",
            "animation": (base_segment.get("subtitle") or {}).get("animation", "fadeIn"),
        }
        now = asyncio.get_event_loop().time()

        new_segments = []
        for i, seg in enumerate(segments_data):
            narration = seg.get("narration", "")
            duration = seg.get("duration_sec") or max(4, min(14, len(narration) // 5))
            merged = {
                **base_segment,
                "id": f"ai-{int(now)}-{i + 1}",
                "index": i,
                "type": "narration",
                "narration_text": narration,
                "duration_sec": duration,
                "scene_description": seg.get("scene_description", "") or seg.get("shot", ""),
                "camera_shot": seg.get("shot", ""),
                "scene_image_url": "",
                "segment_bgm_url": "",
                "thumbnail_url": "",
                "avatar_id": dh_id or base_segment.get("avatar_id", ""),
                "subtitle": {**default_subtitle, **(base_segment.get("subtitle") or {})},
                "diagnostics": ["由 AI 全自动流水线生成"],
                "digital_human": {**(base_segment.get("digital_human") or {}), "enabled": True},
            }
            new_segments.append(merged)

        ctx.dsl["segments"] = new_segments
        ctx.dsl["meta"] = {
            **meta,
            "ai_generated": True,
            "ai_title": generated.get("title", meta.get("name", "")),
        }

        result = await asyncio.to_thread(parse_template, ctx.dsl, ctx.variables)
        ctx.segments = result["segments"]
        ctx.overlays = result["overlays"]
        ctx.total_duration = result["total_duration"]
        ctx.resolved_variables = result["resolved_variables"]
        ctx.report_progress("parsing", 20, f"AI 生成 {len(new_segments)} 个分镜")

    async def generate_scenes(self, ctx: PipelineContext):
        human_photos = {
            "face_photo_url": ctx.digital_human.get("face_photo_url", ""),
            "half_body_photo_url": ctx.digital_human.get("half_body_photo_url", ""),
            "full_body_photo_url": ctx.digital_human.get("full_body_photo_url", ""),
        }
        await asyncio.to_thread(
            generate_scene_images,
            {"segments": ctx.segments, "globalConfig": ctx.dsl.get("globalConfig", {})},
            human_photos,
            ctx.work_dir,
            ctx.server_base_url,
            lambda stage, progress, msg="": ctx.on_progress(stage, progress, msg),
            **ctx.stage_kwargs(),
        )
        await asyncio.to_thread(
            resolve_human_assets_on_segments,
            ctx.segments,
            ctx.digital_human or human_photos,
            ctx.work_dir,
            ctx.server_base_url,
        )

    async def generate_videos(self, ctx: PipelineContext):
        voice_clone_id = ctx.digital_human.get("voice_clone_id", "")
        human_photos = ctx.digital_human or {}
        voice_sample_url = ctx.digital_human.get("voice_sample_url", "")
        adapter = resolve_avatar_adapter(ctx.server_base_url)
        await asyncio.to_thread(
            generate_segment_videos,
            ctx.segments,
            ctx.dsl.get("globalConfig", {}),
            voice_clone_id,
            human_photos,
            ctx.work_dir,
            ctx.server_base_url,
            lambda stage, progress, msg="": ctx.on_progress(stage, progress, msg),
            voice_sample_url,
            avatar_adapter=adapter,
            digital_human_id=ctx.digital_human.get("id", ""),
            **ctx.stage_kwargs(),
        )

    async def assemble(self, ctx: PipelineContext) -> str:
        output_path = os.path.join(ctx.work_dir, "final.mp4")
        await asyncio.to_thread(
            assemble_final_video,
            ctx.segments,
            ctx.overlays,
            ctx.dsl.get("globalConfig", {}),
            ctx.work_dir,
            output_path,
            lambda stage, progress, msg="": ctx.on_progress(stage, progress, msg),
            job_logger=ctx.job_logger,
        )
        return output_path


pipeline_registry.register("ai_full_auto", AIFullAutoPipeline())
