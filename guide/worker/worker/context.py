from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


def create_core_services():
    from worker.core import CoreServices
    return CoreServices()


@dataclass
class ProcessedSegment:
    """A segment after pipeline processing."""
    index: int
    type: str
    narration_text: str
    duration_sec: float
    scene_image_url: str
    scene_description: str
    camera_shot: str
    subtitle: Dict[str, Any]
    transition: Dict[str, Any]
    digital_human: Dict[str, Any]
    overlays: List[Dict[str, Any]]

    # Processing results
    scene_image_path: Optional[str] = None
    human_face_path: Optional[str] = None
    tts_audio_path: Optional[str] = None
    clip_path: Optional[str] = None
    start_time: float = 0.0
    end_time: float = 0.0


@dataclass
class PipelineContext:
    """Shared state across pipeline stages (inspired by Pixelle-Video)."""
    task_id: str
    dsl: Dict[str, Any]
    variables: Dict[str, Any]
    digital_human: Dict[str, Any]
    work_dir: str
    server_base_url: str

    # Populated during pipeline execution
    resolved_variables: Dict[str, Any] = field(default_factory=dict)
    segments: List[ProcessedSegment] = field(default_factory=list)
    overlays: List[Dict[str, Any]] = field(default_factory=list)
    total_duration: float = 0.0
    output_path: Optional[str] = None

    # Progress callback
    on_progress: Any = None
    core: Any = field(default_factory=create_core_services)

    def report_progress(self, stage: str, progress: float, message: str = ""):
        if self.on_progress:
            self.on_progress(stage, progress, message)
