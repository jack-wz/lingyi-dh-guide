# Clauge 配置指南

本项目已配置完整的 Clauge 开发工具链，充分利用以下功能：

- **Agent Atlas** — 代码知识图谱（GitNexus）
- **Workspace** — 开发工作区布局
- **REST** — API 接口集合
- **SQL** — 数据库查询
- **NOSQL** — （本项目使用 SQLite，未配置 MongoDB）
- **SSH** — （本地开发，未配置远程）
- **Explorer** — 文件浏览器书签
- **History** — 操作历史记录

## 配置文件

| 文件 | 功能 | 说明 |
|------|------|------|
| `clauge.config.json` | 主配置 | Agent Atlas / REST / SQL / Explorer / History 总开关和配置 |
| `clauge.workspace.json` | 工作区 | 面板布局、终端、数据库、API 客户端、历史记录 |
| `clauge.atlas.json` | 知识图谱 | 代码分层、导航规则、GitNexus 集成 |
| `clauge.rest.json` | API 集合 | 8 个分类的完整 REST API 请求 |
| `clauge.sql.json` | 数据库 | SQLite 表结构、预置查询模板 |

## 快速开始

### 1. 启动服务
```bash
# 启动完整平台（API + Web + Worker）
./start_platform.sh

# 仅启动 API 网关
./start_api.sh

# 仅启动前端
./start_guide_web.sh
```

### 2. API 文档
启动后访问：http://127.0.0.1:8000/docs

### 3. 数据库
- 路径：`guide/data/templates.db`
- 驱动：better-sqlite3（WAL 模式）
- 使用 `clauge.sql.json` 中的预置查询

### 4. 测试
```bash
# 工作流单元测试
make -C guide test-guide

# E2E 测试
cd guide/web && npm run test:e2e

# 验证渲染
make -C guide validate-renders
```

## 功能详解

### Agent Atlas
- 项目已由 GitNexus 索引（6089 symbols, 13418 relationships, 300 flows）
- 6 个代码层：API Gateway、Guide Server、Database、Web Frontend、Worker/Pipeline、Pixelle Core
- 编辑代码前必须运行 impact 分析
- 提交前必须运行 detect_changes

### REST API 集合
共 8 个分类：
1. Health & System — 健康检查、版本信息
2. Templates — 模板 CRUD
3. Digital Humans — 数字人管理
4. Render Jobs — 渲染任务管理
5. Library — 素材库
6. Assets & Uploads — 资源上传
7. Config & Ops — 配置与运营
8. Legacy Media APIs — LLM/TTS/Image/Video 生成

### SQL 查询
预置查询覆盖：
- Templates（模板查询）
- Digital Humans（数字人查询）
- Render Jobs（渲染任务查询）
- Logs（日志查询）
- Library（素材库查询）
- Assets（资源查询）
- Analytics（统计分析）

### Explorer
书签快速导航：
- API Routes（`api/routers`）
- Guide Server Routes（`guide/server/src/routes`）
- Web Frontend（`guide/web/src`）
- Pixelle Services（`pixelle_video/services`）
- Database（`guide/server/src/db`）
- Data Directory（`guide/data`）
- Worker（`guide/worker`）

## 环境变量

复制 `guide/.env.example` 为 `guide/.env`，填写：

```bash
KIE_API_KEY=xxx
YUNTTS_API_KEY=xxx
WAVESPEED_API_KEY=xxx
LLM_API_KEY=xxx
```

## 项目架构

```
Pixelle-Video/
├── api/                    # FastAPI 网关
│   ├── routers/            # 所有 HTTP 路由
│   ├── app.py              # 主应用入口
│   └── config.py           # API 配置
├── guide/                  # 导购平台
│   ├── server/src/         # Express API
│   │   ├── routes/         # 服务端路由
│   │   └── db/             # SQLite 数据库
│   ├── web/src/            # React 前端
│   ├── worker/             # Python 渲染工作流
│   └── scripts/            # 辅助脚本
├── pixelle_video/          # Pixelle 核心服务
│   ├── services/           # LLM/TTS/Image/Video
│   └── pipelines/          # 处理流水线
├── web/                    # 独立 Web 组件
├── clauge.*.json           # Clauge 配置文件
└── AGENTS.md               # 项目编码规范
```
