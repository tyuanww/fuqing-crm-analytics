# 驾驶舱候选 Delegate 审查 · 2026-09-20

接续用户点名的 `open-code-review-delegate`，在原隔离工作树 `codex/cockpit-history-import`、HEAD `f9070431` 审查累计未提交成果。OCR 1.12.4 只执行 `delegate preview/rule`，代码由当前 Codex 核对，没有调用外部审查模型。此前外部 OCR 的 18/42 完成、24 项超时记录仍然保留，不能改记为外部审查成功。

## 覆盖

| total_files | reviewed_files | skipped_files | coverage_rate |
|---|---|---|---|
| 42 | 42 | 0 | 100% |

以上分母是 preview 选出的代码/合同/测试文件。初始工作区共有62个变更路径，另外20个由规则排除：Markdown、类型声明、生成类型以及明确排除的T0图片/证据。类型同步由契约和编译检查补充，不计入42个文件。每项以 `(path,status)` 标识；已修改文件读取 `git diff HEAD`，新文件读取全文，按规则核验调用方、错误恢复、所有权、版本与副作用。完整清单、分组规则、差异快照、源码hash及结构化评论在 `.context/delegate-20260920/{preview,rules,checklist,findings}.json` 与 `diff-*.txt`。

## 本轮确认并修复

| 编号 | 级别 | 问题和处理 |
|---|---|---|
| D1 | 高 | Office 首次保存响应丢失、期间到达新编辑事件，重试按最新 generation 判断旧回执，会误清除未保存状态。保存请求现在绑定首次 generation；恢复原回执后，新修改仍需新请求保存。回归修复前失败、修复后通过。 |
| D2 | 中 | ONLYOFFICE 签名回调 `status: 7` 被忽略，回执永久 WAITING、界面持续锁定。新增相关请求的 FAILED 终态；保留修改，允许重新保存/显式放弃；晚到回调不能复活失败回执，已保存回执也不会被晚到失败改写。真实 HTTP 路由与新连接持久化回归通过，前端失败恢复回归修复前失败、修复后通过。 |
| D3 | 中 | Office 验证只检查 ZIP 中央目录，损坏的 DOCX/XLSX 可入库，XLSX 候选也可能被确认。现在在条目数/解压大小限制内检查压缩包内容 CRC，并拒绝加密或不可解压的包。损坏 DOCX 入库用例修复前失败；DOCX/XLSX 修复后拒绝且不写库。 |

D2 依据 ONLYOFFICE 官方[回调协议](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)：7 表示强制保存失败，userdata 对应命令携带的信息。仅在签名、编辑会话和请求身份都匹配时记录失败，普通网络超时继续按未知处理。

前三条为本轮新增问题；前轮R1–R7未丢失，详见[前轮记录](COCKPIT-REVIEW-REPAIRS-2026-09-20.md)。本轮没有尚未处理的已确认审查缺陷；这不代表下面未执行的验收已完成。

## 验证与边界

- 针对性：57项Python、22项Node通过；日志为`backend-green.log`、`client-green.log`。修复前失败在`backend-red.log`、`client-red.log`，保留原始证据。
- 完整B0通过：565项Python、所选Node/编译后DOM、离线契约、类型、插件构建和干净重建。日志为`pipeline.log`，干净插件目录为`.context/dsh-b0/clean-build-EXYAg1/analytics-workbench`。
- Ruff及差异空白检查通过。使用Node24、Python3.14、固定上游，不安装或升级依赖。
- 本轮未重新执行真实ONLYOFFICE浏览器或真实模型；新增故障是隔离测试注入，不能写成真实文档服务故障验收。此前真实浏览器证据仅对应前轮候选，见前轮记录。
- 真实模型此前因缺少凭据未通过；P13、用户真实历史/业务文件、用户UAT、远端CI、现役切换仍未验收。扫描件OCR、复杂Office兼容、PDF浮动菜单上游异常及原生侧栏离开保护限制仍开放。
- 保留原有未提交文件、交接稿和验收材料；本轮仅修改候选树。没有commit、push、PR、merge或reload6677；WeKnora主仓及固定DSH源码未改动。
