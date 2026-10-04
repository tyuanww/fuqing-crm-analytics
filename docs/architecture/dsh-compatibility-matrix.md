# DSH 兼容性矩阵（G0 / T2 / T17）

状态：**PARTIAL / release-blocking**。2026-10-04 已完成固定官方 Web CLI 的本机隔离验收；宿主、Agent Loop 和持久化使用真实 DSH，模型响应与会话内容为 synthetic。旧 synthetic host 夹具、此次真实宿主、杭州/WSL 现场证据分开记录。详见[本次证据](../hackathon/evidence/dsh-g0-pinned-host-20261004.md)。

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
| session/WAL durable prefix replay | `SUPPORTED`（原生 v4 压缩会话日志） | `DEFERRED` | pinned-host 正常重启与进行中崩溃两行 | 原生 flush/open/read/resume，前缀逐事件摘要一致；未测 torn frame、rc1→rc2 或业务数据库回滚 |
| profile / native composition reconcile | `SUPPORTED`（本机模块清单核对） | `DEFERRED` | pinned-host `loaded-composition-reconcile` | 包、配置和测试源码各记录 digest；完整 journal/native/远端回执接线仍属 T13 |
| client / slot 浏览器生命周期 | `NOT_RUN`（本轮） | `NOT_RUN`（advisory） | 浏览器 gate 单列 | 本轮 IPC 验证未经过浏览器 UI，不能代签 UI 热切换 |
| shell/tool timeout/result union | `NOT_RUN` | `NOT_RUN`（advisory） | 静态 source family 已命中；运行时 fixture 待补 | 不能用文本匹配或旧测试数代替本轮 pinned host 证据 |

## G0 结论与下一步

当前可以确认的是：官方 rc2 Web CLI 通过显式 preset 声明加载双插件；候选移除后现有会话仍持有旧 revision；正常重启、进行中崩溃、原生回退和恢复原固定包均保留原生会话的已提交前缀。任意插件的同进程隔离仍不承诺，候选整体切换采用 `HOST_RESTART_REQUIRED`。登录内存需重建，profile 回退不回滚服务数据。

仍未关闭：签名不可变 runtime 的目标平台冷安装、Windows/WSL、rc1→rc2 格式兼容、浏览器 slot/client、shell/tool timeout/result union、T3/T7 D15 保存/UNKNOWN 回执、T13 远端 journal 接线与生产原子激活、0.2.0 生命周期。本机 candidate/host journal 接线和同版本 SQLite 恢复已另行[留证](../hackathon/evidence/dsh-g0-host-journal-20261004.md)。T4/T6 不得把本次测试目录的原子指针写入扩大为生产原子回滚。

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
