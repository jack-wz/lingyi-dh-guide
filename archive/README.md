# 归档代码说明

此目录用于存放本仓库历史遗留的 Pixelle-Video 产品线代码与文档，与当前活跃的「零一数字人导购平台」（`guide/`）相互隔离。

## 归档内容

- `web/` — 旧 Streamlit/Gradio 前端
- `docs/` — 旧 MkDocs 文档站点（含 `en/`、`zh/`、FAQ、gallery）
- `templates/` — 旧 HTML 视频模板
- `workflows/` — 旧 ComfyUI workflows（selfhost / runninghub）
- `bgm/` — 旧默认背景音乐
- `packaging/` — Windows 打包脚本
- `resources/` — 旧静态资源
- `scripts/` — 旧批处理脚本
- `data/` / `output/` — 旧运行时目录
- `docker/` — 旧 Docker 构建文件
- `.devcontainer/` — 旧 DevContainer 配置
- `mkdocs.yml`、`requirements-docs.txt` — 旧文档站点配置
- `config.example.yaml`、`.env.example`、`README_EN.md` — 旧配置与说明

## 说明

- 这些代码**不再维护**，仅作为历史参考保留。
- 当前产品线入口请见仓库根目录 `README.md` 和 `guide/README.md`。
- 如确需恢复其中某些模块，请在独立分支中评估影响后再迁移，不要直接在 `archive/` 上修改当前生产线。
