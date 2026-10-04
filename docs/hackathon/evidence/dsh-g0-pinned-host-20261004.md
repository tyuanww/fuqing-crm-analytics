# 固定 DSH 宿主：加载、重启、原生会话与回退

2026-10-04，`codex/plugin-boundary-review`。此前 CRM/知识拆分及 OCR 修复已通过正常 hooks 本地提交为 `1737adc3cffeb9db5fbbcee222fb044526324d40`，未 push。本记录属于提交后的宿主验收增量；测试脚本与 profile 修复的实际源码摘要保存在 raw receipt，不能仅用该 commit 描述全部测试输入。

## 本次结论

固定 **DSH 0.1.7-rc.2 / `477b4f420553e8a52c2fbccc464d7561b239c443`** 的官方 Web CLI，在 macOS、Node 24.19.0 上完成 **10/10 场景**。没有改上游源码，插件从同一固定 tarball 安全解包，宿主运行原生 Agent Loop、preset registry 和 session persistence；只有模型响应与会话内容是本机合成输入。

发现并修复一个实际接线错误：旧生成器只输出 `preset/preset.yml` 与 `preset/agent.cordis.yml`，rc2 不扫描这些目录，真实宿主只有默认四个 preset，业务 preset 根本没有注册。固定上游 `packages/preset/agent-preset-registry/README.md` 明确描述声明注册；另把两文件实际放进自有 `$DSH_HOME/.agent-presets/crm-knowledge/` 做负测，仍无业务 preset。现在额外生成 `preset.patch.yml`，用官方 `@deepseek-ai/dsh-agent-preset` 声明逐个作用域插件；manifest 明确记录 loader 合同与入口。旧描述文件保留供检查，不再被文档当作可自动加载的入口。

实测移除 preset 声明后，新绑定被拒绝，但已有会话保留旧 revision/工具。同步挂死插件会阻塞同一宿主，需要外部终止并重启。因此整体切换采用 `HOST_RESTART_REQUIRED`；没有“随意卸载即可隔离任意插件”的承诺。

## 实际场景

| 场景 | 结果与断言 |
|---|---|
| `profile-load` | 官方 Web CLI 加载 CRM、知识的独立工具模块与 CRM Host 身份能力 |
| `loaded-composition-reconcile` | 原生 preset composition 与生成器声明的模块列表完全一致 |
| `domain-tools` | 两域工具均可见；未配知识服务时实际调用返回 `SERVICE_NOT_CONFIGURED` |
| `native-loop-and-durable-session` | 原生 followup/whenIdle 产生新回复；通过原生 persistence flush/open/read 读取落盘事件 |
| `controlled-restart-session-replay` | SIGTERM 正常退出，再启动相同宿主；旧事件前缀摘要不变且新增回复 |
| `retired-preset-retains-live-session` | 移除声明后新建绑定拒绝；已有会话工具仍在，必须按重启边界处理 |
| `inflight-crash-durable-prefix-replay` | 模型请求进行中强杀自有宿主；恢复后已提交前缀不变、原生 turn 收口、新回复成功 |
| `blocking-plugin-requires-process-restart` | 在自有子进程加载同步死循环插件；外部命令有界超时并回收该进程 |
| `native-fallback-restart` | 新宿主移除业务工具、保留 persona；原会话恢复、旧事件未变且仍能续聊 |
| `restore-previous-pinned-profile` | 恢复原固定双包组合，身份合同、实际模块及工具集合与首次一致，原会话继续新增回复 |

另实测对验收父命令发送 SIGTERM：退出码 2、receipt 为 `BLOCKED / PINNED_HOST_INTERRUPTED`，仅回收其拥有的宿主 PID，没有遗留实例。四项启动前负测检查错 Git pin、相对路径、已有输出目录和被篡改包；它们在解包/启动前拒绝，篡改留下 BLOCKED 回执。与 profile 的五项生成/拒绝测试共 **9 PASS / 0 SKIP**，不计入上面的十项真实宿主场景。

本次使用原生 `session.v4.jsonl.zstd`，不是自造 JSON WAL。测试配置的原子指针只存在于隔离目录；它不替代生产 release journal、可用性 SLO 或服务状态回退。

## 不可变插件与输入

| 包 | 源提交 | SHA-256 |
|---|---|---|
| CRM `0.0.0-crm.1` | `1737adc3` | `4be76b81f374b4cf354d783bb11c49bbe09df468b8c398186184f7066a11c968` |
| knowledge `0.0.0-candidate.1` | `1737adc3` | `fb1b4d9e1e626d8ba858bb0ea849d022eed29a3e5385da5a884a0397be96d7a0` |

固定 checkout 的官方 CLI 编译入口摘要为 `935e95d05f4dc70a8a013eea59da80028946b5c139e45c6351dcaf2810ca00a1`。这是已构建 checkout 的本机验收，不是签名、SBOM 或完整 runtime artifact 证明。上游 tracked source 未修改。

最终 raw receipt：`.context/checks/pinned-host-20261004-final-v2/evidence.json`；同目录保存两份复核后的 tarball、解包目录、声明配置、原生 synthetic 会话与脱敏日志。父命令中断负测：`.context/checks/pinned-host-20261004-interrupted/{evidence.json,interrupt-check.json}`。目录和文件按私有权限创建，不读取 operator HOME、模型密钥或真实数据库；CRM Host 地址也固定到本次 fixture，非模型路径返回 404。

宿主增量的 OCR delegate 覆盖 16/16 路径（6 个代码/测试、10 个补审文档），没有跳过。原生对抗复核确认一项 P2：首次和恢复时原先只记录身份值，缺 provider 也可能通过其他检查。已增加两处精确身份合同断言及恢复后的 composition 核对，再跑最终十项。此前 raw roster 中的身份值实际存在，但不能据此省略 fail-closed 门禁。本轮边界漂移、语法、差异检查及 116 个文档文件链接通过；未重跑历史全量 B0。

实际入口：

```sh
node scripts/dsh-b0/pinned-host-acceptance.mjs \
  --upstream /absolute/unchanged-built-dsh-0.1.7-rc.2 \
  --output /absolute/new-private-evidence \
  --packages-from /absolute/prior-host-evidence
B0_BUILD_UPSTREAM=/absolute/unchanged-built-dsh-0.1.7-rc.2 \
  node --test scripts/dsh-b0/pinned-host-acceptance.test.mjs \
  dsh-plugins/crm-knowledge/test/profile.test.mjs
```

不传 `--packages-from` 时，从干净插件源使用既有受控 pack 生成包；传入时重新核对大小、摘要、安全解包。复用包是为了让修复宿主接线时仍验证同一份已提交插件，不放宽 dirty-source 发布检查。所有检查均不自动 publish 或激活已有环境。

## 保留的失败与限制

- `legacy2`：真实宿主启动，但缺官方 preset 声明而拒绝验收；后续 `legacy-final` 在实际旧目录补齐描述文件后仍被拒，确认不是单纯遗漏复制文件。该负测为预期 BLOCKED，`negative-check.json` 核对缺 preset、CRM Host 已加载与 PID 已回收。
- `legacy` / `run1` / `run2`：分别发现测试读取 pack receipt 字段错误、dirty pack 正常被拒、原生 followup 需要带标识的消息对象。修正 harness 并使用官方 `createUserMessage`，没有改上游或绕过 dirty 检查。
- `run3` 只覆盖结束后进程退出；`run4` 进一步注入在途故障时，恢复后的原提问仍被测试模型故意挂起，超时。修正模型故障恢复阶段后，`run5`/`run6` 与最终运行通过。`final-v2` 在复核补齐身份断言后再跑十项；历史失败不计为当前通过。

仍为 **NOT_RUN/PARTIAL**：真实浏览器/client slot、真实模型/业务 UAT、Windows/WSL 冷安装、rc1→rc2 和 torn-frame 恢复、0.2.0、完整 runtime 信任链、生产原子激活、T13 远端 journal/reconcile、T3/T7 durable save/UNKNOWN 回放。profile 回退不撤销已写服务数据；重启后 CRM 登录内存需重建。

## 物理分仓前置

T2/T17 的本机精确宿主子项现在有真实证据，整体保留 PARTIAL。按已批准计划，下一步关闭 T3/T7 服务状态矩阵并把本次 host receipt 接到 T13/T21，再通过候选供应链、canary 与 stop/go 才迁移 authoritative 仓库。静态分仓清单继续由[机器边界](../../architecture/shinemage-plugin-boundaries.md)唯一维护。

本轮预查还确认：leaf 的构建入口仍以 `../plugin-kit/toolchain.mjs` 获取 dev kit，kit 当前为 private workspace 包。现有隔离测试复制的是“单个 leaf + kit”；这证明无兄弟业务源码依赖，不等于已支持任意独立仓根目录。正式迁移前须把 kit 变成固定版本的开发依赖并验证仓库根目录构建，不复制一份工具链到每个插件，不因此增加运行时业务耦合。尚未创建、移动或删除物理仓库。

同日后续的 candidate↔host journal 接线、v2 回执以及 SQLite 丢失响应/崩溃恢复子项见[后续证据](./dsh-g0-host-journal-20261004.md)；本页保留本阶段原始 v1 记录和实际失败，不用后续结果覆盖它们。
