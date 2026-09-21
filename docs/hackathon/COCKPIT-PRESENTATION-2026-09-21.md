# HTML 卡片文案与块级 AI 编辑：本地候选

状态：`codex/cockpit-inline-edit` 本地实现，尚未提交、合并或加载 6677。工作树已快进到公开主线 `d521051c`（#38 / 0.14.0.0）。不是上一轮 0.13.0.0 的已上线能力，也不继承上一轮真实模型评估结论。

## 原因与实现

用户的 `standalone.html` 将卡片、数值、图表和筛选逻辑写在 JavaScript 中，HTML 中只有空容器。旧编辑器按静态源码范围选区，并把运行时改写的 DOM 排除，因此按钮和静态标题可改，卡片正文不可改。单纯放开 DOM 的 contenteditable 会在筛选后丢失修改；把整段 DOM 写回又可能破坏原脚本的生成逻辑。

现在 `PagePackage` 增加可选的 `presentation`，与 HTML/CSS/JS 一起存入既有页面版本。记录包含源码哈希、目标身份、显示文字和受限局部样式。手动文案和运行时块级 AI 共用这一格式。原脚本继续生成页面，统一预览运行时在生成后应用记录；不追加模型生成的补丁脚本，不重新生成另一份 result.html。

已有 SQLite 版本、候选冻结、确认幂等、乐观并发与回退机制继续使用，没有复制一套事务服务。运行时选区的 AI 候选必须保持 HTML/CSS/JS/资源/映射不变，只能增改选中身份路径下的 presentation；后端同时比较范围外已有记录。改计算、事件或结构生成函数属于整页源码任务。

## 身份与兼容边界

- 根节点必须有唯一 `id`、`data-node`、`data-page-block` 或 `data-page-field`。逐层优先用显式身份，再用同标签兄弟中唯一的 class；同标签唯一时可省略键。不用 nth-child 或数组位置保存身份。
- 旧页面的无标识叶子文案允许在已定位父级内按唯一原文匹配。按原文匹配的叶子顺序变化仍可识别；原文变化、相同原文重复或父级身份消失时停止应用并显示未匹配提示。此兼容方式不保证任意动态页面都可定位。
- 混合元素存在唯一直接文本节点时只替换该节点，保留单位等子元素。多个无法区分的文本片段不猜测。
- 记录随版本保存。筛选暂时隐藏目标时保留记录，目标再次出现时重新匹配。源码变化须重新核对目标并更新 source_hash，不能偷偷套用旧记录。
- 新页面生成提示要求稳定的板块、字段和重复卡片业务键；计算或绑定值标记 `data-page-readonly`。已有用户示例按其明确选择，仅覆盖显示文字，原计算和筛选源码保留。业务绑定页禁止附加这种显示覆盖。
- 文案通过文本节点赋值，不解析为 HTML；样式只有受限属性和值。原有 iframe/CSP、导入资源、静态选区结构限制继续有效。

## 用户操作与原生接线

1. “编辑”直接改卡片文案，预览后确认保存。
2. “用 AI 改”进入块选择，点击文字提升到对应卡片，页内填写调整要求。
3. 发送后通过原有 DSH session.prompt 进入主对话，按任务地址打开右侧 HTML 产物。
4. 模型按 TASK.md 写 candidate.json；用户点击“收取修改”，右侧从服务端冻结候选统一渲染，比较后确认新版本。

右侧使用固定 DSH `0.1.6-alpha.2` 的 `sidebarRightTabs` 与 `sidebar.right.pane.tab` 扩展，不改上游。会话切换后等目标侧栏状态建立，通过固定版本的 `tabsIn` / `openResourceIn` 适配打开到对应会话，避免误开到上一会话。SDK 路径在 toolchain.json 固定。产物客户端由插件按任务持有，标签关闭/重建不会销毁待核对的确认请求；参与统一离开保护及 beforeunload。刷新可重载任务和冻结候选。

当前没有自动收取模型输出；“收取修改”仍是明确操作。没有新增模型服务、凭据或第二条 Agent Loop。

需要调整共享脚本或结构时，打开“来源与源码”并选择“用 AI 调整整页逻辑”；入口说明修改范围，不自动扩大当前块任务。业务绑定页的“用 AI 改”沿用整页 CSS 限制。

## 验证与升级边界

针对性验证包含：实际用户示例的 JS 渲染与筛选、同文卡片重排插入、混合文字与单位、旧标签匹配失败、选区外候选拒绝、并发确认、重复确认、独立连接重开和回退。新增后端测试进入 B0 pipeline，前端测试由既有递归入口收集。

浏览器入口：`node dsh-plugins/analytics-workbench/test/cockpit-ui-ux-browser-probe.mjs --presentation`。按既有探针配置固定上游、Python、Playwright、Chromium；可用 `COCKPIT_EXAMPLE_PACKAGE` 指定本地 synthetic 示例源码包。真实浏览器与真实 FastAPI/SQLite，临时随机端口，使用生产编辑器及右侧组件；聊天宿主和候选生产明确为测试桩。结果保存在 `COCKPIT_EVIDENCE_DIR/results.json`，不宣称完整 DSH 宿主或真实模型通过。最终执行结果见本轮 STATUS 记录。

旧页面无 presentation 时兼容读取，无需批量迁移。含新字段的页面需要新前后端配套；旧后端严格合同不会接受新字段，不能把回退二进制等同于数据兼容。发布前应保留旧代码与原状态，验证独立状态副本的升级/降级策略；本轮未切换现役，也未改归档真实库。

### 首次实现验证（复核修复前）

| 检查 | 实际结果 |
|---|---|
| 完整 B0 pipeline | PASS；后端 604 passed，合同/类型/构建/编译后 Cordis 接线与干净重建通过。递归前端组 615 passed、1 skipped，跳过项为未提供外部示例路径的实际文件检查，已在下面专项执行。 |
| presentation 前端专项 | 11 passed / 0 skipped，包含用户提供的 synthetic standalone 源码包及筛选/图表。 |
| presentation 后端专项 | 11 passed；范围外及共享源码拒绝、业务绑定拒绝、并发、幂等、独立连接重开与回退。已包含于 B0 数字。 |
| 实际示例浏览器流程 | 5 组 PASS；生产编辑器与右栏组件、真实 HTTP/SQLite，聊天宿主及候选生产为桩。浏览器异常 0。 |
| 既有 UI 浏览器回归 | 15 组 PASS；排序/宽度/自由移动/缩放/回收站/全屏/窄屏/选区/错误恢复。浏览器异常 0。 |
| 完整 DSH 宿主、真实模型、现役 6677 | NOT_RUN；不继承上一轮模型评估。 |

本地证据分别在 `.context/checks/inline-edit-pipeline.log`、`presentation-unit.log`、`presentation-browser/results.json`、`inline-edit-ui-regression/results.json`，干净构建证据在 `.context/dsh-b0/build-evidence.json`。失败截图/文字保留在对应浏览器证据目录。排查中修正了预览重新序列化导致来源哈希不一致、原生侧栏挂载时机、测试宿主缺少新增服务，以及旧测试仍假定“点击 AI 即发送”的流程。实际文件探针改为用户列表点击，避免测试自行重复打开页面导致选择状态竞争。此前变更中运行的流水线未算通过，最终固定源码后完整执行退出 0。


### OCR 复核与修理（同日后续）

按 open-code-review-delegate 的 workspace 清单，复核 46/46 文件（36 个 OCR 可审文件及 10 个补充文档/声明），0 跳过，覆盖率 100%。确认的 4 处代码问题已修复：

1. 旧文案身份缓存失效不完整，脚本复用同一文字节点会误套旧修改。现在验证外部文本变更及最后显示值，涵盖元素移出页面后再复用。
2. 冻结 AI 候选省略可选默认值时，前端与后端合同不一致，预览会抛错。现对齐默认值并继续拒绝非法字段。
3. 右栏确认回执丢失后，标签销毁会丢掉待核对状态，也未接入宿主离开保护。现按任务保持客户端，重开沿用原候选核对。
4. 保存成功状态先于请求结束时，预览请求会被 busy 拒绝，可能出现空白。现等待空闲后加载，按候选去重，隔离任务缓存。

本次新增失败证据先于修复保留；STATUS 另触发行数门禁，已将施工摘要放回既有入口并保留详细记录。最终完整 B0 再次通过：605 项后端、递归前端 617 passed / 1 skipped、类型/构建/编译接线/干净重建通过；被跳过的外部示例已在 presentation 专项 13/13 中执行。组合前端专项 43/43，后端专项 12/12；这些数字有包含关系。合成后端全套 2846 passed / 77 skipped，先前成功的 8 组加文档修复后的失败/剩余 4 组覆盖全部 278 个测试文件，不重复累计失败组。

实际示例浏览器新增为 6 组，覆盖确认已落盘但响应丢失、右栏重建、原候选幂等核对和保存后恢复显示；真实 HTTP/SQLite，聊天/模型仍为测试桩。此前 15 组 UI 回归本轮未重复执行。完整 DSH 宿主、真实模型、本人 UAT、6677 切换仍未执行。

证据集中在 `.context/checks/cockpit-ocr-review/`：`review.json`、`coverage.json`、`pipeline-final.log`、`python-combined.json`、`presentation-final.log` 与 `browser-verified/results.json`。最初的失败日志、浏览器截图和测试生成证据均保留；历史 T0 文件已恢复原内容。

## 收尾（2026-09-21）

本轮实现与 OCR 修理在隔离工作树收口，**不作为上线完成**。产品仍 PARTIAL。候选 0.15.0.0 走 `/ship`；未合入、未把本候选加载 6677（现役 6677 仍是公开 0.14.0.0 / CRM 分析组板）。

| 项 | 状态 |
|---|---|
| 工作树 | `/Users/hutou/.codex/worktrees/cockpit-inline-edit/fuqing-crm-analytics`，分支 `codex/cockpit-inline-edit` |
| HEAD | `d521051c`（#38 / v0.14.0.0，快进完成） |
| 公开 main | `d521051c`（#38 / v0.14.0.0） |
| VERSION | 候选 0.15.0.0；公开 main 0.14.0.0 |
| 确认问题 | 4 修 / 0 未修 |
| 变基前合成验证 | B0 PASS；后端 2846 passed / 77 skipped；浏览器 6 组 PASS（数字停在快进前，不带到变基后） |
| 变基后接触面 | Node 45 passed / 0 skipped（含 html-rendered-text 示例包）；Python 17 passed（presentation + STATUS 行数）。证据 `.context/checks/cockpit-rebase-contact/` |
| 合成门禁 | backend 2873 passed / 77 skipped / 71 deselected；B0 pipeline PASS |
| 真实 MiniMax | MiniMax-M3 五项 PASS（unicode-title / phrasing-context / section-inline-style / refuse-shared-css / refuse-executable-link）。6677 未重启。证据 `.context/checks/cockpit-native-eval/` |
| 未跑 | 本人 UAT、现役加载本候选 |

下一步（需另授权）：合入后 `授权 reload` 加载 6677；本人 UAT。
