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
| `SMOKE_PIPELINE_KEY` | `template_editor` | `make smoke-integrator-hf` 设为 `hyperframes_template` |
| `SMOKE_DIGITAL_HUMAN_ID` | （自动） | 未设置时从模板 `meta.digital_human_id` 读取 |

轮询任务（轻量 API，避免拉全量 `provider_config_snapshot`）：

```bash
make poll-render-job JOB=<render-job-id>
# 等价：GET /api/renders/{id}?summary=1
```

**CI 门禁说明：** PR 合入前 `guide-ci` 会跑 `make smoke-integrator-hf-ci`，校验 `ENABLE_HF_TEMPLATE_PIPELINE=1` 时 `hyperframes_template` 无 blockers 且 `POST /api/renders` 可入队。本机完整出片仍用 `make smoke-integrator-hf`（需 `./start_platform.sh` + Worker）。

---

## 6. 一键验收（可选）

```bash
make verify-playground
```

等价于：`preflight` → 检查 `/debug` 可访问 → `SUBMIT_ONLY=1` smoke 入队。

成片 **FFmpeg 单路径** 验收（已完成任务）：

```bash
make verify-final-delivery JOB=<render-job-id>
make validate-render-job JOB=<render-job-id>
```

检查：`final.mp4` 存在、无 `base_ffmpeg.mp4`、仅 video+audio 轨、日志/dsl 含转场证据、无 `hf_style_pass`。

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

编辑器中的「HyperFrames 字幕 / 转场 / 全局质感」通过 **Guide Adapter** 接入：产品侧暴露稳定 `style_id`。**导购交付默认 FFmpeg 单路径**（`template_editor` / `standard`）：ASS 单字幕轨 + xfade 转场 + 质感滤镜。HF HTML 仅用于编辑器预览；`hyperframes_template` 为调试/CI 专用全 HTML 出片。

### 9.1 流水线 registry（`pipeline_key`）

注册表见 `guide/shared/data/pipelines.ts`；Worker 实现在 `guide/worker/worker/pipelines/`。

| `pipeline_key` | 适用场景 | 四阶段 | 需数字人 | 成片引擎 | UI 暴露 | 预览 vs 成片 |
|----------------|----------|--------|----------|----------|---------|--------------|
| **`template_editor`** | **导购默认**：编辑器「生成视频」 | 全跑 | 否\* | FFmpeg 单路径 | ✅ 默认 | **layout**（流程一致） |
| `standard` | API 缺省、集成 smoke | 全跑 | 否\* | FFmpeg 单路径 | ✅ | approximate |
| `digital_human` | 只要口播，跳过 AI 场景图 | 跳过 Stage2 | **是** | FFmpeg 单路径 | ✅ | approximate |
| `avatar_talk` | 口播 + AvatarAdapter 统一唇形 | 跳过 Stage2 | **是** | FFmpeg 单路径 | ✅ | approximate |
| `ai_full_auto` | 主题/脚本 → LLM 自动分镜 | 全跑 | **是** | FFmpeg 单路径 | ✅ | approximate |
| `asset_driven` | 上传素材列表自动分镜口播 | 全跑 | **是** | FFmpeg 单路径 | ✅ | approximate |
| `hyperframes_template` | 调试 / CI / GSAP 实验 | **跳过** AI 场景与口播 | 否 | HF CLI 全 HTML | ❌ 需开关 | **exact**（与画布一致） |

\* 模板含口播文案时，API 会校验 `digital_human_id`（`narrationRequiresDigitalHumanIssue`），与上表「需数字人」列略有差异。

**动效交付（FFmpeg 单路径流水线）：** ASS 字幕（`hf-caption-*` 降级映射）、xfade 转场、`hf_overlays` 滤镜；产物仅 `final.mp4`（无 `hf_style_pass`）。  
**`hyperframes_template`：** 跳过 Stage2/3，compose → lint → `hyperframes render`；适合验证画布 pixel 级一致，**非导购主路径**。

#### 如何选择

```
导购成片（场景 + 口播 + 字幕 + 转场）     → template_editor（推荐；编辑器默认）
只要数字人对镜头讲、不要 AI 场景图       → digital_human 或 avatar_talk
只有主题/脚本，LLM 自动分镜               → ai_full_auto（POST /api/renders/ai-generate）
一批上传素材自动切成口播                 → asset_driven（DSL 含 asset_urls）
验证「画布预览 = 成片」或 CI 门禁          → hyperframes_template + ENABLE_HF_TEMPLATE_PIPELINE=1
编辑器里看字幕/转场（不交付）            → HF iframe 预览（不选 pipeline_key）
```

| 入口 | 默认 `pipeline_key` |
|------|---------------------|
| 编辑器「生成视频」 | `template_editor`（`resolveEditorPipelineKey` 会把历史的 `hyperframes_template` 改回默认） |
| `POST /api/renders` | `standard`（集成方建议显式传 `template_editor`） |
| `POST /api/renders/ai-generate` | 固定 `ai_full_auto` |
| `GET /api/renders/pipelines` | 未开 HF 开关时隐藏 `hyperframes_template` |

预览一致性评级（复核对话框）：`exact` = `hyperframes_template`；`layout` = `template_editor`；`approximate` = 其余 FFmpeg 流水线。实现见 `guide/web/src/utils/previewRenderAlignment.ts`。

#### 启用 HyperFrames 模板流水线（调试）

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
| `hf-caption-pop` | 弹跳逐字 | `bold-yellow` |

**转场（`segment.transition.type`，末镜无效）**

`hf-dissolve`、`hf-push-left` / `hf-push-right` / `hf-push-up` / `hf-push-down`、`hf-wipe-left` / `hf-wipe-right`、`hf-zoom`

**全局质感（`globalConfig.hf_overlays[]`，`type` + `enabled`）**

`hf-grain`、`hf-vignette`、`hf-light-leak`、`hf-motion-blur`

注册表与品牌 token 映射见 `guide/shared/hfStyleRegistry.ts`。

### 9.3 词级卡拉 OK 与试听对齐

- 字段：`segment.subtitle.hf_params.word_timings`（`{ text, start, end }[]`）
- 成片：`template_editor` / `standard` 写入 ASS `\k` 卡拉 OK；`hyperframes_template` 用于 GSAP 逐词高亮实验
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
| 外观预设与品牌联动（深链/Banner/品牌编辑器） | `make test-guide-e2e`（`brand-look-preset-flow.spec.ts`） |
| 本地 HF 出片（compose → render，约 2–3 分钟） | `make smoke-hf-render` |
| 在线 HF 出片（API + Worker，`hyperframes_template`） | `make smoke-integrator-hf` |
| **CI 发布门禁**（HF 流水线诊断 + 入队，无需 live :8000） | `make smoke-integrator-hf-ci`（GitHub Actions `guide-worker` job） |
| 流水线警告文案 | `shared/hfPipelineWarnings.ts`；导出对话框 `RenderReviewDialog` |

常见现象：

- **字幕重复或动效缺失**：确认 Worker 已升级至 FFmpeg 单路径（不再调用 `hf_style_pass`）；成片应仅一层 ASS 字幕
- **HF 预览有动效但成片较平**：交付以 FFmpeg 映射为准；霓虹/渐变等复杂动效在 ASS 中会降级为近似样式
- **竖屏 9:16 字幕裁切**：Adapter 已做 `hfVerticalScale`；若仍异常，检查 `meta.canvas_width/height`
- **预览一直「加载 HyperFrames…」**：先 `curl /api/guide/health`；再 `make smoke-integrator` 确认 Worker；浏览器强刷或看 Network 里 composition 请求

产品化审计与路线图见 [SYNTHESIA_EDITOR_EXPERIENCE_AUDIT.md](./SYNTHESIA_EDITOR_EXPERIENCE_AUDIT.md)。

### 9.6 外观预设（`look_preset`）与品牌联动

资产库 **外观预设** Tab（`category=look_preset`）保存可分享的动效组合 JSON，字段包括：

| 字段 | 说明 |
|------|------|
| `subtitle_style_id` | HF 字幕 `style_id` |
| `transition_type` / `transition_duration` | 分镜转场 |
| `hf_overlays[]` | 全局质感（颗粒/暗角/漏光/动感模糊/调色） |
| `pipeline_required` | 默认 `template_editor`（FFmpeg 单路径成片） |
| `registry_version` | HF 注册表版本（当前 `2026.06.3`）；低于当前版本时 UI 显示「需同步」，应用时自动迁移 |

内置种子见 `guide/shared/lookPreset.ts`（如 `look-steady-voice`、`look-promo-fast`、`look-push-tech`）；服务启动时写入 `library_items`，并在版本漂移时自动 upsert 同步。

**编辑器深链**

- 从编辑器打开资产库：`/assets?tab=look_preset&from=/editor/<template_id>`
- 卡片「应用到项目」→ `/editor/<id>?apply_look=<preset_id>`，自动写入 DSL、切换「动效」面板，并在需要时建议 HyperFrames 流水线
- 品牌包应用后若尚未套用外观：顶部 `BrandLookPresetBanner` 展示品牌推荐预设（来自品牌包 `default_look_preset_seed_id` / `recommended_look_preset_seed_ids`）

**品牌包配置**（资产库 → 品牌 → 编辑 → **外观动效**）

- `category`：场景分类（企业/母婴/大促/导购等），决定默认推荐列表
- `default_look_preset_seed_id`：一键套用时的首选种子
- `recommended_look_preset_seed_ids`：动效面板「品牌推荐」排序

应用品牌包时 `meta.look_preset_id` 会清空并写入 `meta.recommended_look_preset_seed_ids`，避免旧外观与新品牌冲突。

资产库外观预设表单支持 **多质感勾选 + 强度滑杆**、**卡片/表单 mini HF 缩略图预览**，以及 **导出/导入 JSON**（`guide-look-preset` 格式，见 `shared/lookPresetExport.ts`）。导出文档可附带 `brand_hints`（`category` / `default_look_preset_seed_id` / `recommended_look_preset_seed_ids`），便于集成方把外观预设与品牌包推荐一并迁移。从编辑器深链进入资产库（`from=/editor/<id>`）且项目已绑定品牌包时，可 **导出并写入品牌推荐**（同步更新品牌包 payload）；导入 JSON 后可点 **保存并应用到项目**，自动写库并跳回 `?apply_look=<preset_id>`。编辑器 **动效** 面板的外观预设列表同样展示 mini HF 缩略图。

第 7 个 HF 字幕样式为 `hf-caption-stagger`（错落滑入），内置种子 `look-stagger-guide`（错落导购）。第 8 个 HF 转场为 `hf-circle-reveal`（圆形揭示），内置种子 `look-circle-beauty`（圆形美妆）。

`brand_hints` 除种子 ID 外，支持 **自定义外观预设库 ID**（`default_look_preset_library_id` / `recommended_look_preset_library_ids`），无 `seed_id` 的预设也可导出并写入品牌推荐。编辑器 **动效** 面板「品牌推荐」会对库 ID 匹配的自定义预设显示 **「自定义」** 角标。品牌包编辑器 **外观动效** 区支持导入 `brand_hints` JSON，以及 **`guide-brand-look-bundle` v1** 迁移包（`brand_hints` + 关联 `look_presets[]` JSON，见 `shared/brandLookBundleExport.ts`）。

第 5 个全局质感块为 `hf-color-grade`（调色：色温/强度/饱和度），内置种子 `look-grade-cinema`（影院调色）；资产库卡片缩略图与标题旁显示 **「影院调色」** 专属标签（`shared/lookPresetSeedTags.ts`）。

迁移包 `look_presets[]` 可带 `source_library_id`；导入时会 upsert 外观预设并将 `brand_hints` 中的库 ID **重映射** 到新环境行 ID。编辑器顶部 `BrandLookPresetBanner` 对自定义库预设显示名称与 **「自定义」** 角标；提供 **「一键套用品牌推荐」**（`brand-banner-apply-all-recommended`）按品牌默认顺序套用首选外观并写入 `meta.recommended_look_preset_seed_ids`。

**种子预览标签（可配置）**：内置表见 `shared/lookPresetSeedTags.ts`（如 `look-grade-cinema` →「影院调色」）。品牌编辑器 **外观动效** 区提供 **key-value 表单**（`brand-look-seed-tag-seed-*` / `brand-look-seed-tag-label-*`），并支持 **「导入内置表」**（`brand-look-seed-tag-import-builtin`）一键填充默认行（保留已有自定义覆盖）。资产库外观预设 Tab 会合并所有品牌包中的 `look_preset_seed_preview_tags` 显示在卡片角标上。

**品牌 PUT 字段删除**：`PUT /api/library/:id` 的 `payload` 中，将字段设为 **`null`** 可从合并后的品牌 payload 中显式删除该键（见 `shared/brandPayloadMerge.ts`）。支持嵌套删除，例如 `{ "tokens": { "typography": null } }` 仅移除 `tokens.typography`，保留 `tokens.colors`。

**迁移包品牌 payload 白名单**：`guide-brand-look-bundle` v1 可附带 `brand_payload`，导出时保留 `BRAND_LOOK_BUNDLE_PAYLOAD_KEYS`、**`tokens.colors` 色板子集**（不含 `typography` / 字体），以及 logo 引用等；**不包含** `design_markdown` / `frame_markdown` 等大字段。品牌编辑器 **外观动效** 区在导出前展示 `brand-look-bundle-export-preview` 字段列表预览。

**Banner 一键套用**：`brand-banner-apply-all-recommended` 套用默认推荐外观后，底部 toast（`api-toast`）提示「已套用默认：XXX，另有 N 个备选可单独选择」。

**API 示例**

```bash
# 列出外观预设
curl -s 'http://127.0.0.1:8000/api/guide/library?category=look_preset&limit=20' | python3 -m json.tool

# 一键同步全部过期外观预设（内置种子 upsert + registry_version 迁移）
curl -s -X POST 'http://127.0.0.1:8000/api/guide/library/look-presets/sync' | python3 -m json.tool

# 更新品牌包推荐（payload 需含完整 brand 文档字段时走 PUT /api/library/:id）
curl -s -X PUT "http://127.0.0.1:8000/api/guide/library/<brand_id>" \
  -H 'Content-Type: application/json' \
  -d '{
    "payload": {
      "category": "导购",
      "default_look_preset_seed_id": "look-wipe-retail",
      "recommended_look_preset_seed_ids": ["look-wipe-retail", "look-maternal-soft"]
    }
  }' | python3 -m json.tool
```

**E2E**：`make test-guide-e2e` 含 `brand-look-preset-flow.spec.ts`（深链 / Banner / 品牌编辑器 / brand_hints 导入）、`look-preset-hub.spec.ts`（资产库、自定义预设写入品牌、动效缩略图）、`editor-hf-stagger-caption.spec.ts`（第 7 个字幕样式预览）。

## 10. 下一步

- 编辑器：http://127.0.0.1:5173  
- 模板 API：`GET/POST /api/templates`  
- 数字人：`/api/digital-humans`  
- Worker 单测：`make test-guide-fast`  
- Server API 单测：`make test-guide-server`（CI 同款）  
- Web E2E（含 Playground）：`make test-guide-e2e`
- HyperFrames 集成：见上文 **§9**
- 变更记录：[CHANGELOG.md](../CHANGELOG.md)