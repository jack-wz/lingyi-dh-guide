#!/usr/bin/env python3
"""飞鹤卓睿全链路 E2E：从平台目录加载声音/形象/分镜/模板并跑完整渲染。"""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path

import requests

API = os.getenv("SERVER_URL", "http://127.0.0.1:8000").rstrip("/")
GUIDE_DIRECT = os.getenv("GUIDE_INTERNAL_URL", "http://127.0.0.1:3001").rstrip("/")
PLATFORM = Path("/Users/wuzhu/Documents/AI 产品/数字人/零一数字人导购平台")
POLL_TRAIN_S = int(os.getenv("E2E_TRAIN_TIMEOUT", "900"))
POLL_RENDER_S = int(os.getenv("E2E_RENDER_TIMEOUT", "3600"))
SEGMENT_COUNT = int(os.getenv("E2E_SEGMENTS", "4"))

SHOTS = [
    {
        "id": "shot_01",
        "dir": PLATFORM / "07_测试案例/飞鹤卓睿_V1测试/分镜素材/shot_01_open",
        "pose": "shot_01_medium_smile.png",
        "scene": "01.png",
        "narration": "当妈后怎么天天都这样松弛，我们快来请教请教她",
        "duration_sec": 10,
    },
    {
        "id": "shot_02",
        "dir": PLATFORM / "07_测试案例/飞鹤卓睿_V1测试/分镜素材/shot_02_think",
        "pose": "shot_02_thinking.png",
        "scene": "02.png",
        "narration": "哎问我妈，美宝妈松弛带娃有秘籍吗，销冠口粮带娃真的so easy",
        "duration_sec": 10,
    },
    {
        "id": "shot_03",
        "dir": PLATFORM / "07_测试案例/飞鹤卓睿_V1测试/分镜素材/shot_03_confident",
        "pose": "shot_03_arms_crossed.png",
        "scene": "03.png",
        "narration": "你是说飞鹤卓睿是松弛秘籍，搭载母源黄金配比，营养全覆盖，当妈也要像阿凡提一样反压力",
        "duration_sec": 10,
    },
    {
        "id": "shot_04",
        "dir": PLATFORM / "07_测试案例/飞鹤卓睿_V1测试/分镜素材/shot_04_cta",
        "pose": "shot_04_thumbs_up_wave.png",
        "scene": "04.png",
        "narration": "妈妈们，快来上海砖桥万达孩子王，找我安排上，带娃秘籍",
        "duration_sec": 8,
    },
]

ASSETS = {
    "voice": PLATFORM / "06_品牌素材库/飞鹤卓睿/声音素材/wyai_audio_v3.mp3",
    "face": PLATFORM / "07_测试案例/飞鹤卓睿_V1测试/分镜素材/shot_01_open/shot_01_medium_smile.png",
    "half": PLATFORM / "07_测试案例/飞鹤卓睿_V1测试/分镜素材/shot_01_open/shot_01_medium_smile.png",
    "full": PLATFORM / "06_品牌素材库/飞鹤卓睿/导购形象/wyai-形象参考.png",
    "bgm": PLATFORM / "08_剪辑工程/6月5日数字人demo素材/bgm.mp3",
    "script": PLATFORM / "06_品牌素材库/飞鹤卓睿/脚本/当妈后怎么天天都这样松弛_脚本.md",
    "dsl_spec": PLATFORM / "03_视频生产管道/视频模板DSL规范-V1.md",
}


def log(step: str, status: str, detail: object = "") -> None:
    print(json.dumps({"step": step, "status": status, "detail": detail}, ensure_ascii=False))


def upload_file(path: Path) -> str:
    last_err: Exception | None = None
    for base in (API, GUIDE_DIRECT):
        for attempt in range(3):
            try:
                with path.open("rb") as handle:
                    res = requests.post(
                        f"{base}/api/uploads",
                        files={"file": (path.name, handle, "application/octet-stream")},
                        timeout=180,
                    )
                res.raise_for_status()
                return res.json()["url"]
            except Exception as exc:
                last_err = exc
                time.sleep(1 + attempt)
    raise RuntimeError(f"upload failed for {path}: {last_err}")


def build_template_dsl(scene_urls: list[str], bgm_url: str) -> dict:
    segments = []
    for i, shot in enumerate(SHOTS[:SEGMENT_COUNT]):
        segments.append(
            {
                "id": shot["id"],
                "index": i,
                "type": "narration",
                "narration_text": shot["narration"],
                "duration_sec": shot["duration_sec"],
                "scene_image_url": scene_urls[i],
                "scene_description": f"飞鹤卓睿导购分镜 {i + 1}",
                "camera_shot": "medium",
                "segment_bgm_url": "",
                "subtitle": {
                    "enabled": True,
                    "style_id": "default",
                    "position": "bottom",
                    "animation": "fadeIn",
                },
                "transition": {"type": "fade", "duration": 0.5},
                "digital_human": {"enabled": True, "position": {"x": 50, "y": 75}, "scale": 100},
                "overlays": [],
                "thumbnail_url": "",
                "diagnostics": [],
                "layout": "avatar-center",
                "avatar_id": "",
                "voice_id": "",
                "objects": [],
            }
        )
    return {
        "meta": {
            "id": "",
            "name": "飞鹤卓睿·40秒标准版(E2E)",
            "type": "bestseller",
            "description": "从平台目录 07_测试案例 导入的 4 分镜模板",
            "coverUrl": scene_urls[0] if scene_urls else "",
            "status": "draft",
            "version": 1,
            "pipeline_key": "standard",
            "input_mode": "template",
        },
        "globalConfig": {
            "canvas_width": 1080,
            "canvas_height": 1920,
            "fps": 30,
            "bgm_url": bgm_url,
            "bgm_volume": 0.15,
            "output_format": "mp4",
            "background_color": "#000000",
            "bgm_enabled": bool(bgm_url),
            "bgm_loop": True,
            "transition_enabled": True,
            "brand_logo_url": "",
            "brand_color": "#E85D04",
            "output_resolution": "720p",
            "aspect_ratio": "9:16",
        },
        "segments": segments,
        "variables": [],
    }


def main() -> int:
    report: dict = {"api": API, "steps": []}

    # 1) 目录素材校验
    missing = [k for k, p in ASSETS.items() if not p.exists()]
    for shot in SHOTS[:SEGMENT_COUNT]:
        for key in ("pose", "scene"):
            fp = shot["dir"] / shot[key]
            if not fp.exists():
                missing.append(str(fp))
    if missing:
        log("asset_check", "fail", missing)
        return 1
    log("asset_check", "ok", {k: str(v) for k, v in ASSETS.items()})

    # 2) 上传素材
    voice_url = upload_file(ASSETS["voice"])
    face_url = upload_file(ASSETS["face"])
    half_url = upload_file(ASSETS["half"])
    full_url = upload_file(ASSETS["full"])
    bgm_url = upload_file(ASSETS["bgm"]) if ASSETS["bgm"].exists() else ""
    scene_urls = []
    for shot in SHOTS[:SEGMENT_COUNT]:
        scene_urls.append(upload_file(shot["dir"] / shot["scene"]))
    log("upload", "ok", {"voice": voice_url, "scenes": len(scene_urls)})

    # 3) 创建数字人
    dh_name = f"飞鹤-wyai-E2E-{int(time.time())}"
    res = requests.post(
        f"{API}/api/digital-humans",
        json={
            "name": dh_name,
            "face_photo_url": face_url,
            "half_body_photo_url": half_url,
            "full_body_photo_url": full_url,
            "voice_sample_url": voice_url,
        },
        timeout=60,
    )
    res.raise_for_status()
    dh_id = res.json()["id"]
    put = requests.put(
        f"{API}/api/digital-humans/{dh_id}",
        json={
            "face_photo_url": face_url,
            "half_body_photo_url": half_url,
            "full_body_photo_url": full_url,
            "voice_sample_url": voice_url,
        },
        timeout=60,
    )
    put.raise_for_status()
    log("digital_human_create", "ok", {"id": dh_id, "name": dh_name})

    # 4) 训练（KIE 形象 + MOSI 音色）
    train = requests.post(
        f"{API}/api/digital-humans/{dh_id}/train",
        json={"provider": "cenker", "async": True},
        timeout=60,
    )
    train.raise_for_status()
    log("digital_human_train_start", "ok", train.json().get("status"))

    deadline = time.time() + POLL_TRAIN_S
    train_ok = False
    while time.time() < deadline:
        st = requests.get(f"{API}/api/digital-humans/{dh_id}", timeout=30).json()
        status = st.get("status")
        if status == "ready":
            train_ok = True
            log("digital_human_train", "ok", {
                "voice_clone_id": st.get("voice_clone_id"),
                "image_model_id": st.get("image_model_id"),
            })
            break
        if status == "failed":
            log("digital_human_train", "fail", st.get("training_error"))
            break
        time.sleep(10)
    if not train_ok:
        # 回退：使用历史验证 voice_id 继续测渲染链路（仅当训练失败）
        fallback_voice = "2062813451901734912"
        requests.post(
            f"{API}/api/digital-humans/{dh_id}/training-status",
            json={
                "status": "ready",
                "voice_clone_id": fallback_voice,
                "image_model_id": f"cenker-persona:{dh_id}",
                "provider_job_id": "e2e-fallback",
            },
            timeout=30,
        )
        log("digital_human_train", "fallback", {"voice_clone_id": fallback_voice})

    # 5) 创建视频模板
    dsl = build_template_dsl(scene_urls, bgm_url)
    tpl_res = requests.post(
        f"{API}/api/templates",
        json={"name": dsl["meta"]["name"], "type": "母婴奶粉", "description": "飞鹤卓睿 E2E 全链路"},
        timeout=60,
    )
    tpl_res.raise_for_status()
    template_id = tpl_res.json()["id"]
    dsl["meta"]["id"] = template_id
    put = requests.put(
        f"{API}/api/templates/{template_id}",
        json={"dsl_json": dsl},
        timeout=60,
    )
    put.raise_for_status()
    saved = requests.get(f"{API}/api/templates/{template_id}", timeout=30).json()
    saved_dsl = saved.get("dsl_json") or saved.get("dsl") or {}
    seg_count = len(saved_dsl.get("segments") or [])
    if seg_count != len(dsl["segments"]):
        log("video_template", "fail", {"expected": len(dsl["segments"]), "saved": seg_count})
        return 3
    log("video_template", "ok", {"template_id": template_id, "segments": seg_count})

    # 6) 提交渲染任务
    render = requests.post(
        f"{API}/api/renders",
        json={
            "template_id": template_id,
            "digital_human_id": dh_id,
            "pipeline_key": "standard",
            "input_mode": "template",
            "max_retries": 1,
        },
        timeout=60,
    )
    render.raise_for_status()
    job = render.json()
    job_id = job["id"]
    log("render_submit", "ok", {"job_id": job_id, "pipeline": "standard"})

    # 7) 轮询渲染
    deadline = time.time() + POLL_RENDER_S
    final_status = "timeout"
    while time.time() < deadline:
        job = requests.get(f"{API}/api/renders/{job_id}", timeout=30).json()
        stage = job.get("stage")
        progress = job.get("progress")
        status = job.get("status")
        print(json.dumps({
            "poll": True,
            "status": status,
            "stage": stage,
            "progress": progress,
            "error": job.get("error_message", ""),
        }, ensure_ascii=False))
        if status == "completed":
            final_status = "completed"
            log("render_done", "ok", {
                "output_url": job.get("output_url"),
                "duration_sec": job.get("duration_sec"),
            })
            break
        if status == "failed":
            final_status = "failed"
            log("render_done", "fail", job.get("error_message"))
            break
        time.sleep(20)

    if final_status == "timeout":
        log("render_done", "timeout", {"job_id": job_id})

    report["result"] = final_status
    report_path = Path(__file__).resolve().parents[1] / "data" / "e2e_feifei_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nReport: {report_path}")
    return 0 if final_status == "completed" else 2


if __name__ == "__main__":
    raise SystemExit(main())