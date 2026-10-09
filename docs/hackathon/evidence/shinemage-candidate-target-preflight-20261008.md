# 当前候选目标准入离线准备（2026-10-08）

只准备当前候选的既定目标验收输入，不运行目标、业务服务或已通过的本机 terminal 测试。专属工作树 `/Users/hutou/.codex/worktrees/shinemage-candidate-admission/fuqing-crm-analytics` 保持 detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`。没有产品源码修改、profile 改写、门禁放宽或 journal 写入，没有 commit、push、PR、发布、部署或 SSH。

新材料位于本树 `.context/checks/candidate-target-preflight-20261008/`。候选仍为 `993daf31daa79137c22ce8d16c84b61892117386a9b7b8c5119fa0be62abefb0`、插件包 `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b`，源码 `bd647352d02402c679b04172855e40ec8f2d96a5`；正式 journal 保持 seq 3 / `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`，摘要 `018bf8a055af8e2315c7071d54aa73bc9ab604c2cb8c2288d1ff2cd2b947ef6c`。

## 已实际准备和静态核对

| 材料 | 本轮结果 |
|---|---|
| `source/input/` | 现有 `synthetic-source-http-target-input/v2`，43 个密封成员＋input.json；42 个原字节复用，只换 candidate.json。input 清单同步新 candidate digest 和该成员摘要。 |
| source input SHA-256 | `ccc21047f6525e9a07f4ed9406b178e06d1d9b1996815d73cc96089b06d0c69b` |
| `terminal/transfer/` | 现有 `synthetic-terminal-only` seal，349 个成员＋input-seal.json；345 个原字节复用，4 个候选相关成员变化。 |
| 4 个变化成员 | payload/candidate 下的 candidate.json、plugin-pack.json、原同名 tgz，以及 source/input/candidate.json。profile 原字节保持。 |
| terminal seal SHA-256 | `15637a1bc3c09b7a7ccbb8fb756e1783c0343732ea0f8574d588667add5f63c7` |
| `terminal/runner.py` | 既有固定 runner 原字节副本，SHA-256 `bc1b021a1b7a689e717f4fa77ae016283ff46fe0a934c60c9878aecdfb70b75f`，未执行。 |
| Linux runtime | 仅核对现有本机归档路径/大小/摘要 `a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4`；未执行、复制或下载。 |
| 浏览器输入 | 核对已有 510 成员清单，仅生成 `browser-input-inventory.json`。旧 platform receipt 标为需新观察；没有生成新 browser seal。 |

43 个 source 成员包含固定 query/save archive、来源 receipt、合成 JSON、6 个 helper/runner 和 28 个 Linux wheel 文件（query 15、save 13）。服务源码保持 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`，不混入较新查询冷安装包。terminal 材料仍复用原 CRM、query/save pair、控制器和 wheelhouse；只按密封清单复制固定源码/包/wheel/合成验收输入，没有复制旧运行会话、cookie、真实库、旧 target result 或平台回执。

本轮实际执行的检查：

- 固定 Python 3.14.4，以 `runpy` 读取现有 source probe，仅调用纯只读 `verify_inputs` 和 `verify_source_binding`，均通过。没有实例化 Drill，没有进入 run-local/run-wsl CLI。
- 固定 Node 24.19.0，调用现有 `readPreparedServiceCandidate`、`checkedSet`、`checkReviewedControllerSources`：候选与正式 journal、349 文件 seal、固定受审控制器通过；另核对两处 candidate 原字节、pack、runner、5 个当前 helper、2 个固定服务源码 fixture。
- 确认新 terminal 输入中没有 `payload/platform-receipt.json`、`payload/input-v5.json`、结果目录或数据库文件；正式 journal 字节保持。
- browser runner 只读核对：仅第一行所属目录规范化后，摘要符合当前验证器固定值 `7a74101a608953e6d8d37f46c019aff40a8370125dc6c9f263ec956fc06482d4`。没有运行旧脚本里嵌入的历史目标路径。

`prepare.py` / `prepare.log` 与 `verify-static.mjs` / `verify-static.log` 均 exit 0。以上是离线输入检查，不是 target/source/terminal/browser 验收通过，不累计为业务测试数。

## 待执行命令和不可填补的输入

当前有效命令交接为 `commands-not-run-r2.json`，保留初稿 `commands-not-run.json` 但不使用。其中记录完整本机材料路径、固定 runner、目标前提、argv 和后续主 Agent 验证入口。没有 SSH、地址、凭据、传输或自动启动命令。

目标必须实际符合 Linux x86_64 / WSL2、UID 65534、Python 3.14.4、现有固定 runtime 所需 Node 24 与工具环境，并核验 4335–4337 和自有目录归属。本轮不连接目标，不能宣称这些条件当前满足。原 runner 的 `.owned` 标记是固定协议字节 `synthetic-first-purchase-terminal/20261007\n`，不代表沿用旧运行目录；未来必须选择新的独占目录并获得目标操作授权。

提供两个**互斥**执行入口：source-only 或既有 combined terminal。combined runner 自己先跑 source HTTP，不能先独立跑完 source-only 又对同一结果目录运行 combined。组合执行前，将独立 source/input 中与 terminal/transfer 重叠的 15 个固定成员逐字节对照，再补 28 个 Linux wheel 与已封存 input.json，写对应 source-input-sha.txt；不要因枚举顺序不同重新生成清单摘要。

**input-v5 尚未生成。** 它依赖新候选真正执行得到的 source target receipt；固定 runner 的 source HTTP 子步骤成功后，才会复制该新回执为 platform-receipt 并按实际目标绝对路径派生 v5，然后执行 terminal 测试。旧 candidate 的 source 回执不能代替。

terminal 验证封套也未生成：其 `service_target_event` 必须引用主 Agent 在实际验核新 source 回执后追加的真实 seq/digest。browser v2 再依赖同候选的 terminal_host_event、同候选 platform receipt、Linux Chrome 151.0.7922.34 / Playwright 1.62.1、目标字体/库、结果归档及清理完成证据。旧 browser 的 510 个输入记录不是这些新观察的替代。本机 HTML 线的 Chrome 154 也不能替代这个固定目标 browser 合同。

## 保持的状态

离线 source/terminal 输入已准备并通过现有静态校验；目标执行、source target receipt、terminal/browser 目标准入仍 **NOT_RUN**。没有新建成功回执或目标父事件。正式 CI、真实模型/业务/生产未执行；SDK BLOCKED、release_ready=false；物理分仓与 DSH 升级继续受原 stop/go 约束。

[机器汇总](shinemage-candidate-target-preflight-validation-20261008.json)记录全部新材料身份、原始清单路径、静态检查结果和精确待执行边界。后续直接承接这些固定材料，无需重跑已通过的本机 1 项、整条 B0 或旧业务矩阵。
