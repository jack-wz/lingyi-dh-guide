"""Stage 3: AI video generation - TTS + talking head for each segment."""

import os
import subprocess
from worker.utils import ensure_dir, get_duration, download_file, check_ffmpeg
from worker.config import RENDERS_DIR


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
) -> list[dict]:
    """Generate video clips for each segment.

    For narration segments: TTS + Talking Head (InfiniteTalk)
    For non-narration segments: Ken Burns effect on scene image
    Fallback: color bar placeholder

    Args:
        segments: Segments from Stage 2 (with scene_image_path)
        global_config: Global template config
        voice_clone_id: Voice ID from digital human training
        human_photos: Digital human photo URLs
        work_dir: Working directory
        server_base_url: Base URL for resolving paths
        on_progress: Progress callback
        voice_sample_url: URL/path to voice sample for re-cloning if needed
        avatar_adapter: Optional AvatarAdapter instance for talking-head generation
        tts_adapter: Optional TTSAdapter instance for speech synthesis

    Returns:
        Segments with clip_path added
    """
    if not check_ffmpeg():
        raise RuntimeError("FFmpeg is not available. Install FFmpeg and ensure `ffmpeg` is on PATH.")

    ensure_dir(work_dir)
    from worker.ai_clients.talking_head_client import TalkingHeadClient
    from worker.tts_adapter import tts_registry

    tts = tts_adapter or tts_registry.get("yuntts")
    talking_head = TalkingHeadClient()
    canvas_w = global_config.get("canvas_width", 1080)
    canvas_h = global_config.get("canvas_height", 1920)
    fps = global_config.get("fps", 30)

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

        print(f"[Stage3] Segment {i+1}: text='{text[:50]}...' duration={duration}s")
        print(f"[Stage3] Segment {i+1}: scene={scene_path}, human_face={human_face_path}")
        print(f"[Stage3] Segment {i+1}: voice_clone_id={voice_clone_id}")

        # Step 1: Generate TTS audio if there's narration text
        if text and voice_clone_id:
            print(f"[Stage3] Segment {i+1}: Generating TTS audio...")
            audio_path = os.path.join(work_dir, f"tts_{i}.wav")
            tts_path = tts.synthesize(text, voice_clone_id, audio_path)

            if not tts_path:
                print(f"[Stage3] Segment {i+1}: TTS failed with stored voice_id, trying to re-clone...")
                # Try to re-clone voice from sample
                voice_sample_path = _resolve_voice_sample(voice_sample_url, server_base_url, work_dir)
                if voice_sample_path and os.path.exists(voice_sample_path):
                    tts_path = tts.clone_and_synthesize(
                        text, voice_sample_path, audio_path, voice_name=f"vh_{i}"
                    )
                else:
                    print(f"[Stage3] Segment {i+1}: No voice sample available, trying fallback TTS...")
                    tts_path = tts.synthesize_fallback(text, audio_path)

            if tts_path and os.path.exists(tts_path):
                try:
                    audio_dur = get_duration(tts_path)
                    print(f"[Stage3] Segment {i+1}: TTS audio duration = {audio_dur:.2f}s, target = {duration:.1f}s")
                    # Sync segment duration with actual audio duration for better assembly timing.
                    # This follows Pixelle-Video's approach: the generated audio is the source of truth.
                    if abs(audio_dur - duration) > 0.5:
                        print(f"[Stage3] Segment {i+1}: Syncing segment duration from {duration:.1f}s to {audio_dur:.2f}s")
                        seg["duration_sec"] = round(audio_dur, 2)
                        duration = seg["duration_sec"]

                    # If audio is longer than target duration, speed up audio to fit
                    if audio_dur > duration * 1.1:  # Allow 10% tolerance
                        speed_factor = audio_dur / duration
                        if speed_factor > 2.0:
                            speed_factor = 2.0  # Cap at 2x speed to avoid unnatural speech
                        print(f"[Stage3] Segment {i+1}: Audio too long ({audio_dur:.1f}s > {duration:.1f}s), speeding up {speed_factor:.2f}x")
                        tts_path = _speedup_audio(tts_path, speed_factor, work_dir, i)
                        if tts_path:
                            audio_dur = get_duration(tts_path)
                            seg["duration_sec"] = round(audio_dur, 2)
                            duration = seg["duration_sec"]
                            print(f"[Stage3] Segment {i+1}: Sped-up audio duration = {audio_dur:.2f}s")
                except Exception as e:
                    print(f"[Stage3] Segment {i+1}: Get audio duration failed: {e}")
            else:
                print(f"[Stage3] Segment {i+1}: TTS failed, will use silent audio")
                tts_path = ""

        # Step 2: Generate video clip
        # Try talking head first if we have both scene image and TTS audio
        can_use_talking_head = (
            scene_path and os.path.exists(scene_path) and 
            tts_path and os.path.exists(tts_path)
        )
        
        if can_use_talking_head:
            print(f"[Stage3] Segment {i+1}: Trying talking head (lip-sync) video...")
            clip_path = _generate_narration_clip(
                seg, i, text, duration, scene_path, tts_path,
                talking_head, work_dir, canvas_w, canvas_h, fps, server_base_url,
                avatar_adapter, human_photos,
            )
        else:
            print(f"[Stage3] Segment {i+1}: Skipping talking head (missing scene image or TTS audio)")

        # Fallback: Scene image + TTS audio
        if not clip_path and scene_path and os.path.exists(scene_path) and tts_path and os.path.exists(tts_path):
            print(f"[Stage3] Segment {i+1}: Using scene image + audio...")
            clip_path = _generate_image_audio_clip(
                i, scene_path, tts_path, duration, work_dir, canvas_w, canvas_h, fps,
            )

        # Fallback: Ken Burns on scene image (no audio or no talking head)
        if not clip_path and scene_path and os.path.exists(scene_path):
            print(f"[Stage3] Segment {i+1}: Using Ken Burns effect...")
            clip_path = _generate_ken_burns_clip(
                i, scene_path, duration, work_dir, canvas_w, canvas_h, fps,
            )

        # Final fallback: color bar placeholder
        if not clip_path:
            print(f"[Stage3] Segment {i+1}: Using placeholder...")
            clip_path = _generate_placeholder_clip(
                i, seg, duration, work_dir, canvas_w, canvas_h, fps,
            )

        seg["clip_path"] = clip_path
        seg["tts_audio_path"] = tts_path  # Store for potential mixing
        print(f"[Stage3] Segment {i+1}: clip = {clip_path}")

    if on_progress:
        on_progress("video_gen", 75, "分镜视频生成完成")

    return segments


def _speedup_audio(audio_path: str, speed_factor: float, work_dir: str, index: int) -> str:
    """Speed up audio using FFmpeg atempo filter.
    
    Args:
        audio_path: Path to the input audio file
        speed_factor: How much to speed up (e.g., 1.5 = 50% faster)
        work_dir: Working directory for output
        index: Segment index for naming
    
    Returns:
        Path to the sped-up audio file, or original path on failure
    """
    output_path = os.path.join(work_dir, f"tts_{index}_fast.wav")
    
    # atempo only supports 0.5 to 2.0, chain if needed
    # For speed_factor > 2.0, chain multiple atempo filters
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
        print(f"[Stage3] Speeding up audio: {speed_factor:.2f}x with filter: {filter_str}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            print(f"[Stage3] FFmpeg audio speedup failed: {result.stderr[:200]}")
            return audio_path
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return output_path
    except Exception as e:
        print(f"[Stage3] Audio speedup failed: {e}")
    
    return audio_path  # Return original on failure


def _resolve_voice_sample(voice_sample_url: str, server_base_url: str, work_dir: str) -> str:
    """Resolve voice sample URL to a local file path."""
    if not voice_sample_url:
        print("[Stage3] No voice sample URL provided")
        return ""
    
    # Check if it's a local file path
    if os.path.isabs(voice_sample_url) and os.path.exists(voice_sample_url):
        return voice_sample_url
    
    # Try /uploads/ path
    if voice_sample_url.startswith("/uploads/"):
        from worker.config import UPLOADS_DIR
        local = os.path.join(UPLOADS_DIR, voice_sample_url[len("/uploads/"):])
        print(f"[Stage3] Voice sample local path: {local}, exists={os.path.exists(local)}")
        if os.path.exists(local):
            return local
    
    # Try downloading from URL
    if voice_sample_url.startswith(("http://", "https://")):
        local_path = os.path.join(work_dir, "voice_sample.m4a")
        try:
            download_file(voice_sample_url, local_path)
            return local_path
        except Exception as e:
            print(f"[Stage3] Download voice sample failed: {e}")
    
    # Try server_base_url + relative path
    if server_base_url and voice_sample_url.startswith("/"):
        url = f"{server_base_url}{voice_sample_url}"
        local_path = os.path.join(work_dir, "voice_sample.m4a")
        try:
            download_file(url, local_path)
            return local_path
        except Exception as e:
            print(f"[Stage3] Download voice sample from server failed: {e}")
    
    return ""


def _generate_narration_clip(
    seg, index, text, duration, scene_path, tts_path,
    talking_head, work_dir, canvas_w, canvas_h, fps,
    server_base_url,
    avatar_adapter=None,
    human_config=None,
):
    """Generate a talking-head narration clip using pre-generated TTS audio."""
    # Get actual audio duration
    try:
        audio_dur = get_duration(tts_path)
    except Exception:
        audio_dur = duration

    video_url = None
    if avatar_adapter is not None:
        print(f"[Stage3] Seg {index+1}: Calling AvatarAdapter: image={scene_path}, audio={tts_path}")
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
        except Exception as e:
            print(f"[Stage3] AvatarAdapter generation failed: {e}")

    if not video_url:
        # Pass local paths directly - talking_head_client will upload to WaveSpeed
        print(f"[Stage3] Seg {index+1}: Calling talking head API: image={scene_path}, audio={tts_path}")
        video_url = talking_head.generate_talking_video(
            image_path_or_url=scene_path,
            audio_path_or_url=tts_path,
            duration=audio_dur,
        )

    if video_url:
        clip_path = os.path.join(work_dir, f"clip_{index}.mp4")
        try:
            download_file(video_url, clip_path)
            print(f"[Stage3] Seg {index+1}: Talking head video downloaded")
            return clip_path
        except Exception as e:
            print(f"[Stage3] Download talking video failed: {e}")

    # Fallback: scene image + audio overlay
    return _generate_image_audio_clip(
        index, scene_path, tts_path, duration, work_dir, canvas_w, canvas_h, fps,
    )


def _generate_image_audio_clip(
    index, image_path, audio_path, duration, work_dir, canvas_w, canvas_h, fps,
):
    """Generate clip from static image + audio."""
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
    except Exception as e:
        print(f"[Stage3] Image+audio clip failed: {e}")
    return ""


def _generate_ken_burns_clip(
    index, scene_path, duration, work_dir, canvas_w, canvas_h, fps,
):
    """Generate a Ken Burns (slow zoom/pan) effect clip from a static image."""
    clip_path = os.path.join(work_dir, f"clip_{index}.mp4")
    # Zoom from 1.0 to 1.15 over the duration
    zoom_expr = f"min(zoom+0.0008,1.15)"
    x_expr = f"iw/2-(iw/zoom/2)"
    y_expr = f"ih/2-(ih/zoom/2)"

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
    except Exception as e:
        print(f"[Stage3] Ken Burns clip failed: {e}")
    return ""


def _generate_placeholder_clip(
    index, seg, duration, work_dir, canvas_w, canvas_h, fps,
):
    """Generate a color bar placeholder clip."""
    clip_path = os.path.join(work_dir, f"clip_{index}.mp4")
    text = (seg.get("narration_text") or f"Scene {index+1}")[:40]

    # Use simple color background; add text only if drawtext works
    vf = f"fps={fps},format=yuv420p"
    cmd_base = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i",
        f"color=c=0x1a1a2e:s={canvas_w}x{canvas_h}:d={duration}:r={fps}",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
        "-t", str(duration),
    ]

    # Try with drawtext first
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
            # Fallback: without text
            subprocess.run(cmd_without_text, capture_output=True, text=True, timeout=60)
        if os.path.exists(clip_path) and os.path.getsize(clip_path) > 0:
            return clip_path
    except Exception as e:
        print(f"[Stage3] Placeholder clip failed: {e}")
    return ""
