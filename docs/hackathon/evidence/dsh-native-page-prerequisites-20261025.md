# 原生页面接线的授权与事务前置修复

后续进展见[租约包组合接收记录](dsh-native-page-composition-20261025.md)。作者严格包已从干净源码构建并进入组合；前置修复提交 `3d7dd687` 的运行包预检成功。下文保留前置单元完成时的输入和失败证据。

本轮完成页面接线前的原授权租约、短事务确认和来源回查。完整 Host 页面代理、Python resolver 与结果桥、Workbench 同源传输尚未实现，不能据此认定聊天到看板闭环已验收。组合仍消费 CRM 作者 `ed5940f`；新增租约接口在作者提交 `21a7368decf3a72f784436880ccb8e597673cae8`，已推送到 [CRM PR #2](https://github.com/tyuanww/dsh-crm-knowledge/pull/2)，尚未进入组合包。

## 行为变化

CRM Host 提供 `openNativeSnapshotLease(sessionId, signal)`，租约固定原登录记录。打开租约、读取引用和当前性检查均在线核验 CRM 身份。重新登录不会恢复旧租约，旧请求的延迟 401 不会清掉新登录。租约只公开身份、失效信号和受控方法，不导出 Bearer 或私有查询句柄。打开调用的 signal 只控制打开步骤，后续读取使用自己的 signal。

页面首次确认先读取预览，在数据库写事务外解析来源，再用短写事务复查预览内容、摘要、期限、取消状态、base version 和当前 head。取消先落定则拒绝提交；其他确认先成功则返回已保存版本，保留既有幂等重放。历史读取不强制 CRM 在线。

来源登记、读取和撤销的外部回调移出写事务。交付前再次检查引用内容、撤销和期限。独立审查发现最终连接退出后到期仍可能交付，修复保留退出后的期限检查。前后核验不承诺跨系统原子撤权。

严格资源检查另发现收件箱迁移检查和两处 Host 测试没有关闭 SQLite 连接。修复保留事务的提交与回滚，并显式关闭连接；新增回归覆盖 v1 迁移和 v2 重开。既有收件箱测试使用的连接也显式关闭。

## 已执行验证

| 范围 | 实际结果 |
|---|---|
| CRM 固定 rc3 SDK 构建 | 通过 |
| CRM 作者完整包测试 | 196 通过，0 失败，0 跳过；包含租约定向 57 项，不相加 |
| CRM 新提交远端 CI | [40120160600](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/40120160600) 成功，对应 `21a7368` |
| 主仓事务修复最初回归 | 18 失败、94 通过，保留持锁和撤销失败证据 |
| 最终连接退出后到期 | 修复前 read/register 两项失败 |
| 收件箱迁移与重开资源检查 | 修复前两项失败 |
| 页面、Source、Host、跨语言及收件箱合并定向验证 | 166 通过，0 失败，退出码 0；将 ResourceWarning 和 PytestUnraisableExceptionWarning 作为错误 |
| 组合清单与严格绑定负测 | 原测试 7 通过、1 失败；修复后 14 项通过 |
| 完整发布测试 `node scripts/dsh.mjs test` | 609 通过、6 跳过、0 失败，退出码 0 |

合并定向验证保留 5 项依赖弃用与故意无效输入的序列化警告。跨语言用例实际加载维护中的 Node 作者代码，与 Python 来源服务互调，使用小型合成 DuckDB 和 SQLite。认证服务为合成边界，未运行真实 DSH Connection、浏览器或业务 UAT。

可复跑入口如下。解释器和作者插件路径须显式指定，不回退历史副本。

```sh
CRM_NATIVE_HOST_PLUGIN=/absolute/maintained-crm/plugin \
PYTHONPATH=/absolute/main-repository \
/absolute/locked-python -m pytest --noconftest -o addopts='' \
  -W error::ResourceWarning -W error::pytest.PytestUnraisableExceptionWarning \
  backend/tests/test_crm_native_snapshot_source.py \
  backend/tests/test_page_documents.py \
  backend/tests/test_crm_native_snapshot_host.py \
  scripts/crm-calibration/test_native_snapshot_host_chain.py \
  backend/tests/test_artifact_inbox.py -q
```

## 远程预检和开放项

基线 `eb5194fd` 的主 CI `40115158180` 成功。独立运行包预检 [40115158182](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40115158182) 已取消，没有上传 artifact。实际日志先报告发布测试 602 通过、1 失败、6 跳过；失败来自组合清单测试仍硬编码旧 consumer SHA。该结果不能用旧运行包或主 CI 的绿色状态替代。

测试已改为核对真实 profile、组合锁、来源清单和 artifact 锁的绑定，未改生产门禁或组合输入。补充六个负测，错配在创建输出目录前被拒绝。本地合成 CLI 失败链正常退出，远程失败后持续等待的原因尚未定位。新完整预检仍需以最终提交执行。

代码审查采用用户批准的独立 Codex CLI 同模型替代，不能称为跨模型审计。原授权租约审查无新增已确认 P0–P2；主仓首次审查的过期缺陷已复现并修复。后续审核和最终 CI 以 [PR #164](https://github.com/tyuanww/fuqing-crm-analytics/pull/164) 当前提交为准。

七个页面、来源、Host 测试与跨语言文件的增量复核未发现新增已确认 P0–P2。该复核另跑了纯内存控制流探针，不替代主 Agent 的文件型 SQLite 验证。补充收件箱、发布测试及文档的八文件审查也未发现新增已确认问题，独立执行收件箱 30 项、清单 14 项及六个合成异常探针。不把两份增量报告扩大为全 PR 审核。

作者新 CI 上传包 `12571246160` 已实际下载，ZIP 摘要与 GitHub metadata 一致。包缺少 `generated_bytes_provenance`，现有严格接收器返回 `PLUGIN_PACK_BUILD_PROVENANCE_REQUIRED`。仍需按现有流程从干净作者源码生成带构建证明的严格包，再更新组合；没有降低接收要求或把作者 CI 成功当作组合准入。

后续按序完成新版作者包消费、运行包预检、完整页面接线和隔离业务验收，再验证近两年 RFM 与商品缓存。此次没有合并、发布或操作杭州。产品仍为 PARTIAL，`release_ready=false`。

本机原始红绿日志、审查和取消日志保存在 `/private/tmp/dsh-rc3-final.ELtVwt/native-page-*`。这些临时文件用于接续，不是公开持久附件。
