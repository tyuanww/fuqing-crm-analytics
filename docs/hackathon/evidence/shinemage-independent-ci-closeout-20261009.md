# 八个独立插件的 CI 本地收尾（2026-10-09）

本轮沿既有 T1/T15/T21 推进固定输入、独立构建和 Git 交付，没有新增业务功能。主树起点为 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d` 加 108 项未提交内容；主树不提交，原产品源码、VERSION、候选和 journal 保留。此前交接中的“未提交”按当时时点保存，以本页及[机器记录](./shinemage-independent-ci-closeout-20261009-validation.json)作为此次接续。

## 已交付的本地提交

八仓各增加一笔 `chore(ci)`，只包含本仓 CI、固定输入清单、保护脚本及相应开发说明。没有将八仓混成一笔提交，也没有把主树未提交成果带入。八仓工作区干净、无 remote；shine-brand 的既有远程交付未改。

| 作者仓 | 新提交 | 原提交 |
|---|---|---|
| analytics-workbench | `aa56dbeb56b4ffc8216c9b01d394981226c28960` | `cc1dd6a9` |
| crm-knowledge | `73efd8bc229ea6c9e4f5715fda347fdf9e065869` | `12b82593` |
| knowledge | `5c4a775a54086370ef5b2c12a86ad5a32b4abd8f` | `d9e26776` |
| shine-query | `7220fa65993cf579a87f5611a64fd5965ddd1a7b` | `258a3449` |
| shine-board | `613ba48fb64471b4d8204b0c582e20f3fb039f0b` | `49b00e08` |
| shine-crowd-action | `680f01c2f4befc989de050e3c7ed0bf3b94bd96c` | `51f8088d` |
| shine-funnel | `e3f6a04b11a11837d9c5083cfd8997c39b83eb02` | `1c71c04b` |
| shine-waterfall | `8110c61f568f9d9067ceea4a36fcc6b6529d93a3` | `632867cb` |

提交后各做一次 `git clone --no-local`，核对 SHA、无 alternates、初始无 lib/node_modules，以及审查文件逐字节一致。Workbench 新 clone 位于其任务根 `clones/ci-aa56dbe`；另七仓位于 `/Users/hutou/.codex/tasks/shinemage-independent-ci-integration-20261009/clones/`。提交后未重复构建：已验证的是原提交加本轮同字节增量，新提交仅封存这些字节。各仓原 `plugin/`、kit、领域包、包名/版本/peer 均未改。

## 具体修复与输入

完整 workflow 现在会在新的 `runner.temp` 根取得固定上游源码、冻结锁依赖及官方 npm lib，再执行本包原有构建、测试和内容打包；不再把尚不存在的路径变量当作准备好的 SDK。固定 Node 24.19.0、Python 3.14.4、上游 `477b4f42`，上游 pnpm 11.7.0、作者与 build-tools pnpm 11.28.2。源码 checkout/build-tools 要求仍保留，不是 npm-only 作者路径。

Workbench 审查发现两处失败处理缺口并修复：准备超时只杀父进程可能留下下载子进程，现按本次独立进程组结束并回收；CI 原来丢弃完整准备日志，现用固定 artifact action 在成功/失败后尝试留存日志、输入回执和内容包 14 天。上传范围不含 SDK 安装树或 SDK 包归档。根开发入口也已补齐。

CRM 与 Knowledge 的实际包测试首次缺少 `dsh-agent-loop-testkit`。仅补同一官方 rc2 的 `dsh-agent-loop` 和 `dsh-agent-loop-testkit`，新增 13 个 lib 文件。原 106 包记录不变；两仓现为 108 包 / 1,495 文件，其余六仓保持 106 包 / 1,482 文件。两份新增归档的 sha512、sha256 与成员摘要已复核，记录在机器摘要。没有重装整套 SDK、修改真实测试或放宽类型检查。Knowledge 另修一处 preflight 文案：仅该检查步骤不准备输入，而非整个 workflow 不准备输入。

## 实际验证，分仓记账

所有本轮消费者均为本地 Docker Debian bookworm / Linux x64 仿真、固定 Node/Python，消费者阶段禁网，只使用合成测试。Ubuntu GitHub Actions 尚未执行。

| 仓 | 构建/类型边界 | 本包测试 | 其他实际验证 |
|---|---|---|---|
| Workbench | 原 host/client 严格构建已通过，运行输入与产品未变，本轮不重跑 | 沿用 23 文件 193 PASS 的原始记录 | 本轮进程组 3 PASS、输入保护 6 PASS；新包装修复不改变正常构建输入 |
| CRM | 本轮严格 host/client 构建通过 | 103 PASS / 0 FAIL / 0 SKIP | 作者守卫 11、输入保护 6、进程组 3 分别通过 |
| Knowledge | 本轮严格类型检查与构建通过 | graph 22、service-client 5、package 5、identity 12、author-boundary 5，各组 0 FAIL / 0 SKIP | 输入保护 6、进程组 3；缺输入 preflight 仍 exit 2 |
| shine-query | 现有构建通过；NOT_IN_CURRENT_BUILD | lifecycle 2、author-boundary 5，各组 0 FAIL / 0 SKIP | 离线安装、预检、内容包 exit 0 |
| shine-board | 现有构建通过；NOT_IN_CURRENT_BUILD | lifecycle 2、author-boundary 5，各组 0 FAIL / 0 SKIP | 离线安装、预检、内容包 exit 0 |
| shine-crowd-action | 现有构建通过；NOT_IN_CURRENT_BUILD | lifecycle 2、author-boundary 5，各组 0 FAIL / 0 SKIP | 离线安装、预检、内容包 exit 0 |
| shine-funnel | 现有构建通过；NOT_IN_CURRENT_BUILD | calculation 2、lifecycle 1、author-boundary 7，各组 0 FAIL / 0 SKIP | 离线安装、预检、8 成员内容包及领域声明校验 exit 0 |
| shine-waterfall | 现有构建通过；NOT_IN_CURRENT_BUILD | calculation 1、lifecycle 1、author-boundary 7，各组 0 FAIL / 0 SKIP | 离线安装、预检、8 成员内容包及领域声明校验 exit 0 |

D/E 五仓没有单独 tsc，固定编译器版本检查不等于类型检查通过。共同 5 个 Python 文件与两份锁逐字节等于 Workbench `aa56dbe`；五仓的 3+6 保护项只复用该精确字节证据，未计作五轮新执行。测试组、重复轮次和不同仓的数字不相加。

准备路径的成功基线仍为 Workbench 既有 recipe-r3；本轮其他七仓复用只读的已准备平台依赖并各自实测消费者，没有逐仓重跑空缓存下载。CRM/Knowledge 用固定源码新 clone 构造本任务 overlay，重新 materialize 108 官方归档；CRM 最终依赖与 overlay 均只读。Knowledge 原共享依赖始终只读，本任务 overlay 在消费初次验证可写，之后有只读预检；不宣称整机不可读。D/E 容器只挂自己的 clone 工作根及只读 recipe-r3，没有主树或原作者仓挂载。

## 产物与审查

本轮内容包及每个成员摘要已复算。CRM 为 `53c6ecd7…` / 244181 字节 / 6 成员；Knowledge 为 `5bb2e8f4…` / 17140 字节 / 5 成员，成员与旧 macOS 包相同、压缩归档不同。D/E Linux 包分别为 query `b141df60…`、board `da091814…`、crowd-action `6a855bdc…`、funnel `c27fda09…`、waterfall `ab7b8be9…`；成员与本次真实构建产物一致。精确摘要见机器记录和原始打包日志。全部只是内容包，formal packPlugin/candidate 未执行，不继承旧包的 headed/WSL 结论。

八仓提交前均完成主 Agent 检查及未编写该仓增量的宿主内独立审查，最终无待修发现。Workbench 的两项 P2 已修复并复核；其他仓复用同字节 helper 后分别审查自己的 workflow、输入、调用方和证据。独立审查测试部分采用日志/摘要核验，主 Agent 核对实际代码、归档及必要新验证。本轮未执行外部 OCR/Claude 审查，既有 HTML probe 的外审缺口未因此关闭。

## 原始证据与剩余事项

本轮原始日志、补丁、manifest、审查/提交记录和内容包归档在 `.context/checks/independent-ci-closeout-20261009/archive/`，共 431 文件、3744674 字节；目录外的原任务材料均保留。主索引为 `archive-manifest.json`。主要原任务根：

- `/Users/hutou/.codex/tasks/shinemage-ci-materialization-20261009/`：Workbench 输入基线及本轮 review 修复日志。
- `/Users/hutou/.codex/tasks/shinemage-crm-ci-20261009/`：CRM 验证、首轮缺包失败和最终 103 项。
- `/Users/hutou/.codex/tasks/shinemage-knowledge-ci-closeout-20261009/`：Knowledge 缺包、目录归属、输出逃逸与旧绑定失败；最终 r3 验证。
- `/Users/hutou/.codex/tasks/shinemage-de-ci-materialization-20261009/`：五仓独立消费者命令、退出和包。
- `/Users/hutou/.codex/tasks/shinemage-independent-ci-integration-20261009/`：主 Agent 核验、最终提交、提交后 clone。

下一步沿原任务：这八仓按各仓实际授权创建远程、推送、PR 并实跑 Ubuntu CI，记录冷环境准备和各仓产物；再按原 stop/go 推进独立版本发布与适用组合准入。CRM/真实 WeKnora 接口及权限验收、官方 DSH 独立升级/回退仍未完成。本轮没有远程建仓、push、PR、合并、发布或部署；没有操作生产或读取真实业务 DuckDB。SDK 分发仍 BLOCKED，仅适用于其实际门禁；产品 PARTIAL、release_ready=false，不勾完 T1/T15/T19/T21。
