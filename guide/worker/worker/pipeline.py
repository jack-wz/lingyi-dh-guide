"""Pipeline orchestrator - coordinates the 4-stage video generation pipeline."""

import json
import os
import shutil
import sys

from worker.stage1_parser import parse_template
from worker.stage2_scene_gen import generate_scene_images
from worker.stage3_video_gen import generate_segment_videos
from worker.stage4_ffmpeg import assemble_final_video
from worker.timeline_sync import (
    reconcile_timeline,
    validate_job_after_assembly,
    write_segments_manifest,
)
from worker.config import get_pipeline_config
from worker.config import RENDERS_DIR, UPLOADS_DIR
from worker.utils import ensure_dir, check_ffmpeg


class FileLogger:
    """Write logs to both stdout and a file."""
    def __init__(self, log_path):
        self.log_path = log_path
        self.file = open(log_path, 'w', encoding='utf-8')
        self.stdout = sys.stdout
    
    def write(self, msg):
        self.stdout.write(msg)
        self.file.write(msg)
        self.file.flush()
    
    def flush(self):
        self.stdout.flush()
        self.file.flush()
    
    def close(self):
        self.file.close()


def run_pipeline(
    dsl: dict,
    variables: dict,
    digital_human: dict,
    job_id: str,
    server_base_url: str = "",
    on_progress=None,
) -> str:
    """Execute the full 4-stage video generation pipeline.

    Args:
        dsl: Template DSL (parsed JSON)
        variables: User-provided variable values
        digital_human: Digital human data (photos, voice_clone_id, etc.)
        job_id: Render job ID
        server_base_url: Base URL of the server for resolving relative paths
        on_progress: Callback(stage, progress, message)

    Returns:
        Path to the output MP4 file
    """
    # Setup working directory
    work_dir = os.path.join(RENDERS_DIR, f"job_{job_id}")
    ensure_dir(work_dir)
    
    # Setup file logging
    log_path = os.path.join(work_dir, "pipeline.log")
    logger = FileLogger(log_path)
    old_stdout = sys.stdout
    sys.stdout = logger

    print(f"[Pipeline] Starting job {job_id}")
    print(f"[Pipeline] Work dir: {work_dir}")
    print(f"[Pipeline] DSL: {json.dumps(dsl, ensure_ascii=False)[:500]}...")
    print(f"[Pipeline] Variables: {variables}")
    print(f"[Pipeline] Digital Human: {json.dumps(digital_human, ensure_ascii=False)}")

    # Verify ffmpeg
    if not check_ffmpeg():
        raise RuntimeError("FFmpeg is not available. Please install ffmpeg.")

    try:
        # === Stage 1: Parse template ===
        print("[Pipeline] === Stage 1: Template Parsing ===")
        if on_progress:
            on_progress("parsing", 5, "解析模板中...")

        resolved = parse_template(dsl, variables)
        print(f"[Pipeline] Resolved: {len(resolved['segments'])} segments, "
              f"duration={resolved['total_duration']}s")

        if on_progress:
            on_progress("parsing", 20, f"模板解析完成 ({len(resolved['segments'])} 个片段)")

        # === Stage 2: Scene image generation ===
        print("[Pipeline] === Stage 2: Scene Image Generation ===")
        human_photos = {
            "face_photo_url": digital_human.get("face_photo_url", ""),
            "half_body_photo_url": digital_human.get("half_body_photo_url", ""),
            "full_body_photo_url": digital_human.get("full_body_photo_url", ""),
        }

        segments = generate_scene_images(
            resolved, human_photos, work_dir, server_base_url, on_progress,
        )

        # === Stage 3: Video generation ===
        print("[Pipeline] === Stage 3: Video Generation ===")
        voice_clone_id = digital_human.get("voice_clone_id", "")
        voice_sample_url = digital_human.get("voice_sample_url", "")

        segments = generate_segment_videos(
            segments,
            resolved["globalConfig"],
            voice_clone_id,
            human_photos,
            work_dir,
            server_base_url,
            on_progress,
            voice_sample_url=voice_sample_url,
        )

        # === Stage 4: FFmpeg assembly ===
        print("[Pipeline] === Stage 4: FFmpeg Assembly ===")
        synced = reconcile_timeline(
            segments, resolved.get("overlays", []), work_dir=work_dir
        )
        segments = synced["segments"]
        overlays = synced["overlays"]
        write_segments_manifest(segments, overlays, work_dir, extra={"job_id": job_id})
        print(f"[Pipeline] Timeline reconciled: total={synced['total_duration']}s")

        output_filename = f"{job_id}.mp4"
        output_path = os.path.join(RENDERS_DIR, output_filename)

        result_path = assemble_final_video(
            segments,
            overlays,
            resolved["globalConfig"],
            work_dir,
            output_path,
            on_progress,
        )

        if on_progress:
            on_progress("validate", 96, "校验字幕/TTS/贴纸时间轴...")
        pipeline_cfg = get_pipeline_config()
        validate_job_after_assembly(
            work_dir,
            job_id=job_id,
            strict=pipeline_cfg["timeline_validate_strict"],
            enabled=pipeline_cfg["timeline_validate"],
        )

        print(f"[Pipeline] Complete: {result_path}")
        return result_path

    except Exception as e:
        print(f"[Pipeline] Failed: {e}")
        raise
    finally:
        # Restore stdout and close logger
        sys.stdout = old_stdout
        logger.close()
        # Always keep work dir for debugging
        pass
