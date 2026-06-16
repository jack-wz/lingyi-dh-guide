# 集成方快速上手（Integrator Quickstart）

面向 **解决方案/集成工程师**：从零到「提交一条渲染任务并拿到成片」。

**目标时间：** 约 15–20 分钟（含配置三把供应商 Key）  
**魔法时刻：** `render_jobs.status = completed` 且 `output_url` 可访问  
**实测（本机 smoke）：** 配置完成后 `make smoke-integrator` 约 **60s** 出片（`TTHW_ELAPSED_SEC≈60`）

---

## 0. 你要跑什么

| 服务 | 地址 | 说明 |
|------|------|------|
| Pixelle API | http://127.0.0.1:8000 | 含导购 API 代理 |
| 导购健康检查 | http://127.0.0.1:8000/api/guide/health | 应返回 `{"status":"ok",...}` |
| 编辑器 | http://127.0.0.1:5173 | 模板可视化编辑（可选） |
| Playground | http://127.0.0.1:5173/debug | 浏览器内 smoke 渲染 |
| OpenAPI | http://127.0.0.1:8000/docs | FastAPI 文档 |

---

## 1. 预检依赖（~2 分钟）

```bash
cd Pixelle-Video
chmod +x guide/scripts/preflight.sh start_platform.sh
guide/scripts/preflight.sh
```

缺依赖时按脚本提示安装（macOS 常用：`brew install node uv ffmpeg-full`）。

---

## 2. 配置 API Key（~5–10 分钟）

```bash
cp guide/.env.example guide/.env
# 编辑 guide/.env，填写：
#   KIE_API_KEY
#   YUNTTS_API_KEY
#   WAVESPEED_API_KEY
#   SERVER_URL=http://127.0.0.1:8000
```

**在启动平台之前**验证 Key（失败则停止，不要继续）：

```bash
uv run python guide/scripts/verify_providers.py
```

输出 `"ok": true` 表示三方可连通。若失败，根据 JSON 里各 provider 的 `hint` 字段修正 Key。

---

## 3. 启动平台（~2 分钟）

```bash
./start_platform.sh
```

另开终端确认：

```bash
curl -s http://127.0.0.1:8000/api/guide/health
curl -s http://127.0.0.1:8000/api/config/diagnostics | python3 -m json.tool
```

`diagnostics.pipelines.standard.blockers` 应为空数组；`warnings` 列出缺失的可选能力。

---

## 4. Hello World — 提交渲染（~1 分钟）

默认 smoke 模板 ID（仓库内 Makefile 同款）：

`517a1920-6376-47ef-871b-9badbaa16b53`

```bash
curl -s -X POST http://127.0.0.1:8000/api/renders \
  -H 'Content-Type: application/json' \
  -d '{
    "template_id": "517a1920-6376-47ef-871b-9badbaa16b53",
    "pipeline_key": "template_editor",
    "input_mode": "template"
  }' | python3 -m json.tool
```

记下响应里的 `id`（job uuid）。Worker 会自动拉起处理队列。

查询状态：

```bash
JOB=<上一步的 id>
curl -s "http://127.0.0.1:8000/api/renders/$JOB" | python3 -m json.tool
```

`status: completed` 时，`output_url` 即为成片路径（通常 `/renders/job_<id>/final.mp4`）。

---

## 5. 浏览器 Playground（推荐）

打开编辑器同源的调试页：

http://127.0.0.1:5173/debug → **集成 Playground** 标签

- 自动检测 API 与供应商配置  
- **一键 Smoke 渲染**：提交任务、轮询进度、页面内播放 MP4  
- 显示 `TTHW_ELAPSED_SEC`（从点击到成片）

等价 CLI：

```bash
make smoke-integrator
```

脚本会：健康检查 → 提交 render → 轮询至完成或超时，并输出 `TTHW_ELAPSED_SEC`。

仅验证「能入队」、不等待成片：

```bash
make smoke-integrator SUBMIT_ONLY=1
```

环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `SERVER_URL` | `http://127.0.0.1:8000` | API 根地址 |
| `SMOKE_TEMPLATE_ID` | 见上文 | smoke 模板 |
| `SMOKE_POLL_TIMEOUT_SEC` | `3600` | 等待成片超时（秒） |
| `SUBMIT_ONLY` | — | 设为 `1` 则只创建任务 |

---

## 6. 一键验收（可选）

```bash
make verify-playground
```

等价于：`preflight` → 检查 `/debug` 可访问 → `SUBMIT_ONLY=1` smoke 入队。

更新 `guide/worker/` 代码后，重启 Worker：

```bash
make restart-worker
# 或完整重启：Ctrl+C 停掉 ./start_platform.sh 后重新执行
```

Worker 在 KIE/WaveSpeed 长轮询期间会每 15s 发送心跳，避免被误判为僵死。

---

## 7. 故障排查

| 现象 | 下一步 |
|------|--------|
| `verify_providers.py` 失败 | 检查 `guide/.env` 三把 Key；看 JSON 中 `hint` |
| `/api/guide/health` 不通 | 确认 `./start_platform.sh` 在跑；看 API 终端日志 |
| `/api/guide/health` 返回 `upstream :3001` 失败但 `:8000` 已占用 | FastAPI 在跑但导购内嵌服务未起：`make start-guide-internal` |
| 任务一直 `queued` | 检查 `guide/data/worker.log`；确认 `GUIDE_WORKER_ENABLED=true` |
| 任务 `failed` | `GET /api/renders/{id}/logs`；对照 `error_message` |
| `Timeline validation` / TTS missing | 确认 Worker 已重启；模板有口播时会自动走 Edge 降级 TTS；见 `guide/data/worker.log` |
| 编辑器预览卡在「加载 HyperFrames…」 | API 可能正常；先用本节 smoke 验证渲染链路 |
| 找不到导购文档 | 你正在读本文件；模块详情见 [guide/README.md](../README.md) |

---

## 8. API 错误码

失败响应统一形状：

```json
{
  "error": "说明",
  "error_code": "G002",
  "remediation": "下一步建议",
  "doc_url": "/guide/docs/INTEGRATOR_QUICKSTART.md"
}
```

查询全部错误码：`GET /api/error-catalog`

从 HeyGen 等 SaaS 迁移见 [MIGRATION_FROM_SAAS.md](./MIGRATION_FROM_SAAS.md)。

## 9. 下一步

- 编辑器：http://127.0.0.1:5173  
- 模板 API：`GET/POST /api/templates`  
- 数字人：`/api/digital-humans`  
- Worker 单测：`make test-guide-fast`  
- Server API 单测：`make test-guide-server`（CI 同款）  
- Web E2E（含 Playground）：`make test-guide-e2e`
- 变更记录：[CHANGELOG.md](../CHANGELOG.md)