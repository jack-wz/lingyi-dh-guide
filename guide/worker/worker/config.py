import os
import json

# Server API
SERVER_URL = os.getenv("SERVER_URL", "http://localhost:8000")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "3"))

# API Keys (defaults)
KIE_API_KEY = os.getenv("KIE_API_KEY", "")
KIE_BASE_URL = os.getenv("KIE_BASE_URL", "https://api.kie.ai")
YUNTTS_API_KEY = os.getenv("YUNTTS_API_KEY", "sk-")
YUNTTS_BASE_URL = os.getenv("YUNTTS_BASE_URL", "https://www.yuntts.com/api/v1")
WAVESPEED_API_KEY = os.getenv("WAVESPEED_API_KEY", "")
WAVESPEED_BASE_URL = os.getenv("WAVESPEED_BASE_URL", "https://api.wavespeed.ai")

# Data directories
_worker_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_project_root = os.path.dirname(_worker_dir)
DATA_DIR = os.path.join(_project_root, "data")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
RENDERS_DIR = os.path.join(DATA_DIR, "renders")
DB_PATH = os.path.join(DATA_DIR, "templates.db")
CONFIG_JSON_PATH = os.path.join(DATA_DIR, "config.json")
_JOB_CONFIG_SNAPSHOT = {}


def _deep_merge(base, override):
    """Recursively merge dictionaries without mutating inputs."""
    result = dict(base or {})
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def set_job_config_snapshot(snapshot=None):
    """Set provider/pipeline config snapshot for the currently executing job."""
    global _JOB_CONFIG_SNAPSHOT
    _JOB_CONFIG_SNAPSHOT = snapshot if isinstance(snapshot, dict) else {}


def _load_json():
    """Load and return config.json contents (fresh read each call)."""
    data = {}
    if not os.path.exists(CONFIG_JSON_PATH):
        return _deep_merge(data, _JOB_CONFIG_SNAPSHOT)
    try:
        with open(CONFIG_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = {}
    return _deep_merge(data, _JOB_CONFIG_SNAPSHOT)


KIE_AVATAR_DEFAULT_MODEL = os.getenv("KIE_AVATAR_MODEL", "infinitalk/from-audio")
KIE_AVATAR_DEFAULT_RESOLUTION = os.getenv("KIE_AVATAR_RESOLUTION", "480p")


def get_kie_config():
    """Get KIE config with hot-reload from config.json."""
    cfg = _load_json().get("models", {}).get("kie", {})
    api_key = cfg.get("api_key", "")
    if not api_key or "***" in api_key:
        api_key = KIE_API_KEY
    base_url = cfg.get("base_url") or KIE_BASE_URL
    return api_key, base_url


def get_kie_avatar_config():
    """KIE InfiniteTalk lip-sync settings (separate from scene-image model)."""
    cfg = _load_json().get("models", {}).get("kie", {})
    api_key, base_url = get_kie_config()
    raw_model = (cfg.get("avatar_model") or KIE_AVATAR_DEFAULT_MODEL or "infinitalk/from-audio").strip()
    resolution = (cfg.get("avatar_resolution") or KIE_AVATAR_DEFAULT_RESOLUTION or "480p").strip()
    prompt = cfg.get("avatar_prompt") or get_prompt(
        "avatar_infinitetalk",
        "自然口播，轻微头部动作和表情，电商导购短视频风格",
    )
    try:
        poll_timeout = int(cfg.get("avatar_poll_timeout") or cfg.get("poll_timeout") or 300)
    except (TypeError, ValueError):
        poll_timeout = 300
    return api_key, base_url, raw_model, resolution, prompt, poll_timeout


def get_yuntts_config():
    """Get YunTTS config with hot-reload from config.json."""
    cfg = _load_json().get("models", {}).get("yuntts", {})
    api_key = cfg.get("api_key", "")
    if not api_key or "***" in api_key:
        api_key = YUNTTS_API_KEY
    base_url = cfg.get("base_url") or YUNTTS_BASE_URL
    default_voice = cfg.get("default_voice") or "zh-CN-XiaoxiaoNeural"
    return api_key, base_url, default_voice


WAVESPEED_DEFAULT_MODEL = os.getenv("WAVESPEED_MODEL", "infinitetalk")
WAVESPEED_DEFAULT_RESOLUTION = os.getenv("WAVESPEED_RESOLUTION", "480p")
AVATAR_PROVIDER_DEFAULT = os.getenv("AVATAR_PROVIDER", "wavespeed")


def get_wavespeed_config():
    """Get WaveSpeed config with hot-reload from config.json."""
    cfg = _load_json().get("models", {}).get("wavespeed", {})
    api_key = cfg.get("api_key", "")
    if not api_key or "***" in api_key:
        api_key = WAVESPEED_API_KEY
    base_url = cfg.get("base_url") or WAVESPEED_BASE_URL
    model = (cfg.get("model") or WAVESPEED_DEFAULT_MODEL or "infinitetalk").strip()
    resolution = (cfg.get("resolution") or WAVESPEED_DEFAULT_RESOLUTION or "480p").strip()
    return api_key, base_url, model, resolution


def get_avatar_provider() -> str:
    """Talking-head provider: wavespeed (InfiniteTalk via WaveSpeed) or kie (reserved)."""
    cfg = _load_json().get("pipeline", {})
    provider = (os.getenv("AVATAR_PROVIDER") or cfg.get("avatar_provider") or AVATAR_PROVIDER_DEFAULT or "wavespeed")
    return str(provider).strip().lower() or "wavespeed"


def get_pipeline_config():
    """Get pipeline config with hot-reload from config.json."""
    cfg = _load_json().get("pipeline", {})
    return {
        "poll_interval": cfg.get("poll_interval") or POLL_INTERVAL,
        "tts_speed_threshold": cfg.get("tts_speed_threshold") or 1.1,
        "ken_burns_zoom_start": cfg.get("ken_burns_zoom_start") or 1.0,
        "ken_burns_zoom_end": cfg.get("ken_burns_zoom_end") or 1.15,
        "avatar_provider": get_avatar_provider(),
        "timeline_validate": _env_bool(
            "RENDER_TIMELINE_VALIDATE",
            cfg.get("timeline_validate", True),
        ),
        "timeline_validate_strict": _env_bool(
            "RENDER_TIMELINE_STRICT",
            cfg.get("timeline_validate_strict", False),
        ),
    }


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return bool(default)
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def get_prompt(key, fallback=""):
    """Get a prompt from config.json with hot-reload."""
    val = _load_json().get("prompts", {}).get(key, "")
    return val if val else fallback
