# M2-09 alpha2 target execution record — 2026-10-16

本次在授权目标 `100.93.46.46` 的独立临时目录执行了 alpha2 候选 host 前置、web 构建、隔离启动和一次 owned-host 停止/重启。主仓仍固定 DSH `0.1.7-rc.2` / `477b4f42`，live `4328` 未被停止或复用；候选只使用 `4329`。

目标 preflight 已先通过：Node `24.21.0`、`python3.14` `3.14.4`、zstd `1.5.5`、WSL2 x86_64 和 live/candidate 端口状态均符合输入清单。候选包从本地传入，固定 `pnpm 11.28.2`，并补传上游 Git 元数据以满足 runner 的固定 SHA 验证。`dsh-dev check` 通过，随后目标机 `pnpm run build:web` 通过；web dist 缺失造成的首轮认证后 404 已消除，认证根页返回 200，未授权请求仍为 401。

host 日志仍报告两个稳定 import warning：analytics workbench 包和 `scripts/dsh-dev/brand.mjs` 没有激活。它们使插件页面不能作为已加载的真实浏览器页面继续验收。Codex in-app browser 对本地 loopback URL 返回 `ERR_BLOCKED_BY_CLIENT`；native Chrome 导航没有形成稳定的候选页面状态。因此本次没有写入 synthetic history/board fixture，也没有把 curl 的 401/200 helper 结果写成 browser PASS。

同一 owned runtime 已完成一次停止/重启。重启后候选 4329 再次 ready，未授权根页 401、带临时 cookie 的根页 200，live 4328 仍由原进程监听。这只是 host-level restart probe；由于没有真实 headed browser 页面和 history/board 写入、重启后同一记录回读，完整 target recovery 继续记为 `NOT_RUN`。

原始日志保存在本地 ignored packet `m2-09-alpha2-target-20261016T070323Z-38823/logs/`，关键 SHA 和机器可复核字段见同目录的 JSON 记录。目标临时目录保留用于审计；没有写入正式 profile/journal，也没有切换生产。

## 当前结论

- `TARGET_PREFLIGHT`: PASS
- `TARGET_CHECK`: PASS
- `TARGET_WEB_BUILD`: PASS
- `TARGET_HOST_AUTH_PROBE`: PASS（仅 helper HTTP）
- `TARGET_BROWSER`: NOT_RUN
- `TARGET_RECOVERY`: NOT_RUN（仅完成 host restart probe）
- `M2-09`: `TARGET_BROWSER_NOT_RUN / TARGET_RECOVERY_NOT_RUN / MAIN_PIN_UNCHANGED`
- `M2-07`: `BLOCKED`
- `release_ready`: `false`
