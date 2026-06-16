# Guide 模块变更日志

本文件记录 **零一数字人导购平台**（`guide/`）面向集成方与运维的变更。根仓库 Pixelle-Video 总变更见根目录 `README.md` 更新节。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]

### Added

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

### Changed

- 根 `README.md` 增加导购平台入口区块
- `guide/README.md` 启动顺序：preflight → verify → start

## [1.0.0] - 2026-06-01

### Added

- 从 `cenker-creation-demo` 迁入导购模块（模板编辑器、数字人、渲染 Worker）
- FastAPI `:8000` 统一代理导购 API
- HyperFrames 编辑器实时预览
- 飞鹤/剪映模板数据资产与 E2E 脚本

[Unreleased]: https://github.com/AIDC-AI/Pixelle-Video/compare/main...feat/guide-platform-merge
[1.0.0]: https://github.com/AIDC-AI/Pixelle-Video/releases