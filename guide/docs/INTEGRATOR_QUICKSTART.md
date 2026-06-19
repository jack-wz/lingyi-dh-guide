# 集成方快速上手（Integrator Quickstart）

面向 **解决方案/集成工程师**：从零到「提交一条渲染任务并拿到成片」。

**目标时间：** 约 15–20 分钟（含配置三把供应商 Key）  
**魔法时刻：** `render_jobs.status = completed` 且 `output_url` 可访问  
**实测（本机 smoke）：** 配置完成后 `make smoke-integrator` 约 **60s** 出片（`TTHW_ELAPSED_SEC≈60`）

---

## 0. 你要跑什么

| 服务 | 地址 | 说明 |
|------|------|------|
| 统一 API 网关 | http://127.0.0.1:8000 | 含导购 API 代理 |
| 导购健康检查 | http://127.0.0.1:8000/api/guide/health | 应返回 `{"status":"ok",...}` |
| 编辑器 | http://127.0.0.1:5173 | 模板可视化编辑（可选） |
| Playground | http://127.0.0.1:5173/debug | 浏览器内 smoke 渲染 |
| OpenAPI | http://127.0.0.1:8000/docs | FastAPI 文档 |

---

## 1. 预检依赖（~2 分钟）

```bash
cd <项目根目录>
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

## 9. HyperFrames 动效集成

编辑器中的「HyperFrames 字幕 / 转场 / 全局质感」通过 **Guide Adapter** 接入：产品侧只暴露稳定 `style_id`，Worker 在 `hyperframes_template` 流水线生成完整 HTML 合成，在 `standard` 等流水线自动降级为 ASS/CSS 近似效果。

### 9.1 两种成片流水线

| 流水线 `pipeline_key` | 适用场景 | HF 效果 |
|----------------------|----------|---------|
| `standard` / `template_editor` | 默认集成、数字人/口播混剪 | 字幕走 ASS `\k` 卡拉 OK + 品牌色；转场/颗粒/暗角等**不渲染** |
| `hyperframes_template` | 需要完整 GSAP 动效 | 字幕、转场、`globalConfig.hf_overlays` 全量输出 |

在 `guide/.env` 或启动环境中设置：

```bash
ENABLE_HF_TEMPLATE_PIPELINE=1
```

之后渲染 API 与编辑器「导出成片」对话框才会出现 **HyperFrames 模板** 选项。未开启时 UI 会隐藏该流水线，但模板仍可保存 HF 风格；提交 `standard` 任务时会收到 `hfPipelineWarnings` 提示。

带 HF 字幕的 smoke 示例（需先开启上一行环境变量）：

```bash
curl -s -X POST http://127.0.0.1:8000/api/renders \
  -H 'Content-Type: application/json' \
  -d '{
    "template_id": "<你的模板 id>",
    "pipeline_key": "hyperframes_template",
    "input_mode": "template"
  }' | python3 -m json.tool
```

### 9.2 编辑器可选风格 ID

**字幕（`segment.subtitle.style_id`）**

| style_id | 说明 | standard 降级 |
|----------|------|---------------|
| `hf-caption-highlight` | 高亮扫字 | `bold-yellow` |
| `hf-caption-pill` | 胶囊卡拉 OK | `subtitle-card` |
| `hf-caption-neon` | 霓虹发光 | `gradient-glow` |
| `hf-caption-editorial` | 杂志强调 | `brand-elegant` |
| `hf-caption-gradient` | 渐变填充 | `gradient-glow` |

**转场（`segment.transition.type`，末镜无效）**

`hf-dissolve`、`hf-push-left` / `hf-push-right` / `hf-push-up` / `hf-push-down`、`hf-wipe-left` / `hf-wipe-right`、`hf-zoom`

**全局质感（`globalConfig.hf_overlays[]`，`type` + `enabled`）**

`hf-grain`、`hf-vignette`、`hf-light-leak`、`hf-motion-blur`

注册表与品牌 token 映射见 `guide/shared/hfStyleRegistry.ts`。

### 9.3 词级卡拉 OK 与试听对齐

- 字段：`segment.subtitle.hf_params.word_timings`（`{ text, start, end }[]`）
- 成片：HF 流水线用于 GSAP 逐词高亮；standard 流水线写入 ASS `\k` 标签
- 编辑器：**试听并对齐词轴** → `POST /api/tts/preview-segment`（body：`template_id`、`segment_id`、`narration_text`、可选 `voice_id`）→ 返回预览音频 URL + `word_timings`，前端写回 DSL

```bash
curl -s -X POST http://127.0.0.1:8000/api/tts/preview-segment \
  -H 'Content-Type: application/json' \
  -d '{
    "template_id": "<uuid>",
    "segment_id": "<segment uuid>",
    "narration_text": "今日特惠，限时抢购"
  }' | python3 -m json.tool
```

预览文件落在 `guide/data/uploads/tts-preview/`；时间轴会显示「预览配音」条，可与画布字幕预览同步播放。

### 9.4 本地 HF 工具链

在 `guide/` 目录：

```bash
npm run hf:lint      # 校验 hyperframes.json / 注册块
npm run hf:compose   # 由模板 DSL 写出 composition HTML（调试用）
npm run hf:render    # 本地渲染 HF 成片（需 Node + 已安装 hyperframes@0.6.114）
```

Worker 使用 `guide/node_modules/.bin/hyperframes`，与 `package.json` 锁定版本一致。

### 9.5 验证与排错

| 检查项 | 命令 / 入口 |
|--------|-------------|
| 共享层单测（含 composer、warnings、vertical scale） | `make test-guide-fast` |
| TTS 预览 API | `make test-guide-server` |
| 编辑器 HF smoke（字幕/转场/overlay/试听） | `make test-guide-e2e`（`editor-hf-smoke.spec.ts`） |
| 本地 HF 出片（compose → render，约 2–3 分钟） | `make smoke-hf-render` |
| 在线 HF 出片（API + Worker，`hyperframes_template`） | `make smoke-integrator-hf` |
| 流水线警告文案 | `shared/hfPipelineWarnings.ts`；导出对话框 `RenderReviewDialog` |

常见现象：

- **选了 HF 字幕但成片是静态黄字**：当前 `pipeline_key` 不是 `hyperframes_template`；看任务日志或导出前的 warnings
- **竖屏 9:16 字幕裁切**：Adapter 已做 `hfVerticalScale`；若仍异常，检查 `meta.canvas_width/height`
- **预览一直「加载 HyperFrames…」**：先 `curl /api/guide/health`；再 `make smoke-integrator` 确认 Worker；浏览器强刷或看 Network 里 composition 请求

产品化审计与路线图见 [SYNTHESIA_EDITOR_EXPERIENCE_AUDIT.md](./SYNTHESIA_EDITOR_EXPERIENCE_AUDIT.md)。

## 10. 下一步

- 编辑器：http://127.0.0.1:5173  
- 模板 API：`GET/POST /api/templates`  
- 数字人：`/api/digital-humans`  
- Worker 单测：`make test-guide-fast`  
- Server API 单测：`make test-guide-server`（CI 同款）  
- Web E2E（含 Playground）：`make test-guide-e2e`
- HyperFrames 集成：见上文 **§9**
- 变更记录：[CHANGELOG.md](../CHANGELOG.md)