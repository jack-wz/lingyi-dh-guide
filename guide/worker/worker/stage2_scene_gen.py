"""Stage 2: AI scene image generation - calls KIE API for each segment."""

import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Optional

from worker.ai_clients.kie_client import KieClient
from worker.config import UPLOADS_DIR, get_prompt, get_scene_fusion_parallel_workers
from worker.kie_input_resolver import resolve_kie_input_url
from worker.pipeline_log import PipelineLogger, null_logger
from worker.scene_fusion import describe_fusion_urls, scene_fusion_role_prefix
from worker.utils import download_file, ensure_dir

_SCENE_FUSION_CONSTRAINTS = (
    "移除水印、多余人物、贴纸及与口播无关的干扰元素；"
    "输出干净自然的单人场景图，适合竖屏口播视频。"
)

_SCENE_IMAGE_DEFAULT_FALLBACK = (
    "将数字人融入分镜场景：保持数字人五官与服装与参考图完全一致；"
    "参照分镜场景图的镜头视角、表情、场景环境与人物姿势生成新图；"
    "移除不必要的元素，画面简洁自然。"
)


@dataclass
class _SharedHumanAssets:
    human_face_url: str
    human_half_url: str
    human_face_path: str
    human_half_path: str
    human_half_kie: str = ""
    human_face_kie: str = ""


def _scene_fusion_prompt(seg: dict) -> str:
    """KIE 场景融合提示词：说明双图角色 + 分镜 scene_description 或调试台默认文案。"""
    custom = (seg.get("scene_description") or "").strip()
    default = get_prompt("scene_image_default", _SCENE_IMAGE_DEFAULT_FALLBACK).strip()

    role_prefix = scene_fusion_role_prefix()
    if custom:
        parts = [role_prefix, f"分镜补充：{custom}"]
        if _SCENE_FUSION_CONSTRAINTS not in custom:
            parts.append(_SCENE_FUSION_CONSTRAINTS)
        return "\n".join(parts)

    body = default or _SCENE_IMAGE_DEFAULT_FALLBACK
    return f"{role_prefix}\n{body}\n{_SCENE_FUSION_CONSTRAINTS}"


def _load_persona_angle(image_model_id: str, angle: str) -> str:
    if not image_model_id or not image_model_id.startswith("cenker-persona:"):
        return ""
    dh_id = image_model_id.split(":", 1)[1]
    manifest_path = os.path.join(UPLOADS_DIR, "personas", dh_id, "manifest.json")
    if not os.path.exists(manifest_path):
        return ""
    try:
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        return (manifest.get("angles") or {}).get(angle, "")
    except Exception as exc:
        print(f"[Stage2] persona manifest read failed: {exc}")
        return ""


def generate_scene_images(
    resolved_script: dict,
    human_photos: dict,
    work_dir: str,
    server_base_url: str = "",
    on_progress=None,
    *,
    strict: bool = True,
    job_logger: Optional[PipelineLogger] = None,
) -> list[dict]:
    """Generate scene images for each segment.

    KIE fusion calls run in parallel when scene_fusion_parallel_workers > 1.
    """
    ensure_dir(work_dir)
    segments = resolved_script.get("segments", [])
    log = job_logger or null_logger()
    stage = "Stage2"
    log.stage_begin(stage, f"开始生成场景图，共 {len(segments)} 段，strict={strict}")

    shared = _prepare_shared_human_assets(
        human_photos, work_dir, server_base_url, KieClient()
    )
    parallel_workers = get_scene_fusion_parallel_workers()

    if len(segments) > 1 and parallel_workers > 1:
        workers = min(parallel_workers, len(segments))
        log.info(stage, "KieFusion", f"场景融合并行提交 {len(segments)} 段，workers={workers}")
        _generate_scenes_parallel(
            segments=segments,
            shared=shared,
            work_dir=work_dir,
            server_base_url=server_base_url,
            workers=workers,
            strict=strict,
            log=log,
            stage=stage,
            on_progress=on_progress,
        )
    else:
        kie = KieClient()
        for i, seg in enumerate(segments):
            if on_progress:
                pct = 25 + (i / max(len(segments), 1)) * 25
                on_progress("scene_gen", pct, f"生成场景图 ({i+1}/{len(segments)})...")
            _process_segment_scene(
                index=i,
                seg=seg,
                shared=shared,
                work_dir=work_dir,
                server_base_url=server_base_url,
                kie=kie,
                strict=strict,
                log=log,
                stage=stage,
            )

    _validate_scene_outputs(segments, strict=strict, log=log, stage=stage)

    log.stage_end(stage, "场景图阶段完成")
    if on_progress:
        on_progress("scene_gen", 50, "场景图生成完成")

    return segments


def _prepare_shared_human_assets(
    human_photos: dict,
    work_dir: str,
    server_base_url: str,
    kie: KieClient,
) -> _SharedHumanAssets:
    human_face_url = human_photos.get("face_photo_url", "")
    human_half_url = (
        human_photos.get("half_body_photo_url")
        or human_photos.get("half_body_cutout_url")
        or ""
    )
    persona_face = _load_persona_angle(human_photos.get("image_model_id", ""), "face")
    if persona_face:
        human_face_url = persona_face

    human_face_path = ""
    human_half_path = ""
    if human_half_url:
        human_half_path = _resolve_local(human_half_url, server_base_url)
    if human_face_url:
        local_path = _resolve_local(human_face_url, server_base_url)
        if local_path and os.path.exists(local_path):
            human_face_path = local_path
        elif human_face_url.startswith(("http://", "https://")):
            human_face_path = os.path.join(work_dir, "human_face.png")
            try:
                download_file(human_face_url, human_face_path)
            except Exception as e:
                print(f"[Stage2] Download human face photo failed: {e}")
                human_face_path = ""

    human_half_kie = ""
    human_face_kie = ""
    human_ref_url = human_half_url or human_face_url
    if human_ref_url:
        human_half_kie = resolve_kie_input_url(human_ref_url, kie, server_base_url)
    if human_face_url and human_face_url != human_ref_url:
        human_face_kie = resolve_kie_input_url(human_face_url, kie, server_base_url)
    elif human_face_url:
        human_face_kie = human_half_kie

    return _SharedHumanAssets(
        human_face_url=human_face_url,
        human_half_url=human_half_url,
        human_face_path=human_face_path,
        human_half_path=human_half_path,
        human_half_kie=human_half_kie,
        human_face_kie=human_face_kie,
    )


def _generate_scenes_parallel(
    *,
    segments: list[dict],
    shared: _SharedHumanAssets,
    work_dir: str,
    server_base_url: str,
    workers: int,
    strict: bool,
    log: PipelineLogger,
    stage: str,
    on_progress,
) -> None:
    completed = 0

    def _run_segment(index: int) -> int:
        kie = KieClient()
        _process_segment_scene(
            index=index,
            seg=segments[index],
            shared=shared,
            work_dir=work_dir,
            server_base_url=server_base_url,
            kie=kie,
            strict=strict,
            log=log,
            stage=stage,
        )
        return index

    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="scene-fusion") as pool:
        futures = {pool.submit(_run_segment, i): i for i in range(len(segments))}
        for future in as_completed(futures):
            future.result()
            completed += 1
            if on_progress:
                pct = 25 + (completed / max(len(segments), 1)) * 25
                on_progress(
                    "scene_gen",
                    pct,
                    f"场景图完成 ({completed}/{len(segments)})...",
                )


def _process_segment_scene(
    *,
    index: int,
    seg: dict,
    shared: _SharedHumanAssets,
    work_dir: str,
    server_base_url: str,
    kie: KieClient,
    strict: bool,
    log: PipelineLogger,
    stage: str,
) -> None:
    scene_url = seg.get("scene_image_url", "")
    scene_path = ""

    dh_config = seg.get("digital_human", {})
    use_digital_human = (
        dh_config.get("enabled", False)
        or shared.human_face_path
        or shared.human_half_path
    )

    if use_digital_human and shared.human_half_path:
        human_kie = shared.human_half_kie
        if not human_kie and (shared.human_half_url or shared.human_face_url):
            human_ref_url = shared.human_half_url or shared.human_face_url
            human_kie = resolve_kie_input_url(human_ref_url, kie, server_base_url)
        ref_kie = resolve_kie_input_url(scene_url, kie, server_base_url) if scene_url else ""

        fusion_error = ""
        if not human_kie:
            fusion_error = "无法上传数字人参考图到 KIE"
        elif not ref_kie:
            fusion_error = "无法上传场景图到 KIE"
        else:
            fusion_prompt = _scene_fusion_prompt(seg)
            log.info(stage, "KieFusion", "数字人场景融合开始", segment=index)
            log.info(
                stage,
                "KieFusion",
                describe_fusion_urls(ref_kie, human_kie),
                segment=index,
            )
            log.info(
                stage,
                "KieFusion",
                f"prompt={fusion_prompt[:240]}{'…' if len(fusion_prompt) > 240 else ''}",
                segment=index,
            )
            generated_url = kie.generate_scene_image(
                scene_image_url=ref_kie,
                digital_human_image_url=human_kie,
                prompt=fusion_prompt,
            )
            if generated_url:
                scene_path = os.path.join(work_dir, f"scene_{index}.png")
                try:
                    download_file(generated_url, scene_path)
                    log.info(stage, "KieFusion", f"融合成功 → {scene_path}", segment=index)
                except Exception as exc:
                    log.error(stage, "KieFusion", f"下载融合场景失败: {exc}", segment=index)
                    scene_path = ""
            if not scene_path:
                fusion_error = "KIE 场景融合未返回有效结果"

        if fusion_error:
            if strict:
                log.fail(stage, "SceneImage", f"{fusion_error}，strict 模式禁止半身回退", segment=index)
            log.warn(stage, "SceneImage", f"{fusion_error}，使用数字人半身照作为场景", segment=index)
            scene_path = shared.human_half_path

        seg["scene_image_path"] = scene_path
        seg["human_face_path"] = shared.human_face_path or shared.human_half_path
        log.info(stage, "SceneImage", f"场景就绪 → {scene_path or '(none)'}", segment=index)
        return

    ref_kie = resolve_kie_input_url(scene_url, kie, server_base_url) if scene_url else ""
    human_kie = shared.human_face_kie
    if not human_kie and shared.human_face_url:
        human_kie = resolve_kie_input_url(shared.human_face_url, kie, server_base_url)

    if ref_kie:
        log.info(stage, "KieFusion", "普通场景图生成开始", segment=index)
        generated_url = kie.generate_scene_image(
            scene_image_url=ref_kie,
            digital_human_image_url=human_kie,
            prompt=_scene_fusion_prompt(seg),
        )
        if generated_url:
            scene_path = os.path.join(work_dir, f"scene_{index}.png")
            try:
                download_file(generated_url, scene_path)
            except Exception as e:
                print(f"[Stage2] Download generated image failed: {e}")
                scene_path = ""
    else:
        print(f"[Stage2] Segment {index + 1}: Skipping KIE (local files not accessible to external APIs)")

    if not scene_path and use_digital_human and shared.human_face_path:
        print(f"[Stage2] Segment {index + 1}: using human face photo as scene")
        scene_path = shared.human_face_path

    if not scene_path and scene_url:
        local_path = _resolve_local(scene_url, server_base_url)
        if local_path and os.path.exists(local_path):
            scene_path = local_path
        elif scene_url.startswith(("http://", "https://")):
            scene_path = os.path.join(work_dir, f"scene_{index}_ref.png")
            try:
                download_file(scene_url, scene_path)
            except Exception as e:
                print(f"[Stage2] Download reference image failed: {e}")
                scene_path = ""

    seg["scene_image_path"] = scene_path
    seg["human_face_path"] = shared.human_face_path
    log.info(stage, "SceneImage", f"场景就绪 → {scene_path or '(none)'}", segment=index)


def _validate_scene_outputs(
    segments: list[dict],
    *,
    strict: bool,
    log: PipelineLogger,
    stage: str,
) -> None:
    if not strict:
        return
    for i, seg in enumerate(segments):
        narration = (seg.get("narration_text") or "").strip()
        if not narration:
            continue
        path = seg.get("scene_image_path") or ""
        if not path or not os.path.exists(path):
            log.fail(stage, "SceneImage", "口播分镜缺少可用场景图", segment=i)


def _resolve(url: str, base_url: str) -> str:
    """Resolve a potentially relative URL."""
    if not url:
        return ""
    if url.startswith(("http://", "https://")):
        return url
    if base_url:
        return f"{base_url.rstrip('/')}/{url.lstrip('/')}"
    return url


def _resolve_local(url: str, base_url: str) -> str:
    """Try to resolve a URL to a local file path."""
    print(f"[Stage2] _resolve_local: url={url}, base_url={base_url}")
    if url.startswith("/uploads/"):
        local = os.path.join(UPLOADS_DIR, url[len("/uploads/"):])
        print(f"[Stage2] _resolve_local: checking {local}, exists={os.path.exists(local)}")
        if os.path.exists(local):
            return local
    if url.startswith("/renders/"):
        from worker.config import RENDERS_DIR
        local = os.path.join(RENDERS_DIR, url[len("/renders/"):])
        print(f"[Stage2] _resolve_local: checking {local}, exists={os.path.exists(local)}")
        if os.path.exists(local):
            return local
    return ""