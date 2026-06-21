# 新一轮优化计划 V2

> 调研范围：零一数字人导购平台（guide）、opentalking、FireRed-OpenStoryline、cenker-creation-demo、HyperFrames
> 方法：产品主次 / 用户逆向 / 交互简化 / 设计审计 / AI 原生  
> 日期：2026-06-16

---

## 0. 现状摘要

**已完成（V1）**

- 统一资产库 `/assets`（7 类 Tab + 预览面板）
- `/api/library` + OpenStoryline/opentalking 外部同步
- 编辑器「选数字人 / 选脚本 / 选品牌」选择器
- HF 预览路由、compositionResolver、Worker 四阶段成片

**核心断层**

品牌库仍是「扁平色值」，未实现 opentalking **品牌包（design.md + frame.md + 字体 + presets）** 与 HyperFrames **frame 镜头** 的闭环。

---

## 1. 目标架构

```
┌─────────────────────────────────────────────────────────┐
│                    BrandPack (品牌包)                      │
│  design.md ──► colors, typography.fonts[], bgms[]        │
│  frame.md  ──► frames[], presets{subtitle,text,layout…}   │
│  hyperframesTemplate ──► HF composer / 预览              │
└───────────────────────┬─────────────────────────────────┘
                        │ brand_pack_id
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   资产库维护      模板 DSL.meta    编辑器选择器
        │               │               │
        └───────────────┴───────────────┘
                        ▼
              Worker 成片 / HF 预览
```

---

## 2. 分阶段计划

### Phase A — 品牌包数据层（P0，1–2 周）

**目标**：字体库、frame.md、design.md 入库并可查询。

| 任务 | 说明 | 文件 |
|------|------|------|
| A1 | 定义 `BrandPack` TS 类型（对齐 opentalking `BrandAsset`） | `shared/types/brand-pack.ts` |
| A2 | 移植 `parseDesignMarkdown` / `parseFrameMarkdown`（TS 或调用 Python shim） | `server/src/brand-pack/parser.ts` |
| A3 | 扩展 `import-external-catalog`：完整读取 opentalking `09_设计系统/*.md` | `import-external-catalog.ts` |
| A4 | `library_items.brand` payload 升级为 `brand_pack` v1；迁移旧扁平字段 | `library.ts`, migration |
| A5 | API：`GET /api/library/brand-packs/:id/fonts|frames|presets` | `routes/library.ts` |
| A6 | 测试：fixture design+frame → 解析 frames≥4、fonts≥15 | `brand-pack.test.ts` |

**移除**：无（纯扩展）

---

### Phase B — 资产库品牌包 UX（P0，1 周）

| 任务 | 说明 |
|------|------|
| B1 | 品牌 Tab 改为 `BrandPackPanel`（概览/字体/镜头/预设/源文件） |
| B2 | 字体库表格 + 「永」字预览 |
| B3 | 镜头列表展示 shotType、duration、hyperframesTemplate |
| B4 | 同步按钮结果展示 fonts/frames 导入计数 |
| B5 | 知识库：隐藏文档 CRUD，仅保留开发中说明（/distill） |

**移除**

- 品牌 Tab 下仅 3 个 color input 的简陋表单 → 并入品牌包编辑器或「从 md 导入」

---

### Phase C — 编辑器「只选择」（P0，1 周）

| 任务 | 说明 |
|------|------|
| C1 | `BrandPackPicker` 替代 `libraryItemToBrandKit` + 删除 `BRAND_KITS` |
| C2 | `applyBrandPack`：写入 `meta.brand_pack_id`、globalConfig 色、subtitle 来自 `presets.subtitleStyles` |
| C3 | `FrameTemplatePicker`：从品牌包 frames 添加 segment（含 variables 默认值） |
| C4 | DSL 扩展：`segment.frame_template_id`、`segment.variables` |
| C5 | 顶栏减法：预置 → 模板中心；调试入口环境门控 |

**移除**

- `EditorPage.tsx` 内 `BRAND_KITS` 常量
- 设计面板内「应用预设」重复列表（只保留选择器入口）

---

### Phase D — HyperFrames 对齐（P1，1–2 周）

| 任务 | 说明 |
|------|------|
| D1 | `composer.ts` 读取 brand_pack presets 生成字幕 CSS |
| D2 | `hyperframesTemplate` 映射到 registry block 或内置 HTML 片段 |
| D3 | 编辑器 HF 预览改 iframe 侧栏；真实 DH URL 替代 emoji |
| D4 | 补齐 `brand-elegant` 等 style 映射 |
| D5 | 文档：标明 HF=预览轨、Worker=口播成片轨 |

**可选**：特定 shotType 成片走 `POST /render-hyperframes`（P2）

---

### Phase E — AI 原生（P1，2 周）

| 任务 | 说明 |
|------|------|
| E1 | 「AI 推荐脚本」：按模板 type + topic 从 script 库检索（标签匹配，无需向量先行） |
| E2 | 「AI 推荐 BGM」：脚本关键词 ↔ bgm meta mood/scene |
| E3 | 「AI 生成分镜」：品牌包 frames + topic → POST 生成 segments（复用 worker llm_client） |
| E4 | 生成审查门增加「一键 AI 补齐缺失项」 |
| E5 | （P2）design.md 上传 → 调用 HF design 转换建议 frame 补丁 |

---

### Phase F — 清理与收敛（P2，持续）

| 移除/收敛 | 理由 |
|-----------|------|
| `web/src/data/sceneImages.ts` 默认展示 | 改资产库媒体优先，静态作 offline fallback |
| 导航「调试」生产环境 | 降低运营认知噪音 |
| `import-external-catalog` 硬编码绝对路径 | UI 设置 + `.env` |
| 重复 `AssetLibrary` dh 列表逻辑 | 统一走 library API |
| `knowledge_doc` 前后端 CRUD UI | 保留 API，UI 待 RAG 一期再开 |
| cenker 式假「AI 优化描述」 | 合并为 E1 或删除 |

---

## 3. 优先级矩阵

|  | 用户价值 | 实现成本 | 建议序 |
|--|----------|----------|--------|
| 品牌包 frame+font 解析导入 | 极高 | 中 | **A→B** |
| 编辑器 BrandPack/Frame 选择器 | 极高 | 中 | **C** |
| HF 预览对齐 | 高 | 中 | D |
| AI 推荐脚本/BGM | 高 | 低 | E |
| 知识库 RAG | 中 | 高 | 延后 |
| HF 替代 Worker 成片 | 低 | 极高 | 不做 |

---

## 4. 用户逆向检查清单（易遗漏）

- [ ] **换品牌后已生成分镜字幕是否同步** — 需提示「仅影响后续镜」或提供批量应用
- [ ] **数字人未 ready 仍可选** — 生成审查必须拦截并跳转训练
- [ ] **BGM 与口播 TTS 混音** — 审查门显示「将覆盖 segment_bgm」提示
- [ ] **变量未填（price、productName）** — frame 模板变量空值在预览用 placeholder 色块
- [ ] **同步外部库失败** — 路径错误时 Banner 说明配置 OPENTALKING_ROOT
- [ ] **首次空模板** — 模板中心应推导购预置，非空白 editor
- [ ] **字体未嵌入** — 预览用 Web 字体 fallback，成片 ASS 字体名一致性问题需文档说明

---

## 5. 里程碑与验收

| 里程碑 | 内容 | 验收 |
|--------|------|------|
| **M1** | A+B 完成 | 资产库品牌包可见 15 字体、4+ 镜头；frame.md 源文件只读 |
| **M2** | C 完成 | 编辑器无 BRAND_KITS；可从品牌包添加镜头；meta.brand_pack_id 持久化 |
| **M3** | D 完成 | HF 预览字幕样式与品牌包 preset 一致 |
| **M4** | E1+E2 | 顶栏「AI 推荐」脚本+BGM 一键填入 |
| **M5** | F | `make test-guide` 绿；导航 ≤3 项；文档更新 |

---

## 6. GitNexus 建议用法（实施阶段）

实施 Phase A/C 时建议：

```bash
gitnexus-cli index .                    # 索引 guide/
/gitnexus-impact-analysis               # 改 brand payload 影响面
/gitnexus-refactoring                   # 拆 BRAND_KITS → BrandPackPicker
/gitnexus-pr-review                     # M2 合并前
```

（当前环境 CodeGraph agentic 需 `ai-enhanced`；可改用本地 gitnexus-cli。）

---

## 7. 本周可执行 Quick Wins（若只作 3 天）

1. **A3+A4**：导入完整 opentalking design+frame 到 brand payload  
2. **C1**：删除 `BRAND_KITS`，编辑器品牌全走库  
3. **B5+F**：知识库文档 UI distill + 导航隐藏调试  

---

## 8. 相关文档

- [PRODUCT.md](./PRODUCT.md) — 产品定义与缺口
- [DESIGN.md](./DESIGN.md) — IA 与视觉交互规范
- opentalking：`09_设计系统/design.md`、`frame.md`
- HyperFrames：https://github.com/heygen-com/hyperframes、https://www.hyperframes.dev/design