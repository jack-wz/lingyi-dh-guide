#!/usr/bin/env python3
"""用新模板的字幕/贴纸层，对已有分镜 clip 重新 FFmpeg 组装（跳过 TTS/口型）。"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from reassemble_lib import reassemble_job


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: reassemble_with_template.py <job_id> <template_id>")
        return 1

    job_id = sys.argv[1]
    template_id = sys.argv[2]
    output_name = os.getenv("OUTPUT_NAME", "final_ass_jianying.mp4")
    result = reassemble_job(
        job_id,
        template_id,
        output_name=output_name,
        ass_only=os.getenv("ASS_ONLY", "1") != "0",
    )
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())