# 原生页面来源接线验证

本轮从主仓 `1add2ac3`、CRM 作者 `21a7368`、Workbench 作者 `d6b711a` 接续。前一单元的九插件包装配已通过；本轮实现新的运行接线，尚未据此切换杭州或完成真实业务验收。

## 已实现

- Host 固定操作代理、私有请求租约与原 CRM 授权复用。
- Python 统一五指标投影、显式请求上下文、服务端 target 和每次读取重新核权。
- 实际预览消息到结果桥，文字与结构编辑确认、保存重开、数字只读和成功回执重放。

设计与配置见[原生页面与 CRM 来源](../../operating/native-crm-page-source.md)。当前只支持经营聚合快照，未将 RFM、商品结果或缓存接入本来源投影。

## 本地实测

- 主环境 `scripts/dsh-dev/test_native_page_composition.py`：13 PASS，1 warning。使用实际 Connection/BrowserAuth、CRM 路由、自建 DuckDB、权威来源、页面服务和 Workbench store/MessageChannel；保留错身份、撤权、重登、到期、进程重启、容量与回执重放断言。
- 受影响的页面、结果、编辑与 HTTP 测试：127 PASS，3 warnings。包含四项等待来源时其他 HTTP 请求仍可处理的回归。
- CRM 作者完整普通包测试：197 PASS，0 FAIL、0 SKIP；固定 rc3 SDK 严格类型与构建通过。错误白名单提交 `631b8d8` 已正常推送，[作者 CI](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/40160120229) 成功。
- Workbench 固定 SDK 完整构建通过，包含实际 UI 类型检查；普通 core 入口 162 文件、1143 PASS、0 FAIL、0 SKIP。作者 `a63fe78` 已正常提交推送，新严格包读回通过；浏览器和 standalone 阶段未执行。集成组合状态以后续精确提交和当前 PR 为准。
- 既有 TLA+ 模型 75 个生成状态、14 个不同状态，无违例。该模型不证明本轮网络权限或浏览器安全。

测试计数分层记录，不相加为全项目测试通过。实际浏览器 iframe 脚本、真实模型、CRM/WeKnora 业务数据与杭州实例未在本轮运行。

## 发现与修复

独立对抗审核确认实际预览未接 read/cancel adapter、原生文字和结构确认未接 edit-context 两项缺陷。修复后补真实消息入口与保存重开回归；直接调用 adapter 的旧组件测试未作为这两项完成证据。

主环境另复现停滞请求体不能及时释放、已保存绑定的可空字段被结果桥拒绝、同步来源核权阻塞编辑 HTTP 事件循环。均有先失败后修复记录。可空字段仅按公开 PageBinding 合同规范化 node_id/data_ref，空字符串和未知字段仍拒绝。

Node Fetch 不会发送手设的错误 Host，本轮认证负测改用原始 HTTP 请求；该夹具问题没有算作认证绕过。来源固有限流四，八突发测试接受符合身份的结果或结构化 503，并验证恢复，未扩容换取通过。

审核采用已批准的独立同模型 CLI 替代，不属于跨模型审计。最终增量复核覆盖主仓与 Workbench 共 43 文件，无新增确认 P0–P2；注释检查无待处理项。正常 hooks、精确集成 CI 与实际新包消费继续按顺序完成，未执行部分不报通过。

## 未关闭

完整新包消费后的浏览器业务验收、近两年 RFM 与商品缓存覆盖、旧 CI 失败后长等待的根因、正式发布门禁和杭州切换仍开放。PR 不合并，`release_ready=false`。
