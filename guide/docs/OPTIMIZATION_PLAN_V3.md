# 零一数字人导购平台 — 新一轮优化计划 V3

> 调研日期：2026-06-16  
> 基线分支：`main`
> 方法：GitNexus 架构探索 + opentalking / OpenStoryline / cenker-demo 对标 + HyperFrames design 规范 + taste-skill 设计审查框架  
> 前置文档：`PRODUCT.md`、`DESIGN.md`、`OPTIMIZATION_PLAN_V2.md`

---

## 0. 执行摘要

### 已完成（V2 → V3 增量）

| 能力 | 状态 | 证据 |
|------|------|------|
| 统一资产库 `/assets` | ✅ | 七 Tab + 预览 + Picker |
| 编辑器画布拖拽 ↔ 样式/时间轴同步 | ✅ | `PreviewInteractionLayer` + `elementTiming.ts` |
| 异构时间轴（字幕/贴片/对象独立时长） | ✅ | `GuideTimeline` object/overlay tracks |
| **HF 实时预览** | ✅ | `buildPreviewHtml` + CDN runtime + 「HF 实时」徽标 |
| Konva 主渲染路径 | ✅ 已移除 | bundle ~499KB |

### 仍阻塞「品牌一致性」的 P0

**品牌库仍是扁平色值**，未形成 opentalking 式 **品牌包（design.md + frame.md + 字体库 + presets）** 与 HyperFrames **frame 镜头语义** 的闭环。这是 V3 第一优先级。

### V3 一句话目标

> **资产库管品牌包（含字体库）→ 编辑器只选用 → HF 预览与 Worker 成片同源 → AI 辅助写脚本/镜头/提示词，不替代导购 DSL。**

---

## 1. 产品视角：主次关系与功能缺口

### 1.1 信息架构（不变，强化执行）

```
资产库（维护）          模板（编排）              生成（出口）
    │                      │                        │
    ├─ 数字人              ├─ 选品牌包 meta          └─ 渲染任务 / 下载
    ├─ 品牌包 ★            ├─ 选数字人 / 声音
    │   ├─ design.md       ├─ 选脚本 / 变量
    │   ├─ frame.md        └─ 时间轴微调（次）
    │   ├─ 字体库
    │   └─ 字幕/镜头预设
    ├─ 声音（TTS+BGM）
    ├─ 脚本 / 模版 / 媒体
    └─ 知识库（开发中）
```

**主路径（P0）**：同步外部库 → 选品牌包 → 选数字人 → 选脚本 → 生成。  
**次路径（P1）**：编辑器内镜头替换、贴片拖拽、异构时间轴微调。  
**隐藏路径（移除或降级）**：编辑器内品牌 CRUD、Konva 调试、知识库假功能、重复静态 `BRAND_KITS`。

### 1.2 功能缺口矩阵

| 缺口 | 严重度 | 对标 | V3 方案 |
|------|--------|------|---------|
| 品牌包无 frame.md / 字体入库 | **P0** | opentalking | Phase A：解析 + DB schema + 导入 |
| `import-external-catalog` 只导颜色子集 | **P0** | opentalking `brand_asset.py` | 扩展 `parseOpentalkingDesign` + 新增 `parseFrameMd` |
| 编辑器 `BRAND_KITS` 硬编码 3 套 | **P0** | 资产库单一数据源 | Phase C：删除常量，全走 `BrandPackPicker` |
| HF composer 未注入品牌 token / @font-face | **P0** | hyperframes.dev/design | `injectBrandTokens()` + 字体 URL |
| 品牌 Tab 无「字体 / 镜头 / 源文件」子视图 | **P1** | opentalking Inspector | `BrandPackDetail` 四 Tab |
| meta 无 `brand_pack_id` 持久化 | **P1** | DSL 溯源 | `globalConfig.brand_pack_id` |
| Worker ASS 字幕未用品牌字体 | **P1** | 预览≠成片 | Stage4 读品牌包 typography |
| 知识库 RAG 未接线 | **P2** | — | 保持「开发中」，删假上传入口 |
| AI 镜头/脚本助手 | **P2** | video-use / videocut | Phase F：受控 Agent，不替代 DSL |
| design→frame 转换助手 | **P2** | HF design 页 | 上传 design.md → 建议 frame 补丁 |

### 1.3 竞品取舍（V3 精炼）

| 来源 | 必借鉴 | 不借鉴 |
|------|--------|--------|
| **opentalking** | design.md + frame.md 双文件品牌包；`typography.fonts[]`；镜头 `hf_shots`；资产库 Tab 维护 | 记忆库、市场克隆、导出视频独立 Tab |
| **OpenStoryline** | 脚本/BGM 原子资产、标签过滤、TTS 预设目录 | 全自动剪片替代导购场景 DSL |
| **HyperFrames** | frame.md 语义、`hf-seek` 预览、registry blocks 字幕样式 | 完全弃 Worker 口播链路 |
| **cenker-demo** | 分镜条 UX、生成前审查门、场景级素材应用 | 静态 JSON 场景库作主数据源 |
| **video-use** | 「说一句改一版」的 Agent 交互范式 | 浏览器全自动替代平台内编辑器 |
| **videocut-skills** | 中文剪辑 Agent 话术、分步确认 | 独立 CLI 与平台 UI 割裂 |
| **seedance2-skill** | 即梦/Seedance 专业镜头提示词结构 | 绑定单一视频生成供应商 |
| **Remotion skills** | 代码化批量出片、composition 参数化 | Remotion 运行时替代 HF |

---

## 2. 品牌包 + 字体库 — 技术规格（P0 核心）

### 2.1 数据模型

```typescript
interface BrandPack {
  id: string;
  name: string;
  description?: string;
  source: 'opentalking' | 'openstoryline' | 'custom';
  design_md: string;           // 原文
  frame_md?: string;           // 原文
  tokens: {
    colors: Record<string, string>;
    typography: {
      fonts: Array<{
        family: string;
        url?: string;          // woff2/ttf 相对路径或 CDN
        weights?: number[];
        fallback?: string;
      }>;
      sizes?: Record<string, string>;
    };
    spacing?: Record<string, string>;
    radius?: Record<string, string>;
  };
  presets: {
    subtitle_styles: Array<{ id: string; label: string; hf_block?: string }>;
    shots: Array<{ id: string; label: string; camera?: string; transition?: string }>;
    bgms?: Array<{ name: string; url: string }>;
  };
  payload: { brand_color; accent_color; ... };  // 兼容现有扁平字段
}
```

### 2.2 解析与导入（Phase A）

| 任务 | 文件 | 说明 |
|------|------|------|
| A1 | `guide/server/src/parsers/designMd.ts` | 扩展：fonts、bgms、spacing、radius |
| A2 | `guide/server/src/parsers/frameMd.ts` | 新增：镜头表、字幕 preset、transition |
| A3 | `import-external-catalog.ts` | opentalking 导入完整品牌包 + 字体文件复制到 uploads |
| A4 | `guide/shared/brandPack.ts` | `resolveBrandPack(id)` → tokens + presets |
| A5 | `POST /api/library/brand/import-md` | 上传 design.md + 可选 frame.md |

### 2.3 消费链（Phase B）

```
BrandPack.tokens
    ├─► hyperframesComposer.injectBrandTokens()  → CSS variables + @font-face
    ├─► buildPreviewHtml / live preview          → 与 Worker 同源
    ├─► Editor 默认字幕样式 / 对象 fontFamily     → 从 presets 填充
    └─► Worker Stage4 ASS                        → fontFamily 字段（P1）
```

### 2.4 资产库品牌 Tab UI（Phase B）

| 子 Tab | 内容 | 交互 |
|--------|------|------|
| 概览 | 色板 + 主字体预览 | 选用 → 写入 `meta.brand_pack_id` |
| 字体库 | `typography.fonts[]` 列表 | 预览 TTF/woff2；选用为默认字幕字体 |
| 镜头 | frame.md `hf_shots` | 只读卡片；选用插入当前 segment |
| 源文件 | design.md / frame.md | 语法高亮折叠；运营可下载 |

---

## 3. 用户视角：逆向思维 — 易遗漏项

| 用户心智 | 平台现状 | 遗漏风险 | V3 对策 |
|----------|----------|----------|---------|
| 「我选了品牌，为什么字幕还是黄的？」 | 品牌只改 logo 色 | 品牌未驱动字幕 preset | 选品牌包 → 自动应用 `subtitle_styles[0]` |
| 「字体在预览对，下载不对」 | HF 预览有 fontFamily，ASS 写死 | 预览≠成片 | Worker 读品牌包字体（P1） |
| 「镜头是什么？」 | frame.md 未入库 | 运营不懂 DSL | 镜头用中文标签 + 缩略示意 |
| 「资产库和编辑器两套品牌？」 | `BRAND_KITS` 兜底 | 数据源分裂 | 删除硬编码，空库提示「去同步」 |
| 「第一次用不知道从哪开始」 | 七 Tab 平铺 | 认知过载 | 首屏只露 3 步：品牌→人→脚本；其余收「更多资产」 |
| 「生成失败不知道为什么」 | 错误 toast 泛化 | 信任崩塌 | 保留审查门（cenker 式）+ 可复制的错误码 |
| 「AI 帮我改一下这句话」 | 仅全量 AI 生成 | 缺局部 AI | 脚本 Tab「润色本段」；编辑器「换镜头」 |
| 「知识库能问答吗？」 | UI 像能用 | 假功能挫败 | 明确「开发中」+ 禁用上传（distill） |

---

## 4. 交互视角：简化入口、降低认知门槛

### 4.1 三级入口

| 级别 | 入口 | 用户 |
|------|------|------|
| L1 快捷 | 首页 / 模板卡片 → 「用此模版生成」 | 运营 |
| L2 标准 | `/assets` 维护 → 模板选品牌/人/脚本 → 生成 | 运营主管 |
| L3 专业 | 编辑器：时间轴 + 画布 + HF 实时 | 剪辑/设计 |

### 4.2 Distill 清单（简化冗余）

| 移除/合并 | 位置 | 理由 |
|-----------|------|------|
| `BRAND_KITS` 常量 | `EditorPage.tsx` | 与资产库重复 |
| 编辑器「管理品牌」入口 | Editor 侧栏 | 维护只在 `/assets` |
| 知识库上传按钮 | `/assets` 知识 Tab | RAG 未接线 |
| Konva 相关 dead import | `web/src` | 已弃用主路径 |
| 重复 `libraryItemToBrandKit` 映射 | Editor + utils | 收敛到 `brandPack.ts` |
| Debug 面板默认展开 | 若有 | 专业用户才需要 |
| 七 Tab 同等视觉权重 | `/assets` | 品牌/人/脚本加「推荐」徽标，其余弱化 |

### 4.3 首访引导（P1）

1. 检测 `libraryBrands.length === 0` → 引导「同步外部素材库」  
2. 检测未选 `brand_pack_id` → 模板页顶部 Banner「先选品牌包」  
3. 编辑器首次进入 → 单次 Coachmark：「拖拽画布 = 改位置；时间轴 = 改时长」

---

## 5. AI 原生能力路线图（Phase F）

> 原则：**AI 增强选用与生成，不替代导购 DSL 与品牌包权威源。**

| 能力 | 触发 | 实现参考 | 优先级 |
|------|------|----------|--------|
| 脚本润色 | 脚本 Tab / 编辑器段落 | LLM + 品牌 tone | P1 |
| 镜头推荐 | 选品牌包后 | frame.md shots + 场景描述匹配 | P1 |
| 「说一句改一版」 | 编辑器自然语言框 | video-use 范式；输出 DSL diff | P2 |
| 视频提示词助手 | 外链生成场景 | seedance2-skill 结构 | P2 |
| 批量出片 | 任务列表 | Remotion skills 参数化思想 | P2 |
| 生成前审查 | 提交渲染前 | cenker 审查门 + 缺字段清单 | P1 |
| design→frame 建议 | 上传 design.md | HF design 转换规则 | P2 |

**不做**：用 browser-use 完全托管编辑器；用 Generative-Media 替代口播数字人链路。

---

## 6. 设计视角：taste-skill 审查结论

**Design Read**：*B2B 导购内容生产工具，面向运营与非专业剪辑，信任优先、信息密度中等，shadcn 黑白体系 + 品牌色点缀，动效克制。*

**Dials**：VARIANCE 5 / MOTION 3 / DENSITY 5（工具型，非营销页）

### 6.1 /audit — AI 味问题

| 问题 | 位置 | 严重度 |
|------|------|--------|
| 渐变 CTA + 过多 Badge | 部分卡片 | 中 |
| 七 Tab 等权 + 图标同质化 | `/assets` | 中 |
| 「HF 实时」技术术语外露 | 预览角标 | 低 |
| 空状态无引导 | 品牌/字体列表 | 高 |
| 知识库「像能用」 | 知识 Tab | 高 |

### 6.2 /distill + /quieter

- 资产库：主 Tab（品牌/数字人/脚本）实色，次 Tab 描边  
- 编辑器：默认只露预览+时间轴；样式进 Inspector 折叠  
- 去掉多余渐变与装饰性 shadow  

### 6.3 /bolder + /polish

- 品牌色板用大面积色块（参考 HF design Colors）  
- 字体库行：字号对比预览（18/24/32）  
- 选用态：左侧 3px `brand-blue` 条 + 勾选  
- 时间轴播放头：2px 高对比竖线  

### 6.4 /animate（克制）

- Tab 切换：150ms opacity  
- 选用品牌包：色板 200ms scale(1.02)  
- 禁止：循环脉冲、页面入场 stagger  

### 6.5 /critique — 结构性问题

1. **双数据源品牌**：硬编码 vs 库 — 必须删其一  
2. **预览与成片字体分叉**：损害信任 — P1 必须对齐  
3. **frame.md 运营不可见**：品牌包价值打折扣 — 资产库要可视化  

---

## 7. 代码移除清单（gitnexus-refactoring 输入）

| 目标 | 路径 | 条件 |
|------|------|------|
| `BRAND_KITS` | `guide/web/src/pages/EditorPage.tsx` | `BrandPackPicker` 就绪后 |
| `libraryItemToBrandKit` 重复逻辑 | Editor + helpers | 合并 `brandPack.ts` |
| Konva 残留 | `web/src` grep `konva` | 确认无引用后删 |
| 扁平品牌 payload 扩展字段 | 逐步迁移到 `BrandPack` | 保留兼容层 1 版本 |
| 未使用的 subtitle 静态 map 重复 | composer vs editor | 统一从品牌 preset 读 |

**gitnexus-impact 必查**：改动 `hyperframesComposer.ts`、`import-external-catalog.ts`、`EditorPage.tsx`、`globalConfig` 类型。

---

## 8. 分阶段实施

### Phase A — 品牌包数据层（P0，3–5d）

- [ ] A1–A5 解析与 API  
- [ ] 迁移 opentalking `design.md` + `frame.md` 完整入库  
- [ ] 字体文件复制 + `file_url`  
- [ ] `make test-guide` 新增 parser 单测  

### Phase B — 资产库品牌 UX（P0，2–3d）

- [ ] `BrandPackDetail` 四子 Tab  
- [ ] 字体预览组件  
- [ ] 选用写入 `brand_pack_id`  

### Phase C — 编辑器收敛（P0，2d）

- [ ] 删除 `BRAND_KITS`  
- [ ] `BrandPackPicker` + 镜头插入  
- [ ] 选品牌 → 默认字幕 preset  

### Phase D — HF / Worker 对齐（P1，2–3d）

- [x] D0 HF 实时预览（已完成）  
- [ ] D1 `injectBrandTokens` + @font-face  
- [ ] D2 Worker ASS 品牌字体  
- [ ] D3 `meta.brand_pack_id` 全链路  

### Phase E — Distill + 入口简化（P1，1–2d）

- [ ] 知识库仅开发中态  
- [ ] 资产库 Tab 主次视觉  
- [ ] 首访引导 + 空状态  

### Phase F — AI 原生（P2，按需）

- [ ] 脚本润色、镜头推荐、审查门  
- [ ] 自然语言 DSL diff（实验）  

### Phase G — 设计精修（P1，1d）

- [ ] 执行 audit 清单  
- [ ] polish 品牌/字体卡片  
- [ ] animate 选用反馈  

---

## 9. 里程碑与验收

| 里程碑 | 交付 | 验收标准 |
|--------|------|----------|
| **M1** | Phase A+B | 品牌包含 ≥15 字体、≥4 镜头；资产库可预览选用 |
| **M2** | Phase C | 编辑器无 `BRAND_KITS`；选品牌后字幕样式变 |
| **M3** | Phase D | 预览与成片字幕字体一致（抽样 3 模板） |
| **M4** | Phase E+G | 新用户 10 分钟内完成首条生成；audit 高项清零 |
| **M5** | Phase F | 脚本润色 + 审查门上线 |

---

## 10. GitNexus 工作流（实施时）

```bash
# 索引（若未索引）
npx gitnexus analyze /path/to/<项目根目录>

# 探索品牌/HF 链
/gitnexus-exploring    # brandPack, hyperframesComposer, import-external-catalog

# 改前影响
/gitnexus-impact-analysis   # 删 BRAND_KITS、改 globalConfig

# 实施
/gitnexus-refactoring       # 提取 brandPack.ts、BrandPackPicker

# 预览字体分叉 bug
/gitnexus-debugging         # ASS vs HF fontFamily

# 合入前
/gitnexus-pr-review
```

---

## 11. 本周执行顺序（Quick Wins）

1. **A2+A3**：`frameMd.ts` + 扩展 import（opentalking 完整品牌包）  
2. **C1**：删除 `BRAND_KITS`，空库引导同步  
3. **B1**：品牌 Tab「字体」「镜头」子视图（只读先行）  
4. **D1**：`injectBrandTokens` 进 `hyperframesComposer.ts`  
5. **E1**：知识库去掉上传，仅保留开发中说明  

---

## 12. 文档同步

| 文档 | V3 变更 |
|------|---------|
| `PRODUCT.md` | 更新 HF 实时状态；品牌包/字体库为主功能描述 |
| `DESIGN.md` | 品牌包详情 UI、字体库行、audit 结论入库 |
| `OPTIMIZATION_PLAN_V2.md` | 冻结归档，以本文档为准 |

---

*V3 结束 — 下一步：按 §11 顺序开工 Phase A，或指定优先实现项。*