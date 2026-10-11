# CRM/Knowledge 包行为消费迁移（2026-10-11）

主仓基线 `5390667cc990fa558b0445aa455b086d325a6c77`。本轮继续既有源码装配迁移：默认 B0 中 CRM 和 Knowledge 的两项源码构建及作者私有测试改为各自独立仓负责，主仓保留真实正式包的公开行为检查。实现未提交，完整 B0 和新远端 CI 未运行。机器记录见[validation JSON](shinemage-crm-knowledge-package-consumers-20261011-validation.json)。

## 输入与实现

沿用现有 `crm-knowledge-rc2` profile 和[上轮固定两包输入](shinemage-crm-profile-pack-migration-20261011.md)，没有新建 profile、放宽 peer 或生成新包。CRM 来源 `5a839fa86de2240cf661a9034c58e0ead2d4b4ef`，归档摘要 `0da9f8edd40b17a92377aa4b35d219229c8461b942060a7dd0e12265343500fd`；Knowledge 来源 `94ef29fa6c39d3dc506fbc5ef734f0a7ea9eb2b0`，归档摘要 `ed7888204d5cefe7d383632a75319d3427fec9a735863f4e123b8ea17387ef67`。实际 Cordis `4.0.4`，声明仍为精确 `4.0.2`，整体兼容仍 PARTIAL。

- 新入口是 `scripts/crm-calibration/crm-package.integration.mjs` 和 `knowledge-package.integration.mjs`。原公开断言正文逐字节保留，仅将导入与文件读取绑定到正式包解出的运行目录。
- 同一两包 profile 安装两包；各项测试在独立 Context 中只激活所需领域。这是公开包行为消费，不是一次只有单包文件的安装验证。
- `composition-inputs.mjs` 增加 `crm-package`、`knowledge-package` 两个固定 scope；原 `knowledge`、`page` 仍独立。默认 B0 在任何源码构建或服务启动前拒绝四个结果目录的复用。
- 默认 B0 取消主仓 CRM/Knowledge 的两项构建和作者私有 transport/graph/relay 测试，保留主仓 profile 生成及公共组合。四份私有测试与对应独立仓同字节，而且已经列入各自作者 CI 入口；本轮没有重跑作者 CI。缺显式构建输入的历史守卫、原源码包测试和目录继续保留，没有删除副本。

## 实际验证

| 层级 | 本轮结果 |
|---|---|
| 正式包消费 | CRM 7 项、Knowledge 4 项，同次 11 PASS / 0 FAIL / 0 SKIP |
| 相关包/profile/输入守卫 | 67 PASS / 0 FAIL / 0 SKIP，包含新增 scope 拒绝检查 |
| 原知识/page 公共组合回归 | 9 PASS / 0 FAIL / 0 SKIP；与上两行分开记账 |
| 指定源码负对照 | 六份主仓源码/旧包测试/原作者文件读取均为 EPERM |
| 坏输入与防复用 | 缺输入、相对输入、坏 manifest 摘要、两个重复 scope 及流水线重复 scope 均被拒绝；未回退源码，原回执摘要不变 |

第一轮坏摘要夹具只搬了输入 JSON，漏了相对引用的 profile/包文件，因此实际报 ENOENT，不能算坏摘要门禁通过。该脚本失败与日志保留；第二轮只修正隔离夹具的相对输入布局，没有修改产品读取器，之后实际命中 `PROFILE_PACK_MANIFEST_DIGEST`。没有覆盖历史失败。

Node `24.19.0`，Python `3.14.4`，固定上游 `477b4f420553e8a52c2fbccc464d7561b239c443`，本机 macOS。Seatbelt 拒绝列明业务/作者源码，网络仅 localhost；这不是整机 deny-default。使用真实发布 JS 和合成 HTTP 夹具，没有模型调用或真实业务数据。临时 HTTP 由原 `t.after` 关闭，各测试进程实际 exit 0，没有启动 DSH 宿主、浏览器、杭州、6677 或真实 WeKnora。

## 当前缺口

两项源码构建已从本地默认 B0 配置中切走，但完整流水线尚未实跑。Workbench 构建、七个旧生产者入口、干净新正式包和候选准入，以及历史源码守卫仍待收口；不能据此宣称默认 B0 已完全脱离源码或删除旧 `dsh-plugins/`。

九份原正式包、当前 candidate/journal、Workbench 作者修改和固定上游不变。整体 peer 兼容、真实服务/模型/UAT、目标/浏览器/正式回退、新 hosted CI、独立发布及 DSH 升级均不由本次结果抵扣。SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION 0.20.0.0。

原始日志、输入回执、断言摘要和失败轮次：`/Users/hutou/.codex/tasks/shinemage-domain-package-consumers-20261011-xx9r5i41/`。本轮没有 commit、push、PR、合并、发布或部署。
