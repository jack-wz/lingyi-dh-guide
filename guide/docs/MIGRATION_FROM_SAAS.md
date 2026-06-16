# 从数字人 SaaS 迁移到 Pixelle 导购平台

面向从 **HeyGen、D-ID、蝉镜** 等托管 SaaS 迁到自研 **零一数字人导购平台** 的集成方。

## 能力对照（高层）

| 能力 | HeyGen / 同类 SaaS | Pixelle Guide |
|------|-------------------|---------------|
| 单 API Key 出片 | ✅ 通常 1 把 Key | ❌ KIE + 云声(YunTTS) + WaveSpeed + 本地 FFmpeg |
| 浏览器 Playground | ✅ developers 门户 | ✅ http://127.0.0.1:5173/debug（集成 Playground） |
| 模板化导购视频 | 有限 / 通用口播 | ✅ 模板 DSL + 分镜 + 品牌包 |
| 数字人训练 | 平台内建 | ✅ `/api/digital-humans` + 抠图 |
| 口型 / 配音 | 平台内建 | ✅ Worker 流水线（MOSI + WaveSpeed） |
| 本地化部署 | 企业版 | ✅ 自托管 FastAPI + Worker |
| TTHW（集成方） | ~5 分钟 | ~15–20 分钟（黄金路径实施后） |

## 概念映射

| SaaS 概念 | Pixelle Guide |
|-----------|---------------|
| Avatar / Presenter | `digital_human`（`/api/digital-humans`） |
| Video / Project | `template`（`/api/templates`）+ `render_job` |
| Script / Prompt | `segments[].narration_text` 或 `input_mode: topic/script` |
| Render / Export | `POST /api/renders` → `output_url` |
| Voice | 云声克隆 `voice_clone_id` / Edge TTS 降级 |
| Background / Scene | 分镜 `scene_image` + KIE 生成 |
| Webhook 完成通知 | 当前：轮询 `GET /api/renders/:id`（webhook 可二期） |

## 迁移步骤建议

### 1. 证明链路（第 1 天）

按 [INTEGRATOR_QUICKSTART.md](./INTEGRATOR_QUICKSTART.md) 完成：

- `verify_providers.py` 三 Key 全绿  
- Playground 或 `make smoke-integrator` 拿到第一条 MP4

向客户说明：**渲染能力已等价验证**，非 UI 演示。

### 2. 资产迁移（第 2–3 天）

| SaaS 侧 | 导入方式 |
|---------|----------|
| 品牌脚本 | 资产库 `script` 或写入模板 DSL |
| 人物形象 | 上传至数字人素材 → 训练 → 抠图 `POST .../matting` |
| 分镜/场景图 | `POST /api/uploads` + 模板 segment 引用 |
| BGM / 字体 | 资产库 `media` / `brand` |

### 3. 模板复刻（第 3–5 天）

- 从剪映/飞鹤工程导入：`guide/data/templates/*.template.json`  
- 在编辑器 `:5173` 微调 DSL，用 `pipeline_key: template_editor` 精确渲染  

### 4. 生产切换

- 统一 `SERVER_URL` 指向生产 API  
- Worker 与 FFmpeg 部署在同一可写 `guide/data/` 卷  
- 监控：`GET /api/config/diagnostics`、`guide/data/worker.log`  

## API 错误码

结构化错误见 `GET /api/error-catalog`：

```json
{
  "error": "人类可读说明",
  "error_code": "G002",
  "remediation": "下一步操作",
  "doc_url": "/guide/docs/INTEGRATOR_QUICKSTART.md"
}
```

## 常见差距与话术

| 客户问题 | 建议回应 |
|----------|----------|
| 「为什么比 HeyGen 慢上手？」 | 多供应商=可换模型、可私有化；首条成片用 smoke 脚本，不是从零摸索 |
| 「能不能一个 Key？」 | 短期否；可用 staging 共享 Key 降低集成方配置成本 |
| 「预览编辑器卡住？」 | 预览与渲染解耦；以 `render_jobs.status=completed` 为验收标准 |

## 相关文档

- [INTEGRATOR_QUICKSTART.md](./INTEGRATOR_QUICKSTART.md)  
- [guide/README.md](../README.md)  
- [CHANGELOG.md](../CHANGELOG.md)