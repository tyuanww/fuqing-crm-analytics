# DSH 兼容性矩阵（G0 / T2 / T17）

状态：**PARTIAL / release-blocking，当前核对至 2026-10-07**。固定官方 Web CLI 的本机证据继续保留；当前候选已有杭州 WSL HTTP/headless、终态恢复和回执接线。文本、工具、附件/委派元数据三组声明语料各有实际跨版本恢复证据，不能扩大为任意会话或生产放行。见[元数据语料](../hackathon/evidence/dsh-g0-session-rich-corpus-20261007.md)、[当前候选终态](../hackathon/evidence/dsh-g0-first-purchase-terminal-candidate-20261007.md)和[浏览器接线](../hackathon/evidence/dsh-g0-current-browser-gate-20261007.md)。

## 固定来源

| Host profile | DSH version | Upstream SHA | 本仓 checkout | 角色 |
|---|---|---|---|---|
| `dsh-0.1.7-rc.2` | `0.1.7-rc.2` | `477b4f420553e8a52c2fbccc464d7561b239c443` | `.context/dsh-b0/upstream-0.1.7-rc.2`（ignored exact checkout） | 首期 blocking pin |
| `dsh-0.2.0-rc.2` | `0.2.0-rc.2` | `639ed015397290b3745d163aafe02ffee4aa3f84` | `.context/dsh-b0/upstream-0.2.0-rc.2`（ignored exact checkout） | 后续 advisory pin |

来源配置：[toolchain.json](../../dsh-plugins/plugin-kit/toolchain.json)。只读扫描入口为 `scripts/dsh-b0/compatibility-matrix.mjs`；它不会 clone/fetch/install。任何没有 exact checkout、SHA 和候选 profile 的结论都不能写成 `SUPPORTED`。

## 合同矩阵

| 能力/行为 | 0.1.7-rc.2 首期结论 | 0.2.0-rc.2 结论 | 证据入口 | 说明 |
|---|---|---|---|---|
| capability/slot 静态清单 | `SUPPORTED`（静态） | `SUPPORTED`（静态 advisory） | `scripts/dsh-b0/compatibility-matrix.mjs`；tag/SHA evidence | 只记录受控 source 文件名，不把文本匹配当作运行时语义 |
| preset / profile load | `SUPPORTED`（本机固定 Web CLI） | `DEFERRED` | pinned-host `profile-load` / `loaded-composition-reconcile` | 必须显式加载 `@deepseek-ai/dsh-agent-preset` 声明；只生成旧 preset 目录不会注册 |
| preset 移除与已有会话 | `HOST_RESTART_REQUIRED`（整体切换） | `DEFERRED` | pinned-host `retired-preset-retains-live-session` | 移除声明拒绝新绑定，但已有会话仍持有工具；不是“无法 dispose 任意 Cordis 模块”的泛化结论 |
| hung plugin timeout | `SUPPORTED`（外部进程恢复） | `DEFERRED` | pinned-host `blocking-plugin-requires-process-restart` | 插件同步死循环确实阻塞同进程；父命令超时后终止自己的宿主，新进程恢复，不承诺挂死期间 native loop 可用 |
| process crash recovery | `SUPPORTED`（本机固定 Web CLI） | `DEFERRED` | pinned-host `inflight-crash-durable-prefix-replay` | 在模型请求未结束时 SIGKILL 自有宿主；不等同于同进程故障隔离 |
| native fallback / 恢复旧组合 | `SUPPORTED`（本机固定 Web CLI） | `DEFERRED` | pinned-host `native-fallback-restart` / `restore-previous-pinned-profile` | 移除业务工具后仍能续聊，再加载相同固定插件包；测试指针不替代生产 activation journal |
| session/WAL durable prefix replay | `SUPPORTED`（声明语料的本机/WSL 观察） | `DEFERRED` | [文本/在途恢复](../hackathon/evidence/dsh-g0-first-purchase-recovery-wsl-20261007.md)、[工具](../hackathon/evidence/dsh-g0-session-tool-wsl-20261007.md)、[元数据](../hackathon/evidence/dsh-g0-session-rich-corpus-20261007.md) | 原生 v4 截断恢复、rc1→rc2 续写、rc2→rc1 读回及保留旧状态回退分别通过；不代表任意语料、业务数据回滚或编译来源认证 |
| profile / native composition reconcile | `SUPPORTED`（本机模块清单核对） | `DEFERRED` | pinned-host `loaded-composition-reconcile` | 包、配置和测试源码各记录 digest；完整 journal/native/远端回执接线仍属 T13 |
| client / slot 浏览器生命周期 | `PARTIAL`（WSL headless 五场景） | `NOT_RUN`（advisory） | [当前包浏览器](../hackathon/evidence/dsh-g0-first-purchase-current-browser-20261007.md) | 原生查询/保存/刷新/登录/回退路径已有观察；不能代签 UI 热切换、headed/移动端或无障碍 |
| shell/tool timeout/result union | `NOT_RUN` | `NOT_RUN`（advisory） | 静态 source family 已命中；运行时 fixture 待补 | 不能用文本匹配或旧测试数代替本轮 pinned host 证据 |
| 附件/委派持久元数据 | `SUPPORTED`（引用/header/descriptor/depth） | `DEFERRED` | [rich 四项现场矩阵](../hackathon/evidence/dsh-g0-session-rich-corpus-20261007.md) | 只验证引用与元数据；不调用附件服务或真实子代理，存储/渲染/执行仍 NOT_RUN |

## G0 结论与下一步

2026-10-07 补证：从固定 rc1 commit/lock 新建的本机输入已完成官方 host/native 构建与三语料 12 场景/30 冷进程，输入清单前后保持，四个 JS 入口与旧 WSL 观察一致。见[构建追踪](../hackathon/evidence/dsh-g0-rc1-rebuild-kit-20261007.md)。这项是 Darwin arm64 本地构建来源记录，不是旧 WSL 全闭包认证或签名；下方相关未关闭项保留此区分。

当前可以确认的是：官方 rc2 Web CLI 通过显式 preset 声明加载双插件；候选移除后现有会话仍持有旧 revision；正常重启、进行中崩溃、原生回退和恢复原固定包均保留原生会话的已提交前缀。任意插件的同进程隔离仍不承诺，候选整体切换采用 `HOST_RESTART_REQUIRED`。登录内存需重建，profile 回退不回滚服务数据。

已关闭的目标子项：固定 runtime/四包的 WSL 隔离安装、当前候选 FAILED/EXECUTION_UNKNOWN 终态恢复、HTTP/headless 观察与 journal seq 5/6 接线，以及三组声明语料的 rc1↔rc2 四项矩阵。不能再将这些整体列为 NOT_RUN。仍未关闭：runtime/旧 rc1 编译来源信任，未覆盖事件组合及真实附件/委派执行，完整浏览器生命周期与 shell/tool timeout/result union，真实身份/业务准入、生产 activation/receive/reconcile/canary/rollback，以及 0.2.0 生命周期。本机 candidate/host journal 接线和同版本 SQLite 恢复已另行[留证](../hackathon/evidence/dsh-g0-host-journal-20261004.md)。T4/T6 不得把本次测试目录的原子指针写入扩大为生产原子回滚。

真实宿主复验（显式启动并清理自己拥有的临时进程；需要 Node 24 与已构建的固定上游，不安装依赖）：

```bash
node scripts/dsh-b0/pinned-host-acceptance.mjs \
  --upstream /absolute/unchanged-built-dsh-0.1.7-rc.2 \
  --output /absolute/new-private-evidence
```

默认从干净插件源码受控打包；复用已记录的同一包可传 `--packages-from /absolute/prior-host-evidence`，入口复核摘要后复制进新证据目录并安全解包。它不是来源签名验证器；不能把任意手写旧 receipt 当作 reviewed Release。输出包含 `evidence.json`、包、配置、脱敏进程日志与原生 synthetic 会话。完整宿主命令不自动加入 B0/CI；B0 只加入启动前的四项负测。

较早的 synthetic host / 静态检查命令（范围保持不变）：

```bash
node --test scripts/dsh-b0/host-feasibility.test.mjs
node --test scripts/dsh-b0/compatibility-matrix.test.mjs
node scripts/dsh-b0/host-feasibility.mjs --output /tmp/dsh-host-feasibility.json
node scripts/dsh-b0/compatibility-matrix.mjs --output /tmp/dsh-compatibility-matrix.json
```

CLI 默认只使用临时目录；`--output` 只写调用者指定的绝对路径，`--keep` 才保留夹具目录。夹具不联网、不读取 operator home、不启动 DSH/CRM、不连接杭州，也不访问真实 DuckDB。
