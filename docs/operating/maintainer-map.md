# 维护地图

给后来改这个仓库的人。当前提交和版本只看根目录 [STATUS.md](../../STATUS.md)。这里只写目录、端口、检索和开发/生产边界，不重复施工编年。

## 先搜哪里

1. 符号和调用关系：若仓库已有 `.codegraph/`，在仓库根用 `codegraph explore "<名字>"`；没有索引时按 [AGENTS.md](../../AGENTS.md) 用限定范围的 `rg` 和源码阅读，不要自行初始化或提交索引。
2. 现在什么在跑：只看 [STATUS.md](../../STATUS.md)。
3. 怎么生成驾驶舱 HTML：[从对话生成 HTML 驾驶舱](cockpit-native-html.md)。
4. `docs/hackathon/` 和 `docs/history/` 是档案。里面的旧提交号不属于这个公开仓库的 `main`。

## 三块目录

| 角色 | 放什么 | 不放什么 |
|---|---|---|
| Mac 公共开发 checkout | `git@github.com:tyuanww/fuqing-crm-analytics.git` 的 `main` 与 feature 分支 | 不放 131GB 归档库、运行时令牌或生产数据 |
| Mac 归档 checkout | 旧账号历史，仅供取证和回溯 | 不配置活动 push，不从这里建新功能分支 |
| 杭州 WSL 生产 checkout | `/srv/shinemage/src/fuqing-crm-analytics`，只检出已通过 CI 的明确 SHA | 不在服务器直接开发，不把未审查分支当生产 |
| CRM 运行目录 | 杭州的生产数据与容器挂载 | 不把生产数据复制回公共 Git 或演示工作树 |

开发和生产的完整步骤见 [Mac 开发到杭州生产链路](mac-hangzhou-git-workflow.md)。

旧账号仓库和本仓库没有共同祖先。历史留在本机原仓。要进公开仓的功能，从当前 `main` 另起分支移植。

## 端口

公网只这三对。其余只听 `127.0.0.1`。

| 域名 | 本机 | 作用 |
|---|---|---|
| `https://app.tyuan.chat` | `127.0.0.1:6677` | 驾驶舱 |
| `https://page.tyuan.chat` | `127.0.0.1:18091` | 页面接口。根路径 404 是预期 |
| `https://board.tyuan.chat` | `127.0.0.1:15173` | 比赛看板 |

| 只在本机 | 作用 |
|---|---|
| `127.0.0.1:18093` | 现役 CRM 指标。启动目录在 `crm-assets-public`，代码读本仓库 |
| `127.0.0.1:8000` | 旧 CRM API。不要把它当成 6677 |
| `127.0.0.1:18090` / `18092` / `17687` | 知识库页面、API、图数据库。不提供生意数字 |

未登录访问 6677 和 18093 会要求认证。页面接口的跨域允许 `https://app.tyuan.chat`，并且不带凭证。

## 构建

Node 用 24。插件测试需要本机已准备好的 DSH 上游目录，变量名是 `B0_BUILD_UPSTREAM`。不要改上游源码，不要对 6677 使用 `--fresh`。改完插件后，现役进程要等明确授权才重载。

即席查询看子命令：

```bash
PYTHONPATH="$(pwd)" python3 scripts/ad_hoc_query.py -h
```

## 不要提交

交接备忘、废弃的 `session-cockpit-page` 草稿、`.codegraph/`、归档库和页面令牌。
