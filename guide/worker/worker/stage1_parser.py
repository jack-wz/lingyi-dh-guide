"""Stage 1: Template parsing - variable substitution, timeline & overlay resolution."""


def _replace_vars(value, resolved_vars: dict) -> str:
    text = "" if value is None else str(value)
    for var_name, var_value in resolved_vars.items():
        text = text.replace(f"{{{var_name}}}", var_value)
    return text


def _object_to_overlay(obj: dict, segment_duration: float, segment_index: int) -> dict | None:
    """Convert editor canvas objects into the legacy overlay event shape.

    The editor now stores most non-collaborative canvas layers in `objects[]`.
    Stage 4 already consumes overlay events, so Stage 1 acts as the compatibility
    bridge instead of making the composition stage understand every DSL variant.
    """
    if obj.get("visible") is False:
        return None

    obj_type = obj.get("type", "")
    asset_url = obj.get("asset_url", "")
    raw_metadata = obj.get("metadata") or {}
    has_renderable_placeholder = obj_type in {"text", "logo", "subtitle"} or obj.get("interaction") or raw_metadata.get("source") == "record"
    if not asset_url and not has_renderable_placeholder:
        return None

    metadata = dict(raw_metadata)
    duration = metadata.get("duration_sec", segment_duration)
    try:
        duration = float(duration)
    except (TypeError, ValueError):
        duration = segment_duration
    if duration <= 0:
        duration = segment_duration

    if obj.get("interaction") or metadata.get("source") == "record":
        render_width_pct = 52
        render_height_pct = 18
    elif obj_type in {"text", "subtitle"}:
        render_width_pct = 58
        render_height_pct = 11
    else:
        render_width_pct = 33
        render_height_pct = 13

    return {
        "id": obj.get("id", f"object-{segment_index}"),
        "asset_url": asset_url,
        "position": obj.get("position", {"x": 50, "y": 50}),
        "scale": obj.get("scale", 100),
        "render_width_pct": render_width_pct,
        "render_height_pct": render_height_pct,
        "rotation": obj.get("rotation", 0),
        "seg_start_time": 0,
        "duration": min(duration, segment_duration),
        "animation": metadata.get("animation", "none"),
        "segment_index": segment_index,
        "object_type": obj_type,
        "label": obj.get("label", ""),
        "text": obj.get("text", ""),
        "interaction": obj.get("interaction"),
        "metadata": metadata,
        "style": obj.get("style", {}),
        "locked": obj.get("locked", False),
    }


def parse_template(dsl: dict, variables: dict) -> dict:
    """Parse template DSL and resolve variables + segment-level overlays.

    Args:
        dsl: The full Template DSL
        variables: User-provided variable values

    Returns:
        Resolved script with computed timeline and flattened overlays
    """
    global_config = dsl.get("globalConfig", {})
    segments = dsl.get("segments", [])
    dsl_variables = dsl.get("variables", [])

    # Merge variables: user values override defaults
    resolved_vars = {}
    for v in dsl_variables:
        name = v.get("name", "")
        if name in variables:
            resolved_vars[name] = str(variables[name])
        elif v.get("default_value"):
            resolved_vars[name] = str(v["default_value"])
        else:
            resolved_vars[name] = ""

    # Apply variable substitution to all segments
    cursor = 0.0
    resolved_segments = []
    all_overlays = []

    for i, seg in enumerate(segments):
        seg = dict(seg)  # shallow copy

        # Replace variables in narration text and media references.
        seg["narration_text"] = _replace_vars(seg.get("narration_text", ""), resolved_vars)
        seg["scene_image_url"] = _replace_vars(seg.get("scene_image_url", ""), resolved_vars)
        seg["scene_description"] = _replace_vars(seg.get("scene_description", ""), resolved_vars)

        # Compute timeline
        try:
            duration = float(seg.get("duration_sec", 5.0))
        except (TypeError, ValueError):
            duration = 5.0
        seg["duration_sec"] = duration
        seg["start_time"] = round(cursor, 3)
        seg["end_time"] = round(cursor + duration, 3)
        seg["index"] = i

        # Resolve segment-level overlays to global timeline
        normalized_objects = []
        for obj in seg.get("objects", []) or []:
            obj = dict(obj)
            obj["asset_url"] = _replace_vars(obj.get("asset_url", ""), resolved_vars)
            obj["text"] = _replace_vars(obj.get("text", ""), resolved_vars)
            obj["label"] = _replace_vars(obj.get("label", ""), resolved_vars)
            interaction = obj.get("interaction")
            if isinstance(interaction, dict):
                interaction = dict(interaction)
                interaction["target_url"] = _replace_vars(interaction.get("target_url", ""), resolved_vars)
                interaction["options"] = [
                    _replace_vars(option, resolved_vars)
                    for option in interaction.get("options", []) or []
                ]
                obj["interaction"] = interaction
            normalized_objects.append(obj)
        seg["objects"] = normalized_objects

        seg_overlays = list(seg.get("overlays", []) or [])
        for obj in normalized_objects:
            obj_overlay = _object_to_overlay(obj, duration, i)
            if obj_overlay:
                seg_overlays.append(obj_overlay)

        for ov in seg_overlays:
            seg_start = float(ov.get("seg_start_time", 0))
            ov_duration = float(ov.get("duration", 3.0))
            global_start = cursor + seg_start
            global_end = min(global_start + ov_duration, cursor + duration)

            all_overlays.append({
                "id": ov.get("id", ""),
                "asset_url": ov.get("asset_url", ""),
                "position": ov.get("position", {"x": 50, "y": 50}),
                "scale": ov.get("scale", 100),
                "render_width_pct": ov.get("render_width_pct"),
                "render_height_pct": ov.get("render_height_pct"),
                "rotation": ov.get("rotation", 0),
                "seg_start_time": round(seg_start, 3),
                "duration": round(ov_duration, 3),
                "global_start_s": round(global_start, 3),
                "global_end_s": round(global_end, 3),
                "animation": ov.get("animation", "none"),
                "segment_index": i,
                "object_type": ov.get("object_type", ""),
                "label": ov.get("label", ""),
                "text": ov.get("text", ""),
                "interaction": ov.get("interaction"),
                "metadata": ov.get("metadata", {}),
                "style": ov.get("style", {}),
            })

        cursor += duration
        resolved_segments.append(seg)

    return {
        "meta": dsl.get("meta", {}),
        "globalConfig": global_config,
        "segments": resolved_segments,
        "overlays": all_overlays,
        "total_duration": round(cursor, 3),
        "resolved_variables": resolved_vars,
    }
