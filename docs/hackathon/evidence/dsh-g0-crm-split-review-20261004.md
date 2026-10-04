# CRM/知识插件拆包：OCR delegate 审核与修复

2026-10-04，`codex/plugin-boundary-review`，基线 `ff7fc5fc0fa0295969fe789bc0bd7983a670c73a`。范围是该基线后的 workspace 增量；使用用户指定的 OCR delegate，由当前 Agent 审核并按 commit 前 `/review` 检查点补一次原生对抗审查。没有调用 OCR 云端模型、发布或切换生产。

## 覆盖与结论

OCR preview 共 **68 个路径：42 个默认可审、26 个默认排除**。主审覆盖 68/68，未跳过；排除项中的文档、生成物和删除路径已补审。生成物通过 authoring 源/摘要和离线生成器核验；4 个迁移文件与原路径逐字节一致。清单按 `(path,status)` 记录，移动的删除与新增分别计入。另审核本记录与修复增量。

只确认 1 类 P2：公开知识解释未绑定 Cordis owner 生命周期，卸载后迟到 HTTP 仍可返回成功；CRM HTTP/看板工具存在同类缺口。现已加入模块拥有的 AbortController、调用前/异步返回后二次检查，并把信号传给 provider。私有教材原有身份 lease 检查保留。新增 3 项回归先复现失败，修复后通过，独立复核未发现新缺口。

这只阻断旧模块回执，不撤销已完成的服务端 snapshot 写入；durable save/UNKNOWN 回放仍是 T3/T7 门禁。没有声称同进程隔离任意插件的崩溃、挂死或全局副作用。

## 本次实际验证

Node 24.19.0、pnpm 11.7.0，固定 DSH `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`。HTTP 跨服务测试使用已有完整后端 Python 3.14.4，仅公开 synthetic fixture 和本次拥有的 loopback 子进程。

| 命令/范围 | 实际结果 |
|---|---|
| 双方 `build.mjs <pinned-upstream> <plugin-kit/build-tools>` | 类型检查与构建 PASS |
| profile 与双方 package 测试 | 15 PASS；新目录真实落盘/拒覆盖、实际包加载、卸载取消和重加载 |
| login 与 knowledge-composition integration | 19 PASS；授权撤销、引用拦截与原生/其他域工具保留 |
| 两插件全部 `test/*.test.mjs` 与 Host/page/service-http/knowledge-composition integration | **166 PASS / 0 SKIP** |
| `node --test scripts/dsh-b0/plugin-isolation.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs scripts/release/plugin-boundary.test.mjs` | **16 PASS / 0 SKIP**；真实独立构建、pack、安全解包及 SDK 加载 |
| `generate_contract.py --check`、`plugin-boundaries.mjs --check` | PASS；11 包、607 源文件、29 跨包边、15 合同 |

各 suite 存在重叠，不相加为唯一用例数。本次修复未改 backend，未重跑历史全量 Python/B0；实现阶段的完整证据仍见[拆分记录](./dsh-g0-crm-plugin-split-20261004.md)。首次修复构建还发现一处漏包裹的查询 signal 名称，已修复并由正式构建和上述全部回归验证；失败日志保留。

当前隔离 fixture 包（不是 reviewed Release）摘要：

| 包 | SHA-256 |
|---|---|
| CRM `0.0.0-crm.1` | `4be76b81f374b4cf354d783bb11c49bbe09df468b8c398186184f7066a11c968` |
| knowledge `0.0.0-candidate.1` | `fb1b4d9e1e626d8ba858bb0ea849d022eed29a3e5385da5a884a0397be96d7a0` |

原始目录：`.context/checks/crm-split-review-20261004-170136/`。包含 OCR preview/rules/checklist/findings、修复前失败、双构建、`affected-full.log`、`isolation-boundary.log`、functional-only QA 捕获及核对记录；生成的 diff/link 检查与摘要随同保存。原生对抗审查的测试覆盖不冒充完整测试审查，主审负责测试与生成物核验。

## 下一步边界

本次代码没有未修复的已确认 P0/P1/P2，可做用户授权的本地 commit。下一阶段在独占 HOME/profile/session/WAL 与 loopback 端口运行固定官方宿主，验证加载、受控重启、会话恢复及回退。浏览器、WSL、真实模型/业务、杭州与远端 CI 本次 **NOT_RUN**。物理分仓仍遵循计划 G0/stop-go 顺序，不把本次 SDK 通过等同于宿主或数据回退通过。
