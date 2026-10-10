# ShineMage 维护、清理与升级手册

这份文档给维护者、插件作者和使用者一条共同的路径：主仓库负责把固定版本的 DeepSeek Harness（DSH）装配成可验收的平台，业务能力由独立插件和服务仓库维护。它也规定本机证据、Git worktree、分支和远程仓库怎样留存，避免为了“整洁”误删仍可复核的材料。

当前固定基线是 DSH `0.1.7-rc.2`、上游 SHA `477b4f420553e8a52c2fbccc464d7561b239c443`、产品 VERSION `0.20.0.0`。这些值是本次记录的事实，不表示以后永远不升级。

## 先看哪一个仓库

| 对象 | 负责什么 | 不负责什么 |
|---|---|---|
| `fuqing-crm-analytics` | DSH pin、host/profile、跨插件合同、集成 CI、候选与验收账本、升级适配 | 不再把 CRM、知识、看板业务源码当作唯一维护源；历史 `dsh-plugins/` 在迁移期保留 |
| 一个独立插件仓 | 一个业务域的源码、版本、测试、构建输入、包摘要和自己的 CI | 不携带 DSH runtime、兄弟插件源码或真实业务数据库 |
| CRM/知识服务仓 | API、权限、领域 schema、持久化和兼容窗口 | 不启动 DSH，不读取兄弟服务的实现或生产数据 |
| profile / 部署输入 | 固定插件选择清单、DSH pin、候选中的来源/pack digest、回执和回退指针 | 不把工作树路径、现场编译结果或浮动 `latest` 当作身份 |

因此，`fuqing-crm-analytics` 可以理解为“DSH 集成仓”，但不是只放一个空的 DSH 壳。它还要保存平台级合同、组合验证和升级记录。插件仓是业务变化的主要落点；主仓只在插件合同、profile 或 DSH 版本变化时同步。

## 日常更新：只改一个插件

这是默认路径。它不重建 DSH、不迁移数据库，也不重复 SDK 全量审计。

1. 从目标插件已审查的分支和完整 SHA 创建更新分支，确认对应 CI、版本和 peer；PR #1 未合并时，默认 `main` 不能代替该产品基线。具体核验命令见[插件更新指南](./shinemage-plugin-update.md)。
2. 按该仓选择构建路径：shine-brand 默认使用自身 `npm-author` 锁定的公开编译工具，不需要上游 checkout 或 SDK；其他八仓的固定 SDK 路径使用已审查的 kit、上游 checkout、build-tools 和领域输入。固定输入路径使用绝对路径，缺输入就停止；不从相邻 worktree 或 `.context` 回退。
3. 在插件仓运行自己的 frozen install、build、测试、包内容检查和边界负测。记录包摘要、输入摘要、测试范围和未执行项。
4. 分开记录 CI/内容校验回执与实际保留的 content pack。shine-brand 的 `verify-pack.mjs` 校验后删除临时 tarball，不能把日志当作已留存的包；需要交付时另走保留产物的步骤。普通 content pack 不自动等于 `dsh-plugin-pack/v1` 或 `dsh-plugin-candidate/v1`。
5. 在主仓只有组合选择发生变化时才更新 profile；插件版本/字节变化由正式 pack/candidate 回执记录，并同步兼容记录，再跑受影响的组合合同。插件失败时应显示 `disabled`/`NOT_AVAILABLE` 和原因，并保留 DSH 原生回退。
6. 只有在适用的 host、服务、目标平台和发布门禁都有新证据时，才进入 candidate、journal、receive 或 activate。没有这些输入就保持 `NOT_RUN`，不借用旧包的 PASS。

插件仓的测试通过只说明该插件在声明的输入上通过。它不证明真实模型、真实业务、杭州生产或任意 DSH 版本兼容。

## DSH 升级：单独的一条变更轴

DSH 升级不能简化为“从官网 `npm install latest` 后插入”。正确做法是把 DSH 版本和插件版本当成两个独立轴：

```text
固定 DSH SHA ──┬── 插件 A 版本
               ├── 插件 B 版本
               └── CRM/知识服务合同版本
```

升级顺序如下：

1. 从官方来源选择一个明确的 DSH release/commit，保存版本、SHA、来源和锁文件。不要跟随浮动分支或 `latest`。
2. 在主仓新 candidate 分支/隔离目录准备新的 host、SDK、runtime 和 build-tools 输入；保留旧输入可回退。
3. 先跑 host API、slot、生命周期、保存、权限、回退和插件合同兼容矩阵。发现合同变化时，分别在受影响插件仓修复并发布新版本。
4. 在主仓更新 DSH pin、profile 和验证入口，重新生成只属于这次组合的 candidate/journal。旧 candidate、旧 WSL/浏览器回执不继承。
5. 经过 CI、目标平台和必要的人工/UAT 门禁后，才允许 receive/activate。没有授权不部署、不切生产。

这样，普通插件更新仍然是轻量的插件更新；只有 DSH 本身升级时，才走完整的宿主升级门禁。

## 文档怎样留存

文档按用途分三层，避免把历史数字误当成当前状态：

- `STATUS.md`、`README.md` 和 `docs/README.md` 是当前入口，以当前事实、入口和未关闭边界为主；必要的带日期历史摘要必须明确标为历史并链接证据。
- `docs/architecture/`、`docs/operating/` 是长期规则和操作方法，随流程变化更新；需要解释流程来源时可以保留短的带日期记录，但长日志和原始结果放在证据层。
- `docs/hackathon/evidence/`、`.context/` 和任务目录是证据。失败日志、原始 JSON、截图和旧回执保留原样；新结果用新文件名，不覆盖旧证据。

历史阶段的 `NOT_RUN`、旧 PASS 数和旧分支路径只在带日期的证据上下文中有效。当前文档引用证据时要写清 SHA、包摘要、范围和未执行项。路径即将清理时，先把证据目录、manifest、摘要和恢复说明登记到归档索引，再移动或打包。

## 本机清理顺序

清理分为“可自动做”和“必须确认”两类。当前盘查（2026-10-10）已完成 11 个历史候选的压缩归档、SHA-256 复核、worktree 移除和源目录清理；归档包与清单保留。三个已合并远程候选分支也已按单独授权删除，T14、RC2、公共 main、SDK/证据归档和 `security-audit-skill/` 保持不动。PR #118 随后已合并，当前远端主线为 `4859d136`；本次事实同步见[post-merge r4](../hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)。

### 可以先做的低风险步骤

1. 在主仓执行 `git worktree prune --dry-run --verbose`，只确认已不存在的 worktree 元数据。
2. 对确认不存在的路径执行 `git worktree prune`。本轮已清理 3 条失效登记；这一步只改 `.git/worktrees` 元数据，不删除证据目录。
3. 生成本地历史清单，至少记录 `path`、`HEAD`、分支、porcelain 状态、`.context` 大小、证据文档和恢复方式。
4. `security-audit-skill/` 是未跟踪的独立 Git 仓。它的 remote、HEAD 和工作区摘要已核对，但移动或删除需要单独的明确授权，不作为默认清理动作，也不能加入主仓提交。

### 需要归档后再处理的 worktree

候选准则是：工作区干净、证据已在主仓文档中登记、没有仍在运行的任务、归档包可解开并校验。归档可以是带 SHA-256 的 tar 包或保留原目录；归档完成前不要 `git worktree remove`。

当前必须保留的例子包括：

- `shinemage-t14-html-ocr`：仍有未提交源码/测试/证据，不能删除。
- `shinemage-candidate-admission`、`shinemage-html-remaining`、`shinemage-sdk-evidence`：体量大但含原始证据，先做 manifest 和压缩归档。
- `shinemage-probe-source-decouple-20261009/repo` 及其任务根：包含 r1/r2 补丁和交接文档，不能按“已合并”推断可删。
- `fuqing-crm-analytics-dsh-rc2` 和 `fuqing-crm-analytics-public`：各自有独立分支和历史，先单独确认用途，不纳入 ShineMage 清理。

旧的干净执行树可以在证据归档并确认无后续任务后移除；本次已保存 branch→tip→证据目录映射。删除本地分支引用仍需单独确认，归档包是恢复路径，避免悬空 SHA。

### 远程仓整理

- 保留受保护的 `main`、仍在使用的 Dependabot 分支和未完成的候选/修复分支。
- PR #111–#118 已合并到 `main`；当前完整 SHA 和合并时间见[最新 post-merge 远端事实](../hackathon/evidence/shinemage-remote-repository-postmerge-r4-20261011.md)。`codex/shinemage-final`、`codex/docs-maintenance-closeout` 和 `codex/docs-postmerge-20261010` 已完成各自使命，归档和恢复路径核对后已删除远程引用；本地旧分支与 stale `origin/*` tracking 引用仍单独整理。
- `dsh-rc2-candidate`、`fix-dependabot-fastapi141` 等旧分支先做用途核对，不因为 PR 关闭就直接删除。
- Release 和 tag 是发布审计历史，不随分支清理删除。清理前用 GitHub 页面和相关 release 文档核对当前版本，不能用分支名推断发布状态。
- 独立插件远程仓及其 CI 继续各自维护，九仓当前均有开放 PR #1、最近 fixed-inputs CI 成功且暂无 GitHub Release；详见[远程仓收口复核](../hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)。不把它们合并回主仓，也不把普通 content pack 写成正式 DSH candidate。

合并后同步当前事实时，至少检查这份清单：`STATUS.md` 的 Git 行和施工计划、README 顶部收口段、`docs/README.md` 横幅、`HANDOVER.md` 头部和入口快照日期、`docs/hackathon/TODOS.md` 当前接续、`docs/architecture/shinemage-plugin-platform.md` 首段、本手册远程仓段，以及带日期的远端证据 JSON/Markdown。先运行 `git fetch origin main`，再运行 `gh api repos/tyuanww/fuqing-crm-analytics/git/ref/heads/main` 和 `gh run list --repo tyuanww/fuqing-crm-analytics --branch main`，把远端 `main` SHA、合并 PR 和最新 CI run 与文档逐项对齐；本地分支用 `git merge-base origin/main HEAD` 判断差异，不能把旧 feature 分支的 HEAD 当成已合并主线。完整的主仓 `main` SHA 只留在证据层，STATUS 放短 SHA，其他入口引用 STATUS，避免下一次合并后出现多份旧值；固定 DSH pin 可以在入口中重复，当前主线 SHA 与生产状态仍以 STATUS/证据为准；证据 JSON/Markdown 必须随本次文档提交。`docs/hackathon/README.md` 和 `docs/hackathon/PRODUCT-READINESS-2026-09-10.md` 是历史档案，只有其当前段落发生变化时才加入同一轮事实同步；`docs/operating/maintainer-map.md` 与 `docs/operating/verification.md` 是当前运行入口，目录、端口或验证矩阵变化时必须同轮同步。

带日期的远端证据使用 `<topic>-YYYYMMDD.md` 与 `.json` 成对保存；JSON 顶层至少保留 `schema`、`observed_at`、`main_head` 和 `ci`，失败、超时和 `NOT_RUN` 也按原事实记录，不用新结果覆盖旧快照。

任何删除动作都应先输出清单、目标、可恢复方式和影响，再执行。生产目录、真实 DuckDB、杭州/6677、旧 CRM、WeKnora 和含凭据的目录不属于这套清理范围。

## 开发者体验检查结果

2026-10-11 对公开 GitHub 首页、本地 CLI 和 branches API 做了只读复核：PR #118 已合并，当前主线为 `4859d136`，合并后的 `main` CI run `38066459376` 通过；三个已合并候选远程分支已删除，剩余 stale `origin/*` tracking 引用和已归档本地分支仍需单独处理。九个独立插件仓的最新 PR/CI/Release 状态见[远程仓收口复核](../hackathon/evidence/shinemage-plugin-remote-closeout-20261010.md)。`pnpm dsh --help`、`doctor --help`、`plugin candidate --help` 能给出入口、退出码和证据边界；缺少候选输出目录时返回 `DSH_ERROR OUTPUT-DIR_REQUIRED`，未知命令返回 `DSH_COMMAND_UNKNOWN`。当前主要摩擦是 README 顶部和 STATUS/TODOS 在合并后容易过期、插件流程仍需维护者从多份历史文档拼接、以及未使用固定 Node 入口时 pnpm 会显示 Node 25 的 engine warning。新维护者应优先读[插件更新指南](./shinemage-plugin-update.md)、本手册、Quickstart、STATUS 和验证入口。

这次浏览截图和 CLI 输出属于开发者体验证据，不是产品或生产验收。它们保存在本地 `.context/checks/devex-review-20261011/`；此前日期目录的截图保留为历史，不进入运行包。
