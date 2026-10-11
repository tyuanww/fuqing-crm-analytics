# Workbench 当前正式包与组合锁接续（2026-10-11）

本轮从独立作者仓干净提交 `fd46b34d04ddf143811fd1eba7ef2ff6c3ca230b` 和该提交成功的 Ubuntu PR CI 取得已构建运行成员，生成新的 `dsh-plugin-pack/v1`，再让主仓现有公共消费者读取这份包。当前主仓 `HEAD` 仍为 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`；本轮仅本地修改组合锁的 Workbench 一行及当前说明，没有新增 Git 提交或远端动作。

## 输入与正式产物

| 项目 | 实际值 |
| --- | --- |
| 独立源码 | `fd46b34d04ddf143811fd1eba7ef2ff6c3ca230b`，`git clone --no-local`，无 alternates，已跟踪源码干净 |
| Ubuntu PR CI | [38104163773](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38104163773)，30 个文件，212 PASS / 0 FAIL / 0 SKIP |
| CI artifact | `11689087774`；ZIP SHA-256 `69260065f6848fe6e9374be008209f3b318e9c1995d0fbe32f2685d7b4fe6252`，541800 字节 |
| CI 普通 content pack | `f5e9dfe41859b0ae3254cbaddf12a128e89cd3c53bde82b84f366beef03ae5d7`；与正式包分别记账 |
| 新正式 tarball | `e41df9f5a8f7031c092319222543c8d723ca644c0c9d69b2ae53f13257e9b79e`，438499 字节，8 个成员 |
| 正式回执 | `a9463faa7c3299cc5d24179708dc7c5ae5ecf0f124ce97dfa904145398b65910`，`source_dirty=false` |
| 当前组合锁 | `598b62ea0ae00c2f57474c8666e2787202658b57488612cb1d1ea4c40edd571b`，尚未提交 |
| 本地可接收 ZIP | `1e255055ee0fdd846df660d94dd68018e93cd4ffd5a41b9571a0feeb618c1bce`，704010 字节，18 个成员，未上传 |

固定 Node 24.19.0、Python 3.14.4、pnpm 11.28.2、DSH 0.1.7-rc.2 和上游 `477b4f42`。只将该 CI 的 5 个声明运行 JS 导入干净 clone 的忽略目录 `lib/`；源码资产、manifest 的既有规范化差异和 CI head 均校验，没有重新编译 SDK或复制主仓插件源码。正式生产器使用干净 `5390667` 的固定工具闭包；回读使用主仓当前更严格的 reader 字节闭包，两者来源分别记录，不能把未提交 reader 称为干净工具提交。

新旧包的成员名单相同，7 个非 manifest 成员逐字节相同；manifest 唯一改变的字段是 `peerDependencies`，增加 `@deepseek-ai/dsh-client-connection` 与 `@deepseek-ai/dsh-llm` 的精确 `0.1.7-rc.2`。即使运行 JS 同字节，新 tarball 与旧 `a0d5dd08…` 身份不同，不继承旧 headed、WSL2 或 journal 验收。

## 实际验证与范围

| 入口 | 本次结果 | 覆盖 |
| --- | --- | --- |
| 固定正式生产器 | exit 0 | 生成新 pack，activation 仍 NOT_RUN |
| 当前严格 reader | exit 0 | 精确 peer、成员与摘要；坏摘要拒绝；10 个原源码路径 EPERM |
| 再次写入同输出 | exit 2，`PLUGIN_PACK_OUTPUT_EXISTS` | 首份 tarball 和回执不变 |
| 目录模式 canonical prepare | exit 0 | 读取主仓当前锁与既有 CRM/page profile，9 份正式包 |
| 9 个公共消费者入口 | 66 PASS / 0 FAIL / 0 SKIP，exit 0 | 当前 pack 公开 client/tools，合成 React SSR/JSDOM/本机 HTTP 合同 |
| 3 个输入/组合守卫入口 | 37 PASS / 0 FAIL / 0 SKIP，exit 0 | 缺输入、摘要/身份漂移、输出防覆盖及原阶段输入守卫 |
| 真实 CLI ZIP 接收 | exit 0 | 18 个 pack 文件；与目录模式 9 包、2 profile 及锁一致 |

66 和 37 是两个独立执行范围，不相加成整体通过。公共消费者执行时拒读主仓的 9 份插件源码及 9 个原作者仓；固定上游解析、主仓公共验证脚本和合成夹具仍可读，因此不宣称整台机器或全部主仓不可读。

主仓只更新 `config/shinemage-composition-packs.lock.json` 的 Workbench `source_sha` 和 `manifest_sha256`。其他八行、两个 profile 及其摘要不变。CRM/page 是既有公共组合 profile，没有 `service_binding`，不能充当正式服务/宿主 candidate profile。完整 B0 未因这个局部锁更新重复运行，前轮 855 PASS/41 subtests 不能改写为新组合全量结论。

## 保留的失败

首次回读 harness 使用了干净 `5390667` reader 未返回的 `manifest` 字段，exit 1；当时正式生产器已 exit 0。修正 harness 并绑定当前严格 reader 后通过，没有重生成包。

首次 ZIP 带了两份 profile，实际受限解包器以 `CI_COMPOSITION_ARCHIVE_PATH` 拒绝，exit 1。该 ZIP 和日志原样保留；r2 只封装 18 个 pack 文件，profile 由 canonical 主仓读取，原检查器未放宽。

## 尚未关闭

- 新组合的 candidate、宿主激活、固定服务、WSL2、headed browser、进程恢复和新 journal 事件均未执行。旧 candidate/journal 与 46 个受保护文件未改。
- 主仓源码测试/构建阶段尚未切走。Workbench 的 40 路径扩大作者测试提案仍未应用或提交，当前 hosted CI 只属于 `fd46b34d` 的 30 文件入口。
- Cordis owner 提案仍待授权；现有 CRM/Knowledge 的精确 4.0.2 声明与固定 npm 实际 4.0.4 的差异仍单独处理。
- ZIP 没有上传，主仓消费当前锁的 hosted CI 仍 NOT_RUN；主仓与各私有 PR 未因本轮合并，没有 GitHub Release、发布或部署。
- VERSION 0.20.0.0，产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

## 原始记录与入口

本轮原始目录：`/Users/hutou/.codex/tasks/shinemage-workbench-current-formal-20261011-1uesb6bc`。实际命令、退出码和日志摘要在 `formal-pack-result-r1.json`、`verification-execution-r2.json`、`canonical-verification-r2.json`、`archive-receive-r2.json`；失败分别在 `verification-execution-r1.json` 和 `archive-receive-r1.json`。机器摘要逐项绑定原始文件：[shinemage-workbench-current-formal-20261011-1uesb6bc/summary-r1.json](/Users/hutou/.codex/tasks/shinemage-workbench-current-formal-20261011-1uesb6bc/summary-r1.json)。

主仓机器索引：[shinemage-workbench-current-formal-pack-20261011-validation.json](shinemage-workbench-current-formal-pack-20261011-validation.json)。前轮 Git/CI 与作者测试归属：[Workbench 源码测试归属接续](shinemage-workbench-source-ownership-20261011.md)。当前维护入口：[验证入口](../../operating/verification.md)、[单插件更新](../../operating/shinemage-plugin-update.md)、[架构](../../architecture/shinemage-plugin-platform.md)。
