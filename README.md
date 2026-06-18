# 零一数字人导购平台

**仓库：** https://github.com/jack-wz/lingyi-dh-guide

品牌导购短视频生产平台：模板可视化编辑、数字人形象、分镜场景融合、TTS 配音、口型视频与 FFmpeg 成片组装。

**集成方入口：** [guide/docs/INTEGRATOR_QUICKSTART.md](guide/docs/INTEGRATOR_QUICKSTART.md)  
**模块说明：** [guide/README.md](guide/README.md)  
**变更记录：** [guide/CHANGELOG.md](guide/CHANGELOG.md)

## 能力概览

- 模板 DSL 编辑器（分镜、贴纸、字幕、品牌包）
- 数字人资源库（半身像 / 口播形象）
- KIE 场景图 + 数字人融合（可配置 input_urls 顺序）
- MOSI / YunTTS 配音 + KIE / WaveSpeed 口型（默认 `infinitetalk-fast`）
- 渲染任务队列、调试控制台、分镜产物预览

## 快速启动

```bash
chmod +x guide/scripts/preflight.sh start_platform.sh
guide/scripts/preflight.sh
cp guide/.env.example guide/.env   # 填写 KIE / YunTTS / WaveSpeed Key
uv run python guide/scripts/verify_providers.py
./start_platform.sh
```

| 入口 | 地址 |
|------|------|
| 编辑器 | http://127.0.0.1:5173 |
| 调试控制台 | http://127.0.0.1:5173/debug |
| 统一 API | http://127.0.0.1:8000 |
| 导购健康检查 | http://127.0.0.1:8000/api/guide/health |

集成 smoke：`make smoke-integrator`

`:8000` 已被占用时，可单独拉起导购服务：

```bash
make -C guide start-guide-internal
```

## 目录结构

| 路径 | 说明 |
|------|------|
| `guide/server/` | 导购 Express API（内嵌 `:3001`，经 FastAPI 代理） |
| `guide/worker/` | 渲染流水线 Worker |
| `guide/web/` | React 前端 |
| `guide/shared/` | 共享类型与 HyperFrames 合成逻辑 |
| `guide/data/` | SQLite、配置、上传与成片（本地，不入库） |
| `api/` | FastAPI 网关（代理导购 API 与静态资源） |

## 测试

```bash
cd guide
make test-guide-server
make test-guide
make test-guide-fast
```

## 配置说明

- 复制 `guide/data/config.example.json` → `guide/data/config.json`（含 API Key，已 gitignore）
- 模型与流水线参数可在 **调试控制台 → 模型配置** 调整（口型供应商、场景融合顺序等）
- 修改配置后执行 `make -C guide restart-worker`

## 关于仓库中的其他代码

根目录 `api/` 除导购代理外，还保留部分历史媒体路由；`pixelle_video/`、`web/` 旧 UI、`docs/en/` 等为遗留模块，**与当前导购产品线无关**，日常开发与部署以 `guide/` 为准。