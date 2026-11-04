# rc.5 面影子门禁（P3-0）与 Connection Fetch 路由归属（P3-1）

状态：**SHADOW（非阻塞）**。目标面是 DSH `0.2.1-rc.5`、tag commit `b830ec950faba0a46dda564be3e2d854afed94f1`；仓库当前仍 pin `0.2.1-rc.3`、`upstream_sha 1f81c047…`。因此本门禁先以“能证明的静态面”fail-closed 报错、以 `continue-on-error` 进 CI，不参与 `merge-gate`。

## 入口

| 面 | 文件 | 说明 |
|---|---|---|
| 面合同 | [config/dsh-rc5-surface.v1.json](../../config/dsh-rc5-surface.v1.json) | rc.5 的 103 个官方 slot 目录、声明/路由/工具形状、逐条来源指针、记录中的债务 |
| 门禁 | [scripts/ci/rc5-surface-gate.mjs](../../scripts/ci/rc5-surface-gate.mjs) | `--shadow`、`--json`、`--summary`、`--extract-upstream` |
| 门禁单测 | [scripts/ci/rc5-surface-gate.test.mjs](../../scripts/ci/rc5-surface-gate.test.mjs) | 每条失败规则都有负向夹具；另有“当前仓库 0 error”的基线断言 |
| P3-1 归属 | [dsh-plugins/analytics-workbench/src/connection-fetch-ledger.mjs](../../dsh-plugins/analytics-workbench/src/connection-fetch-ledger.mjs)、[dsh-plugins/crm-knowledge/src/connection-fetch-ledger.mjs](../../dsh-plugins/crm-knowledge/src/connection-fetch-ledger.mjs) | 每个插件唯一允许直接调用 `connection.fetch.register` 的模块；两包各自发布，副本必须逐字节一致 |
| P3-1 单测 | `dsh-plugins/analytics-workbench/test/connection-fetch-{ledger,ownership}.test.mjs` | 释放顺序、幂等、并发注册、重挂载不重复；归属单测覆盖 5/5 条生产路由和两包账本一致性 |
| CI | `.github/workflows/lint.yml` 的 `rc5-shadow` job | 独立非阻塞 job（`continue-on-error`，不在 `merge-gate.needs`），两个 step：门禁 + 归属单测；不进 4 分片 `test` 矩阵 |

本地运行：`node scripts/ci/rc5-surface-gate.mjs`（0 error 退出 0；`--shadow` 恒退出 0）。

## 检查项与 rc.5 依据

| 检查 | rc.5 依据 | 失败代码 |
|---|---|---|
| `dsh.client.platform === "web"` | `packages/client/modules/src/index.ts:862-865`（非 web 行不参与 client 发现） | `CLIENT_PLATFORM` |
| 有 `dsh.client` 就有 `exports["./client"]` | `packages/client/modules/src/index.ts:866-868`（缺失直接 throw） | `CLIENT_EXPORT_MISSING` |
| `inject`/`external` 为不重复字符串数组、`immediately` 为布尔 | `packages/client/modules/src/client/manifest.ts:173-193` | `CLIENT_ARRAY`、`CLIENT_IMMEDIATELY` |
| `dsh.bundle.patch` 文件存在 | 组合装载前置 | `BUNDLE_PATCH` |
| slot key 在官方目录内，或由 `children` 声明 / 合同登记为私有 | `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`；`ui-slots/src/index.ts:1207-1211`（未声明即注册 throw） | `UNKNOWN_SLOT` |
| list slot 带 `id`、keyed slot 带 `key` | `packages/client/ui-slots/src/index.ts:1161-1235` | `SLOT_LIST_ID`、`SLOT_KEYED_KEY` |
| Fetch 路由在 `/api` 之下、方法只有 GET/HEAD/POST、body 只有 buffered/streaming、有 handler | `packages/client/connection/src/rpc.ts:147-181` | `FETCH_PATH`、`FETCH_METHODS`、`FETCH_BODY`、`FETCH_HANDLER` |
| 每个 `register()` 的异步 disposer 有归属：ledger、`ctx.effect`，或合同里记录的债务 | `rpc.ts:169-181`（返回 disposer）+ cordis effect 释放顺序 `vendor/cordis/src/fiber.ts:73-78,415-418` | `UNOWNED_FETCH_ROUTE`、`ROUTE_DEBT_EXCEEDED` |
| 工具注册只走 `defineTool` | `packages/core/tools/README.md:34` | `TOOL_DSL` |
| 版本 pin 与 `toolchain.json` 对齐 rc.5（当前必然漂移） | P0 单源目标 | `PIN_DRIFT`（warn） |
| 部署值不来自 `process.env.B0_*` | `docs/user/develop/basic/config.md:78` | `ENV_DEPLOYMENT_VALUE`（warn） |

门禁对“读不懂的写法”一律报错而不是跳过：`UNPARSED_SLOT_REGISTER`、`UNPARSED_SLOT_INJECT`、`UNPARSED_FETCH_ROUTE`；合同本身不合法时直接退出 2。

## 记录中的债务

清债后门禁会自动变绿（债务项残留会报 `ROUTE_DEBT_STALE`，提醒更新合同）。

| 债务 | 数量 | 归属 | 出处 |
|---|---|---|---|
| `@deepseek-ai/dsh-tools` 仍 `0.2.1-rc.3` | 9 个插件 + `toolchain.json` | P0 单源（#211） | `PIN_DRIFT` |
| `B0_*` 环境变量部署值 | 11 处 | P3-2 `Config.baseUrl` | `ENV_DEPLOYMENT_VALUE` |

Fetch 路由债务已清零（5/5 条生产路由经两本插件账本登记，`routeOwnership.debt` 为空），`ROUTE_DEBT` / `ROUTE_DEBT_STALE` 不再出现。

slot 目录再生（需要 rc.5 源码树，不需要构建）：

```bash
node scripts/ci/rc5-surface-gate.mjs \
  --extract-upstream /path/to/deepseek-harness-b830ec95 \
  --write-contract config/dsh-rc5-surface.v1.json
```

## P3-1：每个插件一本 ledger 持有全部路由 disposer

`connection.fetch.register()` 在 rc.5 返回 `() => Promise<void>`。旧代码在 5 个位置丢弃了它，HMR/重载时旧 handler 会与新行撞同一 exact route。现在：

- **形状**：`ConnectionFetchLedger` 以 `owner` tag 分组登记 `{seq, path, methods, requestBody, state, dispose}`；`own()` 只接受 `/api` 之下的 exact 路由并对形状 fail-closed，`release(owner)` 释放一个 tag，`close()` 释放整本账。
- **顺序**：登记按 seq 递增，释放按 seq 递减（LIFO），与 cordis effect 的释放顺序一致；`close()` 幂等，registration 在途时也会等到 disposer 再释放，且每个 disposer 只调用一次。
- **接线**：`analytics-workbench/src/index.ts` 在 `connection`+`webServer` 可用的作用域里建一本账，`first-purchase-save-api`、`board-browser-api`、`cockpit-history-api` 三行通过 config 共用（3 条路由）；`crm-knowledge/src/host.ts` 用自己的包内账本登记 2 条 streaming 路由。行单独挂载（无 config）时自建一本，保持探针与既有 fixture 行为。
- **为什么是两份**：两个插件各自发布到独立作者仓（`dsh-crm-knowledge` / `dsh-analytics-workbench`），不能互相 import 源码；边界 policy 仍保持 0 条生产源码例外。两包副本必须逐字节一致，由归属单测守护，避免契约漂移。
- **合同**：`routeOwnership.ownerModules` 列出两个 ledger 模块；门禁只允许它们直接 `register`，并逐个断言仍在登记路由（`OWNER_MODULE_MISSING`）。

## 仍需 rc.5 运行时证明（不在本门禁内）

固定输入（B0 author packs / 上游构建）可用后，P3-0 的运行时半边仍需真实宿主：组合图含全部插件行、`/plugins/<id>/client.js?rev=` 200、12 个 slot key 的注册无 `not declared`、浏览器 Peer 对同源 `/api` 放行、HMR 后路由不重复、`--dump-config` 形状、`sessionQuery` 冷恢复并发窗口、`--profile acp|sdk` 驱动。这些是 2026-11-04 rc.5 API 复验报告 §5 的 9 条（会话产物，未入库），只能实机立项，不能由源码或本门禁代替。

## 转 blocking 的条件

1. P0 把 pin 提到 rc.5 并清空 `PIN_DRIFT`；
2. `routeOwnership.debt` 已清空、5/5 条生产路由全部经两本账本登记（本轮已完成）；
3. 删除 `.github/workflows/lint.yml` 的 `rc5-shadow` job 及其两个 step 的 `continue-on-error`，并把该 job 加入 `merge-gate` 的 `needs` 与失败条件。
