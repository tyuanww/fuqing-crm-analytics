# ShineMage A/B/C 集成接续（2026-10-08）

承接 [A/B/C 集成交接](shinemage-abc-integration-20261008.md)，沿用既有任务顺序，没有重新规划。当前产品 **PARTIAL / release_ready=false**；本页只记录本次实际执行，旧通过数、NOT_RUN 和失败证据保持各自时间范围。

## 现场与保护

集成树 `/Users/hutou/.codex/worktrees/shinemage-abc-integration/fuqing-crm-analytics` 起始 HEAD 为 `e577f41b9247e3ac56052e21f84daed9dd32f163`，detached HEAD，工作树干净；本地引用 `codex/shinemage-abc-integration` 指向同一提交。先完整读取该树 AGENTS，再核对交接 JSON、架构、作者入口、验证入口及当前计划相关任务。没有 reset、stash、checkout 或改 Git 配置。

本次只在集成树保留本地改动；原主成果树 `plugin-boundary-review` 的 14 份未提交文件不参与提交或编辑。流水线前后记录其 status/文件摘要，以及固定上游 HEAD、lock、index 和 tracked status。DSH 固定 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，未改源码或重建上游。

## 固定环境与全量 B0

新环境位于集成树 `.context/checks/abc-resume-20261008/`：

- Node `/Users/hutou/homebrew/opt/node@24/bin/node`，24.19.0。
- Python 基础解释器 `/Users/hutou/homebrew/opt/python@3.14/bin/python3.14`，3.14.4；B0 单独新建 `b0-venv`，按 `scripts/dsh-b0/requirements.lock` 安装，不修改系统环境或其他服务 venv。
- 专属 `home/` 的 Corepack 缓存分别准备插件 pnpm 11.28.2、官方 pnpm 11.7.0。显式联网仅用于准备；使用 `/etc/ssl/cert.pem` 公共 CA，TLS/完整性/版本校验保持。`--global --cache-only` 运行在此私有 HOME 中，没有改变用户全局默认版本。
- 新 `build-tools/` 使用当前 kit 的 manifest、lock、workspace 和两份 patch 原字节，实际 frozen/ignore-scripts 安装 111 项依赖。已核对当时集成树的依赖链接状态；缺失的依赖通过显式链接消费该目录，既有 TypeScript 链接经 manifest 核对后保持。原主成果树依赖不安装、不改写。
- `pipeline --check` 仍禁止 Corepack 联网。入口会净化环境，不透传外层 `COREPACK_HOME`；本轮通过其保留的私有 HOME 定位固定缓存，不删除版本检查。

流水线的固定上游 Git 检查改为 `--no-optional-locks`、禁用 fsmonitor、忽略调用方全局/系统 Git 配置和 replacement objects，避免只读复用刷新上游 index 或运行本地 fsmonitor。没有改变上游 SHA/lock/dirty 拒绝条件。

实际完整调用由 `.context/checks/abc-resume-20261008/run-b0.py` 保存：

```sh
# 私有 HOME 与 PATH 由上述控制器给子进程显式设置。
B0_BUILD_UPSTREAM=/absolute/unchanged-built-rc2 \
node scripts/dsh-b0/pipeline.mjs --check \
  --python /absolute/abc-resume-20261008/b0-venv/bin/python
```

首轮 `b0-full-r1.log` **FAIL / exit 1**：Python 已完成 855 PASS、41 subtests、22 warnings；Node 大组 697 PASS / 2 FAIL / 3 SKIP，其中两个 FAIL 是独立 workbench 子项及其父测试的同一故障，不能计为两个产品缺陷。原因是编译客户端已使用浏览器标准 `AbortController`，VM 夹具遗漏注入该全局 API。

补充编译组件测试先实际复现 **2 PASS / 37 FAIL**；仅补齐六份夹具的 `AbortController`，不修改产品行为或放宽断言。修后 **46 PASS / 0 SKIP**；kit 独立十消费者 **20 PASS / 0 SKIP**。边界清单 **11 packages / 30 edges / 652 sources / 74 dynamic imports PASS**。

第二轮 `b0-full-r2.log` 继续跑到编译后组，实际 **64 PASS / 8 FAIL**，故整轮仍 FAIL。补齐共享 `tool-card-harness` 的 AbortController；loader-only 夹具声明带失败哨兵的 sessionQuery，两个实际技能/agent-loop 测试装配固定官方 SessionQuery。loader 注册断言同步当前源码明确声明的三个路由（save、board、deliveries），继续精确比对，不使用子集断言。完整编译后组曾 **85 PASS / 1 FAIL**（旧路由期望），修后 **86 PASS / 0 SKIP**。

上述修复涉及七份 VM 夹具和三份 loader 测试；边界生成器增加两条测试路由观察及更新行号，包/边数量与规则保持。组件/HTML/比赛组另实际 **745 PASS / 1 SKIP**。

第三轮 `b0-full-r3.log` 跑到最后干净重建，隔离编译后测试 **64 PASS / 5 FAIL**，整轮仍 FAIL：clean build 后的测试没有收到显式 build-tools；首购保存测试还直接读取主仓 backend 夹具。修复为 clean 测试显式接收同一固定 build-tools；沿用已有 test-only fixture loader/白名单/SHA/provenance 机制纳入两份 owner 原字节的首购合成预期数据，三个消费者不再向上搜索主仓。包内夹具不进入运行时 tarball，仓库侧 drift 测试逐字节核对当前 owner。kit 的独立 workbench 检查增加三个首购文件，实际十消费者加领域输入 **32 PASS / 0 SKIP**，workbench 独立跑 11 份文件；不是生产保存验收。

第四轮 `b0-full-r4.log` **完整本地 B0 PASS / exit 0 / 246.967 秒**，包括固定环境、合同/边界、Python、插件构建与隔离包、编译后测试、组件/HTML 组，以及最后 clean rebuild（`clean_removed=true`）。Python **855 PASS / 41 subtests / 22 warnings**；Node 每阶段结果保存于[机器记录](shinemage-abc-resume-validation-20261008.json)，含重跑，不能相加当作去重用例数。运行时产品逻辑及 DSH 未改。

默认流水线实际 **8 SKIP**：服务 pair/Python/wheelhouse 三项、query archive 冷安装一项、固定官方 shell/tool runtime 三项、standalone example 一项。服务三项本轮另以固定输入补跑成功（下节 28 PASS / 0 SKIP）；其余五项本轮未执行，历史通过不能替代。本地完整入口退出 0 不等于所有 opt-in 准入通过。

完整复跑之后，仅校正两条 provenance 的描述字段为实际 `analytics-first-purchase-path/v1`，未改原始夹具字节；领域输入专项再验 **12 PASS / 0 SKIP**，边界清单与 `git diff --check` 通过。原主成果树 14 份未提交文件、固定上游 HEAD/lock/index/status 及八项原交接证据摘要保持不变。

## 原始证据归档

集成树的新 `.context/archives/shinemage-abc-20261008/` 内已有三个本地归档，均以新文件创建，没有覆盖旧记录：

| 文件 | 内容 | 大小 | SHA-256 |
|---|---|---:|---|
| `raw-evidence.tar.gz` | A/B/C `.context/checks`、上一集成检查及原 workbench tarball；2,273 个普通文件 | 36,420,630 B | `945e495ba7e3e9979206a001f33666b7b4dcccab80d1295e88f3d462a388808c` |
| `fixed-inputs.tar.gz` | A 原插件/服务包/SDK receipt，后续固定服务 pair、candidate/journal、13 个 wheel；30 个文件 | 4,034,933 B | `6924e3c80902e1d11cdfe68c05e969365a773bdd44491d50bfcbee3376b07084` |
| `verification-logs.tar.gz` | 本轮四次 B0、专项失败/修复、执行脚本、保护摘要及上轮 document-release 超时原记录；60 个文件 | 264,278 B | `e2b977059276fd2ca0470566c2b857e21362f2913c1b318d287942ea0cae3117` |

每个归档成员均回读并逐个验 SHA-256，原文件内容及 mtime 前后保持。原 B workbench 包 `ecaa86ddd41a88e563ae411be08897aeadb3a2ef408c00377f2b905dfaecae42` 已从系统临时目录纳入归档，没有重打历史包。115 个链接仅在 manifest 记录目标，不追随到 SDK/依赖目录。`manifest.json`、`fixed-inputs-manifest.json` 与 `verification-logs-manifest.json` 提供原绝对路径到归档成员的映射；历史 JSON 内绝对路径原样保留，不能直接当作可搬迁执行输入。

这是当前工作树中的**本地原字节归档**，没有上传或完成异机备份；归档本身不赋予包发布信任。失败目录、截图、旧日志与原包均保留。

## 三项服务专项与正式候选关联

首次使用历史 `first-purchase-service-host-20261006/input.json`（v2）补输入，当前 guard **26 PASS / 2 FAIL / 0 SKIP**：旧配方摘要被 `SERVICE_ARTIFACT_RECIPE_DRIFT` 拒绝。未改旧回执或当前校验规则。

随后采用已有 `first-purchase-terminal-candidate-20261007/input-v4.json`，核对其 candidate/pair 摘要，按回执复制 13 个相同 wheel 到本次自有目录，明确 Python 3.14.4，运行：

```sh
B0_BUILD_UPSTREAM=/absolute/unchanged-built-rc2 \
B0_NATIVE_CRM_ARTIFACT_MANIFEST=/absolute/reviewed/input-v4.json \
B0_NATIVE_CRM_SERVICE_PYTHON=/absolute/python3.14 \
B0_NATIVE_CRM_SERVICE_WHEELHOUSE=/absolute/owned/service-wheels-r2 \
node --test --test-concurrency=1 scripts/dsh-b0/pinned-host-acceptance.test.mjs
```

实际 **28 PASS / 0 FAIL / 0 SKIP**，包含先前缺输入的三项：错误 pair 摘要、同名 wheel 篡改拒绝、真实离线冷安装/精确闭包/独占目录/bootstrap 篡改拒绝。原候选、pair、包与 wheel 摘要保持。范围为**历史固定服务包 + 当前保护测试**，不等于当前 HTML 包的服务/宿主组合验收，也没有新跑真实 HTTP/WSL/业务 UAT。

使用现有 `readState` 只读验证既有 journal 的六条摘要链，并核对 candidate digest、profile 与原包：

- candidate `a490457c3e867b3fb0d03fa8daeb04886f7b8657da0b1cf2fbadb30917e7887c`，插件来源 `3ffbd2a2e5a6c3179aecec09c63522ff1bb2d268`。
- journal 仍 seq 6，摘要 `b9ef9b1730abf2f9acfe0ba48473323e8aece9a4b8d85e79783932c9fe7f0149`，没有追加事件。
- 它绑定 workbench `c9770d…`；当前 B HTML 包是 `ecaa86…`，两者不匹配。历史服务/目标/终态/浏览器事件不能继承为当前包的正式验收。

A/B/C 正式 candidate/journal 关联仍 **NOT_LINKED**，正式 CI **NOT_RUN**。下一步须沿用现有候选与对应证据验证入口，将同一包、profile、服务 binding 和审核源码对齐；不把十场演练或 headed 汇总改造成旧候选的通过事件。

## 仍未关闭的既有门禁

- SDK 分发 **BLOCKED**、嵌入组成 **PARTIAL**、内联函数体 **NOT_VERIFIED**。7 个受影响版本/29 条公告仅沿用原记录，本轮没有重查。新准备的构建环境不等于供应链放行。
- 真实模型、真实业务身份/数据/UAT、当前包目标运行组合、生产保存、receive/activation/canary/回退等仍未验收。本轮没有读取真实业务 DuckDB、联系杭州或操作 6677、旧 CRM、WeKnora。
- B 六项外部 OCR 仍未完成；保留原人工及本机复核范围。上轮 document-release 外部 Claude 300 秒超时及两处路径修复仍属原记录，没有标为外审通过。
- 本地源码回归与正式 CI/journal、SDK 分发、真实业务验收分别记账。现有 stop/go 未通过，不推进物理分仓、各仓独立发布或 DSH 升级。
- 本轮没有 commit、push、PR、合并、发布或部署。新改动留在当前 detached 工作树；保存旧提交的分支引用保持。

## 后续五项准入

2026-10-08 继续的结果写在 [剩余准入](shinemage-abc-remaining-20261008.md)。shell/tool 三项已在新目录实际通过；历史查询包对当前配方冷安装失败并保留；standalone example 仍缺外部页面包。旧 journal 摘要未变，正式候选仍未关联。
