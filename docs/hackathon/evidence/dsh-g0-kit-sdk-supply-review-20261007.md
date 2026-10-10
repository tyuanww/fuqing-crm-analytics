# SDK 归档与供应链审修、解耦剩余项（2026-10-07）

本批从 `codex/plugin-boundary-review@d9770b9c` 的 13 项未提交修改开始，按用户要求采用 OCR delegate 审核、修复并本地提交。**本批代码可提交；SDK 分发仍 BLOCKED，产品仍 PARTIAL。** 本记录、STATUS 和任务勾选一起收录，提交 SHA 以 Git 为准；没有 push、发布、生产切换或真实数据访问。

## 审核范围与修复

OCR 仅负责选文件和解析规则，当前 Agent 完成审核，没有调用外部模型或委派另一名 reviewer。证据目录：`.context/checks/kit-sdk-review-fix-20261007/`。

- `ocr delegate preview --format json`：13 个文件，默认选中 4 个；8 份 Markdown 因扩展名、1 份 Python 测试因路径规则被排除。本轮补审全部 9 个排除项，没有将它们跳过。
- `ocr delegate rule --format json <13 paths>`：Python、JS、文档/default 三组规则；检查归档与实际输入、调用关系、契约、权限/资源边界、负测及文档证据。
- 原始范围 **13/13 reviewed、0 skipped、100%**；新增本记录另审，最终 **14/14**。逐文件 `(path,status)` 与摘要见 `coverage-final.json`。

| 级别 | 文件 / 问题 | 修复和验证 |
|---|---|---|
| Medium | `scripts/release/sdk-supply-chain.mjs`：80 次预算在发出第 81 次请求后才拒绝 | 将检查移到发送前，跨批次及独立分页合计最多发送 80 次 |
| Medium | 同文件：首批失败仍将全部身份计作 queried | 分离 requested/queried/completed/requests_sent；逐包记录 NOT_QUERIED、INCOMPLETE、COMPLETE，未知结果不冒充查完 |
| Medium | 同文件：非 2xx 响应没有取消 body | 拒绝前取消响应流，及时释放连接；错误内容仍不外泄 |

三项回归先运行原实现，得到 **20 PASS / 3 FAIL**（`regression-before.log`）；修复后通过。未发现本批其他需阻止本地提交的代码问题。供应链公告属于明确未关闭的分发条件，不能因代码审核通过而豁免。

## 本次实际验证

| 入口 | 本次结果 |
|---|---|
| Node 24：supply-chain、content-audit、closure、plugin-boundary、clean-build 五个测试文件 | **53 PASS / 0 SKIP**，`node-tests.log` |
| Python 3.14：`pytest --noconftest -W error::ResourceWarning -q scripts/dsh-b0/test_sdk_archive.py` | **27 PASS / 41 subtests PASS**，`archive-tests.log` |
| 当前归档解析器只读验证已生成的 63.75 MB 包 | **PASS，30540 条清单记录**，`archive-inspect-current.json`；不是本次重新 pack/receive |
| 当前扫描器在禁网沙箱实际生成离线清单 | **PARTIAL / advisories NOT_RUN / 退出 2**，`inventory-offline-r5.json` |
| 当前扫描器实际查询同一 SDK | **BLOCKED / 退出 2**；222 requested / queried / completed，5 requests_sent；仍为 10 个版本、42 条不同公告，`inventory-osv-r5.json` |
| `node --check scripts/dsh-b0/pipeline.mjs` | PASS；仅把 synthetic 测试加入清单，没有运行完整 pipeline |
| candidate/journal 保护 | 两份摘要与前批相同，`state-protection.json`；不更新旧候选状态 |

本次扫描器 SHA：`690034dea4f9a823ede52dc298b50bb44b0a29feb68a6aaf24f17eb81d947fba`。
本次在线报告 SHA：`33b1a5eafded6261e24c92238bda625c98fd9ba07205c806f739cb5f136a9f84`。
SDK closure 仍为 `7fa86cc9cc190f64735378e5a5bc2b1b74aece33aaa0f2b6b816c91492bcfdc6`。

上一实施阶段的真实打包/接收、10/10 消费者、离线沙箱与来源签名记录见[归档证据](dsh-g0-kit-sdk-compact-transport-20261007.md)和[供应链证据](dsh-g0-kit-sdk-supply-chain-20261007.md)。本次没有重复运行这些构建，不将其历史结果冒充本次通过。 提交前 `git diff --check` 与 17 个新增 Markdown 链接目标核对通过。首次正常 hook 把“输出路径尚不存在”的操作说明误判为代码缺失声明；保留 `commit.log`/`ground-truth-rejection.log`，将该句明确为“只允许全新 output”。随后 commit-msg 要求为较大变更补充具体说明，已补归档/扫描/验证范围；失败日志 `commit-final.log` 保留，未绕过 hooks。

## 按 pnpm → 官方 DSH 顺序核查修复候选

只下载、验签和限额读取公开包/固定 Git 对象，没有安装/执行下载程序，没有修改 pin、锁文件、固定上游或 SDK。

| 候选 | 实际发现 | 结论 |
|---|---|---|
| pnpm 11.11.0 | SRI/当前 npm key 验签与篡改负测通过；完整包内 27 份带版本清单中 tar 7.5.19、undici 6.27.0 合计命中 **7 条**公告 | **拒绝作为完整修复候选**；此前只查 pnpm 自身名称/版本无命中，不等于整个分发包安全 |
| pnpm 11.28.2 | 从当次 `latest-11` 元数据定位后固定精确版本；SRI/当前 key 验签与篡改负测通过；内置 tar 7.5.22、undici 6.28.1，27 个名称/版本全部查完，**无已知公告** | 可进入下一轮隔离兼容构建；不是升级完成，也未核验所有无清单的打包组件 |
| 官方 DSH 0.2.0-rc.2 / `639ed015397290b3745d163aafe02ffee4aa3f84` | 只读获取 package.json/pnpm-lock.yaml 并验证 Git blob SHA；仍声明 pnpm 11.7.0。六类选定依赖的 9 个锁定版本中 8 个命中，合计 **29 条**不同公告 | 单纯升级到该版本不能关闭依赖问题；这是锁文件静态筛查，不能当成已安装 runtime、全包扫描或生产可利用性结论 |

pnpm 11.28.2 tarball SHA：`30d4099fa03b9ba1124d81527808b1e4d8e719aeb0ddfe169426df3c4a038a5f`。来源、公共 key、27 项清单和 OSV 响应保存在 `pnpm-11.28.2/`；11.11.0 原失败候选证据保留。DSH 文件来源绑定见 `upstream-020-files.json`，查询见 `upstream-020-advisories.json`。早期错误 registry 路径返回 HTTP 错误，后改为官方 dist-tags 路径获取；没有用关闭 TLS 绕过。

不能在旧 DSH commit 内替换依赖后继续声称原 SHA。DSH 升级继续走官方独立候选，不能自动跟随 alpha/latest，也不把宿主升级变成业务插件每次提交的前置任务。

## 初衷核对

**方向保持，但“日常只维护插件”的最终体验尚未全部交付。**

| 原始目标 | 已实现的边界 / 当前距离 |
|---|---|
| 官方 DSH 作为可独立升级底座 | 未改上游；保留原生 Web、单一 Agent Loop、session/tool 合同。0.2 候选尚未完成运行兼容与切换 |
| CRM、知识库和 N 个插件各自维护 | workspace 中已拆包，CRM/知识各有插件与 HTTP 服务边界；查询/保存不再共享内部源码或 SQLite owner。物理仓库、远端独立 CI/发布尚待 stop/go |
| 插件单独更新，不重建 DSH/服务/数据 | 独立 pack、精确摘要、profile/journal 与已安装 kit 的 10 个消费者已具备历史实测；维护 SDK 的下载/扫描不加入每次插件 build/test |
| 出问题能够定位、停用和回退 | typed receipt、能力禁用和原生回退已有分层证据；同进程插件挂死不能承诺完全隔离，必要时 HOST_RESTART_REQUIRED；profile 回退不等于业务数据回滚 |
| 以后做内部 AI/插件平台与审核 | 保留长期目标；当前先用 allowlist/来源 manifest，不提前建设 catalog、团队审批和重复工具平台 |

这轮工作重在首次建立可搬移的开发依赖边界、补交付证据；这部分是平台维护成本，不能成为日常插件更新的固定成本。后续仍按三步作者入口：插件自己的 build/test → immutable candidate → profile 受控更新；宿主/SDK 另开升级周期。

## 剩余任务与执行顺序

以下沿用原 T1–T23，不新建重复计划，也不把历史 checkbox 的未勾选数当作完成比例。依据已核对的 STATUS、TODOS、兼容矩阵和 Git 历史。

| 顺序 | 原任务 | 还需完成的出口 |
|---|---|---|
| 1 | T5/T19/T15 供应链与开发 SDK | 用固定 pnpm 11.28.2 做隔离兼容/冻结锁/10 消费者复验；官方 DSH 升级候选另验依赖和合同。补完整 SBOM、17 项不透明内容、发布者/撤销、过期 key 信任结论；旧 SDK 保留 |
| 2 | T15 目标平台 | Linux/WSL/干净机器开发 SDK 冷准备、接收和 10 消费者；指标/知识服务目标平台安装。既有首购服务 WSL 验收不代签它们 |
| 3 | T2/T17/T20 宿主兼容 | 已声明 text/tool/rich WAL 语料与新来源 Mac/WSL 构建有证据；补 shell/tool timeout/result union、附件存储/渲染、真实 delegation 等未覆盖组合。0.2 运行兼容独立推进，历史 rc1 发布签名不可由新构建倒推 |
| 4 | T3/T7/T9/T14 用户链 | 生产身份/候选准入、真实模型/业务 UAT，以及 headed、移动端、键盘和无障碍。已完成 synthetic HTTP/headless 五场景不能代替这些项目；陈旧/过期阈值已移出待办 |
| 5 | T4/T6/T8/T10/T12/T13/T16/T18 | 生产形状故障与性能/10x、十次插件升级/restart/session SLI、RACI、canary/rollback、远端 activation/receive/reconcile；已有本地实现和观察不等于当前生产启用 |
| 6 | T15 物理分仓、ShineMage 命名和独立发布 | G0 stop/go 后按 brand → board-components → CRM/domain adapter → query/workbench 分仓；各仓 build/test/pack/CI，profile 仅组合版本，旧入口按明确兼容/退役条件处理 |

可独立推进的工作线是：SDK/工具链兼容、官方 DSH 合同候选、HTML 差异语义审查、UI 验收准备。共享 profile/schema/candidate/journal 和最终生产切换由单一 owner 顺序集成，不能并发覆盖。catalog/团队审核平台继续后置。

## 其他工作树与未提交成果

本次 `git worktree list` + 各目录 `git status --porcelain -z --untracked-files=all` 只读结果见 `worktrees-before-commit.json`：

| 工作树 | 本次实际状态 | 后续 |
|---|---:|---|
| 当前 plugin-boundary-review | 开始时 13 项；补本记录后 14 项 | 本批审修单独本地提交 |
| dsh-html-edit-chain | 43 个文件：34 modified、9 untracked | 先按既有盘点审 34 个语义差异文件；“34 modified”和“34 待语义审”是不同分类，不能混用 |
| fuqing-crm-analytics-public | 138 个文件；普通 status 折叠目录时是 123 条 | 前次逐 blob 对照表明已有当前/历史提交，不能再次整批提交；本次只复核状态数量，未重做逐文件语义审查 |
| 原始归档仓 | 3 条 untracked | 规划/skill 资产按其 owner 处理 |
| dsh-rc2-candidate | 4 个 modified | 历史验收 JSON/截图先核对所属版本 |

另有三条旧临时工作树登记，其目录存在但 Git 已不可用；保留登记和目录，没有 prune/delete。本轮没有清理或提交其他工作树，具体归属仍见[旧工作树盘点](dsh-g0-worktree-triage-20261007.md)。

未运行：完整 pipeline、新 SDK 构建/安装、WSL 新 SDK、浏览器/模型/真实业务 UAT、远端 CI、生产激活与回退。当前代码提交不宣告项目全部完成或达到 Release 条件。
