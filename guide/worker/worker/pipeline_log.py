"""Structured per-stage logging for render pipelines."""

from __future__ import annotations

from typing import Callable, Optional


EmitFn = Callable[[str, str], None]


class PipelineStepError(RuntimeError):
    """Raised when a required pipeline step fails in strict mode."""

    def __init__(
        self,
        stage: str,
        step: str,
        message: str,
        *,
        segment: Optional[int] = None,
    ):
        self.stage = stage
        self.step = step
        self.segment = segment
        seg = f"分镜{segment + 1}" if segment is not None else ""
        seg_part = f"{seg} " if seg else ""
        super().__init__(f"[{stage}/{step}] {seg_part}{message}")


class PipelineLogger:
    """Emit `[Job:xxxxxxxx][StageN][Step] message` to worker stdout and job logs."""

    def __init__(self, job_id: str, emit: Optional[EmitFn] = None):
        self.job_id = (job_id or "local")[:8]
        self._emit = emit or (lambda _level, msg: print(msg, flush=True))

    def _format(self, stage: str, step: str, message: str, segment: Optional[int] = None) -> str:
        parts = [f"[Job:{self.job_id}]", f"[{stage}]", f"[{step}]"]
        if segment is not None:
            parts.insert(2, f"[Seg{segment + 1}]")
        return "".join(parts) + f" {message}"

    def info(self, stage: str, step: str, message: str, *, segment: Optional[int] = None) -> None:
        self._emit("info", self._format(stage, step, message, segment))

    def warn(self, stage: str, step: str, message: str, *, segment: Optional[int] = None) -> None:
        self._emit("warn", self._format(stage, step, message, segment))

    def error(self, stage: str, step: str, message: str, *, segment: Optional[int] = None) -> None:
        self._emit("error", self._format(stage, step, message, segment))

    def stage_begin(self, stage: str, message: str) -> None:
        self.info(stage, "BEGIN", message)

    def stage_end(self, stage: str, message: str) -> None:
        self.info(stage, "END", message)

    def fail(self, stage: str, step: str, message: str, *, segment: Optional[int] = None) -> None:
        self.error(stage, step, message, segment=segment)
        raise PipelineStepError(stage, step, message, segment=segment)


def null_logger() -> PipelineLogger:
    return PipelineLogger("local", emit=lambda _level, msg: print(msg, flush=True))