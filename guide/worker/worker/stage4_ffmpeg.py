"""Stage 4: FFmpeg assembly - concat clips, overlays, subtitles, BGM → final MP4."""

import os
import subprocess
from worker.ass_generator import generate_ass
from worker.brand_fonts import prepare_brand_fonts, resolve_brand_font_path
from worker.whisper_aligner import apply_whisper_subtitle_timings
from worker.timeline_sync import (
    reconcile_timeline,
    validate_segments_for_assembly,
    write_segments_manifest,
)
from worker.utils import ensure_dir, get_duration, has_audio_stream, download_file, check_ffmpeg


def _hex_to_rgba(value: str, fallback: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    if not isinstance(value, str):
        return fallback
    value = value.strip()
    if value.startswith("#"):
        value = value[1:]
    if len(value) not in (3, 6):
        return fallback
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    try:
        return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), fallback[3])
    except ValueError:
        return fallback


def _wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    def text_width(value: str) -> int:
        bbox = draw.textbbox((0, 0), value, font=font)
        return bbox[2] - bbox[0]

    def wrap_by_chars(value: str) -> list[str]:
        lines: list[str] = []
        current = ""
        for char in value:
            candidate = f"{current}{char}"
            if text_width(candidate) <= max_width or not current:
                current = candidate
            else:
                lines.append(current)
                current = char
        if current:
            lines.append(current)
        return lines

    if any("\u4e00" <= char <= "\u9fff" for char in text):
        return wrap_by_chars(text)[:5]

    words = text.split()
    if not words:
        return [text]
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if text_width(candidate) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            if text_width(word) > max_width:
                wrapped = wrap_by_chars(word)
                lines.extend(wrapped[:-1])
                current = wrapped[-1] if wrapped else ""
            else:
                current = word
    if current:
        lines.append(current)
    return lines[:5]


def _load_font(image_font, size: int, bold: bool = False, font_path: str = ""):
    if font_path and os.path.exists(font_path):
        try:
            return image_font.truetype(font_path, size)
        except Exception:
            pass
    candidates = [
        "/System/Library/Fonts/STHeiti Medium.ttc" if bold else "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            try:
                return image_font.truetype(path, size)
            except Exception:
                continue
    return image_font.load_default()


def _render_placeholder_overlay(ov: dict, work_dir: str, font_family: str = "") -> str:
    """Render text/logo/interactive/record placeholders into a transparent PNG."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:
        return ""

    object_type = ov.get("object_type", "")
    interaction = ov.get("interaction") or {}
    metadata = ov.get("metadata") or {}
    style = ov.get("style") or {}
    requested_family = str(style.get("fontFamily") or font_family or "").split(",")[0].strip().strip("'\"")
    brand_font_path = resolve_brand_font_path(work_dir, requested_family or None)
    is_interactive = bool(interaction)
    is_recording = metadata.get("source") == "record"

    style_variant = (style.get("variant") or "").lower()
    if object_type in {"text", "subtitle"} and style_variant in {"feifei-yellow", "jianying-card"}:
        width, height = 920, 200
    elif object_type in {"text", "subtitle"}:
        width, height = 640, 210
    elif is_interactive or is_recording:
        width, height = 560, 340
    else:
        width, height = 360, 180

    if style_variant == "feifei-yellow":
        fill = _hex_to_rgba(style.get("fill", ""), (26, 58, 107, 200))
        text_color = _hex_to_rgba(style.get("textColor", ""), (255, 215, 0, 255))
        accent = (255, 215, 0, 255)
    elif style_variant == "jianying-card":
        fill = _hex_to_rgba(style.get("fill", ""), (0, 0, 0, 170))
        text_color = _hex_to_rgba(style.get("textColor", ""), (255, 255, 255, 255))
        accent = (255, 255, 255, 255)
    else:
        fill = _hex_to_rgba(style.get("fill", ""), (255, 255, 255, 225))
        text_color = _hex_to_rgba(style.get("textColor", ""), (17, 24, 39, 255))
        accent = _hex_to_rgba(style.get("fill", ""), (79, 70, 229, 255))

    if is_recording:
        fill = (17, 24, 39, 238)
        text_color = (255, 255, 255, 255)
    elif is_interactive:
        fill = (255, 255, 255, 238)

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    radius = 32 if object_type in {"text", "subtitle"} else 24
    border = (255, 215, 0, 120) if style_variant == "feifei-yellow" else (79, 70, 229, 90)
    draw.rounded_rectangle((8, 8, width - 8, height - 8), radius=radius, fill=fill, outline=border, width=3)

    title_font = _load_font(ImageFont, 36, bold=True, font_path=brand_font_path)
    body_font = _load_font(ImageFont, 24, font_path=brand_font_path)
    small_font = _load_font(ImageFont, 18, font_path=brand_font_path)

    text = ov.get("text") or ov.get("label") or ("Screen recording" if is_recording else "Object")
    if object_type == "logo" and not ov.get("text"):
        text = ov.get("label") or "Logo"
    if is_interactive:
        text = ov.get("text") or ov.get("label") or "Interactive"

    if is_recording:
        draw.rounded_rectangle((40, 64, width - 40, height - 78), radius=16, fill=(255, 255, 255, 24), outline=(255, 255, 255, 70))
        draw.ellipse((52, 36, 70, 54), fill=(239, 68, 68, 255))
        draw.text((78, 30), "REC", fill=(239, 68, 68, 255), font=small_font)
        lines = _wrap_text(draw, text, body_font, width - 110)
        y = 132
    elif is_interactive:
        draw.text((34, 28), text, fill=text_color, font=title_font)
        options = (interaction.get("options") or [])[:4]
        y = 104
        for index, option in enumerate(options):
            top = y + index * 48
            draw.rounded_rectangle((56, top, width - 56, top + 32), radius=16, fill=(accent[0], accent[1], accent[2], 42))
            draw.text((76, top + 6), str(option), fill=text_color, font=small_font)
        if interaction.get("kind") == "cta_button":
            draw.rounded_rectangle((width // 2 - 92, height - 72, width // 2 + 92, height - 34), radius=19, fill=(accent[0], accent[1], accent[2], 210))
            draw.text((width // 2 - 42, height - 62), "CTA", fill=(255, 255, 255, 255), font=small_font)
        lines = []
    else:
        if style_variant in {"feifei-yellow", "jianying-card"}:
            title_font = _load_font(ImageFont, 52 if style_variant == "feifei-yellow" else 44, bold=True, font_path=brand_font_path)
            body_font = _load_font(ImageFont, 40 if style_variant == "feifei-yellow" else 36, bold=True, font_path=brand_font_path)
        lines = _wrap_text(draw, text, title_font if object_type == "logo" else body_font, width - 70)
        y = max(28, (height - len(lines) * 34) // 2)

    stroke_fill = (15, 42, 92, 255) if style_variant == "feifei-yellow" else (0, 0, 0, 255)
    stroke_width = 3 if style_variant == "feifei-yellow" else 2
    for line in lines:
        font = title_font if object_type == "logo" else body_font
        bbox = draw.textbbox((0, 0), line, font=font)
        x = (width - (bbox[2] - bbox[0])) // 2
        if style_variant in {"feifei-yellow", "jianying-card"}:
            for dx, dy in ((-stroke_width, 0), (stroke_width, 0), (0, -stroke_width), (0, stroke_width)):
                draw.text((x + dx, y + dy), line, fill=stroke_fill, font=font)
        draw.text((x, y), line, fill=text_color, font=font)
        y += 46 if style_variant == "feifei-yellow" else 38

    if ov.get("rotation"):
        image = image.rotate(-float(ov.get("rotation", 0)), expand=True, resample=Image.Resampling.BICUBIC)

    safe_id = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in str(ov.get("id", "object")))
    output = os.path.join(work_dir, f"object_{safe_id}.png")
    image.save(output)
    return output


def _compute_overlay_box(ov: dict, canvas_w: int, canvas_h: int) -> tuple[int, int, int, int]:
    scale_pct = float(ov.get("scale", 100) or 100) / 100.0
    pos_x_pct = float(ov.get("position", {}).get("x", 50) or 50) / 100.0
    pos_y_pct = float(ov.get("position", {}).get("y", 50) or 50) / 100.0

    render_width_pct = ov.get("render_width_pct")
    render_height_pct = ov.get("render_height_pct")
    if render_width_pct and render_height_pct:
        ov_w = int(canvas_w * (float(render_width_pct) / 100.0) * scale_pct)
        ov_h = int(canvas_h * (float(render_height_pct) / 100.0) * scale_pct)
    else:
        ov_w = int(canvas_w * scale_pct)
        ov_h = int(canvas_h * scale_pct)

    ov_w = max(2, min(canvas_w, ov_w))
    ov_h = max(2, min(canvas_h, ov_h))
    pos_x = int((canvas_w - ov_w) * pos_x_pct)
    pos_y = int((canvas_h - ov_h) * pos_y_pct)
    return ov_w, ov_h, pos_x, pos_y


def _resolve_overlay_asset(ov: dict, work_dir: str, default_font_family: str = "") -> str:
    """Resolve overlay asset: download if URL, return local path."""
    url = ov.get("asset_url", "")
    if not url and (ov.get("object_type") or ov.get("interaction") or ov.get("metadata")):
        return _render_placeholder_overlay(ov, work_dir, font_family=default_font_family)
    if not url:
        return ""
    if os.path.isabs(url) and os.path.exists(url):
        return url
    # Handle relative local paths like /uploads/xxx.gif
    if url.startswith("/uploads/"):
        from worker.config import UPLOADS_DIR
        local = os.path.join(UPLOADS_DIR, url[len("/uploads/"):])
        if os.path.exists(local):
            return local
    if url.startswith("/renders/"):
        from worker.config import RENDERS_DIR
        local = os.path.join(RENDERS_DIR, url[len("/renders/"):])
        if os.path.exists(local):
            return local
    if url.startswith(("http://", "https://")):
        ext = ".png"
        for e in [".mp4", ".mov", ".avi", ".jpg", ".jpeg", ".png", ".webp", ".gif"]:
            if e in url.lower():
                ext = e
                break
        local = os.path.join(work_dir, f"overlay_{ov.get('id', 'asset')}{ext}")
        try:
            download_file(url, local)
            return local
        except Exception:
            return ""
    return ""


def _escape_ffmpeg_filter_path(path: str) -> str:
    """Escape a file path for use inside FFmpeg filter_complex.

    FFmpeg filter_complex special chars that MUST be escaped:
      \\  ->  \\\\
      :   ->  \\:
      '   ->  \\'
    Forward slashes (/) do NOT need escaping.
    """
    path = path.replace("\\", "\\\\")  # escape backslashes
    path = path.replace(":", "\\:")     # escape colons (Windows drive letters)
    path = path.replace("'", "\\'")     # escape single quotes
    return path


def _has_ass_filter() -> bool:
    try:
        result = subprocess.run(
            ["ffmpeg", "-filters"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        text = f"{result.stdout}\n{result.stderr}"
        return " ass " in text or "\n ass " in text
    except Exception:
        return False


def _make_filter_relative(path: str, base_dir: str) -> str:
    """Convert an absolute path to a path relative to base_dir.

    FFmpeg's filter_complex parser cannot handle Windows absolute paths (drive letters, backslashes).
    By running FFmpeg with cwd=base_dir and using a relative filename, we completely avoid
    all escaping issues. Returns the relative path string.
    """
    return os.path.relpath(path, base_dir)


def assemble_final_video(
    segments: list[dict],
    overlays: list[dict],
    global_config: dict,
    work_dir: str,
    output_path: str,
    on_progress=None,
    *,
    job_logger=None,
) -> str:
    """Assemble the final video using FFmpeg filter_complex.

    1. Scale/pad each clip to canvas size
    2. Concat all clips
    3. Apply overlays (segment-level, with global timeline)
    4. Add subtitles (ASS)
    5. Mix BGM
    6. Encode output
    """
    from worker.pipeline_log import null_logger

    log = job_logger or null_logger()
    stage = "Stage4"

    if not check_ffmpeg():
        log.fail(stage, "FFmpeg", "FFmpeg 不可用，无法组装成片")

    log.info(stage, "BEGIN", f"组装成片 clips={len(segments)} overlays={len(overlays)}")
    if on_progress:
        on_progress("ffmpeg", 80, "正在组装最终视频...")

    ensure_dir(os.path.dirname(output_path))
    ensure_dir(work_dir)

    fonts_manifest = prepare_brand_fonts(global_config, work_dir, segments=segments)
    default_font_family = str(fonts_manifest.get("default_family") or "")

    synced = reconcile_timeline(segments, overlays, work_dir=work_dir)
    segments = synced["segments"]
    overlays = synced["overlays"]
    from worker.config import get_pipeline_config

    assembly_strict = get_pipeline_config()["pipeline_strict"]
    for issue in validate_segments_for_assembly(segments, work_dir=work_dir, strict=assembly_strict):
        log.warn(stage, "Validate", issue)
    manifest_path = write_segments_manifest(segments, overlays, work_dir)
    log.info(stage, "Timeline", f"manifest={manifest_path} total={synced['total_duration']}s")

    canvas_w = global_config.get("canvas_width", 1080)
    canvas_h = global_config.get("canvas_height", 1920)
    fps = global_config.get("fps", 30)
    bgm_url = global_config.get("bgm_url", "")
    bgm_volume = global_config.get("bgm_volume", 0.3)

    # Collect valid clips
    clips = []
    for seg in segments:
        clip_path = seg.get("clip_path", "")
        if clip_path and os.path.exists(clip_path):
            clips.append({
                "path": clip_path,
                "duration": seg.get("duration_sec", 5.0),
                "seg": seg,
            })

    if not clips:
        raise RuntimeError("No valid clips to assemble")

    base_count = len(clips)

    # Resolve overlay assets
    resolved_overlays = []
    for ov in overlays:
        asset = _resolve_overlay_asset(ov, work_dir, default_font_family=default_font_family)
        if asset and os.path.exists(asset):
            resolved_overlays.append({**ov, "asset_path": asset})

    # Generate ASS subtitles (Whisper word alignment when available, else heuristic)
    from worker.config import _load_json

    aligner_mode = apply_whisper_subtitle_timings(
        segments,
        work_dir=work_dir,
        config=_load_json(),
    )
    print(f"[Stage4] Subtitle aligner mode: {aligner_mode}")
    ass_path = os.path.join(work_dir, "subtitles.ass")
    ass_result = generate_ass(segments, global_config, ass_path)

    # Pre-check which clips have audio
    clips_with_audio = [has_audio_stream(c["path"]) for c in clips]

    # ---- Build FFmpeg inputs with explicit index tracking ----
    inputs: list[str] = []
    filters: list[str] = []
    input_counter = [0]

    def add_input(extra_args: list[str], main_args: list[str]) -> int:
        idx = input_counter[0]
        inputs.extend(extra_args + ["-i"] + main_args)
        input_counter[0] += 1
        return idx

    # Phase 1: base clip videos + silent audio sources for clips without audio
    clip_input_map: list[int] = []        # clip_i -> ffmpeg input index
    silent_audio_map: dict[int, int] = {}  # clip_i -> ffmpeg input index for silent audio

    for i, clip in enumerate(clips):
        ci = add_input([], [clip["path"]])
        clip_input_map.append(ci)
        if not clips_with_audio[i]:
            dur = clip["duration"]
            si = add_input(["-f", "lavfi", "-t", str(dur)], ["anullsrc=r=44100:cl=mono"])
            silent_audio_map[i] = si

    # Phase 2: overlay assets
    overlay_input_start = input_counter[0]
    for ov in resolved_overlays:
        asset_path = ov["asset_path"]
        # -ignore_loop 0 only works for animated formats (GIF, APNG, WebP)
        # For static images (JPG, PNG), we need -loop 1 instead
        ext = os.path.splitext(asset_path)[1].lower()
        if ext in [".gif", ".apng", ".webp"]:
            add_input(["-ignore_loop", "0"], [asset_path])
        else:
            # Static image: loop forever so filter can control timing
            add_input(["-loop", "1"], [asset_path])
    overlay_count = len(resolved_overlays)

    # Phase 3: BGM
    bgm_path = ""
    bgm_input_index = None
    print(f"[Stage4] BGM URL: {bgm_url}")
    
    if bgm_url:
        # Try to resolve BGM path
        if os.path.isabs(bgm_url) and os.path.exists(bgm_url):
            bgm_path = bgm_url
        elif bgm_url.startswith("/uploads/"):
            from worker.config import UPLOADS_DIR
            local = os.path.join(UPLOADS_DIR, bgm_url[len("/uploads/"):])
            print(f"[Stage4] BGM local path: {local}, exists={os.path.exists(local)}")
            if os.path.exists(local):
                bgm_path = local
        elif bgm_url.startswith("/renders/"):
            from worker.config import RENDERS_DIR
            local = os.path.join(RENDERS_DIR, bgm_url[len("/renders/"):])
            print(f"[Stage4] BGM local path: {local}, exists={os.path.exists(local)}")
            if os.path.exists(local):
                bgm_path = local
        elif bgm_url.startswith(("http://", "https://")):
            bgm_path = os.path.join(work_dir, "bgm.mp3")
            try:
                download_file(bgm_url, bgm_path)
            except Exception as e:
                print(f"[Stage4] BGM download failed: {e}")
                bgm_path = ""
    
    print(f"[Stage4] BGM resolved path: {bgm_path}")

    if bgm_path and os.path.exists(bgm_path):
        bgm_input_index = add_input(["-stream_loop", "-1"], [bgm_path])

    # Phase 4: ASS subtitle (only when libass filter is available)
    ass_input_index = None
    if ass_result and os.path.exists(ass_result) and _has_ass_filter():
        ass_input_index = add_input([], [ass_result])

    # ---- Build filter graph ----

    # Video: scale/pad each clip, force normalized timestamps via setpts=N/fps/TB
    video_labels = []
    for i in range(base_count):
        ci = clip_input_map[i]
        label = f"v{i}"
        filters.append(
            f"[{ci}:v]fps={fps},scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=decrease,"
            f"pad={canvas_w}:{canvas_h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p,"
            f"setpts=N/{fps}/TB[{label}]"
        )
        video_labels.append(f"[{label}]")

    # Audio: prepare audio streams for each clip (use silent source if clip has no audio)
    audio_labels = []
    any_have_audio = any(clips_with_audio)
    need_audio = any_have_audio or bgm_input_index is not None

    if need_audio:
        for i in range(base_count):
            a_label = f"a{i}"
            if clips_with_audio[i]:
                ci = clip_input_map[i]
                filters.append(
                    f"[{ci}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,"
                    f"asetpts=N/44100/TB[{a_label}]"
                )
            else:
                si = silent_audio_map[i]
                filters.append(
                    f"[{si}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,"
                    f"asetpts=N/44100/TB[{a_label}]"
                )
            audio_labels.append(f"[{a_label}]")

    # Concat video streams
    if base_count > 1:
        filters.append("".join(video_labels) + f"concat=n={base_count}:v=1:a=0[basev]")
        current_video = "basev"
    else:
        current_video = "v0"

    # Concat audio streams
    base_audio_label = None
    if need_audio and audio_labels:
        if base_count > 1:
            filters.append("".join(audio_labels) + f"concat=n={base_count}:v=0:a=1[basea]")
            base_audio_label = "basea"
        else:
            base_audio_label = "a0"

    # Overlay chain
    for j, ov in enumerate(resolved_overlays):
        input_index = overlay_input_start + j
        ov_label = f"ov{j}"
        out_label = f"mix{j}"
        g_start = ov["global_start_s"]
        g_end = ov["global_end_s"]
        ov_w, ov_h, pos_x, pos_y = _compute_overlay_box(ov, canvas_w, canvas_h)

        filters.append(
            f"[{input_index}:v]fps={fps},scale={ov_w}:{ov_h}:force_original_aspect_ratio=decrease,"
            f"format=rgba,setpts=PTS-STARTPTS+{g_start}/TB[{ov_label}]"
        )
        filters.append(
            f"[{current_video}][{ov_label}]overlay={pos_x}:{pos_y}:eof_action=pass"
            f":enable='between(t,{g_start},{g_end})'[{out_label}]"
        )
        current_video = out_label

    # Apply ASS subtitles when libass filter is available (FFmpeg 8+ builds may omit it)
    if ass_input_index is not None and _has_ass_filter():
        out_label = "subbed"
        ass_filter_path = _escape_ffmpeg_filter_path(_make_filter_relative(ass_result, work_dir))
        fonts_dir = fonts_manifest.get("fonts_dir") or os.path.join(work_dir, "fonts")
        ass_opts = f"filename={ass_filter_path}"
        if fonts_manifest.get("family_paths"):
            fontsdir_rel = _escape_ffmpeg_filter_path(_make_filter_relative(fonts_dir, work_dir))
            ass_opts += f":fontsdir={fontsdir_rel}"
        filters.append(f"[{current_video}]ass={ass_opts}[{out_label}]")
        current_video = out_label
    elif ass_input_index is not None:
        print("[Stage4] libass unavailable — skipping burned-in subtitles")

    # ---- Map outputs ----
    map_args = ["-map", f"[{current_video}]"]

    # Mix BGM with clip audio
    if bgm_input_index is not None:
        filters.append(
            f"[{bgm_input_index}:a]volume={bgm_volume},aresample=44100,"
            f"aformat=sample_fmts=fltp:channel_layouts=mono[bgm]"
        )
        if base_audio_label:
            filters.append(
                f"[{base_audio_label}][bgm]amix=inputs=2:duration=first:"
                f"dropout_transition=0:normalize=0[mixeda]"
            )
            filters.append("[mixeda]alimiter=limit=0.95:level=false[aout]")
            map_args += ["-map", "[aout]"]
        else:
            filters.append("[bgm]anull[aout]")
            map_args += ["-map", "[aout]"]
    elif base_audio_label:
        map_args += ["-map", f"[{base_audio_label}]"]

    # Build command - run FFmpeg from work_dir so relative paths work in filters
    cmd = [
        "ffmpeg", "-hide_banner", "-y",
        *inputs,
        "-filter_complex", ";".join(filters),
        *map_args,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        output_path,
    ]

    log.info(stage, "FFmpeg", f"开始编码 clips={base_count} overlays={overlay_count}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600,
                           encoding='utf-8', errors='replace', cwd=work_dir)

    if result.returncode != 0:
        # Save debug info for troubleshooting
        debug_dir = os.path.join(work_dir, "debug")
        os.makedirs(debug_dir, exist_ok=True)
        try:
            with open(os.path.join(debug_dir, "ffmpeg_stderr.txt"), "w", encoding="utf-8") as f:
                f.write(result.stderr)
            with open(os.path.join(debug_dir, "ffmpeg_cmd.txt"), "w", encoding="utf-8") as f:
                f.write(' '.join(cmd))
            import shutil as _shutil
            if ass_result and os.path.exists(ass_result):
                _shutil.copy2(ass_result, os.path.join(debug_dir, "subtitles.ass"))
        except Exception:
            pass
        log.error(stage, "FFmpeg", f"编码失败 code={result.returncode}: {result.stderr[:500]}")
        raise RuntimeError(f"FFmpeg failed with code {result.returncode}")

    if on_progress:
        on_progress("ffmpeg", 95, "视频组装完成")

    log.info(stage, "END", f"成片输出 → {output_path}")
    return output_path
