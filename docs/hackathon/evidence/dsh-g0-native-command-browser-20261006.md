# 原生首购命令与 Chrome 合成整链

2026-10-06，`codex/plugin-boundary-review` 从 `f3b7c0cc535acfaa9a734623d2125c13e01c7319` 干净工作树继续。以下结果属于本轮未提交源码和本地编译产物，不是 clean release artifact、远端 CI 或生产验收。

## 实现与边界

- workbench 用固定官方 SDK 的 `commands.register` 注册 `/first-purchase`、`/first-purchase-status`、`/first-purchase-cancel`；只在显式 first-purchase profile 和登记 session 启用。SDK 增加同 SHA 的 commands 绑定，没有修改上游、版本 pin 或既有 SDK 链接。
- 查询由 Host command ID 生成原 request ID，仍由现有 kernel、SQLite journal、原生 Agent Loop 和实际 JSON worker 执行。状态只读；取消按 run 或原 session 中的 call→request 精确定位，不能取消后续任务。
- 不完整/未知/错任务回执、网络或 ACK 不明保持 UNKNOWN；错误脱敏，不自动重发。gateway credential 只注入自有 Host 私有环境，CRM 身份另行逐次校验。
- 原生空会话拒绝提示改走公开 command event/input notice；不接管其他命令、输入框、会话或 `/api` interceptor。首购工具卡片不再依赖 shine-query 的全局开关。取消双击只提交一次，切换 session/call 后丢弃旧回复。
- 生产配置、真实模型、真实 CRM 凭据、业务数据、杭州现役与生产保存未改。

## 本次实际验证

输入：Node 24.19.0；B0 Python 3.14.4；官方 DSH `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`。固定上游工作区再次检查为 clean。模型为官方 mock，CRM 为自有合成 HTTP，计算为真实 JSON worker，状态为隔离 SQLite。

全部日志相对于本工作树 `.context/checks/first-purchase-native-command-20261006/`；源码输入摘要另存 `source-digests.json`。

| 验证 | 本次结果 | 原始证据 |
|---|---|---|
| workbench host/client 类型与正式构建 | PASS | `build-3.log` |
| 原生命令、编译结果卡片与保存/取消 DOM | 12 PASS / 0 SKIP | `command-dom-final.log` |
| 查询、归属、真实 CRM HTTP 与保存 UI 四个后端文件 | 35 PASS | `backend.log` |
| AST 边界、Host 启动保护、mock adapter、身份与 CRM relay | 31 PASS / 0 SKIP | `boundary-guards-pinned.log` |
| 固定官方 Host HTTP 整链 | 1 PASS / 0 SKIP | `host-2.log`、`run-2/test_official_host_crm_query_s0/official-host/http-observations.json` |
| 实际 Chrome headless 整链 | 1 PASS / 0 SKIP，5 项观测，page errors 为空 | `browser-12.log`、`browser-12/test_official_host_crm_query_s0/official-host/browser-observations.json` |
| 生成边界清单、Ruff、差异/新增文档链接 | PASS | `final-checks.json` |

HTTP 与浏览器是分别执行的两个模式，没有把一个 PASS 当作两种模式都通过。pytest 各显示一条既有 warning，未将其隐藏为零告警。早一轮边界命令缺 opt-in，29 PASS / 2 SKIP 保留于 `boundary-guards-final.log`；补齐固定 upstream 后才得到上表 31/31。

Chrome 使用已安装的 Chrome 与 Playwright，新建 1280×900 context，不加载个人浏览器 profile。实际观测：

1. 在官方原生输入框提交查询，未登录时出现 NOT_CONNECTED；未生成新查询。
2. 在官方 CRM 槽位登录合成账号。
3. 再经输入框提交查询，实际原生 Loop/worker 返回 SYNTHETIC 结果；点击“确认保存分析”生成一条分析版本。
4. 刷新并重新打开原任务，恢复同一保存回执；数据库仍只有一条分析记录和一个 worker。驾驶舱/导出/发送禁用。
5. 通过官方“新建会话”进入不带业务工具的 preset，不连接 CRM，普通文本对话收到 mock 原生回答。它只证明正常原生通路，不冒充任意插件崩溃隔离。

已查看 `browser-saved.png`、`browser-native.png` 两张截图。工具卡片按官方默认两层折叠，测试通过原生按钮展开，没有修改官方显示行为。截图中尚在短暂展示的 NOT_CONNECTED 是第一步拒绝提示，不代表后续保存失败；完整视觉/移动端/无障碍评估不在本次通过范围。

HTTP 模式另外验证只读 status、旧卡片不能取消新任务、指定排队 run 取消、保存 ACK 丢失后的恢复和精确重放、同 authority 宿主重启后 CRM 必须重新登录，原 session 事件前缀不变。拒绝的 CRM 缺 CSRF 请求实际为 carrier `CONNECTION_CLOSED`，没有写成 HTTP 403 或容忍合法请求失败。

## 重现入口

从当前工作树运行；`UPSTREAM` 必须是已存在、未修改且完成构建的固定 rc2，Node 24 在 PATH，Python 使用已验证的 B0 依赖。变量均是路径，不放凭据。

```sh
UPSTREAM=/absolute/unchanged-built-dsh-0.1.7-rc.2
B0_PYTHON=/absolute/b0-python3.14
node dsh-plugins/analytics-workbench/build.mjs "$UPSTREAM"

B0_BUILD_UPSTREAM="$UPSTREAM" node --test \
  dsh-plugins/analytics-workbench/test/first-purchase-commands.test.mjs \
  dsh-plugins/analytics-workbench/test/first-purchase-query-card.test.mjs \
  dsh-plugins/analytics-workbench/test/first-purchase-save-dom.test.mjs

"$B0_PYTHON" -m pytest --noconftest -q \
  backend/tests/test_analytics_first_purchase_native.py \
  backend/tests/test_analytics_first_purchase_native_identity.py \
  backend/tests/test_analytics_first_purchase_native_crm_http.py \
  backend/tests/test_analytics_first_purchase_save_ui.py

B0_BUILD_UPSTREAM="$UPSTREAM" node --test \
  scripts/dsh-b0/plugin-boundaries.test.mjs \
  scripts/dsh-b0/pinned-host-acceptance.test.mjs \
  scripts/dsh-b0/mock-provider.test.mjs \
  dsh-plugins/analytics-workbench/test/first-purchase-native-identity.test.mjs \
  dsh-plugins/crm-knowledge/test/first-purchase-relay.test.mjs

# 默认模式：真实 Host HTTP、取消与重启。CRM 插件须按其已有 SDK 绑定预先构建。
B0_NATIVE_CRM_HOST_UPSTREAM="$UPSTREAM" "$B0_PYTHON" -m pytest --noconftest -q \
  -W error::ResourceWarning --basetemp=/absolute/new-http-evidence \
  backend/tests/test_analytics_first_purchase_official_host.py

# 独立浏览器模式；不会自动安装依赖/浏览器。
B0_NATIVE_CRM_HOST_UPSTREAM="$UPSTREAM" \
  B0_NATIVE_CRM_BROWSER_MODULE=/absolute/existing/playwright/index.mjs \
  "$B0_PYTHON" -m pytest --noconftest -q -W error::ResourceWarning \
  --basetemp=/absolute/new-browser-evidence \
  backend/tests/test_analytics_first_purchase_official_host.py
```

两个 Host 模式共用自有 4335/4336/4337 端口块，必须顺序执行；端口占用即失败。每次 `--basetemp` 使用新的目录，pytest 会清空给定目录，不覆盖旧证据。默认未设置 Host opt-in 会 SKIP，未设置 browser module 时浏览器为 NOT_RUN。

两轮最终 `http-observations.json` 都记录 `cleanup_ok=true`；官方 Host PID 81619、82148、82165 已退出，4335/4336/4337 无监听。临时 CRM/model/保存 HTTP、worker 和 Chrome 均由本轮 finally 回收，无其他服务重启。

## 失败调查与修复

失败日志 `browser-1` 至 `browser-6`、`browser-8` 至 `browser-11` 全部保留；`browser-7` 是前四项的中间通过，不代替最终五项。

- 初期夹具缺工作区绑定、误用官方 workspace 返回字段，改为官方 workspaceController/registry 并 flush；没有修改上游。
- 实际发现 rc2 空会话命令拒绝未展示；补自己的公开 input notice。卡片被其他插件的 query 开关隐藏；改为独立注册自己的工具卡片。
- 工具卡片已附着但折叠不可见：核对官方两层折叠结构，修正浏览器定位，不改产品默认折叠。
- 扩展普通对话时误从侧栏寻找空会话。核对固定上游 `session-list-blank`/workspace navigation：空会话按官方规则隐藏，应经“新建会话”复用。测试同时修正可访问名称和重复按钮选择，等待 workspace/session 列表就绪后操作。
- 源码复核补齐受理回执版本/位置/未知字段拒绝、指定取消 run 的响应归属、超长取消幂等键的前置拒绝；负测通过后重建并重跑 HTTP/Chrome。

## 未关闭

实现阶段记录时尚未提交；后续 OCR 审修见下节，提交身份以 Git 与新候选回执为准。尚未重建 clean plugin/service candidate，不能复用旧包的 PASS。

T3/T9/T14 仍 PARTIAL。headed、移动端、读屏、真实模型、生产形状/UAT、签名/来源供应链、目标主机与生产激活没有本次通过证据；结果陈旧/过期检查仍按用户决定暂缓。未 push、创建 Release、切换杭州或访问真实 DuckDB。

## 提交前 OCR delegate 审修

按用户既有审核/修复/提交要求，OCR v1.12.11 提供确定性 preview/rule，由当前 Agent 完成审查，不调用外部模型。原始范围 26 个文件（15 reviewable、11 默认排除）；文档、生成类型和后端测试均已补审。补入回归后共 **27/27 reviewed、0 skipped、100% coverage**；按 `(path,status)` 保存逐文件清单与 SHA-256。

确认并修复 **1 项 Medium**：浏览器 probe 在 context/page 创建失败，或诊断写入 ENOTDIR/磁盘故障时，会跳过关闭已有浏览器。将资源创建与证据写入纳入嵌套 finally，最后关闭本次 browser；context.close 本身失败也不会跳过它。四种故障夹具先得到 **3 FAIL / 1 PASS**，修复后与原 Host 保护合计 **8 PASS / 0 SKIP**。这是生命周期负测，不冒充真实 Chrome。

修复后的真实 Chrome 重新执行 **1 PASS / 5 项观测**，`page errors=[]`、`cleanup_ok=true`；端口已回收。命令、UI 和服务产品源码未在本次审修中改变，已核对它们与上表验证输入摘要一致，没有宣称重跑历史 12/31/35 项。

审修证据根 `.context/checks/first-purchase-command-review-20261006/`：`review-preview.json`、`review-rules.json`、`review-summary.json`、`cleanup-before.log`、`cleanup-after.log`、`browser-after.log`、`browser-after/test_official_host_crm_query_s0/official-host/`。已核对 API/声明、固定 SDK、生成边界、显式 synthetic 运行范围、UNKNOWN 与生产 gate 文档；无剩余确认阻塞缺陷。本批按正常 hooks 本地提交，提交不授权 push 或生产切换。
