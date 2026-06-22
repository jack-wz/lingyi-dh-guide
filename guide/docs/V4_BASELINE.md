# V4 工程基线

记录 #3 建立基线时的系统状态。后续 Issue 以此为回退基准。

## 数据库基线 (templates.db)

| 表 | 用途 | 关键列 |
|------|------|--------|
| templates | 模板 DSL | id, name, dsl_json, status, version |
| assets | 资产库 | id, name, type, file_url, metadata |
| digital_humans | 数字人 | id, name, status, face/half_body/full_body_photo_url |
| render_jobs | 渲染任务 | id, template_id, pipeline_key, input_mode, status, stage |
| render_logs | 渲染日志 | id, render_job_id, level, message |
| library_items | 素材库 | id, category, name, payload_json |

## API 基线

| 路由 | 方法 | 用途 |
|------|------|------|
| /api/templates | GET/POST | 模板 CRUD |
| /api/renders | GET/POST | 渲染任务 |
| /api/renders/ai-generate | POST | AI 全自动快捷入口 |
| /api/renders/pipelines | GET | 流水线注册表 |
| /api/renders/:id | GET/PATCH | 任务状态 |
| /api/digital-humans | GET/POST | 数字人管理 |
| /api/assets | GET/POST | 资产管理 |
| /api/config | GET/PUT | 配置 |
| /api/config/diagnostics | GET | 诊断 |
| /api/config/feature-flags | GET | V4 功能开关 |

## Worker 流水线基线

| pipeline_key | 用途 | Stage1-4 |
|-------------|------|----------|
| template_editor | 默认编辑器出片 | parse → scene_gen → video_gen → ffmpeg |
| standard | 标准四阶段 | 同上 |
| digital_human | 数字人口播 | parse → skip → video_gen → ffmpeg |
| ai_full_auto | AI 全自动 | LLM → scene_gen → video_gen → ffmpeg |
| asset_driven | 素材驱动 | 素材拆镜 → scene_gen → video_gen → ffmpeg |
| avatar_talk | 对口播 | parse → skip → video_gen → ffmpeg |
| hyperframes_template | HF 调试 | TS composer → lint → HF render |

## 单主路径契约

- 编辑器生成固定使用 `template_editor`
- 主题/脚本模式自动使用 `ai_full_auto`
- 其他 pipeline_key 仅通过 API / 集成 / Debug 访问
- 常规 UI 不暴露 pipeline_key 选择器

## 功能开关（全部默认关闭）

| 开关 | 控制 | 对应 Issue |
|------|------|-----------|
| ENABLE_PROJECT_WORKFLOW | Project 生命周期 | #4 |
| ENABLE_PROPOSAL_GATE | Proposal + Preflight | #5 |
| ENABLE_REFERENCE_SETS | Reference Set + 血缘 | #7 |
| ENABLE_SEGMENT_REGEN | 局部重生成 | #11 |
| ENABLE_LOTTIE_OVERLAY | Lottie Overlay | #9 |
| ENABLE_STAGE4_BUSINESS_QA | 业务质量门禁 | #10 |
| ENABLE_REVIEW_WORKFLOW | 审核 + 版本 + 复用 | #14 |

## 测试基线

| 测试 | 命令 | 结果 |
|------|------|------|
| Worker 单元测试 | `make test-guide` | 38 passed |
| Server 单元测试 | `make test-guide-server` | 73 passed, 1 env-failure |
| Timeline 单元测试 | `make test-guide-fast` | 38 passed |

## 已知失败

- `library.integration.test.ts` OpenStoryline 字体导入：环境依赖，与代码改动无关。
