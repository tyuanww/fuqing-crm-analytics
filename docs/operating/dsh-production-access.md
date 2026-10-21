# 杭州生产 DSH 访问

当前现场先看 [STATUS.md](../../STATUS.md)。2026-10-21 的 owner-operated 驾驶舱 v3 side-load 使用 DSH `4328`、页面 HTTP `18091`，并监听 `18090`–`18094`；promo helper 仍为 `18098`。`current` 指向 `dsh-0.2.1-rc.1-core-main-20261021-cockpit-v3`，其 `runtime` 仍链接 v5 的既有持久 runtime；v2 驾驶舱候选保留，稳定回退目标是 v5。裸地址未带 cookie 返回 `401` 是预期行为，不要关闭认证。

在 Mac 开发端打开杭州生产 DSH：

```bash
scripts/ops/open-hangzhou-dsh.sh
```

脚本从当前 owner bundle 的 `/srv/shinemage/dsh/current/runtime/browser-private.json` 读取 WSL `4328` 入口，并把认证参数改写到公开 `app.tyuan.chat`。使用前仍须核对 STATUS 中的当前 owner bundle；脚本不会切换版本，也不会替代发布 runbook。可用环境变量覆盖 SSH 密钥和目标：

```bash
SHINEMAGE_SSH_KEY=~/.ssh/id_ed25519_pc2 \
SHINEMAGE_SSH_TARGET=root@100.93.46.46 \
scripts/ops/open-hangzhou-dsh.sh
```

页面文档和结果读取都通过 `https://page.tyuan.chat`，不要从 Mac 浏览器访问杭州的 loopback 端口。杭州 drop-in `92-cockpit-browser-base.conf` 同时设置 `PAGE_DOCUMENTS_BROWSER_BASE` 与 `PAGE_RESULT_BROWSER_BASE`；loopback 地址与 bearer token 只留在宿主侧。

打开失败时先只读确认 SSH 可达、`systemctl is-active shinemage-dsh.service`、`readlink -f /srv/shinemage/dsh/current` 和 4328/18091 监听状态，不要用 `--fresh`、复制 runtime 或猜测其他 runtime。v3 的可核对包身份、实机结果和未验收项见[驾驶舱 rc1 收口证据](../hackathon/evidence/cockpit-rc1-closeout-20261021.md)。
