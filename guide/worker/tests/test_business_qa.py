"""Tests for business + technical quality gate diagnostics (V4 #10)."""

import pytest
import tempfile
import os
import wave
from worker.business_qa import (
    check_business_constraints,
    check_technical_quality,
    run_full_diagnostics,
)


def test_business_qa_detects_missing_disclaimer():
    segments = [{"narration_text": "产品很好", "duration_sec": 5}]
    brief = {"required_disclaimers": ["本品不能代替药物"], "target_duration_sec": 10}
    result = check_business_constraints(segments, brief)
    assert not result["ready"]
    assert any("不能代替药物" in b for b in result["blockers"])


def test_business_qa_detects_banned_words():
    segments = [{"narration_text": "这是最好的产品", "duration_sec": 5}]
    brief = {"banned_words": ["最好"]}
    result = check_business_constraints(segments, brief)
    assert not result["ready"]
    assert any("最好" in b for b in result["blockers"])


def test_business_qa_detects_missing_cta():
    segments = [{"narration_text": "产品很好", "duration_sec": 5}]
    brief = {"cta": "立即购买"}
    result = check_business_constraints(segments, brief)
    assert any("立即购买" in w for w in result["warnings"])


def test_business_qa_checks_selling_point_coverage():
    segments = [{"narration_text": "高钙易吸收", "duration_sec": 5}]
    brief = {"selling_points": ["高钙", "易吸收", "品牌信赖"]}
    result = check_business_constraints(segments, brief)
    assert any("品牌信赖" in w for w in result["warnings"])


def test_business_qa_duration_overrun():
    segments = [{"narration_text": "x", "duration_sec": 60}]
    brief = {"target_duration_sec": 30}
    result = check_business_constraints(segments, brief)
    assert not result["ready"]
    assert any("远超目标" in b for b in result["blockers"])


def test_business_qa_empty_segments():
    result = check_business_constraints([], {})
    assert not result["ready"]
    assert any("没有分镜" in b for b in result["blockers"])


def test_technical_qa_detects_missing_clip():
    segments = [{"clip_path": "/nonexistent/clip.mp4", "narration_text": "test", "duration_sec": 5}]
    result = check_technical_quality(segments, work_dir="/tmp")
    assert not result["ready"]
    assert any("clip" in b.lower() for b in result["blockers"])


def test_technical_qa_detects_empty_narration():
    segments = [{"narration_text": "", "duration_sec": 5}]
    result = check_technical_quality(segments, work_dir="/tmp")
    assert any("旁白为空" in w for w in result["warnings"])


def test_full_diagnostics_combines_both():
    segments = [{"narration_text": "最好的产品", "duration_sec": 0, "clip_path": "/nonexistent.mp4"}]
    brief = {"banned_words": ["最好"], "target_duration_sec": 10}
    result = run_full_diagnostics(segments, brief, {}, "/tmp")
    assert not result["ready"]
    assert len(result["blockers"]) >= 2  # banned word + duration <= 0 + missing clip
    assert "technical" in result
    assert "business" in result


def test_business_qa_passes_valid_content():
    segments = [
        {"narration_text": "高钙易吸收，品牌信赖，立即购买。本品不能代替药物。", "duration_sec": 10, "scene_image_url": "/x.png"},
    ]
    brief = {
        "required_disclaimers": ["本品不能代替药物"],
        "banned_words": [],
        "cta": "立即购买",
        "selling_points": ["高钙", "易吸收", "品牌信赖"],
        "target_duration_sec": 10,
    }
    result = check_business_constraints(segments, brief, {"digital_human_id": "dh-1"})
    assert result["ready"]
    assert len(result["blockers"]) == 0
