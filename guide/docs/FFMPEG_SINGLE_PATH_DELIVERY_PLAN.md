# FFmpeg 单路径交付计划

> 状态：已交付 · 2026-06-21  
> 目标：导购成片 **一条字幕轨 + FFmpeg 内完成转场/质感**，HF 仅用于编辑器预览与设计。

## 验收标准

| # | 标准 | 验证方式 |
|---|------|----------|
| A1 | 交付链不再调用 `hf_style_pass` | `standard.py` 直出 `final.mp4` |
| A2 | 字幕仅 ASS 烧录一层 | 飞鹤模板成片无重复字幕 |
| A3 | `hf-dissolve` / `hf-push-*` 转场可见 | Stage4 xfade 滤镜 |
| A4 | `hf-vignette` / `hf-grain` / `hf-color-grade` 可见 | Stage4 全局滤镜 |
| A5 | `hf-caption-*` 映射到 ASS 等价样式 | `resolve_ass_subtitle_style_id` |
| A6 | UI 文案：预览=HF，成片=FFmpeg | 复核对话框 / 状态条 |
| A7 | 单元测试 + timeline 测试通过 | `make test-guide-fast` |
| A8 | 共享 TS 测试通过 | `make test-guide-shared` |
| A9 | 全链路 Worker E2E（非仅 reassemble） | 飞鹤模板 job `c6b0e511-…` → `final.mp4`，日志含 xfade、无 `hf_style_pass` |
| A10 | Playwright E2E + 发布门禁 | `make test-guide-e2e`（37 项）+ `make verify-delivery-complete` |

## 切片任务

1. **P0 交付路径** — `ffmpeg_effects.py` + `stage4_ffmpeg.py` + `standard.py`
2. **P0 共享契约** — `hfStylePass.ts` / `hfPipelineWarnings.ts` / `previewRenderAlignment.ts`
3. **P1 体验文案** — `RenderReviewDialog` / `HfPipelineStatusBar` / `renderIssues.ts` / `pipelines.ts`
4. **P1 测试** — `test_ffmpeg_effects.py` + 更新既有测试
5. **P2 文档** — `INTEGRATOR_QUICKSTART.md` 片段更新

## 架构决策（ADR）

- **保留** 四段式：解析 → 场景图 → 分镜视频 → FFmpeg 组装
- **移除** Worker 交付阶段的 HyperFrames 二次渲染（避免双字幕、GSAP CDN 失败）
- **保留** HF 编辑器预览、`hyperframes_template` 调试流水线（`ENABLE_HF_TEMPLATE_PIPELINE=1`）
- **新增** `ffmpeg_effects` 模块：HF 转场/质感类型的 FFmpeg 原生映射

## 回滚

若 xfade 在目标环境不可用，Stage4 回退 `concat` 并记录 warn；质感滤镜逐项 try/fallback。