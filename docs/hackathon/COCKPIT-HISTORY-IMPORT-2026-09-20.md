# 驾驶舱历史汇总与多格式编辑：本地验收

日期：2026-09-20（上海）；代码基线 `f9070431`（#214），分支 `codex/cockpit-history-import`。所有本轮成果未提交，未新建PR、合并或切换6677。原仓 HANDOVER、未提交材料、另一任务 WeKnora 资料以及旧 V2 工作树保留。

## 结论与范围

历史缺失有两个独立原因：真实 Cordis 对 `remote.workspaceFiles` 的嵌套服务注入未声明，异常被旧扫描入口捕获后表现为空列表；旧版本也只扫描当前工作区，没有遍历原生历史交付。此次补齐服务声明及认证历史接口，并在固定上游真实 Host 上验证，避免再以合成 Host 代替原生服务边界。

“添加产物”保存独立原件，Word/Excel/CSV/PDF 使用用户选定的本机 Docker ONLYOFFICE；HTML 继续现有显式预览/确认/PATCH。正式版本、自动草稿及回执分离，不以编辑器内部“所有更改已保存”冒充产物库落盘。

## 实际验证

| 层级 | 结果 | 证据与限制 |
|---|---|---|
| 文件服务与页面合同 | PASS，35 tests | `.context/checks/20260919T170653765287Z/summary.json`；原件/新连接、owner、幂等/CAS、取消、JWT/ticket、错误回调URL、JSON错误、私有配置、手动HTML无会话来源 |
| 历史与文件客户端 | PASS，11 tests | `.context/office-test/evidence/targeted.log`；冷读lease释放、分页、同目录去重、完整分段读取、同步≠持久化、回执丢失重试、保存期间新修改及放弃 |
| 原驾驶舱回归 | PASS，21浏览器主链 | 最终源码`.context/checks/cockpit-history-v2-final/results.json`，0未处理异常；真实Chromium+FastAPI/SQLite，Host部分为原合成夹具，不能冒充完整原生Host |
| 完整B0 pipeline | PASS，主功能成果 | `.context/dsh-b0/build-evidence.json`、`.context/office-test/evidence/pipeline-verified.log`；所有选定stage通过，包含契约、Python/Node、真实Cordis、类型/编译和字节一致的干净目录重建；remote CI未执行。之后仅将离开提示的“自由页面/页面”改成“产物”，另过Host/Client类型与编译、12项离开提示DOM测试，没有重跑全套 |
| Ruff/差异空白 | PASS | 受影响Python及`git diff --check` |
| Docker | PASS | 固定9.4.0 digest，arm64实际容器；healthcheck true，容器到隔离文件服务无凭据返回401；Compose配置校验通过 |
| 原生历史 | PASS | 固定DSH0.1.6-alpha.2，原生创建两份合成会话→写入/present→flush→Host重启→认证history接口与真实页面查得交付；模型调用0。来源标题显示，同目录重复记录折叠 |
| 手动HTML | PASS | 浏览器添加manual.html、预览、显式确认v1、点选改字并保存v2；新SQLite连接验证`session_id:null`、`origin_file_id`及修改文字 |
| Word | PASS | 真实ONLYOFFICE修改DOCX并保存v2；最终额外验证丢失回执恢复v3，独立python-docx重新解析BLOB验证新增文字，保留v1/v2 |
| Excel | PASS | XLSX B2从1280改为2468，保存v2后用独立openpyxl重新读取验证 |
| 历史CSV | PASS | 原生readBytes读取历史rows.csv→保存副本→编码/分隔符确认→B2改3579→保存v2；新SQLite连接验证CSV字节与原v1 |
| 文本型PDF正文 | PASS，有限范围 | 主工具栏“编辑PDF→编辑文本”，生成文本框后双击编辑；原正文替换、保存v3，独立pypdf解析验证新文字且原正文已移除 |
| 保存恢复与离开 | PASS，原生浏览器 | 实际服务接到保存后由Playwright丢弃响应；界面锁定选择与iframe输入，同一请求重试恢复v3且仅新增一份版本。另输入`DISCARD_ME`，返回触发保护并明确放弃，新连接验证正式版本仍为v3、不含该文字；本轮浏览器pageerror为0 |
| 响应式 | PASS，原生1024/760/390无外层横向溢出 | 最终390截图14标题与动作分行；1440截图13展示历史来源与原文件预览。原生侧栏自适应保留，驾驶舱按自身容器宽度布局。内部Office长文档滚动与外层溢出分开 |

## 失败和保留限制

- PDF选中文字浮动菜单“编辑文本”第一次触发 ONLYOFFICE `this.pasteCallback is not a function`，正文未保存。后续主工具栏路径编辑成功；未修改上游SDK、未宣称浮动菜单问题已修好。失败截图：`.context/office-test/pdf-editor-failure.png`。
- 首次XLSX立即保存时，编辑器尚未同步；已增加同步等待，并保留同一回执重试验证。同步尚未发送保存请求时允许放弃；已经发出请求而回执未知时继续锁定。
- CSV自动化第一次在导入转换尚未完成时操作，ONLYOFFICE报`getWorksheet`；等待转换完成并关闭格式提示后实际编辑、保存和字节校验成功。该失败保留，不把整次浏览器累计异常数写成零。
- 初次B0检查遇到新工作树LFS品牌指针未展开；使用本仓已存在的LFS对象checkout恢复，未取相邻仓品牌文件。随后发现文件客户端声明与既有PageHttpOptions不一致，已统一类型后重跑。配置测试中临时目录缺失已修正fixture，未放宽私有目录要求。
- 旧看板DOM测试把所有input都当成第二个聊天输入；新增的产物搜索使该断言失败。已保留“无第二composer”的约束，单独断言仅有一个search输入；该文件58 tests及最终pipeline通过。
- 原生新浏览器的内测声明/API Key设置遮罩会阻止点驾驶舱，验收明确点“继续/稍后配置”，没有设置模型凭据。未把工具等待超时包装成业务成功。

## 未执行

真实用户历史全量验收、现役6677/18091切换、真实模型P13、真实业务/UAT、扫描PDF OCR、复杂Word排版/全部旧格式兼容矩阵、远端CI均NOT_RUN。产品仍PARTIAL。历史仅识别日志中的present/成功write/edit和当前工作区可扫描文件；丢失文件或所属目录外路径不会自动恢复或越界读取。

## 实现入口

- `src/cockpit-history.mjs` / `cockpit-history-api.ts`：固定DSH认证冷读及分页；`src/client/cockpit-delivery.mjs`：合并、去重、原生完整字节读取。
- `backend/services/analytics/cockpit_files.py` / `cockpit_files_routes.py`：独立SQLite文件库、版本、编辑草稿、回执与ONLYOFFICE签名回调。
- `src/client/cockpit-file-client.mjs` / `cockpit-office-editor.tsx`：文件上传、同步等待、显式保存、错误反馈和编辑器生命周期。
- `src/client/cockpit-workspace.tsx` / `index.tsx`：来源列表、手动添加、编辑流程、原有leaveCoordinator接线及浏览器离开保护。
- `backend/contracts/page_documents.py`、离线OpenAPI及生成类型：手动HTML来源扩展；原页面库仍独立于BoardSpec。
- [隔离服务启动说明](../operating/cockpit-office-local.md)：固定Compose、私有配置和端口边界。

以上`src/`均位于`dsh-plugins/analytics-workbench/`。本地原始证据位于当前树`.context/office-test/`，其中`office.env`、`http-token`、`access.json`含本次私有配置，不提交、不复制到报告。无凭据结果为`native-history-result.json`、`persistence-final.json`及`office-receipt-result.json`；截图编号01–17覆盖历史、各格式编辑、响应式及保存/离开保护。`evidence/code-manifest.json`记录本地候选文件摘要。

收尾保留隔离预览4328、文件服务19091和文档容器18110供查看；没有自动重启策略。6677原监听PID35854保持不变。预览全部是合成样例；主仓用户历史不会自动进入此测试profile。
