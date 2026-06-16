# 零一数字人导购平台（Pixelle-Video 子项目）

从 `cenker-creation-demo` 迁入的独立导购模块，由 **Pixelle-Video FastAPI (`:8000`)** 作为统一后端入口。

**集成方首选：** [docs/INTEGRATOR_QUICKSTART.md](docs/INTEGRATOR_QUICKSTART.md)（预检 → 配 Key → 启动 → smoke 渲染）  
**从 SaaS 迁移：** [docs/MIGRATION_FROM_SAAS.md](docs/MIGRATION_FROM_SAAS.md) · [CHANGELOG.md](CHANGELOG.md)

## 目录结构

| 目录 | 说明 |
|------|------|
| `server/` | 导购 Express API（内嵌端口 `3001`，经 FastAPI 代理对外） |
| `worker/` | 渲染流水线：KIE 形象 → 分镜 → MOSI 配音 → WaveSpeed 口型 → FFmpeg |
| `web/` | React 模板编辑器 + 数字人管理 + 渲染中心 |
| `shared/` | TypeScript 共享类型（模板 DSL、数字人 DTO） |
| `data/` | SQLite、`config.json`、上传与成片 |

## 启动方式

### 推荐：统一平台

```bash
cd Pixelle-Video
guide/scripts/preflight.sh
cp guide/.env.example guide/.env   # 填写 Key 后：
uv run python guide/scripts/verify_providers.py
chmod +x start_platform.sh start_guide_web.sh start_api.sh
./start_platform.sh
```

集成验证：`make smoke-integrator`（详见 [INTEGRATOR_QUICKSTART.md](docs/INTEGRATOR_QUICKSTART.md)）

- **后端 API**：http://127.0.0.1:8000
- **导购前端**：http://127.0.0.1:5173（代理到 `:8000`）
- **集成 Playground**：http://127.0.0.1:5173/debug（浏览器内 smoke 渲染）
- **导购健康检查**：http://127.0.0.1:8000/api/guide/health

### 仅导购子模块（开发调试）

```bash
cd guide
npm install
npm run dev:server   # :3001
npm run dev:web      # :5173，需 VITE_API_TARGET=http://127.0.0.1:8000 或 :3001
```

## API 路由（经 Pixelle 代理）

| 路径 | 功能 |
|------|------|
| `/api/templates` | 视频模板 CRUD |
| `/api/digital-humans` | 数字人素材与训练 |
| `/api/renders` | 渲染任务队列 |
| `/api/uploads` | 文件上传 |
| `/api/config` | KIE / MOSI / WaveSpeed 配置 |
| `/uploads` `/renders` | 静态资源 |

## 环境变量

复制 `guide/.env.example` 为 `guide/.env`，或在项目根 `.env` 中配置：

- `KIE_API_KEY`
- `YUNTTS_API_KEY`（MOSI Studio / 云声配音）
- `WAVESPEED_API_KEY`
- `SERVER_URL=http://127.0.0.1:8000`（worker 回调地址）

验证 Key：

```bash
uv run python guide/scripts/verify_providers.py
```

## 测试

```bash
cd guide
make test-guide-server   # Express API 单测（57 tests）
make test-guide          # Worker 单测
make test-guide-fast     # 时间轴 / ASS 快速门禁
make smoke-integrator SUBMIT_ONLY=1
```

Web E2E（自启隔离 server `:3100` + web `:5180`）：`make test-guide-e2e`