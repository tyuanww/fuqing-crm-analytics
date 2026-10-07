# 当前验证入口与工作流

适用于成果工作树的本地补丁；是否已集成，以该工作树 Git 状态和远端证据为准。授权见 [AGENTS](../../AGENTS.md)。当前施工与缺口看根 [STATUS.md](../../STATUS.md) 和 [TODOS 的 M1 核心交付](../hackathon/TODOS.md#m1-核心交付)。黑客松入口与 [治理实施记录](../hackathon/WORKFLOW-GOVERNANCE-2026-09-06.md) 是历史证据链，不是本轮任务卡。

## 单一检查定义

`scripts/ci/pre_push_path_class.py:verification_plan` 定义互相独立的 backend/B0/frontend/tooling/dependencies/deployment 维度，依赖审计细分为 python_dependencies/frontend_dependencies，另有 ground_truth 与 filterbuilder 触发轴；`scripts/ci/run_checks.py` 生成并执行命令。本地 pre-push、PR 的 Python/Vue/B0 检查共用它；PR CI 只通过 `lint.yml` 调用一次 `check-plan.yml`。`dsh-b0.yml` 仅 `workflow_dispatch` 做空机器 `--prepare`。B0 的本地与 CI 构建始终调用既有 `scripts/dsh-b0/pipeline.mjs`。`merge-gate` 在路径计划失败或已选 job 失败/取消时阻断；skip 不算失败。分支保护属于远端配置；2026-09-09 核验已包含 `b0-contract-build` 和 `merge-gate`，本轮不调整必需检查。

| 改动 | 选择与边界 |
|---|---|
| 普通文档 | 不跑业务全套；差异/引用由本次编辑验证 |
| AGENTS、自动化配置、运维/验证文档 | 入口和 hook 行为回归；CI 的 ground-truth 仍使用 committed 模式 |
| B0 插件/内核/合同 | 既有 B0 pipeline：离线合同、Python/Node、编译/装配与干净构建；含 BoardSpec 源测试。`backend/tests/test_board_spec_ask.py` 走合成 backend。无需旧 CRM 全套 |
| Vue | `npm run build`（含 vue-tsc）和 `test:unit`；品牌、App、FilterSync 共用接缝同时选择 B0 |
| 旧 CRM 实现、未知代码、ETL | 合成 backend 全套；不运行真实 ETL |
| 普通 backend 测试文件 | 选中文件；删除/改名后缺失目标扩大到全套 |
| 公共 conftest、测试支撑文件 | 合成 backend 全套；conftest 不再仅当普通单文件执行 |
| hooks/检查脚本 | Shell 语法、改动 Python 的 Ruff、实际入口/失败/选择回归；不再只检查无关 backend Ruff |
| Python 共用锁/配置 | backend + B0 与 Python 依赖审计；Vue 锁仅选择 Vue 审计，混合修改取并集 |
| Docker/部署配置 | backend + CI 容器 smoke；本地入口不启动容器 |
| CI workflow | 主 CI/共享/未知 workflow 与选择器、执行器走完整矩阵；B0 workflow 走 B0 + tooling；周检走 backend + tooling + ground-truth，旧 E2E 走 backend + Vue + tooling |

混合改动取检查集合并集。新分支比较 merge-base 至待推送 SHA，不能只看最后一个提交。`--no-renames` 保留改名前后的两个路径，避免代码移入文档目录后漏检。取差异失败保守扩大，不能按空文档变化放行。未知空范围走 backend 全套。

## GitHub Actions 精简（2026-09-09）

配置生效后，固定测试从每周 11 次降为 1 次：`nightly.yml` 改为每周一运行并吸收原周报的摘要和 90 天产物保留；删除重复的 `weekly-report.yml` 和备用 `pre-commit.yml`；旧登录 `e2e-smoke.yml` 仅手动。主 CI 与共享路径计划继续承担门禁，并按下文去重、细分审计；手动 `dsh-b0.yml`、分支必需检查和 Dependabot 配置不变。本地文件修改须合入远端默认分支后才改变 GitHub 调度。

CI 的 `lint` job 只安装从 `requirements-lock.txt` 读取的唯一 Ruff 精确版本，负责 backend Ruff 和 Agent 入口校验。`test` 使用共享 runner 的 `--only ci-python`：import 完整性只运行一次，保留相同测试目标及改动的非 backend Python lint。`ci-python` 依赖并列且必需的 `lint` job，不作为本地完整验收入口；默认和 `--only python` 仍自包含。`dependency-audit` 保留原 job 名称，以两个生态输出分别选择 Python/Node 安装及审计；混合改动两者都跑。

可选工作流按消费者收窄，仍验证其实际后端/Vue 依赖，不把所有 workflow 改动当成纯文档。主 CI、共享计划、未知 workflow 和 `pre_push_path_class.py` / `run_checks.py` 保守扩大到完整矩阵；修改这些公共入口时不能用周检的缩小范围代替完整选择。B0/后端重叠测试、main push 检查及固定上游的干净构建仍保留。

## Mac 开发与杭州生产的 Git 预检

活动仓库只允许公共远端 `tyuanww/fuqing-crm-analytics`。Mac 上创建 feature 分支、跑本地检查并通过 PR；杭州从 immutable Release 下载绑定批准 source SHA 的 artifact，不在服务器 `git pull`、编辑源码或跟踪浮动分支。

```bash
git remote get-url origin
git remote get-url --push origin
git status --short --branch
git branch --show-current
```

两条 remote URL 都应指向 `tyuanww/fuqing-crm-analytics`；发现旧账号、脏工作树或未批准的服务器分支时先停在预检。生产切换前，另核对杭州 installed manifest/source SHA、容器配置和健康检查，不能把 `git push` 当成部署完成。

## 本地命令

在目标仓库根目录执行。命令不安装依赖、不提交、不推送：

```bash
# 查看计划：changed-files.txt 每行一个仓库相对路径
python3 scripts/ci/run_checks.py --files-from changed-files.txt --plan-only
# 实施该检查集合
python3 scripts/ci/run_checks.py --files-from changed-files.txt
# 直接执行完整的日常合成后端 profile
python3 scripts/run_backend_tests_bounded.py
# 仅验证指定后端文件；同样使用隔离环境和共享排除列表
python3 scripts/run_backend_tests_bounded.py backend/tests/test_local_demo_access.py
```

包含 B0/Vue 的检查会先核对 Node 24，再运行耗时步骤；手工入口可用 `--node /absolute/node` 选择已有解释器。Git hook 继承调用 shell 的 PATH，需要在该次操作中选用已有 Node 24，不自动安装或修改全局版本。已验证 `package-manager-env.test.mjs` 的工具定位和拒绝行为，B0 `--check` 还需现有 zstd：从调用方 PATH 定位，验证版本后将其解析后的工具目录附加到精简环境，缺失/不可运行时提前返回 `B0_ZSTD_REQUIRED`；不继承其他环境变量、不自动安装。ruff 锁 `0.16.9`（以 `requirements-lock.txt` 为准），`pyproject.toml` 的 `lint.select` 为 `E4/E7/E9/F`（0.15 默认集）；不要用无 select 的 `ruff check .` 去套 0.16 的 413 条默认规则。

DSH 本地开发可直接用 `./scripts/dsh-dev/run.sh diagnose`、`check` 和 `probe`；包装器读取 `.nvmrc` 约定并自动选择 Node 24.19.0，不修改系统 Node。没有标准 Homebrew 路径时设置 `DSH_DEV_NODE=/absolute/node24`。

B0 独立入口：`node scripts/dsh-b0/pipeline.mjs --check --python /absolute/python3.14`；不带参数或传 `--help` 会打印用法，不启动任何服务。`--prepare` 会下载固定上游、先用锁文件完整预热 pnpm store，再安装构建依赖；`--audit` 只对已准备的 build-tools 闭包执行在线高危审计；二者属于明确动作，preflight 会把审计作为独立 fail-closed 阶段记录，网络异常时可单独重试。插件 `package.json` 的 `test` 是部分源测试便捷入口，`test:built` 也只有一个子集，均不能作为完整 B0 通过声明。原生查询资产需显式 `node scripts/dsh-b0/serve.mjs --python /absolute/python3.14 --native-query-assets`，不替代默认 `--native-query`。离线分析/驾驶舱合同用 `scripts/dsh-b0/analysis-contract.mjs` 与 `cockpit-contract.mjs`，不启动旧 CRM。旧 Vue 的依赖由 `frontend-vue3/package-lock.json` 管理，B0 的固定版本由 toolchain/自身锁管理，旧后端由 requirements-lock 管理；此轮未升级依赖。

已有固定版本工具链可通过环境变量 `B0_BUILD_UPSTREAM=/absolute/prepared/upstream` 供 `--check` 只读复用。仍强制验证上游 SHA、锁文件、SDK 与类型版本；不下载、不升级。该覆盖不允许用于 `--prepare`。

首购官方 Host 的显式浏览器演练继续使用 `backend/tests/test_analytics_first_purchase_official_host.py` 与 `B0_NATIVE_CRM_BROWSER_MODULE=/absolute/playwright/index.mjs`。默认选择系统 Chrome；若使用独有临时目录中的固定 Chrome for Testing，可增加 `B0_NATIVE_CRM_BROWSER_EXECUTABLE=/absolute/regular-executable`，路径必须绝对、可执行且不能是 symlink，失败不回落到其他浏览器。驱动固定 `zh-CN` locale，与中文原生按钮定位一致，并记录实际浏览器版本、平台与启动状态；不自动安装浏览器或系统库。只有目标实际运行的结果才计为目标浏览器证据，本机空白页预检不能替代业务五场景。目标机还需可用的中文字体；DOM 断言通过不等于中文字形可见，必须复核实际截图。临时字体/库的来源与摘要单独记录，不改业务包；本次目标结果见[WSL 浏览器证据](../hackathon/evidence/dsh-g0-first-purchase-target-browser-wsl-20261007.md)。

在线 `--prepare` / `--audit` 的 Git/pnpm 命令接受操作者显式传入的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY` 及小写形式。macOS 系统代理不会自动成为终端环境；只有确认自己的代理地址后才在当前命令导出。不会改全局网络配置，也不会把代理加入离线构建/测试和业务宿主环境；TLS/audit 绕过参数及业务凭据仍不透传。审计接口超时或返回非 JSON 时继续 fail-closed，修复连接后单独重跑 `--audit`，正式 preflight 使用新 tag 保留旧失败证据。实际故障与修复见[网络证据](../hackathon/evidence/dsh-g0-preflight-network-20261006.md)。

重复准备使用同一 helper 的 frozen fetch/install 参数：fetch 带 `--ignore-scripts`，install 显式关闭 `optimistic-repeat-install`，防止 pnpm 将仅有 virtual store 的目录误判为完整安装。不会禁用锁文件/完整性/供应链校验；构建用原生依赖仍只由已有 rebuild 清单处理。`package-manager-env.test.mjs` 在隔离本地包上连续运行两轮 fetch/install，验证可执行链接恢复、lock 字节不变与生命周期未执行。

独立 synthetic CRM/知识服务包：`CRM_SERVICE_PYTHON=/absolute/locked-python3.14 node --test --test-concurrency=1 scripts/crm-calibration/service-package.test.mjs`。共享后端 profile 的 `test_crm_service_packages.py` 调用同一实际 pack/解包/最小依赖 venv/双服务 HTTP 验证；因此全量后端验证也需要现有 Node 24 与 zstd。CI Python job 已声明这两项工具，不会从 B0 的最小 Python 锁冒充服务依赖。测试只操作自己创建的临时目录和进程，不表示完整 DSH、WSL 冷安装或真实数据验收；[服务包说明](./crm-service-packages.md)列出剩余门禁。

干净重建只复制固定白名单源码，不跟随符号链接，也不进入 `.git`、`.context`、`node_modules`、`dist` 或 `lib`。复制总量上限为 256 MiB、5 万文件和 32 层目录；临时目录带专属标记，正常失败会在 `finally` 清理，启动时还会回收超过 24 小时的已标记残留。构建被强制终止时不会保证即时删除，但不会再无边界复制依赖树。

2026-10-04：上面的服务包入口也覆盖首购分析的独立包，含 13 项精确依赖、HTTP 保存/重启回放、状态合同漂移和 FIFO 拒绝。共享 runner 仍调用同一测试文件；本机包验证不替代跨包版本配对或平台依赖冷安装，见[新包证据](../hackathon/evidence/dsh-g0-analysis-service-package-20261004.md)。

2026-10-05：另有显式 `node scripts/crm-calibration/service-package-compatibility.mjs` 入口，将两个固定源码 SHA 打成真实 archive，各自在新 venv 用离线 hash wheel 安装后执行 9 项 HTTP 兼容观测；参数与前置见[服务包说明](./crm-service-packages.md#精确旧新包的-opt-in-兼容验证)。这项需要已有历史 Git 对象和平台 wheelhouse，普通 CI 不自动下载/运行；本次 Darwin arm64 结果见[配对证据](../hackathon/evidence/dsh-g0-service-artifact-pair-20261005.md)，不代表 WSL 或生产激活。`backend/tests/test_service_artifact_compatibility.py` 的 CLI 负测纳入共享后端入口，覆盖浮动/相同版本、相对路径、重复参数、既有证据不覆盖与失败回执；没有历史对象时失败不能记成 PASS。

保存分析/驾驶舱的 finite mock 组件仍须独立通过类型检查、编译后 DOM 测试与干净重建。HTTP CONNECTED overlay 另有 `query-card-save`、`asset-overlay`、`native-query-assets-smoke` 与独立 analysis/cockpit HTTP 测试。`asset-overlay` 编译后 DOM（mock transport）覆盖 discard、过期预览、拖拽提交，以及撤销整板、从已保存分析加入、无板时创建、预览/保存 409 后重读；不是浏览器 E2E。默认查询入口不带资产能力。

服务包证据接线验证：`node --test --test-concurrency=1 scripts/release/plugin-service-evidence.test.mjs scripts/release/state-reconcile.test.mjs`，也由 `pnpm dsh test` 的 release suite 自动收集。使用 validator-only 小包夹具验证候选/journal 绑定、写锁内前置历史核对、实际安全解包、源码/清单/依赖漂移、特殊文件、错误脱敏与幂等；这些夹具不是实际服务运行证据。对已实际运行的双包调用 `pnpm dsh plugin verify-service` 的另行结果见[接线记录](../hackathon/evidence/dsh-g0-service-artifact-gate-20261005.md)；审核修复、本次 **206 PASS** 和实际 CLI 重试见[2026-10-05 审核记录](../hackathon/evidence/dsh-g0-service-artifact-gate-review-20261005.md)。

目标主机只读预检：`python scripts/run_backend_tests_bounded.py backend/tests/test_service_target_preflight.py`（固定 Python 3.14，PATH 使用 Node 24）。同一测试纳入共享后端矩阵，覆盖实际 CLI、只读审计钩子、WSL 形状的标签匹配/拒绝、Requires-Python、精确闭包和输入负测。WSL 事实注入只存在于测试子进程，不是生产参数；不是 WSL 实机验收。当前 **24 PASS** 与实际 Mac BLOCKED 结果见[证据](../hackathon/evidence/dsh-g0-service-target-preflight-20261006.md)。

随后 OCR 增加 WHEEL/dist-info/改名标签、active Requires-Dist 及 optional marker 的回归，当前同一入口 **35 PASS**；6 项负测先失败后通过，实际依赖包重验通过，见[审核证据](../hackathon/evidence/dsh-g0-service-target-preflight-review-20261006.md)。

2026-10-06 另行实际运行首购服务 WSL 合成验收 **14/14**：原双包、13 个固定 Linux wheel、两个新 venv、真实 HTTP 保存/权限/崩溃恢复/只读回退与未知 schema 拒绝，见[现场证据](../hackathon/evidence/dsh-g0-service-target-acceptance-20261006.md)。使用现有 helper 的有限验收编排，不新增生产安装入口或 CI 自动远端动作；合成状态目录必须保留 `0700`。该现场阶段不替代上面的单元测试，也未重跑历史 35/206 项套件；不代表 DSH 宿主、浏览器、真实身份/时间窗口或供应链通过。当时目标回执尚未接 candidate journal，后续接线见下一段。

WSL 目标回执接线：`node --test --test-concurrency=1 scripts/release/service-target-evidence.test.mjs`，已纳入 `pnpm dsh test` 自动发现。**37 PASS** 覆盖输入/日志/场景/清理篡改、只读回退声明、路径与特殊文件、幂等/恢复、错误脱敏；fixture 的 wheel/seed 是不可安装的解析器测试字节，不冒充 WSL 执行。固定 2026-10-06 runner 原字节只作审计输入，测试不执行它。同日完整 release suite **243 PASS / 0 SKIP**；另用已有真实现场回执执行本地 CLI，原 journal seq 4 和重试、108 文件不变通过，见[本次证据](../hackathon/evidence/dsh-g0-service-target-gate-20261006.md)。本步没有重新执行远端验收，生产 gate 继续 BLOCKED。

来源 HTTP 目标回执接线：`node --test scripts/release/source-target-evidence.test.mjs`（Node 24），由同一 `pnpm dsh test` 自动发现。当前 34 PASS；完整 release suite 278 PASS / 0 SKIP。核对当前 query/save 两包与候选源码关系、安全解包、固定 runner/helper、15/13 Linux 依赖、十项观测、重启/崩溃与独立存储握手；错误证据拒绝且不写 journal。夹具不运行实际服务或 WSL。已有实际杭州回执接入 journal seq 4 的结果、重试与证据边界见[本轮记录](../hackathon/evidence/dsh-g0-first-purchase-source-target-gate-20261007.md)，没有重跑目标服务。

首购目标浏览器回执门禁：`node --test scripts/release/browser-host-evidence.test.mjs`，由既有 release suite 自动发现。本轮新门禁 **34 PASS**，完整 `node --test scripts/release/*.test.mjs` **345 PASS / 0 SKIP**。复用现有 `plugin verify-host` 和 HTTP 的包/runtime 校验，通过独立 browser schema 绑定原候选 Host 事件；真实 WSL 回执接入 seq 6 的幂等/拒绝结果见[接线证据](../hackathon/evidence/dsh-g0-first-purchase-browser-gate-20261007.md)。单元夹具只验证解析与状态，命令不启动浏览器/WSL，不认证截图内容或签名，不放行生产。

Release 来源绑定：`node --test scripts/release/attestation-binding.test.mjs scripts/release/trust.test.mjs`；新增测试随 `node --test scripts/release/*.test.mjs` 自动运行。覆盖缺/错 source SHA、输出结构/subject、错误脱敏、验证期间包变化；临时 verifier 是调用边界夹具。2026-10-07 完整套件 434 PASS、真实 GitHub runtime 签名正负验证与四个叶子插件隔离构建 4/4 见[本轮证据](../hackathon/evidence/dsh-g0-attestation-binding-20261007.md)，不表示新候选或生产准入通过。

## 提交内容与历史审计

Excel SSOT 的提交入口使用 `--staged`：从 Git index 读取变更 view 文件全文，工作树中未暂存的修复不能掩盖错误；新增/重命名文件同样校验四条规则。无参数命令仍全量扫描 views。`--only-new` 为 `--staged` 的兼容别名，原先该参数仅打印文案但没有筛选。

2026-09-06 全仓审计仍报 32 条历史违规，结果留在 `.context/checks/closeout-excel-lint.log`。这些未触及页面的字段语义须另做专项核验；本次不改倍率、不把全仓审计记成通过。暂存区正反例覆盖四条规则、未暂存修复、历史文件、重命名与 Git 读取失败。

## 测试环境与排除的归属

- 日常 runner 使用私有临时 HOME/TMP、白名单环境、禁用 dotenv；清除父 hook 的 Git 定位变量和调用方密码/API key/pytest 参数。不连接调用方配置的 DuckDB。
- conftest 在收集前把业务库和缓存库指向本会话临时路径，不自动探测归档；真实库路径只能由明确授权的 `FQ_TEST_ARCHIVE_DB` 验收配置选择。日常 runner 不透传它。
- 认证 fixture 缓存每个 Python 进程的合成 cost-12 哈希，仅恢复可变状态；密码加载、强度和安全行为的专用测试保留真实 bcrypt。纯逻辑测试不会为 autouse fixture 导入应用或 ETL。
- 清理测试显式引用 tracker fixture，构造函数默认值、日志、marker 全部隔离。会话退出只回收自己创建的临时目录，不遍历或删除其他 pytest 会话。
- 默认串行，每 25 个测试文件开新进程；单组 RSS 上限 6 GB、时间上限 900 秒，超过上限以 90/91 退出并只停止自己创建的进程树。可以通过明确 CLI 参数调整，不自动并行。
- `not slow` 与七条 C 类排除仍由既有 `scripts/ci/pytest_c_class_deselects.txt` 统一。PR/每周后端回归均使用此日常 profile；慢测、归档数据、宿主安装状态、原生服务与真实设备验收不在其中，不能声称已由 CI 全部覆盖。
- 仅有分进程通过不足以证明跨模块状态隔离；公共 fixture/环境变动另做同进程的混合与反序回归。

## 自动入口与副作用清单

| 入口 | 触发/调用 | 写入或网络 | 当前阻断规则 |
|---|---|---|---|
| Git pre-commit | 暂存路径 → 对应检查器 | 只读差异/源码；历史大临时文件只告警 | 失败阻断，CHANGELOG 默认提示 |
| Git commit-msg | message → commit_msg_check | 只读提交描述/差异 | 非零阻断 |
| Git pre-push | refs → run_checks → LFS | 检查写本次产物；授权 push 时 LFS 使用 remote | 任一非零阻断，无自动复用 |
| Git post-merge | main/master → audit/hint | 追加本工作树审计日志 | 记录 merge，不串联清理或发布 |
| Claude PreToolUse | 本仓配置的文件/命令规则 | 无业务数据写入 | 模式防护，不替代授权判断 |
| Claude PostToolUse | 编辑 Python → 文件 Ruff | 本地静态检查 | 提示型，不替代 commit/push 门禁 |
| PR CI | 共用路径计划 → 各 job | CI 临时依赖、产物；按依赖/部署维度访问注册表或启动微型容器 | 启用 job 保持硬门禁，不 continue-on-error |
| Weekly Backend Health Check（nightly.yml） | 每周一 09:00 北京时间/手动 → bounded runner | CI 临时环境、90 天报告与实际 suite 摘要 | 失败非零；ground-truth 仍为历史 warning 模式 |
| E2E Smoke | 仅手动 → 旧 CRM 登录壳层 | CI 微型合成库与临时服务 | 失败非零；不覆盖 DSH 原生业务旅程 |
| framework pre-commit | 仅本地选装；独立 Actions 工作流已移除 | 工具缓存/安装 | 不默认安装或叠加 |
| branch_cleanup | 默认只读预览；apply + exact local | 仅明确 apply 才删指定本地分支；无远端写入 | dirty/protected/current/unmerged/occupied 拒绝；无强删回退 |
| ETL/backup/launchd/start-stack | 独立运维入口 | 可涉及业务库、进程和守护 | 不由治理或普通验证触发，保留归档授权边界 |

全局 Claude 配置、主仓旧版 hooks、历史运维文件没有随成果工作树补丁自动更新。本表列出当前生效关系，不以历史文件存在推断其已安装运行。

## 历史 HTML sidecar 本地校验

不启动 6677，不连接公网，不读取模型凭据。Node 24 与只读 `B0_BUILD_UPSTREAM` 下执行：

```bash
node --test --test-concurrency=1 \
  dsh-plugins/analytics-workbench/test/validation-rollout-browser-smoke.test.mjs \
  dsh-plugins/analytics-workbench/test/validation-rollout-performance.test.mjs \
  dsh-plugins/analytics-workbench/test/validation-rollout-eval.test.mjs
```

开关、指标、回滚和兼容性见 [free-page-validation-rollout.md](free-page-validation-rollout.md)。通过这三项不表示真实模型、Playwright 完整主链或现役挂载已完成；缺凭据时评估报告保持 `MISSING_CREDENTIAL`。产品仍 PARTIAL。

## 证据与交付

每次 backend runner 创建新的 `.context/checks/<time>/`，记录解释器、HEAD、Python 检查源码摘要、完整目标与命令、每组退出码/耗时/峰值 RSS、JUnit 与最终结果；失败也保留。摘要是可审查证据，不是绕过检查的授权或自动缓存键。`summarize_checks.py` 汇总 JUnit 子 suite，避免过去从空根属性得到 None。

当前规则只在 AGENTS；当前产品任务状态在 STATUS 与 TODOS；B0 执行清单保留历史；日期报告是不可回写的历史证据。本次治理记录单列本地补丁、旧成绩和未运行项目。Git/远端 CI/真实业务验收分别交付，不能因为本地检查通过标记产品完成。

## DSH 基座兼容的独立验证

驾驶舱 HTML 选区提示词、源码范围验证器、原生初始提示或评估器发生变化时，合并前另跑真实模型评估（需要用户授权模型调用）：

```sh
node scripts/dsh-dev/cockpit-ai-eval.mjs \
  --runtime /absolute/already-running-dsh-runtime \
  --upstream /absolute/pinned-dsh \
  --python /absolute/python3.14 \
  --output /absolute/new-private-eval-report.json
```

入口复用所指实例当前模型，不读取或复制模型密钥，不启动、重启或切换服务。它创建临时合成目录和唯一原生 preset，限制文件工具与路径；分别跑三项修改和两项越界拒绝，使用真实 `TASK.md`、原生双轮提示、`present`、产品收取/确认及独立连接读回。失败立即停止后续场景，只取消自己创建的会话；临时 preset 结束时清理，失败与候选证据保留在报告所指目录。当前费用未知时记 `null`，有用量则记录实际 token，不伪造费用。这个门禁不自动加入 CI，也不替代完整宿主浏览器或用户真实文件 UAT。纯合成的评估器回归为 `backend/tests/test_cockpit_ai_eval.py` 和 `scripts/dsh-dev/cockpit-ai-eval-guard.test.mjs`，不调用模型。

`DSH_DEV_UPSTREAM=/absolute/pinned/upstream node --test scripts/dsh-dev/*.test.mjs` 检查开发入口及 supervisor 失败清理，需 4325/4327 空闲；不停止现有监听。原生 UI-only 开关使用 `scripts/dsh-dev/cli.mjs start --plugin on|off`，与 B0 pipeline 分层。

B0 `serve.mjs --python /absolute/python3.14 --port-base 4335 --native-first-purchase` 使用 4335–4339；gateway 与 rpc 从同工作树 `current.json` 读取端口，三者均在隔离 worktree 执行。`B0_BUILD_UPSTREAM` 可只读复用固定 checkout。Loader 测试默认使用独立 4326，支持 `B0_PORT_BASE=4335` 选择 4336；端口忙直接失败，不停止用户演示。完整基座 Settings 的插件清单为只读，启停在启动配置层验证。


## 比赛集成候选复现（2026-09-09）

比赛 Python 验收随 backend 全套运行，包含 A9、本地 HTTP、C0 合同和诊断服务测试；
B0 pipeline 另检查 C0 离线产物以及比赛插件源测试和编译后 DOM。
两套 Python 锁不同，混合检查可设置 `FQ_B0_PYTHON=/absolute/b0-venv/bin/python`，
仅 B0 使用该解释器，其余检查仍使用 runner 的解释器；不安装或跳过检查。
Logo 使用当前 checkout 的 Git LFS 字节，可执行
`git lfs pull --include=frontend-vue3/src/assets/brand/shine-mage.png --exclude=`。
不再从相邻工作树读取 Logo。supervisor 单测只选空闲 4328/4329；已有监听不停止。
比赛 HTTP 演示仍为 synthetic；T13/T15/T16 不由单元测试替代。
离线 runtime deploy 在私有 staging 副本中运行，不改写 pinned checkout。HTTPS 直链使用准备阶段缓存的原始 tarball，并按固定锁文件的 SHA-512 integrity 校验；不把已安装目录重新打包冒充原始包。缓存缺失或摘要不符会阻断，离线阶段不重新解析依赖版本。

## 插件边界与独立构建

固定工具链由 `dsh-plugins/plugin-kit/toolchain.json` 和 `plugin-kit/build-tools/` 维护；不从相邻旧仓库发现依赖。`node scripts/dsh-b0/plugin-boundaries.mjs --check` 核对当前所有插件的 owner、直接 import、字面路由、合同与构建 DAG；新增源码耦合、循环、过期例外或清单漂移均阻断。已验证入口与边界负测，具体命令和结果见 [本轮审核](../hackathon/evidence/dsh-g0-decoupling-review-20261003.md)。边界说明见 [架构清单](../architecture/shinemage-plugin-boundaries.md)。

`plugin-kit.test.mjs` 实际打包并用 pnpm 离线安装 kit（新 HOME/store），逐个复制全部 10 个消费者，在没有相邻插件/kit 源码时构建与执行各自测试；SDK/build-tools 仍为显式固定输入。工作台 pin 测试走 kit 公开导出，图表组合断言由 `geometry-composition.test.mjs` 承担，B0 同步执行。当前结果及未执行层级见[全部消费者迁移证据](../hackathon/evidence/dsh-g0-kit-all-consumers-20261007.md)。

B0 `--check` 包含边界负测、`plugin-isolation.test.mjs` 和既有 workbench clean rebuild。CRM 也纳入独立源码构建/固定 SDK 组件注册测试/受控 pack，以及页面提供方组合与卸载测试。独立包测试只复制 kit 与单个 leaf 源码，复用相同锁文件的第三方依赖；在临时 Git 夹具中构建、执行现有生命周期单测并受控打包。临时提交不属于产品历史，不充当 reviewed release SHA。这些测试不启动真实 DSH、不证明热卸载或跨版本兼容。

B0 `--check` 先独立构建 board-components 并绑定受摘要约束的 tarball，再验证公开导出/类型、失真输入和几何语义。workbench clean rebuild 只含 workbench 源码与 kit，图表通过同一个 tarball 输入；不会复制 funnel/waterfall 源码。临时 Git 夹具内再执行受控 pack，记录 `fixture_only`，不冒充正式 reviewed source。`backend/tests/test_board_funnel.py` 与 `test_board_waterfall.py` 消费领域包拥有的同一套 JSON 标本，按受影响文件单独运行。

驾驶舱与 CRM 的 slot 形状由领域 JSON 生成各自的本地类型，B0 自动运行 `cockpit-slot-contract.mjs --check` 和对应消费者/漂移负测。独立消费者只携带自己的生成物；完整固定 SDK 类型检查和原生 SlotCore/编译后 UI 测试仍保留，不以纯类型通过替代宿主验收。

品牌内容主题由 `content-theme-contract.mjs --check` 和真实消费者测试核验；生成物纳入双方包内，无品牌插件运行时依赖。CRM 全部 Node/Host/UI 回归需要完整 backend 锁定 Python（`CRM_METRICS_PYTHON=/absolute/backend-python`），不能复用最小 B0 Python 冒称通过；Chrome 旅程单列，不纳入本轮合成 UI 结论。当前命令、范围及失败修复见 [CRM 端解耦证据](../hackathon/evidence/dsh-g0-crm-decoupling-20261003.md)。

2026-10-04 CRM 插件已改为显式 HTTP 服务配置；上述 Python 变量现在只供测试启动本次拥有的合成 API 进程，插件不再读取它。新增 `service-client.test.mjs` 的版本/超时/取消/重定向/响应大小/异常响应负测纳入 B0；`service-http.integration.mjs` 与 `tools.test.mjs` 在完整锁定 backend Python 下验证实际双 ASGI 服务。独立包测试额外对最终 tarball 安全解包，只提供固定 SDK 依赖后执行包级 ToolRuntime 验证。领域生成物漂移由 `test_crm_service_contracts.py` 与离线生成器检查；这些结果不证明完整原生 profile 或杭州已上线。详见 [服务边界](./crm-plugin-service-boundary.md) 与 [当前证据](../hackathon/evidence/dsh-g0-crm-service-boundary-20261004.md)。

同日插件拆包后，`scripts/crm-calibration/verify.py --node /absolute/node24 --upstream /absolute/pinned-dsh-checkout --build-tools /absolute/plugin-kit/build-tools` 由锁定 backend Python 执行，实际构建 CRM 与知识包，再跑两域工具、跨服务 HTTP、Host 和身份撤销组合测试。知识 schema/类型生成物归 `dsh-plugins/knowledge/src`，独立包回归与类型检查纳入 B0；`plugin-isolation.test.mjs` 只复制各自源码和 kit，分别 pack/安全解包/加载最终 tarball。页面组合仍由 B0 在提供方构建后验证。浏览器、完整 DSH profile、WSL/WAL 与真实服务 UAT 单列，详见[本轮拆分证据](../hackathon/evidence/dsh-g0-crm-plugin-split-20261004.md)。

固定官方宿主验收使用显式入口 `node scripts/dsh-b0/pinned-host-acceptance.mjs --upstream /absolute/unchanged-built-dsh-0.1.7-rc.2 --output /absolute/new-private-evidence`。命令自己拥有 HOME/profile/session、loopback 模型夹具、动态端口与所有子进程；会实际进行重启、SIGKILL 和同步挂死负测，结束仅回收自有实例。默认从干净插件源码 pack；`--packages-from /absolute/prior-host-evidence` 可复核并复用同一包。没有真实模型、业务数据或现役服务访问，不替代目标平台、完整 runtime 信任链与浏览器验收。[实际证据](../hackathon/evidence/dsh-g0-pinned-host-20261004.md)及[兼容矩阵](../architecture/dsh-compatibility-matrix.md)记录范围。

这个真实宿主入口不自动加入日常 B0；B0 只运行 `pinned-host-acceptance.test.mjs` 的四项启动前负测，传入已有 `B0_BUILD_UPSTREAM`，检查错误 pin、路径、拒覆盖和包篡改。单独跑该测试而未提供固定 checkout 时，两项依赖 exact checkout 的检查明确 SKIP，不能记为全通过。

CRM 首购的真实宿主 HTTP 链另有显式入口：先按已有 SDK 链接构建 workbench 与 CRM 插件，再在 Node24 / B0 Python3.14 环境运行 `B0_NATIVE_CRM_HOST_UPSTREAM=/absolute/unchanged-built-dsh-0.1.7-rc.2 python -m pytest --noconftest -q -W error::ResourceWarning backend/tests/test_analytics_first_purchase_official_host.py`。未设置该变量时明确 SKIP；不安装依赖、不修改上游，独占临时 4335/4336/4337，端口占用就失败，不能杀现有进程腾位置。它使用合成 CRM/model/JSON 和独立 SQLite，实际加载官方 Web CLI，经官方 `commands/execute` 准入，验证 Cookie/Origin、CRM 登录、原生 worker、保存/核对、精确取消和重启重新登录。这个默认模式只证明 HTTP 整链。

同一测试另提供显式 `B0_NATIVE_CRM_BROWSER_MODULE=/absolute/existing/playwright/index.mjs` 模式：使用已安装 Chrome、全新 headless context，实际点击官方输入框、CRM 登录与保存，刷新核对同一回执，再用不带业务工具的 preset 验证普通对话。这个模式和默认 HTTP 重启模式需分别运行，不把一个 PASS 当作两种都通过；未提供浏览器变量时浏览器保持 NOT_RUN，不自动安装浏览器/依赖或使用个人 profile。两种模式均回收自有实例，见[本次证据](../hackathon/evidence/dsh-g0-native-command-browser-20261006.md)；headless 不等于 headed、移动端、读屏或生产 UAT。如需保留 pytest 临时文件，`--basetemp` 只能传新的专用证据目录，不能复用旧证据目录。

同一入口可显式增加 `B0_NATIVE_CRM_ARTIFACT_MANIFEST=/absolute/owned/input.json`，安全解包并加载固定 workbench 候选与 CRM 包，保存使用真实 candidate digest。输入 schema/绝对路径/文件摘要见[包级验收](../hackathon/evidence/dsh-g0-first-purchase-artifact-host-20261006.md)；pytest 自动分配独立输出，沿用现有生产 peer link helper，结束后验证文件和 SDK 链接完整性。不提供变量仍走 workspace 模式；服务/查询内核仍为源码合成夹具，不代表服务 archive 已整链通过。自有 HTTP fixture 支持关闭连接后的端口复用，仍拒绝现有 live listener；不要杀其他进程腾端口。

该输入的 v2 schema 增加固定 `service_evidence_path` / `service_evidence_sha256`，同时要求显式 `B0_NATIVE_CRM_SERVICE_PYTHON` 和 `B0_NATIVE_CRM_SERVICE_WHEELHOUSE`。它复用原服务 verifier 和离线 hash 安装器，在独立 venv/进程运行保存服务，验证 Host 重放与服务重启，拒绝回落到源码服务；v1 保持上一段范围。具体[命令与范围](../hackathon/evidence/dsh-g0-first-purchase-service-host-20261007.md)已核对：查询内核/CRM/model 仍是源码合成夹具，不等于整套生产 runtime。`test_first_purchase_packed_service_support.py` 的启动拒绝/回收负测纳入 B0；真实宿主/服务包验收仍需 opt-in，同端口模式顺序运行。

该组合输入的 v3 schema 再增加绝对 `kernel_receipt_path` 与 `kernel_receipt_sha256`，并要求 `B0_NATIVE_CRM_KERNEL_WHEELHOUSE`。查询演练包由 `first-purchase-kernel-artifacts.mjs` 从完整固定 Git SHA/显式 allowlist 打包，复用现有安全解包、文件验证和离线安装器；不产生生产 profile 或 release journal。实际查询 API/dispatcher/worker 位于另一独立 venv/进程，私有 pipe 仅驱动原 dispatcher 和读取观测，不新增业务 HTTP 端点。输入错误拒绝回落，四种模式/重启/回收命令见[包级查询证据](../hackathon/evidence/dsh-g0-first-purchase-kernel-host-20261007.md)。日常 B0 纳入 `first-purchase-kernel-artifacts.test.mjs` 和 `test_first_purchase_packed_kernel_support.py` 的保护测试；实际冷安装 guard 另需 `B0_NATIVE_CRM_KERNEL_RECEIPT`/Python/wheelhouse。保存与查询仍共享同一合成 RunStore/SQLite，代码包隔离不等于存储服务解耦。

2026-10-07 增加源码模式 `B0_NATIVE_CRM_SOURCE_HTTP=1`：同一官方 Host 测试通过新的 `first-purchase-frozen-source/v1` 查询来源 API 保存结果，保存 factory 的 `run_store=None`。默认仍保留旧兼容路径；这个开关与 `B0_NATIVE_CRM_ARTIFACT_MANIFEST` 不能同时使用，旧固定包缺少新接口，不能悄悄回落或套用旧证据。此次新旧 HTTP 模式分别验证，浏览器/新双包/WSL 未重跑，见[源码边界证据](../hackathon/evidence/dsh-g0-first-purchase-source-http-20261007.md)。

`backend/tests/test_analytics_first_purchase_source_http.py` 纳入 B0：真实 loopback 检查来源/权限/版本/大小/超时/撤权与争锁；独立保存子进程有 SQLite audit guard，只允许打开其自有分析库，查询下线后新进程可核对/重放原回执。两套实际 allowlist 的隔离导入另验证不依赖邻接源码。`first-purchase-analysis-contract.mjs --check --python /absolute/python3.14` 同时离线检查分析 API/原插件类型与新 source OpenAPI；服务间合同不生成新浏览器 API。归档测试与这些源码测试不能替代 exact-SHA 双包、目标 runtime 或生产准入。

固定包来源模式使用 `dsh-first-purchase-host-artifacts/v4`（字段与 v3 相同），不设置工作树专用的 `B0_NATIVE_CRM_SOURCE_HTTP`。v4 对保存/查询包 source 合同摘要及实现入口做校验，再由实际进程走 HTTP；缺项不能回落到 v3 或工作树。保存进程使用专属目录，并在导入包前启用 SQLite audit guard；原 v3 本机适配模式仍可显式回归。新模式固定包、Chrome、查询离线重放和冷安装的实际命令/输入/边界见[本轮证据](../hackathon/evidence/dsh-g0-first-purchase-source-packages-20261007.md)，不继承旧 WSL 验收。

目标 immutable runtime 模式使用 `dsh-first-purchase-host-artifacts/v5`；输入字段和本次 WSL 命令/摘要见[目标宿主证据](../hackathon/evidence/dsh-g0-first-purchase-runtime-host-20261007.md)。同一个 `test_analytics_first_purchase_official_host.py` 入口读取 `B0_NATIVE_CRM_ARTIFACT_MANIFEST`、绝对 `B0_NATIVE_CRM_SERVICE_PYTHON`、两个 wheelhouse；**不设置** `B0_NATIVE_CRM_HOST_UPSTREAM` 或 `B0_NATIVE_CRM_SOURCE_HTTP`。v5 只接受固定 manifest/runtime 和匹配 candidate/source 的 Linux 依赖来源，安全解包与完整性检查后运行，绝不自动下载、编译或激活。Host 启动仍只在显式 opt-in 测试中发生。

`node --test scripts/dsh-b0/first-purchase-runtime-artifacts.test.mjs` 纳入 B0 pipeline，普通保护检查不启动 Host。覆盖 runtime pin/digest/大小、输入替换、FIFO/符号链接、完整安装树、错误平台 wheel 和混用 checkout；真实目标机结果不能由这些负测代替。原生查询恢复基线须在总结 turn 空闲后截取，不能把计算完成时的中间 journal 序号拿来比较恢复状态。

新来源的目标服务演练使用 `scripts/dsh-b0/first-purchase-source-target.probe.py run-wsl <absolute-sealed-input> <input-sha256>`（Python 3.14，`-I -B`）。输入目录含两包 archive/manifest、原来源 receipts、局部 candidate、固定 synthetic JSON、验收 helper 和目标平台各自 15/13 个 wheel；`input.json` 固定全量文件字节/摘要，验收不联网下载。只能在 WSL2、UID 65534 的专属临时目录运行，输出在其同级新建 `result`；4335 被占用则失败，不停止既有 owner。`run-local` 可用于预演，但输出 scope 不等于 WSL。

本次同一 `f9726f68` 包的实际杭州来源/同版本恢复 **10/10 PASS**，命令、摘要、失败修复及清理见[现场证据](../hackathon/evidence/dsh-g0-first-purchase-source-wsl-20261007.md)。该范围不启动 DSH/真实 CRM/模型，不关闭目标宿主或生产 gate；现场阶段回执接线当时未完成；现已由上文新的十项 schema 校验器接入原 journal seq 4，不能冒充旧十四项回执通过。

`pnpm dsh plugin verify-host --candidate /absolute/candidate.json --evidence /absolute/evidence.json --state-path /absolute/state.json` 核验已有 v2 宿主证据并幂等追加到原 candidate journal；该命令不运行宿主。`plugin-host-evidence.test.mjs` 纳入 release suite/B0，用明确的 verifier-only 夹具检查缺项、篡改、错误 scope/journal 和重试，不能将这些夹具视为真实宿主通过；真实命令的十项场景与 CLI 接线另行留证，见[本机接线与服务状态证据](../hackathon/evidence/dsh-g0-host-journal-20261004.md)。

同一 `plugin verify-host` 现在也接收 `dsh-runtime-host-evidence/v1` 封套：`inputs`、`controller`、`inventory`、`runtime_archive` 都是相对封套目录的 `{name, sha256}`，`service_target_event` 是原 journal 的 `{seq, digest}`。既有 WSL 主机输入与输出原字节保持不动；先核对原 source-HTTP 服务事件、固定控制器源码、完整文件清单/安全解包的插件安装摘要、runtime 流式摘要和 20 项 HTTP 记录，再以 `CANDIDATE_RUNTIME_HOST_OBSERVED` 幂等记账。旧 v2 分支不变。新分支不是浏览器、生产身份、签名或部署回退门禁。

定向入口：Node 24 `node --test scripts/release/runtime-host-evidence.test.mjs`，已由 `pnpm dsh test` 自动发现；当前 **33 PASS**，同轮完整 release suite **311 PASS / 0 SKIP**。夹具中的 runtime/wheel 和 PASS 日志明确是不可安装的校验器输入，不当作现场运行证据。真实已有杭州回执 CLI 接线、幂等重试及原输入保护见[本轮证据](../hackathon/evidence/dsh-g0-first-purchase-runtime-host-gate-20261007.md)。命令只读取封套相关文件、在本机临时目录安全解包插件并写显式 journal，不执行包内代码、不启动 Host 或连接杭州。

T3/T7 的 `backend/tests/test_analytics_first_purchase_save_recovery.py` 纳入现有 B0 Python 目标和常规 backend 回归：只用隔离合成 RunStore/SQLite，分别在提交前后 SIGKILL 自有子进程，通过新进程重放、冲突/权限拒绝、保留旧版本的 forward-fix 和不兼容 schema 拒绝验证存储边界。这仍不证明 D15 candidate/correlation 回执、业务数据迁移或跨版本服务回退；保存门禁继续关闭。

后续 `test_analytics_first_purchase_save_receipts.py` 补齐 G0 的保存身份、双键幂等和只读 `save-receipts/reconcile` 合同，并纳入 B0 Python 清单。此文件单独只证明存储回执；后续 `test_analytics_first_purchase_save_api.py` 覆盖版本化结果/freshness、候选准入、受控写 API、写锁后重验、保存来源原子性和新进程重放，并用真实 ASGI HTTP 响应执行插件严格 decoder。新文件已纳入 B0 Python 清单，见[准入接口](first-purchase-save-admission.md)和[实际证据](../hackathon/evidence/dsh-g0-save-admission-20261004.md)。生产策略和保存 UI 仍未启用。离线生成沿用 `first-purchase-analysis-contract.mjs`，同时产出 OpenAPI 与严格 TypeScript 合同检查；不启动旧 CRM。见[本轮回执证据](../hackathon/evidence/dsh-g0-save-receipt-20261004.md)。

跨版本状态使用显式入口 `python3.14 scripts/dsh-b0/service-save-compatibility.py --baseline <full-old-commit> --candidate <full-new-commit> --output /absolute/new-evidence`。它导出两个固定 Git tree 的受限源码和合成 JSON，以独立进程执行真实服务路由及小型 SQLite 恢复；不接受数据库路径，不联网、不切换分支、不启动监听端口。当前验证 pair 为 `56198c32` → `a50bd424`，其他 pair 必须重新验证。回执 `status=PASS` 是观测完成，旧可写服务仍 BLOCKED、`release_ready=false`；具体见[兼容窗口](../architecture/first-purchase-service-compatibility.md)与[证据](../hackathon/evidence/dsh-g0-service-save-compat-20261004.md)。此入口需要两份 Git 历史及显式运行，不自动加入无 Git 的 clean B0 测试。

兼容门禁回归由 `pnpm dsh test` 统一执行；定向入口为 `node --test scripts/release/service-compatibility.test.mjs scripts/release/plugin-candidate.test.mjs scripts/release/release.test.mjs scripts/release/promotion-retry.test.mjs`。这些测试使用自有临时目录，实际走 pack/receive/install/activate/rollback 与 journal，验证错误版本、旧 writer、篡改/缺证据、特殊文件、绑定丢失和幂等重试；验证器测试夹具不冒充真实兼容回执。真实源码对观测需另运行上段命令，本次结果见[门禁证据](../hackathon/evidence/dsh-g0-service-gate-20261004.md)。

### 插件开发 kit 验证

kit 自身的在线准备入口为 `node node_modules/@shine-mage/dsh-plugin-kit/prepare.mjs --destination /absolute/new-sdk-inputs`，可选 `--ca-file /absolute/public-ca-bundle.pem`。只接受新目录，固定官方 SHA/锁和工具版本；在独立 HOME/store 中安装并构建开发 SDK，不构建生产 runtime。该入口必须显式运行，不接入默认 doctor/check 或每次插件构建。`plugin-kit-prepare.test.mjs` 则只用隔离夹具验证环境、不覆盖、失败码、公共 CA 输入和中断/超时进程回收，已纳入 B0，不联网。

首次准备完成后，使用 `B0_BUILD_UPSTREAM=/absolute/new-sdk-inputs/upstream B0_BUILD_TOOLS=/absolute/new-sdk-inputs/build-tools node --test scripts/dsh-b0/plugin-kit.test.mjs` 验证实际安装 kit 的全部 10 个消费者。冷准备的真实记录另见[本轮证据](../hackathon/evidence/dsh-g0-kit-bootstrap-20261007.md)，包括首次证书失败及修复后的新目录、固定输入保护和仍未运行的目标平台层级。只有设置两个新路径才证明消费新闭包；不能沿用仓库 build-tools 冒充完整冷准备。

dev kit 输入预检在 Node 24 下显式运行 `node dsh-plugins/plugin-kit/check.mjs --upstream /absolute/pinned-rc2-checkout [--build-tools /absolute/identical-installed-build-tools]`。命令只读 source SHA/lock、工具版本和 SDK main/types 边界；不联网、不安装、不执行编译工具、不写插件链接。READY 仅表示本机 build inputs 可用，`release_ready=false`；缺项返回 BLOCKED/退出 2，不输出内部路径。实际构建继续调用同一 `bindToolchain` 的检查器，避免两套校验漂移。

`B0_BUILD_UPSTREAM=/absolute/pinned-rc2-checkout node --test scripts/dsh-b0/plugin-kit.test.mjs scripts/dsh-b0/clean-build.test.mjs scripts/dsh-b0/plugin-isolation.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs` 验证实际 kit 打包/安全解包/public export 导入、SDK 边界负测、解包后叶子构建及原隔离回归；`plugin-kit.test.mjs` 已纳入 B0 pipeline。未设置 `B0_BUILD_UPSTREAM` 时须将真实解包构建记为 NOT_RUN，不能以其余包测试通过代替。kit 仍是 private 本地源码包，不含 SDK/已安装依赖，也未完成新机器分发。

后续 `plugin-kit.test.mjs` 已增加实际 pnpm 离线安装到新 store、无相邻 kit 的 shine-brand 构建、错误 kit 版本拒绝和 workspace 适配器幂等/拒绝外部安装。改动 `packaged-dependencies.mjs` 时同时运行 `scripts/dsh-b0/package-inputs.test.mjs`，保留图表领域 lock 校验，并拒绝把开发 kit 当成运行时领域输入；改动构建入口时同步核对 B0 pipeline 和 `scripts/release/preflight.mjs`。适配器只在正式 build 阶段运行，doctor/preflight `--check` 不创建链接。

### 首购候选恢复验收

2026-10-07 的新 rc1 来源重建和同一恢复入口的三语料实测见[本轮证据](../hackathon/evidence/dsh-g0-rc1-rebuild-kit-20261007.md)：官方固定源码与锁、host/native 构建、输入清单及运行前后摘要已保留，本机 12 场景/30 冷进程通过。它不证明旧杭州编译闭包、历史签名或新输入的 WSL 结果；没有自动重建/部署入口，也不更改 rc2 pin。

Node 24 下以 `B0_BUILD_UPSTREAM=/absolute/pinned-rc2-checkout node --test scripts/dsh-b0/recovery-model-gate.test.mjs scripts/dsh-b0/session-recovery.test.mjs scripts/dsh-b0/mock-provider.test.mjs` 验证故障代理、输出保护和官方 JSONL 冷读写；两个新测试入口已纳入同一 B0 pipeline。跨版本入口为 `node scripts/dsh-b0/session-recovery.mjs /absolute/new-output /absolute/rc2-modules /absolute/rc1-modules`，必须提供新输出目录和实际编译模块目录；缺 rc1 返回 PARTIAL/退出 2，子进程失败返回 FAIL/退出 1，不默认联网、构建或读取现有会话。

实际首购 Host 通过原 `test_analytics_first_purchase_official_host.py` 加 `B0_NATIVE_CRM_RECOVERY=1` 显式运行，沿用 v5 不可变包输入，与 browser 模式互斥。该阶段 WSL 整链 1 PASS、持久化 4/4 和服务兼容 14/14 的范围与原始日志见[恢复证据](../hackathon/evidence/dsh-g0-first-purchase-recovery-wsl-20261007.md)。此模式锁定原候选的安全 UNKNOWN 行为，**不能当作业务任务终态恢复门禁**；恢复历史投影及活动名额释放的修复和新包验收见下段。该阶段未接入新的 release journal 事件。

工具持久化语料用同一 `session-recovery.mjs` 命令附加 `--corpus tool`，可省略 rc1 位置参数运行仅 rc2 部分（返回 PARTIAL/2）。默认 `--corpus text` 保留历史文本范围；tool 模式为显式 v2 回执，比较调用/结果/错误/meta 与官方恢复消息投影，未执行真实工具。本机四冷进程及负测见[工具语料证据](../hackathon/evidence/dsh-g0-session-tool-corpus-20261007.md)；后续杭州同一工具语料已实际完成四项跨版本矩阵、10 冷进程，见[目标机证据](../hackathon/evidence/dsh-g0-session-tool-wsl-20261007.md)。这不关闭媒体/委派等完整 corpus 或编译闭包来源证明。传输控制器需包含 `session-recovery-tool-corpus.mjs`；不能从本机结果推定目标或生产通过。

附件/委派元数据语料在同一入口使用 `--corpus rich`，为显式 v3 回执，第一轮 8 条事件、续写后 15 条（子会话 descriptor 只创建一次）。核对图片/文件引用、relay/notice 来源、会话头父级/delegationDepth、官方 descriptor/depth helper 和消息投影；附件存储/渲染、真实委派/模型仍 `NOT_RUN`。传输控制器须包含 `session-recovery-rich-corpus.mjs`，即使只运行默认 text/tool 也不能漏掉静态 import。相关冷恢复/篡改负测继续由上述 `session-recovery.test.mjs` 统一执行。

修复后终态门禁显式使用 `B0_NATIVE_CRM_RECOVERY=terminal`：要求 FAILED/EXECUTION_UNKNOWN、活动名额释放、相同请求不重复派发和原分析唯一；`=1` 仅保留旧包的历史复现。源码模式与固定包模式继续互斥。本机源码/官方 Host 的命令和失败日志见[投影修复证据](../hackathon/evidence/dsh-g0-native-journal-recovery-fix-20261007.md)。新候选 `a490457c…` 的本机固定包与杭州 WSL2 终态恢复均已实际通过，见[新候选证据](../hackathon/evidence/dsh-g0-first-purchase-terminal-candidate-20261007.md)。原始回执现已通过下述专用 verifier 接入 seq 5，服务目标 seq 4 与 Host 终态 seq 5 是两个独立事件，生产准入仍为 PARTIAL。

2026-10-07 新候选 `a490457c…` 已用原 v5/browser 入口在杭州完成 5/5 headless 场景、官方 Host 1 PASS；输入与执行记录见[当前候选浏览器证据](../hackathon/evidence/dsh-g0-first-purchase-current-browser-20261007.md)。原四包不重建；旧候选回执不继承。其新原始 observation 已通过显式 `dsh-browser-host-evidence/v2` 接入 `plugin verify-host`，关联终态 seq 5 并追加浏览器 seq 6；不向旧 v1 伪装父事件。封套增加 `terminal_host_event/collection/result_archive/completion_script`，核对固定来源、runner、原 archive 与 inventory、清理及逐项观测；定向入口 `node --test scripts/release/browser-host-v2.test.mjs` 已进入 release suite 与 B0 清单，详见[接线证据](../hackathon/evidence/dsh-g0-current-browser-gate-20261007.md)。字体配置原字节未取回，校验的是既定模板摘要与操作者记录；不证明供应链或真实生产准入。

同一 `plugin verify-host` 使用 `dsh-terminal-host-evidence/v1` 封套，只读取已封存的 `inputs/controller/inventory/runtime_archive` 相对路径与摘要，并要求同候选的 `service_target_event`。完整校验后追加 `CANDIDATE_TERMINAL_HOST_OBSERVED`；失败退出 2，重试不写文件。控制器固定已审查来源和历史 runner 字节，核对 HTTP 23 项、恢复 2 项、终态 run、会话前缀、原生回退和独立服务进程；不会执行包、安装依赖或联系杭州。定向命令为 `node --test scripts/release/terminal-host-evidence.test.mjs`，已进入 release suite 与 B0 清单；夹具只测校验器，不代表实际运行。原回执接线命令、一次真实 schema 适配失败及修复见[门禁证据](../hackathon/evidence/dsh-g0-first-purchase-terminal-gate-20261007.md)。保留 `release_ready=false`；原始事件正文/WAL 未在此命令中重新回放，哈希和断言属于未签名操作者观察。

独立插件更新的来源验收使用 `synthetic-source-http-target-input/v2` / `source-http-target-observation/v2`：`source_sha` 指向查询/保存服务源码，必须与 candidate 的 `service_compatibility.binding.source_sha`、两份服务归档一致；插件源码仍由 candidate/pack 自身核对，不能要求跟服务同一次提交。v1 保留历史同 SHA 约束，不能重标旧回执。两种输入都绑定完整 candidate digest、包摘要、固定 runner 和实际目标证据；新插件必须生成自己的 v2 目标回执，不能复制旧 PASS。`first-purchase-runtime-artifacts.test.mjs`、`source-target-evidence.test.mjs` 和 `test_first_purchase_source_target_probe.py` 覆盖该边界。
