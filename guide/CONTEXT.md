# Guide 领域词汇（共享语言）

| 术语 | 含义 |
|------|------|
| **四阶段管线** | 解析 → 场景图 → 分镜视频(TTS/唇形) → FFmpeg 组装 |
| **FFmpeg 单路径** | 成片仅一次 Stage4 编码；ASS 字幕 + xfade 转场 + 质感滤镜 |
| **HF 预览** | 编辑器内 HyperFrames HTML 实时预览；不用于交付二次渲染 |
| **模板编辑器流水线** | 默认导购出片路径（`template_editor`） |
| **动效样式** | 字幕 style_id、HF 转场、全局质感（grain/vignette/grade） |
| **单字幕轨** | 交付成片只烧录一层 ASS，禁止 FFmpeg+HF 双字幕 |

## 验收命令

```bash
make smoke-integrator                    # 全链路 smoke（默认 template_editor）
make poll-render-job JOB=<id>            # 轻量轮询 ?summary=1
make verify-final-delivery JOB=<id>      # 成片单路径验收
make validate-render-job JOB=<id>        # 时间轴/字幕对齐审计
make test-guide-e2e                      # Playwright 37 项
make verify-delivery-complete            # 发布前全门禁（一键）
```

参考 E2E 任务：`c6b0e511-1b11-41d7-bbe9-3cd8b47db350`（飞鹤模板全链路 Worker 成片）。