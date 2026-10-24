# rc3 六项收尾与 CLI 复核

本记录更新于 2026-10-24。八作者仓的新提交、远端 CI、九插件与领域严格包、组合上传及实际 ZIP 读回已完成。主仓完整验证正在执行。没有合并、发布、切换杭州或访问真实业务数据。`release_ready=false`。

## 六项状态

| 项目 | 已有证据 | 仍未关闭 |
| --- | --- | --- |
| 作者 CI | Workbench `d6b711a1`、CRM `46111c5b`、Knowledge `2b0f5745` 及六叶子最终提交对应 CI 全部成功 | 不代表合并、宿主或业务验收 |
| 严格正式包 | 九插件从最终干净提交构建并严格读回；领域包从固定源重建，保留参考字节 | 主仓 candidate、journal 和运行验收未完成 |
| 六个叶子作者与组合 | 六仓已推送，PR 和 CI 成功；组合锁已更新，真实 artifact 已上传并严格读回 | 上传载体不是正式 release 或杭州部署 |
| 主仓验证与 Git | 发布合同重跑 603 PASS、6 SKIP；新组合接收 15 PASS、作者输入 35 PASS、领域输入 15 PASS；前端构建和 226 PASS | 后端、tooling、完整 B0、主仓提交及 PR 正在推进 |
| 独立审核与业务验收 | 用户允许 CLI 替代故障原生审查；定向对抗复核未确认 P0–P2 | 同模型不提供跨模型独立性；真实宿主、业务 UAT、近两年 RFM 和商品缓存覆盖未验证 |
| 合并与杭州切换 | 未执行 | 需要前置检查、实际候选身份、回退与现场 UAT；不继承旧 side-load 的验收 |

## 最终作者与组合身份

| 作者 | 最终 source | 成功 CI run | PR |
| --- | --- | --- | --- |
| Workbench | `d6b711a1bc6f48c4e283eafeba839d4bdba9a803` | `40075710303` | [#2](https://github.com/tyuanww/dsh-analytics-workbench/pull/2) |
| CRM | `46111c5bd93c798cd8256419c6c8dee0505b215f` | `40075710655` | [#2](https://github.com/tyuanww/dsh-crm-knowledge/pull/2) |
| Knowledge | `2b0f5745f725eda5b26df20ebd86c79003b08078` | `40072137767` | [#2](https://github.com/tyuanww/dsh-knowledge/pull/2) |
| board | `c7b4ab6541449adc236398a753662c09f61d5ab8` | `40075750502` | [#2](https://github.com/tyuanww/dsh-shine-board/pull/2) |
| crowd-action | `6a3c2d6601e8500326565d9fefe495c82d5ec37b` | `40075774458` | [#2](https://github.com/tyuanww/dsh-shine-crowd-action/pull/2) |
| query | `81363e4743871a7d08a9a8686b933d53a99b1f67` | `40075776419` | [#2](https://github.com/tyuanww/dsh-shine-query/pull/2) |
| funnel | `3420ec3b2650000388ceee5e2a14d78dc8a84a59` | `40075779068` | [#2](https://github.com/tyuanww/dsh-shine-funnel/pull/2) |
| waterfall | `6a07f2d95c47302ffde72507c6b29e4d7c13f8c6` | `40075781965` | [#2](https://github.com/tyuanww/dsh-shine-waterfall/pull/2) |
| brand | `f2c819003aa695404827957951e44befdc5ae017` | `40075782816` | [#2](https://github.com/tyuanww/dsh-shine-brand/pull/2) |

八个新提交的作者目录均已干净，Knowledge 无新改动。领域库固定源为 `e78e040e14792c89f99a2e3181004dbdaefd9bf6`。原 CI 工件即将到期，已真实重跑同一来源的 run `38121126913` attempt 2，成功并生成 artifact `12553123830`，到期日为 2026-11-07。不是替旧工件延长时间或补写来源证明。

组合载体使用独立分支 `codex/rc3-composition-artifact-20261024`，提交为 `8210b7144ddf297d372dd477df1a2abfeea6333e`。[上传 CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40076593648) 成功，artifact 为 `12553780915`，725944 bytes，SHA-256 为 `e6a5019a56e8cf04fdf1636774ecec696ae10de5d770a54ca166986e67432eb3`，到期日为 2027-01-22。真实 ZIP 包含九插件和领域的 20 个文件，经来源清单、生成证明、peer 和摘要守卫读回。组合锁 SHA-256 为 `96bb0e9b4cd13445e2c36f49d30bb8bbc319f05b6f264024d608a42c4c9aafb2`。

主仓三个 CI 调用显式选择版本化 artifact 锁，并绑定该组合锁、run 和 head。没有改仓库全局变量，也没有让旧分支误消费 rc3。审查发现的锁文件缺失已补充真实配置，相关检查先以 ENOENT 失败再通过。公共契约曾只接受 crm.1，新档案在修复前触发 `PUBLIC_CONTRACT_VERSION`；改为当前 crm.5 并增加旧版拒绝回归后，相关 35 项通过。

前端首次使用借用依赖运行时 224 PASS、2 FAIL。借用目录安装 Rive 2.45.1，而候选锁为 2.43.1。保留原链接后按候选锁离线安装私有依赖，构建及 226 项单测通过，没有改受测 WASM。B0 首次在缺少 zstd 的调用 PATH 上前置失败，保留日志并用现有安装重跑，没有修改门禁。

B0 随后发现边界库存未跟随既有授权测试及测试行号更新。通过 `plugin-boundaries.mjs --write` 生成，`--check` 和 12 项测试通过。下一组发现 CLI 仍期望旧 rc2 SHA，只改固定期望为真实 rc3 SHA，dsh-dev 整组 100 PASS、1 个显式历史上游缺失 SKIP。备份后端测试曾因调用 PATH 缺 `/usr/sbin` 而找不到 lsof，保持 fail-closed；补齐现有工具路径后同文件 9 PASS，没有修改备份删除规则。首次全量后端在第三组因此停止，不计完整通过；完整门禁仍需执行。

新增私有证据位于 `/private/tmp/dsh-rc3-final.ELtVwt`，包括 `author-ci.json`、`composition-results.json`、`domain/result.json`、`carrier-artifacts.json`、`prepared-remote-r1/preparation.json`、`ci-inputs/`、`artifact-reference-tests-final.log`、`updated-author-inputs-tests.log`、`domain-ci-input-tests.log` 和主仓各检查日志。生成脚本和 API 观察一并保留；计数按组报告，不累加或冒充业务验收。

## 核心作者的较早固定提交证据

GitHub workflow 和 job 状态已通过 API 查询，不再沿用此前“CI 未确认”的结论。

| 作者 | CI run | formal artifact | 本地严格 pack manifest SHA-256 |
| --- | --- | --- | --- |
| Workbench | `40072082417` | `12551523808` | `9b5637c1567447cbef3db1aafd0e2b63b5352c318f2daf5f0623e66f84095f49` |
| CRM | `40072133174` | `12551661792` | `b31834721313e69f24739a8b3629ad6397b42bab430ebee4929e14c164cc4703` |
| Knowledge | `40072137767` | `12551199866` | `d09889991f5613153bcb11d70e0305688fbcb06322e81bb58c1e8a6da901bb63` |

这三份远端 artifact 的原 producer 不含 `generated_bytes_provenance`，不能直接通过主仓严格消费。本地严格包来自 `git clone --no-local --no-checkout` 后的精确提交、冻结离线安装和实际构建。构建前后工作树均核对干净，没有给旧产物补写证明。

本轮审修后 Workbench 和 CRM 源码发生变化，上表只保留原提交证据，不再代表这两仓的最新候选。Knowledge 本轮没有新源码变更。

## 六个叶子插件

六仓从各自远端 `main` 新 clone，使用新分支 `codex/dsh-rc3-ci`。仅更新构建输入、peer、对应测试和文档，业务源码未改。五份固定 SDK 输入与 CRM 的 26 个绑定一致，实际闭包核对为 110 包、1512 文件，无锁外 lib。漏斗和瀑布图保留原 `board-components` 身份与摘要，不覆盖成无领域包的输入。

| 作者 | 包级测试 | 其他本地结果 |
| --- | --- | --- |
| board | 7 PASS | 构建、内容包、2 项输入测试通过 |
| crowd-action | 7 PASS | 同上 |
| query | 7 PASS | 同上；这是能力标记插件，不是线上独立 Query Agent 包 |
| funnel | 10 PASS | 构建、声明和内容包、2 项输入测试通过 |
| waterfall | 9 PASS | 同上 |
| brand | 41 PASS | 公开编译器构建和内容包通过；固定 SDK 预检通过，未运行固定 SDK 完整构建 |

各组均 0 FAIL、0 SKIP。五份 SDK 准备脚本另各跑 3 项进程组和 6 项输入保护测试，均成功。没有新增独立 tsc，不把打包成功称为严格 SDK 类型验收。

brand 首次公开工具离线安装报 `ENOTCACHED`。按锁文件通过本机已有代理补齐依赖后，执行构建、41 项测试和内容包。原失败日志保留，后续结果独立记录。Git 网络同样使用每次命令的代理参数，没有修改全局 Git 或代理配置。

## 审查发现与修复

`no-comments` 的首次 CLI 审查提出 10 处注释建议和 3 个代码形状疑点。复核后删除 16 行旁白注释，作者仓和主仓同步副本保持一致，不重复计算删除数。保留裸包 Loader 的外部约束注释，固定 rc3 上游的 `resolveMeta`、`locatePkgJson` 和 `exactPackageSpecifier` 提供依据。

两项代码形状疑点已撤回。页面包的 hash 由服务端归一化后计算，是明确的来源合同；`registerTools:false` 保留 Agent 范围注册，是有意配置。没有为了删注释重构这些正确路径。

一项真实边界问题已修复。`openNativeAccountSettings` 以前在非 Document 根、无 `aria-expanded` 时只要点击未抛错就返回成功。JSDOM scoped DOM 负测在修复前得到 `true !== false`。删除该分支后，所有根都必须观察到菜单或对话框打开；账号优先、等待渲染和一次 Settings 回退保留。

修复后的设置按钮与产物收件箱测试为 20 PASS。Workbench 重新构建后，core 为 160 文件、1135 PASS、0 FAIL、0 SKIP。CRM 仅有注释删除，重新构建并运行包合同为 10 PASS；不能将本轮 10 项写成新跑了此前全部 137 项。

主仓发布合同首次为 609 项，570 PASS、33 FAIL、6 SKIP。失败涉及旧默认 SDK、上游 SHA、profile 夹具和 rc1 诊断的默认线路断言。默认夹具改用当前工具链；rc1 诊断继续固定校验 rc3 默认 SHA/SDK，rc1 目标校验及显式 rc2 来源负测保留。没有放宽 peer、摘要、服务证据或来源检查。

受影响的六个测试文件复跑为 96 项，93 PASS、0 FAIL、3 SKIP。完整发布合同重跑为 609 项，603 PASS、0 FAIL、6 SKIP。跳过项是三项显式 rc1 上游、重绑与 artifact 检查，以及三项需指定 rc3 上游的重绑检查，不能计入通过。

完整重跑期间修改了状态文档，`gstack-evidence` 因工作树指纹变化将该回执标为 STALE。实际执行结果保留，但不用于宣称最终 Git 门禁通过。冻结文件后的补跑日志独立保存为 `main-release-final-frozen.log`，其状态以实际日志为准。

CLI 最终定向复核未确认 actionable P0–P2。`no-comments` 所余一条旁白已按报告删除；剩余 MUST KILL 和 suppressions 均无。复核不证明全项目无 bug 或无安全风险，也不是完整宿主验收。

## 本地证据与 Git

本轮私有证据根为 `/private/tmp/dsh-rc3-six-gates.f5NEEP`。主要文件如下。

- `build-author-pack.mjs`、三个核心作者子目录的 `result.json` 和构建日志。
- `verify-leaf.mjs`、六份 `verify-*/` 日志。brand 保留首次 `result.json` 与补跑 `continuation.json`。
- `comment-review-result.md`、`leaf-adversarial-result.md`、`final-review-result.md`。均为非原生、同模型 CLI，未伪装成多模型或原生通过。
- `native-settings-red-r2.log`、`native-settings-green.log`、`workbench-review-regression/result.json`。最初缺环境的 `native-settings-red.log` 不算缺陷复现。
- `main-release-repair.log`、`main-release-full-green.log`。主仓命令由 `gstack-evidence` 另保留原始日志。

主仓起点为 `79839c0b`。远端 `main` 已 fetch 为 `1c21fa6a`，是当前候选的祖先。新增改动均由本轮产生，没有 stash、reset、强推、切换用户已有分支或绕过 hooks。八作者仓和独立组合上传分支已提交并推送；主仓仍有待提交改动，Knowledge 维护仓未改动。上传载体的干净状态不能替代主仓交付。
