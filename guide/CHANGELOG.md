# Guide 模块变更日志

本文件记录 **零一数字人导购平台**（`guide/`）面向集成方与运维的变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]

### Changed

- 文档与启动脚本：剔除 Pixelle-Video 产品说明，统一以「零一数字人导购平台」表述；根 `README.md` 重写为导购平台入口

### Added

- 模板中心：默认隐藏 `type=e2e` 测试模板，支持搜索/状态筛选与「显示测试模板」开关
- 编辑器顶栏：数字人 / 品牌 / 脚本 ghost 控件 + 单一「生成视频」主 CTA；预置模板弹窗改为跳转模板中心
- 资产库：`ImportCatalogBanner` 空库引导同步；主次 Tab 视觉分组
- 新手引导：`OnboardingWizard` 三步向导（资产 → 数字人 → 模板）
- 渲染详情：错误码对照 `GET /api/error-catalog` 展示 remediation；「回编辑器继续改」入口
- 我的视频：渲染列表分页（`GET /api/renders?limit&offset`）
- 运维脚本：`scripts/cleanup_e2e_templates.py`（dry-run / `--apply` 清理 E2E 模板）
- Playwright：`tests/e2e/template-list.spec.ts`
- 集成方快速上手：[docs/INTEGRATOR_QUICKSTART.md](docs/INTEGRATOR_QUICKSTART.md)
- 依赖预检：`scripts/preflight.sh`
- 集成 smoke：`scripts/smoke_integrator.py`、`make smoke-integrator`
- SaaS 迁移对照：[docs/MIGRATION_FROM_SAAS.md](docs/MIGRATION_FROM_SAAS.md)
- API 结构化错误：`error_code`、`remediation`、`doc_url`；目录 `GET /api/error-catalog`
- 前端 API Toast 与预览三态（加载/就绪/降级/失败）
- 调试页 **集成 Playground**（`/debug`）：浏览器内 smoke 渲染 + 成片预览
- `make verify-playground`：预检 + Web `/debug` + smoke 入队验收

### Fixed

- Smoke 模板无 `voice_clone_id` 时仍生成降级 TTS，避免时间轴校验 `TTS missing` 导致任务失败
- 时间轴审计：分镜已内嵌音轨时不再误报阻塞性 TTS 缺失
- `smoke_integrator.sh`：修复 `set -u` 下空 `ARGS` 导致全量 smoke 无法启动
- Worker 长任务期间后台心跳（15s）；`make restart-worker` 热重启 Worker
- 前端主要页面统一 `apiError` 结构化错误展示（模板中心 / 我的视频 / 数字人 / 渲染详情 / 编辑器提交）
- CI：`guide-server` job 运行 Express API 单测（`make test-guide-server`）
- Playwright：`tests/e2e/playground.spec.ts`；`make test-guide-e2e`；CI `guide-e2e` job
- Playground 健康检查：代理 `/api/guide/health` 不可用时回退 `/api/health`（直连导购 Server / E2E）
- 运维脚本：`scripts/start_internal.sh` / `make start-guide-internal`（`:8000` 已占用时单独拉起 `:3001` + Worker）
- `start_platform.sh`：检测到 `:8000` 已运行时跳过 API 启动并自动执行 `start-guide-internal`

### Changed

- 根 `README.md` 增加导购平台入口区块
- `guide/README.md` 启动顺序：preflight → verify → start

## [1.0.0] - 2026-06-01

### Added

- 从 `cenker-creation-demo` 迁入导购模块（模板编辑器、数字人、渲染 Worker）
- FastAPI `:8000` 统一代理导购 API
- HyperFrames 编辑器实时预览
- 飞鹤/剪映模板数据资产与 E2E 脚本

[Unreleased]: https://github.com/jack-wz/Pixelle-Video/compare/main...feat/guide-platform-merge
[1.0.0]: https://github.com/jack-wz/Pixelle-Video/releases