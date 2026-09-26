# 交接说明（短表）

> **最后更新**: 2026-09-26。公共 `main @ 47f49616`、VERSION **0.18.0.0**、PR #59 已合入，最新 main CI 通过；杭州现役已加载 DSH 0.1.7-rc.1、插件、CRM 和 WeKnora。见 [STATUS.md](STATUS.md)。
> 细节以代码与下列 SSOT 为准，**不要**在本文件堆 sprint 日记。

## 现役入口

| 入口 | 结果/职责 |
|---|---|
| `https://app.tyuan.chat/` | DSH Web（6677）；未带会话凭据返回 401，带登录身份后进入工作台。 |
| `https://page.tyuan.chat/` | 页面文档 HTTP（18091）；根路径返回 404 属于服务正常，具体资源由 DSH 路由提供。 |
| `https://board.tyuan.chat/` | 比赛看板，HTTPS 200。 |
| `https://learn.tyuan.chat/` | WeKnora 知识库（18090）；登录由 WeKnora 自身管理。 |
| `https://www.tyuan.chat/` | 站点入口，HTTPS 200。 |

所有公开入口均由 Cloudflare Tunnel 转到杭州 loopback，HTTP 强制跳转 HTTPS；HSTS 当前为六个月，未启用 preload/includeSubDomains。`learn` 额外启用 Permissions-Policy 与 CSP Report-Only，未把 Neo4j 或管理端口暴露到公网。

## 代码与运行归属

- Mac 公共 checkout：`/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics-public`，负责开发、测试、feature 分支、PR。
- 杭州 Windows + WSL：`/srv/shinemage/src/fuqing-crm-analytics`，只检出批准 SHA 并运行生产服务；当前 CRM 固定 `47f49616`，DSH 上游固定 `46a7f68b`。
- Mac 归档 checkout：`archive/tyuanww-main` 仅保留历史证据，不作为开发入口。
- 常规 DSH 登录入口可使用 [`scripts/ops/open-hangzhou-dsh.sh`](scripts/ops/open-hangzhou-dsh.sh)；不要在仓库或聊天中打印 token，不使用 `--fresh` 覆盖生产会话。

生产 DuckDB、WeKnora 数据卷、DSH runtime 会话与密钥不进入 Git。生产 DuckDB 的 D 盘备份已校验，`incoming` 仍只读保留。

## 立刻要看

| 问题 | 文档 |
|---|---|
| Agent 规则 | [`AGENTS.md`](AGENTS.md)（`CLAUDE.md` 只是兼容入口） |
| 系统能不能用？版本？端口？ | [`STATUS.md`](STATUS.md) |
| 还欠什么？（M1 任务卡） | [`docs/hackathon/TODOS.md`](docs/hackathon/TODOS.md#m1-核心交付) |
| 还欠什么？（运维债） | [`docs/TECH-DEBT.md`](docs/TECH-DEBT.md) |
| 文档地图 | [`docs/README.md`](docs/README.md) |
| 怎么合 PR | [Mac 开发到杭州生产链路](docs/operating/mac-hangzhou-git-workflow.md)；具体门禁以 GitHub PR checks 为准 |
| 整洁规范 | [`docs/operating/project-hygiene.md`](docs/operating/project-hygiene.md) |

## 技术栈（摘要）

- 后端 FastAPI · 前端 Vue3 · 分析库 DuckDB（`data/processed/fuqing_crm.duckdb`，本地大文件，**不进 git**）
- 版本号：根目录 `VERSION` + `CHANGELOG.md`
- 开发机按本地测试脚本运行服务；杭州生产实际监听：DSH `:6677`、页面 HTTP `:18091`、WeKnora 前端/API `:18090/:18092`、CRM `:18093/:18094`，均只绑定 WSL loopback，由 Cloudflare Tunnel 代理公开入口。

## 启动（开发机）

```bash
cd "/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics-public"
git checkout main && git pull origin main --ff-only
# 后端 / 前端按 README.md；hooks: bash scripts/setup-hooks.sh
```

## 禁止

1. 在 main 直接改业务代码（先 feature 分支）  
2. 提交 `data/**` / `.env` / duckdb  
3. 默认重开 Admin Upload 或 L4.74 PG（见 TECH-DEBT）  
4. 无 user 拍板就 `git push`（L4.15）

## 历史

长编年与旧 handoff 已归档或删除出树；需要时用 `git log -- docs/` / `docs/history/`。
