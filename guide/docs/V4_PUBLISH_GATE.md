# V4 发布门禁

## 度量指标 API

### GET /api/metrics/metrics

返回平台度量指标：模板数、项目数、渲染任务数、资产数、数字人数、Proposal 数、Recipe 数、Reference Set 数、资产关系数、生成产物数、渲染成功率、数字人就绪率、Proposal 采用率、任务状态分布、项目状态分布、功能开关状态、V4 能力清单。

### GET /api/metrics/regression-check

返回 V4 回归检查清单（13 项全部 pass）：

1. pipeline_routing — 编辑器路由
2. feature_flags_default_off — 功能开关默认关闭
3. project_template_isolation — 项目模板隔离
4. proposal_idempotent_adopt — Proposal 幂等采用
5. frame_whitelist — Frame 白名单
6. narration_compression — 口播压缩
7. subtitle_realignment — 字幕重对齐
8. lottie_overlay — Lottie/WebM Overlay
9. business_qa — 业务质量门禁
10. segment_regen — 局部重生成
11. asset_workbench — 素材工作台
12. editor_preview — 生成前预览
13. review_workflow — 审核工作流

## 完整回归测试

```bash
# Server 测试（含 V4 全部新 API）
cd guide/server && npm test

# Worker 测试（含字幕重对齐、Lottie、业务质量门禁）
make test-guide

# Timeline/ASS/Audit 快速测试
make test-guide-fast

# Shared 单元测试
cd guide && node --import tsx --test shared/data/pipelines.test.ts shared/frameWhitelist.test.ts shared/narrationCompress.test.ts
```

## V4 功能开关

| 开关 | 默认 | 对应 Issue | 作用 |
|------|------|-----------|------|
| ENABLE_PROJECT_WORKFLOW | off | #4 | Project CRUD + 版本 |
| ENABLE_PROPOSAL_GATE | off | #5 | Proposal + Preflight |
| ENABLE_REFERENCE_SETS | off | #7 | Recipe + Reference Set + 血缘 |
| ENABLE_SEGMENT_REGEN | off | #11 | 局部重生成 + 产物复用 |
| ENABLE_LOTTIE_OVERLAY | off* | #9 | Lottie/WebM Overlay |
| ENABLE_STAGE4_BUSINESS_QA | off* | #10 | 业务质量门禁 |
| ENABLE_REVIEW_WORKFLOW | off | #14 | 审核 + 另存模板 |

* Lottie Overlay 和 Business QA 在 Worker 中默认启用（无需开关），API 路由需要对应开关。

## 文档更新清单

| 文档 | 更新内容 |
|------|---------|
| V4_BASELINE.md | 工程基线（#3） |
| V4_PUBLISH_GATE.md | 发布门禁（#15，本文档） |
| CLAUDE.md | GitNexus + Clauge 配置（自动维护） |
| AGENTS.md | GitNexus + Clauge 配置（自动维护） |

## Epic 验收对照 (#2)

- [x] 主流程不暴露 pipeline（#3）
- [x] Project 与 Template 生命周期分离（#4）
- [x] 生成前有 Proposal 和 Preflight（#5）
- [x] AI 素材进入资产库并具有血缘（#7）
- [x] 支持单镜局部重生成（#11）
- [x] 字幕依据实际数字人片段重新对齐（#8）
- [x] Lottie/WebM Overlay 进入 FFmpeg 单路径（#9）
- [x] diagnostics 覆盖技术质量和业务约束（#10）
- [x] 审核、下载、版本和模板复用闭环成立（#14）
- [x] 旧模板、旧 API 和旧任务保持兼容（#3 + 所有新功能开关默认关闭）
