# Pipeline 代码索引

> 与 [INTEGRATOR_QUICKSTART §9.1](./INTEGRATOR_QUICKSTART.md#91-流水线-registrypipeline_key) 对照使用。  
> 架构总览见 [CONTEXT.md](../CONTEXT.md)。

## 七条 `pipeline_key` 一览

| `pipeline_key` | Worker 实现 | 注册 | 共享元数据 | 预览 tier |
|----------------|-------------|------|------------|-----------|
| `template_editor` | `worker/pipelines/template_editor.py`（继承 `standard`） | 行末 `register` | `shared/data/pipelines.ts` | `layout` |
| `standard` | `worker/pipelines/standard.py` | 同上 | 同上 | `approximate` |
| `digital_human` | `worker/pipelines/digital_human.py` | 同上 | 同上 | `approximate` |
| `avatar_talk` | `worker/pipelines/avatar_talk.py` | 同上 | 同上 | `approximate` |
| `ai_full_auto` | `worker/pipelines/ai_full_auto.py` | 同上 | 同上 | `approximate` |
| `asset_driven` | `worker/pipelines/asset_driven.py` | 同上 | 同上 | `approximate` |
| `hyperframes_template` | `worker/pipelines/hyperframes_template.py` | 同上 | 同上（默认 UI 隐藏） | `exact` |

基类与生命周期：`worker/pipelines/__init__.py`（`BasePipeline` Template Method）。

## 分阶段共享模块（FFmpeg 交付链）

| 阶段 | 模块 | 说明 |
|------|------|------|
| Stage1 | `worker/stage1_parser.py` | DSL 解析、变量、时间轴 |
| Stage2 | `worker/stage2_scene_gen.py` | AI 场景图（`digital_human` / `avatar_talk` / `hyperframes_template` 跳过） |
| Stage3 | `worker/stage3_video_gen.py` | TTS + 分镜 clip / 唇形 |
| Stage3 适配 | `worker/avatar_provider.py` | `avatar_talk` 统一 AvatarAdapter |
| Stage4 | `worker/stage4_ffmpeg.py` | `assemble_final_video` → `final.mp4` |
| Stage4 动效 | `worker/ffmpeg_effects.py` | HF 转场 → xfade；质感 → 滤镜 |
| Stage4 字幕 | `worker/ass_generator.py` + `worker/subtitle_styles.py` | ASS 烧录；`hf-caption-*` 映射 |
| 时间轴审计 | `worker/timeline_sync.py` | 组装后校验 |
| 调试遗留 | `worker/hf_style_pass.py` | **交付链不再调用**；仅历史/调试参考 |

## 共享层（TS）

| 文件 | 职责 |
|------|------|
| `shared/data/pipelines.ts` | Registry、`getExposedPipelines`、`resolveEditorPipelineKey` |
| `shared/hfStylePass.ts` | `FFMPEG_STYLE_PIPELINES` |
| `shared/hfPipelineWarnings.ts` | 导出前 HF 流水线警告 |
| `shared/subtitleStyles.ts` | HF 字幕 style_id ↔ ASS |
| `shared/hfStyleRegistry.ts` | 动效注册表 |
| `shared/renderGuards.ts` | 口播需数字人校验 |
| `shared/hyperframesComposer.ts` | DSL → HF HTML（预览 + HF 流水线 compose） |

## Web 编辑器

| 文件 | 职责 |
|------|------|
| `web/src/pages/EditorPage.tsx` | 默认 `template_editor` 提交 |
| `web/src/pages/EditorPage/utils/renderIssues.ts` | 阻塞项 / 成本预估 |
| `web/src/utils/previewRenderAlignment.ts` | 预览 vs 成片 tier 文案 |
| `web/src/components/RenderReviewDialog.tsx` | 生成复核 |
| `web/src/components/HfPipelineStatusBar.tsx` | 动效 / 流水线状态条 |
| `web/src/components/IntegratorPlayground.tsx` | `/debug` smoke 与流水线选择 |

## Server API

| 路由 | 文件 | 说明 |
|------|------|------|
| `GET /api/renders/pipelines` | `server/src/routes/renders.ts` | 暴露可选 `pipeline_key` |
| `POST /api/renders` | 同上 | 通用入队；缺省 `standard` |
| `POST /api/renders/ai-generate` | 同上 | 固定 `ai_full_auto` |
| `GET /api/config/diagnostics` | `server/src/routes/config.ts` | 按流水线 blockers/warnings |
| 校验 | `server/src/render-utils.ts` | `validatePipeline`、物化 DSL |

## 测试

| 范围 | 文件 | 覆盖 |
|------|------|------|
| Worker registry | `worker/tests/test_pipeline_registry.py` | 七条 pipeline 注册 |
| Worker 交付 | `worker/tests/test_standard_pipeline_assemble.py` | FFmpeg 单路径、无 `hf_style_pass` |
| Worker 动效 | `worker/tests/test_ffmpeg_effects.py` | xfade / 滤镜映射 |
| Worker xfade | `worker/tests/test_xfade_expected_duration.py` | 时长公式 |
| Worker xfade smoke | `worker/tests/test_stage4_xfade_smoke.py` | Stage4 集成 |
| Worker 时间轴 | `worker/tests/test_timeline_validate_pipeline.py` | 组装后校验 |
| Worker strict | `worker/tests/test_pipeline_strict.py` | 严格模式 |
| Shared | `shared/hfStylePass.test.ts` | FFmpeg style pipelines |
| Shared | `shared/hfPipelineWarnings.test.ts` | 警告文案 |
| Server | `server/src/render-utils.test.ts` | 暴露流水线列表 |
| Server | `server/src/renders.integration.test.ts` | 入队 / pipeline 校验 |
| Server HF CI | `server/src/hf-integrator-smoke.integration.test.ts` | `hyperframes_template` 诊断 |
| E2E | `web/tests/e2e/playground.spec.ts` | Playground smoke |
| E2E | `web/tests/e2e/editor-hf-smoke.spec.ts` | 编辑器 HF 动效 |
| E2E | `web/tests/e2e/render-result.spec.ts` | 成片页 |

## Smoke / 验收命令

| 命令 | 默认 `pipeline_key` | 用途 |
|------|---------------------|------|
| `make smoke-integrator` | `template_editor` | 全链路 health → 入队 → 轮询 |
| `make smoke-integrator SUBMIT_ONLY=1` | `template_editor` | 仅入队 |
| `make smoke-integrator-hf` | `hyperframes_template` | HF 全 HTML 出片（需 Worker + Node） |
| `make smoke-integrator-hf-ci` | `hyperframes_template` | CI：诊断 + 入队（无需 live API） |
| `make smoke-integrator-ci` | — | py_compile 门禁 |
| `make verify-final-delivery JOB=<id>` | — | 单路径成片验收（无 `base_ffmpeg` / `hf_style_pass`） |
| `make validate-render-job JOB=<id>` | — | 时间轴 / 字幕审计 |
| `make verify-delivery-complete` | — | 发布前全门禁 |

环境变量：`SMOKE_PIPELINE_KEY`（`scripts/smoke_integrator.py`）、`ENABLE_HF_TEMPLATE_PIPELINE=1`（暴露 `hyperframes_template`）。

## 三条执行路径（代码落点）

| 路径 | 入口 | 产物 |
|------|------|------|
| ① 交付 | Worker `pipeline_registry.get(key)` | `data/renders/job_<id>/final.mp4` |
| ② 预览 | `GET` composition HTML + 编辑器 iframe | 浏览器内播放，不写 job 产物 |
| ③ 调试 | `hyperframes_template` 或 `npm run hf:compose` / `hf:render` | `final.mp4`（HF CLI） |

Composer 脚本：`scripts/write_hf_composition.ts`；本地 HF：`guide/package.json` → `hf:lint` / `hf:compose` / `hf:render`。