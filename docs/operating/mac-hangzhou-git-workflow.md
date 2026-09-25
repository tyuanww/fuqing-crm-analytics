# Mac 开发到杭州生产链路

这份文档是本项目当前的 Git 与部署入口。Mac 负责开发、测试和 PR；杭州 Windows + WSL 负责运行已批准的生产版本。GitHub 公共仓库是唯一活动远端：`tyuanww/fuqing-crm-analytics`。

## 角色和目录

| 位置 | 用途 | 规则 |
|---|---|---|
| Mac | 编码、单测、构建、浏览器验收、提交 PR | 不放生产密钥和真实大库；不直接推 `main` |
| GitHub `main` | 已审查、已通过 CI 的代码基线 | 只通过 PR 合入 |
| 杭州 WSL `/srv/shinemage/src/fuqing-crm-analytics` | 生产 checkout | 只检出批准 SHA；不在服务器改代码 |
| 杭州 `/srv/shinemage/data`、`/srv/shinemage/dsh`、`/srv/shinemage/weknora` | 运行数据和持久 runtime | 不进 Git，不从服务器反向提交 |

旧 `weiweity` checkout 仅作为本机归档取证，不是开发入口，也不配置活动 push。

## Mac 开发流程

```bash
git clone git@github.com:tyuanww/fuqing-crm-analytics.git
cd fuqing-crm-analytics
git switch -c codex/<topic>

# 修改后先检查工作树，再按受影响范围运行验证入口
git status --short --branch
python3 scripts/ci/run_checks.py --files-from changed-files.txt --plan-only

git add <intentional-files>
git commit -m "<具体变更>"
git push -u origin codex/<topic>
gh pr create --base main --head codex/<topic>
```

PR 的 CI、代码审查和人工验收通过后才合入 `main`。`git push` 只发布分支，不会自动更新杭州生产。

## 杭州生产流程

通过 Tailscale SSH 进入 WSL 后，只做只读核对和批准版本切换：

```bash
ssh hangzhou-wsl
cd /srv/shinemage/src/fuqing-crm-analytics
git fetch origin --prune
git checkout --detach <approved-main-sha>
git status --short --branch
```

切换前要记录旧 SHA、服务状态、配置校验和回退点；切换后按杭州运行层的预检、Compose 校验、CRM/DSH/WeKnora 内部健康检查和真实业务验收顺序执行。生产服务使用 `/etc/shinemage`、`/srv/shinemage/data` 和独立 runtime，不从 Mac 路径读取配置。

## 回退和边界

- 生产回退使用上一份已验证 checkout 和镜像，不用 `git reset --hard` 覆盖未登记改动。
- 代码合入不等于部署完成；部署、重载、DNS 和 Cloudflare Tunnel 分别授权。
- 真实 DuckDB、WeKnora dump、DSH runtime 和密钥不进入公共仓库，也不通过普通开发同步复制。
- 发现 remote 不是公共仓库、工作树 dirty、服务器追踪浮动分支或配置仍含 Mac 绝对路径时，停止发布并先修正。
