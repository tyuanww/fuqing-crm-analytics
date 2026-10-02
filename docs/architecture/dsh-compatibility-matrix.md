# DSH 兼容性矩阵（G0 / T2 / T17）

状态：**PARTIAL / release-blocking**。本文把“固定版本的静态合同”“隔离 synthetic host 证据”和“真实 DSH host 证据”分开记录。synthetic 夹具通过不等于 DSH 已支持热卸载，也不等于杭州已验收。

## 固定来源

| Host profile | DSH version | Upstream SHA | 本仓 checkout | 角色 |
|---|---|---|---|---|
| `dsh-0.1.7-rc.2` | `0.1.7-rc.2` | `477b4f420553e8a52c2fbccc464d7561b239c443` | `.context/dsh-b0/upstream-0.1.7-rc.2`（ignored exact checkout） | 首期 blocking pin |
| `dsh-0.2.0-rc.2` | `0.2.0-rc.2` | `639ed015397290b3745d163aafe02ffee4aa3f84` | `.context/dsh-b0/upstream-0.2.0-rc.2`（ignored exact checkout） | 后续 advisory pin |

来源配置：[toolchain.json](../../dsh-plugins/analytics-workbench/toolchain.json)。只读扫描入口为 `scripts/dsh-b0/compatibility-matrix.mjs`；它不会 clone/fetch/install。任何没有 exact checkout、SHA 和候选 profile 的结论都不能写成 `SUPPORTED`。

## 合同矩阵

| 能力/行为 | 0.1.7-rc.2 首期结论 | 0.2.0-rc.2 结论 | 证据入口 | 说明 |
|---|---|---|---|---|
| capability/slot 静态清单 | `SUPPORTED`（静态） | `SUPPORTED`（静态 advisory） | `scripts/dsh-b0/compatibility-matrix.mjs`；tag/SHA evidence | 只记录受控 source 文件名，不把文本匹配当作运行时语义 |
| client lifecycle / profile load | `SUPPORTED`（synthetic process boundary） | `DEFERRED` | `scripts/dsh-b0/host-feasibility.mjs` | 只证明夹具能记录启动与 profile digest，不证明 DSH API |
| in-process unload | **`BLOCKED`** | **`BLOCKED`（advisory）** | exact profile boot source 未发现 plugin-level unload；synthetic `/plugin/unload` 返回 `HOST_RESTART_REQUIRED` | 首期不承诺热卸载；两个 tag 都要以宿主重启作为保守边界，仍需 runtime smoke 补证 |
| hung plugin timeout | `SUPPORTED`（process boundary） | `DEFERRED` | host-feasibility timeout row | 受控超时后保留旧 native fallback |
| crashed plugin containment | `SUPPORTED`（process boundary） | `DEFERRED` | host-feasibility crash row | 需要重启宿主；不能当作同进程原子回滚 |
| native loop after failure | `SUPPORTED`（synthetic fallback） | `DEFERRED` | host-feasibility native-after-failure rows | 旧 native profile 继续可用的夹具证据 |
| session/WAL checkpoint replay | `SUPPORTED`（synthetic WAL only） | `DEFERRED` | host-feasibility WAL row | 不读取真实 DuckDB，不作迁移兼容承诺 |
| profile digest reconcile | `SUPPORTED`（journal vs native manifest） | `DEFERRED` | host-feasibility reconcile row | journal 是期望来源，宿主 manifest 是观测值 |
| shell/tool timeout/result union | `NOT_RUN` | `NOT_RUN`（advisory） | 静态 source family 已命中；运行时 fixture 待补 | 不能用文本匹配或旧测试数代替本轮 pinned host 证据 |

## G0 结论与下一步

当前可以确认的是：在临时 DSH home/profile/WAL 和 loopback 子进程边界内，挂起、崩溃、重启、native fallback、session checkpoint replay 和 profile digest reconcile 都有可重复证据；in-process unload 明确保持 `BLOCKED`。这支持后续实现采用 `HOST_RESTART_REQUIRED`、保留旧 profile/receipt、重启后 reconcile 的保守合同。

当前不能确认的是：DSH `0.1.7-rc.2` 真实 host 是否提供 unload、真实 slot/client 生命周期和 shell/tool timeout union，以及 `0.2.0-rc.2` 的运行时差异。exact checkout 与静态 source scan 已完成；仍必须运行真实 pinned host smoke 和 synthetic shell/tool/session/WAL 语义 fixture。在此之前 T4/T6 不得宣称同进程 activation isolation 或 atomic rollback。

验证命令：

```bash
node --test scripts/dsh-b0/host-feasibility.test.mjs
node --test scripts/dsh-b0/compatibility-matrix.test.mjs
node scripts/dsh-b0/host-feasibility.mjs --output /tmp/dsh-host-feasibility.json
node scripts/dsh-b0/compatibility-matrix.mjs --output /tmp/dsh-compatibility-matrix.json
```

CLI 默认只使用临时目录；`--output` 只写调用者指定的绝对路径，`--keep` 才保留夹具目录。夹具不联网、不读取 operator home、不启动 DSH/CRM、不连接杭州，也不访问真实 DuckDB。
