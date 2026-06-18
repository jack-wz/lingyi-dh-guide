"""Stage 3: AI video generation - TTS + talking head for each segment."""

import os
import subprocess
from typing import Optional

from worker.pipeline_log import PipelineLogger, null_logger
from worker.timeline_sync import _DURATION_TOLERANCE_SEC
from worker.utils import ensure_dir, get_duration, download_file, check_ffmpeg
from worker.config import RENDERS_DIR

_CLIP_ALIGN_TOLERANCE_SEC = _DURATION_TOLERANCE_SEC


def _normalize_voice_clone_id(voice_clone_id: str, digital_human_id: str = "") -> str:
    """Ignore placeholder/local ids that are not usable YunTTS voice models."""
    vid = (voice_clone_id or "").strip()
    if not vid:
        return ""
    if vid.startswith("local-voice:"):
        return ""
    if digital_human_id and vid == digital_human_id:
        return ""
    return vid


def generate_segment_videos(
    segments: list[dict],
    global_config: dict,
    voice_clone_id: str,
    human_photos: dict,
    work_dir: str,
    server_base_url: str = "",
    on_progress=None,
    voice_sample_url: str = "",
    avatar_adapter=None,
    tts_adapter=None,
    *,
    strict: bool = True,
    job_logger: Optional[PipelineLogger] = None,
    digital_human_id: str = "",
) -> list[dict]:
    """Generate video clips for each segment.

    Strict mode (default): narration segments require TTS + lip-sync; no silent/Ken Burns fallbacks.
    Non-strict: legacy fallbacks for smoke tests and degraded preview only.
    """
    log = job_logger or null_logger()
    stage = "Stage3"

    if not check_ffmpeg():
        log.fail(stage, "FFmpeg", "FFmpeg 不可用，无法生成分镜视频")

    ensure_dir(work_dir)
    from worker.avatar_provider import resolve_avatar_adapter
    from worker.tts_adapter import tts_registry

    from worker.tts_adapter import YunTTSAdapter

    tts = tts_adapter or tts_registry.get("yuntts")
    avatar = avatar_adapter or resolve_avatar_adapter(server_base_url)
    canvas_w = global_config.get("canvas_width", 1080)
    canvas_h = global_config.get("canvas_height", 1920)
    fps = global_config.get("fps", 30)

    log.stage_begin(stage, f"开始生成分镜视频，共 {len(segments)} 段，strict={strict}")

    effective_voice_id = _normalize_voice_clone_id(voice_clone_id, digital_human_id)
    voice_persisted = False

    def _persist_voice_id(new_id: str, segment_index: int) -> None:
        nonlocal effective_voice_id, voice_persisted
        cleaned = (new_id or "").strip()
        if not cleaned or cleaned == effective_voice_id:
            return
        effective_voice_id = cleaned
        if digital_human_id and not voice_persisted:
            from worker.digital_human_store import persist_voice_clone_id

            if persist_voice_clone_id(digital_human_id, cleaned, server_base_url):
                voice_persisted = True
                log.info(
                    stage,
                    "TTS",
                    f"已持久化 voice_clone_id={cleaned}",
                    segment=segment_index,
                )

    for i, seg in enumerate(segments):
        if on_progress:
            pct = 50 + (i / max(len(segments), 1)) * 25
            on_progress("video_gen", pct, f"生成分镜视频 ({i+1}/{len(segments)})...")

        text = seg.get("narration_text", "").strip()
        duration = seg.get("duration_sec", 5.0)
        scene_path = seg.get("scene_image_path", "")
        human_face_path = seg.get("human_face_path", "")
        clip_path = ""
        tts_path = ""
        has_narration = bool(text)

        log.info(
            stage,
            "Segment",
            f"text_len={len(text)} duration={duration}s scene={scene_path or '(none)'}",
            segment=i,
        )

        if has_narration and strict:
            if not scene_path or not os.path.exists(scene_path):
                log.fail(stage, "SceneImage", "口播分镜缺少有效场景图，无法生成对口型视频", segment=i)

        voice_sample_path = _resolve_voice_sample(
            voice_sample_url, server_base_url, work_dir, log, stage, i,
        )

        if has_narration:
            log.info(stage, "TTS", "开始合成旁白音频", segment=i)
            audio_path = os.path.join(work_dir, f"tts_{i}.wav")
            if digital_human_id:
                voice_name = (
                    digital_human_id[:16]
                    if digital_human_id.startswith("dh_")
                    else f"dh_{digital_human_id[:12]}"
                )
            else:
                voice_name = f"vh_{i}"
            discovered_voice_id = ""

            if effective_voice_id:
                log.info(stage, "TTS", f"使用已存储 voice_id={effective_voice_id}", segment=i)
                tts_path = tts.synthesize(text, effective_voice_id, audio_path)
                if not tts_path:
                    log.warn(stage, "TTS", "存储 voice_id 合成失败，尝试重新克隆", segment=i)
            else:
                log.info(stage, "TTS", "无可用 voice_clone_id，使用音色样本克隆/回退合成", segment=i)
                tts_path = ""

            if not tts_path and voice_sample_path and os.path.exists(voice_sample_path):
                if isinstance(tts, YunTTSAdapter):
                    tts_path, discovered_voice_id = tts.clone_and_synthesize_with_voice_id(
                        text, voice_sample_path, audio_path, voice_name=voice_name
                    )
                else:
                    tts_path = tts.clone_and_synthesize(
                        text, voice_sample_path, audio_path, voice_name=voice_name
                    )
                _persist_voice_id(discovered_voice_id, i)

            if not tts_path:
                if isinstance(tts, YunTTSAdapter):
                    tts_path, discovered_voice_id = tts.synthesize_fallback_with_voice_id(
                        text, audio_path, voice_sample_path, voice_name=voice_name
                    )
                else:
                    tts_path = tts.synthesize_fallback(text, audio_path, voice_sample_path)
                _persist_voice_id(discovered_voice_id, i)

            if tts_path and os.path.exists(tts_path):
                try:
                    audio_dur = get_duration(tts_path)
                    log.info(
                        stage,
                        "TTS",
                        f"合成成功 path={tts_path} duration={audio_dur:.2f}s target={duration:.1f}s",
                        segment=i,
                    )
                    if abs(audio_dur - duration) > 0.5:
                        seg["duration_sec"] = round(audio_dur, 2)
                        duration = seg["duration_sec"]
                        log.info(stage, "TTS", f"按音频时长同步分镜时长 → {duration:.2f}s", segment=i)

                    if audio_dur > duration * 1.1:
                        speed_factor = min(audio_dur / duration, 2.0)
                        log.info(stage, "TTS", f"音频过长，加速 {speed_factor:.2f}x", segment=i)
                        tts_path = _speedup_audio(tts_path, speed_factor, work_dir, i, log, stage, i)
                        if tts_path:
                            audio_dur = get_duration(tts_path)
                            seg["duration_sec"] = round(audio_dur, 2)
                            duration = seg["duration_sec"]
                except Exception as exc:
                    log.warn(stage, "TTS", f"读取音频时长失败: {exc}", segment=i)
            elif strict:
                log.fail(
                    stage,
                    "TTS",
                    "旁白 TTS 合成失败（请检查 YunTTS 网络/API Key/音色样本）",
                    segment=i,
                )
            else:
                log.warn(stage, "TTS", "合成失败，非 strict 模式将尝试无音频回退", segment=i)
                tts_path = ""

        avatar_image = ""
        if scene_path and os.path.exists(scene_path):
            avatar_image = scene_path
        elif human_face_path and os.path.exists(human_face_path):
            avatar_image = human_face_path

        human_config = dict(human_photos or {})
        if effective_voice_id:
            human_config["voice_clone_id"] = effective_voice_id
        if voice_sample_url:
            human_config["voice_sample_url"] = voice_sample_url

        can_use_talking_head = bool(
            avatar_image and tts_path and os.path.exists(tts_path)
        )

        if has_narration:
            if not can_use_talking_head:
                if strict:
                    log.fail(
                        stage,
                        "LipSync",
                        f"无法启动对口型（scene={bool(avatar_image)} tts={bool(tts_path)}）",
                        segment=i,
                    )
            else:
                log.info(stage, "LipSync", "开始 InfiniteTalk 对口型生成", segment=i)
                clip_path = _generate_narration_clip(
                    seg,
                    i,
                    text,
                    duration,
                    avatar_image,
                    tts_path,
                    work_dir,
                    canvas_w,
                    canvas_h,
                    fps,
                    server_base_url,
                    avatar,
                    human_config,
                    strict=strict,
                    log=log,
                )
                if clip_path:
                    aligned_dur = _align_lipsync_clip_to_tts(
                        clip_path,
                        tts_path,
                        log=log,
                        stage=stage,
                        segment=i,
                    )
                    if aligned_dur > 0:
                        seg["duration_sec"] = round(aligned_dur, 2)
                    log.info(stage, "LipSync", f"对口型成功 → {clip_path}", segment=i)
                elif strict:
                    log.fail(stage, "LipSync", "对口型视频生成失败", segment=i)
        elif scene_path and os.path.exists(scene_path):
            log.info(stage, "Broll", "无旁白文本，生成 Ken Burns 空镜", segment=i)
            clip_path = _generate_ken_burns_clip(
                i, scene_path, duration, work_dir, canvas_w, canvas_h, fps,
            )
        elif strict:
            log.fail(stage, "Clip", "无旁白且无场景图，无法生成分镜视频", segment=i)

        if not clip_path and not strict:
            if scene_path and os.path.exists(scene_path) and tts_path and os.path.exists(tts_path):
                log.warn(stage, "Fallback", "对口型失败，回退为静图+音频", segment=i)
                clip_path = _generate_image_audio_clip(
                    i, scene_path, tts_path, duration, work_dir, canvas_w, canvas_h, fps,
                )
            if not clip_path and scene_path and os.path.exists(scene_path):
                log.warn(stage, "Fallback", "回退为 Ken Burns 静图缩放（无旁白音频）", segment=i)
                clip_path = _generate_ken_burns_clip(
                    i, scene_path, duration, work_dir, canvas_w, canvas_h, fps,
                )
            if not clip_path:
                log.warn(stage, "Fallback", "回退为占位彩条", segment=i)
                clip_path = _generate_placeholder_clip(
                    i, seg, duration, work_dir, canvas_w, canvas_h, fps,
                )

        if not clip_path:
            log.fail(stage, "Clip", "分镜视频生成失败", segment=i)

        seg["clip_path"] = clip_path
        seg["tts_audio_path"] = tts_path or None
        log.info(stage, "Clip", f"完成 → {clip_path}", segment=i)

    from worker.timeline_sync import validate_segments_for_assembly

    issues = validate_segments_for_assembly(segments, work_dir=work_dir, strict=strict)
    for issue in issues:
        log.warn(stage, "Validate", issue)
    if strict and issues:
        log.fail(stage, "Validate", "分镜产物校验未通过: " + "; ".join(issues))

    log.stage_end(stage, f"全部分镜视频生成完成（{len(segments)} 段）")
    if on_progress:
        on_progress("video_gen", 75, "分镜视频生成完成")

    return segments


def _speedup_audio(
    audio_path: str,
    speed_factor: float,
    work_dir: str,
    index: int,
    log: PipelineLogger,
    stage: str,
    seg_index: int,
) -> str:
    output_path = os.path.join(work_dir, f"tts_{index}_fast.wav")
    filters = []
    remaining = speed_factor
    while remaining > 2.0:
        filters.append("atempo=2.0")
        remaining /= 2.0
    if remaining < 0.5:
        remaining = 0.5
    filters.append(f"atempo={remaining:.4f}")
    filter_str = ",".join(filters)
    cmd = [
        "ffmpeg", "-y",
        "-i", audio_path,
        "-filter:a", filter_str,
        "-ar", "44100",
        "-ac", "1",
        output_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            log.warn(stage, "TTS", f"音频加速失败: {result.stderr[:200]}", segment=seg_index)
            return audio_path
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return output_path
    except Exception as exc:
        log.warn(stage, "TTS", f"音频加速异常: {exc}", segment=seg_index)
    return audio_path


def _resolve_voice_sample(
    voice_sample_url: str,
    server_base_url: str,
    work_dir: str,
    log: PipelineLogger,
    stage: str,
    seg_index: int,
) -> str:
    if not voice_sample_url:
        log.info(stage, "VoiceSample", "未配置音色样本 URL", segment=seg_index)
        return ""

    if os.path.isabs(voice_sample_url) and os.path.exists(voice_sample_url):
        return voice_sample_url

    if voice_sample_url.startswith("/uploads/"):
        from worker.config import UPLOADS_DIR
        local = os.path.join(UPLOADS_DIR, voice_sample_url[len("/uploads/"):])
        log.info(stage, "VoiceSample", f"本地路径 {local} exists={os.path.exists(local)}", segment=seg_index)
        if os.path.exists(local):
            return local

    if voice_sample_url.startswith(("http://", "https://")):
        local_path = os.path.join(work_dir, "voice_sample.m4a")
        try:
            download_file(voice_sample_url, local_path)
            return local_path
        except Exception as exc:
            log.warn(stage, "VoiceSample", f"下载失败: {exc}", segment=seg_index)

    if server_base_url and voice_sample_url.startswith("/"):
        url = f"{server_base_url}{voice_sample_url}"
        local_path = os.path.join(work_dir, "voice_sample.m4a")
        try:
            download_file(url, local_path)
            return local_path
        except Exception as exc:
            log.warn(stage, "VoiceSample", f"从服务器下载失败: {exc}", segment=seg_index)

    return ""


def _align_lipsync_clip_to_tts(
    clip_path: str,
    tts_path: str,
    *,
    log: Optional[PipelineLogger] = None,
    stage: str = "Stage3",
    segment: int = 0,
) -> float:
    """Trim/pad provider lip-sync video and mux canonical TTS so durations match."""
    log = log or null_logger()
    if not clip_path or not tts_path or not os.path.exists(clip_path) or not os.path.exists(tts_path):
        return 0.0

    tts_dur = get_duration(tts_path)
    clip_dur = get_duration(clip_path)
    if tts_dur <= 0:
        return clip_dur

    if clip_dur > 0 and abs(tts_dur - clip_dur) <= _CLIP_ALIGN_TOLERANCE_SEC:
        return tts_dur

    temp_path = f"{clip_path}.align.tmp.mp4"
    pad_sec = max(tts_dur - clip_dur, 0.0) if clip_dur > 0 else 0.0
    vf_parts: list[str] = []
    if pad_sec > _CLIP_ALIGN_TOLERANCE_SEC:
        vf_parts.append(f"tpad=stop_mode=clone:stop_duration={pad_sec:.3f}")
    vf_parts.append("format=yuv420p")
    vf = ",".join(vf_parts)

    cmd = [
        "ffmpeg", "-y",
        "-i", clip_path,
        "-i", tts_path,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-vf", vf,
        "-t", f"{tts_dur:.3f}",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        "-pix_fmt", "yuv420p",
        temp_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0 or not os.path.exists(temp_path):
            log.warn(
                stage,
                "LipSync",
                f"clip 时长对齐失败，保留原始对口型视频: {result.stderr[:200]}",
                segment=segment,
            )
            return clip_dur
        os.replace(temp_path, clip_path)
        aligned = get_duration(clip_path)
        log.info(
            stage,
            "LipSync",
            f"clip 时长对齐 {clip_dur:.2f}s → {aligned:.2f}s (tts={tts_dur:.2f}s)",
            segment=segment,
        )
        return aligned if aligned > 0 else tts_dur
    except Exception as exc:
        log.warn(stage, "LipSync", f"clip 时长对齐异常: {exc}", segment=segment)
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        return clip_dur


def _generate_narration_clip(
    seg,
    index,
    text,
    duration,
    scene_path,
    tts_path,
    work_dir,
    canvas_w,
    canvas_h,
    fps,
    server_base_url,
    avatar_adapter,
    human_config=None,
    *,
    strict: bool = True,
    log: Optional[PipelineLogger] = None,
):
    log = log or null_logger()
    stage = "Stage3"
    try:
        clip_path = os.path.join(work_dir, f"clip_{index}.mp4")
        generated = avatar_adapter.generate(
            audio_path=tts_path,
            image_path=scene_path,
            human_config=human_config or {},
            output_path=clip_path,
        )
        if generated and os.path.exists(generated):
            return generated
    except Exception as exc:
        log.error(stage, "LipSync", f"AvatarAdapter 异常: {exc}", segment=index)
        if strict:
            raise

    if strict:
        return ""

    log.warn(stage, "Fallback", "对口型失败，回退为静图+音频", segment=index)
    return _generate_image_audio_clip(
        index, scene_path, tts_path, duration, work_dir, canvas_w, canvas_h, fps,
    )


def _generate_image_audio_clip(
    index, image_path, audio_path, duration, work_dir, canvas_w, canvas_h, fps,
):
    clip_path = os.path.join(work_dir, f"clip_{index}.mp4")
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", image_path,
        "-i", audio_path,
        "-t", str(duration),
        "-vf", f"scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=decrease,"
               f"pad={canvas_w}:{canvas_h}:(ow-iw)/2:(oh-ih)/2:color=black,"
               f"fps={fps},format=yuv420p",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest", "-pix_fmt", "yuv420p",
        clip_path,
    ]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if os.path.exists(clip_path):
            return clip_path
    except Exception:
        pass
    return ""


def _generate_ken_burns_clip(
    index, scene_path, duration, work_dir, canvas_w, canvas_h, fps,
):
    clip_path = os.path.join(work_dir, f"clip_{index}.mp4")
    zoom_expr = "min(zoom+0.0008,1.15)"
    x_expr = "iw/2-(iw/zoom/2)"
    y_expr = "ih/2-(ih/zoom/2)"
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", scene_path,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
        "-t", str(duration),
        "-vf", (
            f"scale={canvas_w*2}:{canvas_h*2},"
            f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}'"
            f":d={int(duration*fps)}:s={canvas_w}x{canvas_h}:fps={fps},"
            f"format=yuv420p"
        ),
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "aac", "-b:a", "64k",
        "-pix_fmt", "yuv420p",
        clip_path,
    ]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if os.path.exists(clip_path):
            return clip_path
    except Exception:
        pass
    return ""


def _generate_placeholder_clip(
    index, seg, duration, work_dir, canvas_w, canvas_h, fps,
):
    clip_path = os.path.join(work_dir, f"clip_{index}.mp4")
    text = (seg.get("narration_text") or f"Scene {index+1}")[:40]
    vf = f"fps={fps},format=yuv420p"
    cmd_base = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i",
        f"color=c=0x1a1a2e:s={canvas_w}x{canvas_h}:d={duration}:r={fps}",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
        "-t", str(duration),
    ]
    cmd_with_text = cmd_base + [
        "-vf",
        f"drawtext=text='{text}':fontsize=48:fontcolor=white:"
        f"x=(w-text_w)/2:y=(h-text_h)/2,{vf}",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-c:a", "aac", "-b:a", "64k",
        "-pix_fmt", "yuv420p",
        clip_path,
    ]
    cmd_without_text = cmd_base + [
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-c:a", "aac", "-b:a", "64k",
        "-pix_fmt", "yuv420p",
        clip_path,
    ]
    try:
        result = subprocess.run(cmd_with_text, capture_output=True, text=True, timeout=60)
        if result.returncode != 0 or not os.path.exists(clip_path):
            subprocess.run(cmd_without_text, capture_output=True, text=True, timeout=60)
        if os.path.exists(clip_path) and os.path.getsize(clip_path) > 0:
            return clip_path
    except Exception:
        pass
    return ""