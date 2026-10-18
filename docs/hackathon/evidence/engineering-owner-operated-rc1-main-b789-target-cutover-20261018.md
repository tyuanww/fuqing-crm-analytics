# rc1 merged-main target cutover

日期：2026-10-18

本记录描述杭州 WSL 的 owner-operated 内部切换。候选来自 PR #139 合并提交 `b78972a09ef61e6511a51ef9aa758207bc091734`。

## 当前结果

- `current` 已原子切换到 `dsh-0.2.1-rc.1-owner-main-b78972a0-20261018`。
- systemd 已绑定 `runtime-rc1-owner-main-b78972a0-20261018`。
- `shinemage-dsh.service=active`。
- `shinemage-dsh-promo-enter.service=active`。
- web 根路径返回 `401`。
- page HTTP 根路径返回 `404`。
- 这两个状态符合未认证 web 根路径和 page listener 根路径的现有合同。

## headed browser

真实 Chrome headed browser 读到 7 个启用插件：

1. `@shine-mage/dsh-analytics-workbench-b0`
2. `@shine-mage/dsh-shine-board`
3. `@shine-mage/dsh-shine-brand`
4. `@shine-mage/dsh-shine-crowd-action`
5. `@shine-mage/dsh-shine-funnel`
6. `@shine-mage/dsh-shine-query`
7. `@shine-mage/dsh-shine-waterfall`

驾驶舱回读到：`项目驾驶舱`、`产物收件箱 · 待处理 0`、`暂无产物。历史交付的 HTML、表格、Word 和 PDF 会出现在这里。`

## 回滚核验

官方 `rollback-release.sh` 将 `current` 回退到 `dsh-0.2.1-rc.1-owner-r9-20261018`。r9 重启后 HTTP 为 `401/404`，headed browser 再次读到 7 个插件和项目驾驶舱。

随后重新执行 `activate-release.sh`，恢复 b789 current，并重启自有 DSH service。最终进程命令行绑定：

```text
--runtime /srv/shinemage/dsh/runtime-rc1-owner-main-b78972a0-20261018
```

最终 current、HTTP、service 和 headed browser 回读均为 b789 候选。

目标机回执保存在 `/srv/shinemage/dsh/evidence/`，包括 activate、current restart、rollback drill 和 reactivate 日志。

## 范围

这是内部 owner-operated 部署证据。它不代表正式公司发布。正式状态保持：`M2-07=BLOCKED`、`M2-08=NOT_RUN`、`M2-09=NOT_RUN`、`release_ready=false`。GitHub Release 未创建。
