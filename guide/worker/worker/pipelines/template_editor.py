"""Template editor pipeline - exact render for templates authored in the editor.

Functionally equivalent to the standard pipeline, but registered as a distinct
key so the editor can choose "render what I see" semantics.
"""

from worker.pipelines import BasePipeline, pipeline_registry
from worker.pipelines.standard import StandardPipeline


class TemplateEditorPipeline(StandardPipeline):
    name = "template_editor"
    description = "模板编辑器：精确渲染当前编辑器中的模板内容"


pipeline_registry.register("template_editor", TemplateEditorPipeline())
