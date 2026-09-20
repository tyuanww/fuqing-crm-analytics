# 驾驶舱 UI / UX · 0.13.0.0 发布候选（2026-09-21）

当前候选位于公开仓库 `fuqing-crm-analytics` 的 `cockpit-ui-ux-public` 隔离工作树，分支为 `codex/cockpit-ui-ux-ship`；最终 diff 基线为 `origin/main` / `481f2f0`（#35 文档，代码基线为 #34 / `73ee74c6`）。保留主线 CRM 入口与本轮全屏动作。仅移植旧 `codex/cockpit-ui-ux` 的本任务补丁，没有合并旧仓库历史；旧工作树与证据保留。用户已选择版本 **0.13.0.0**，要求先补真实模型评估再创建 PR。真实 MiniMax-M3 的最终五项评估已通过，人工复核两项拒绝答复不再虚构操作入口；删除全异步链焦点修复及定向回归完成，合并后完整检查通过（后端 2834 passed / 77 skipped，B0 593 项 Python 与核心 Node / DOM 605 项及构建）；最终提示文案增量 B0 冻结复验通过，公开工作树正常 pre-push 完整通过，代码 `7836547` 已正常推送。尚未创建本轮 PR、合并或切换候选至现役 6677；主线 CRM #34 的 CI、运行切换及真实账号验收不代替本轮驾驶舱 / HTML 验收。产品仍 PARTIAL。

固定 DSH 上游源码与业务架构保持不变；验证使用合成数据和隔离小库。下面的“当前公开候选”记录与后面的“旧工作树历史”分开，旧 SHA、旧测试计数和旧 `.context` 路径不作为当前候选的通过证据。

## 行为变化

- 产物行只保留标题，完整路径及来源通过悬停查看；搜索仍可匹配来源。删除先确认，移入当前账号的回收站，可恢复；原文件和历史版本保留。
- 按用户确认，拖动“产物”标题栏移动整个面板；浮动面板右下角可同时调节宽高，右侧分隔条调宽，“停靠”恢复左侧。Esc 取消当前拖动，方向键也可移动和调宽；位置、尺寸、顺序及回收站落盘，窄屏回到可用布局。另保留同类列表项拖动排序。
- “全屏展示”进入浏览器全屏，隐藏侧栏、标题条、工具条与 AI 提示，Esc 或右上角按钮退出。普通模式标题/版本并为单行；已保存、已放弃的 AI 信息折叠为一行。
- 修复预览构建器的结束标签正则：原先 `head` 前缀会误伤 `</header>`，现在仅匹配完整的 html/head/body 包装标签；安全沙箱和包装转义保留。
- 普通静态 HTML 无需专用 `data-shine-node` 也能点选改字；沿用“预览修改 → 确认保存”的不可变版本流程。源码定位不写入永久映射或预览标记；已存在映射继续沿用原编辑路径。
- 点选后可选择上级静态板块，再点击“用 AI 修改此选区”。范围、原版本和 HTML 哈希持久化；服务端核验边界，拒绝选区外 HTML、共享 CSS / JS / 资源及映射改动。继续使用现有原生 Agent Loop，没有第二运行时。

使用方式和 HTTP 合同见[产物修改说明](../operating/cockpit-ai-edit.md)。原始 HTML 要先保存为可编辑副本。动态区域、业务绑定内容或不可靠结构保持只读；外链、module / defer 等既有导入限制保留。

## 当前公开候选：修复与审查处理

| 问题 | 当前实现与证据边界 |
|---|---|
| 删除当前看板后重新进入驾驶舱又显示 | 自动打开、缓存选择、原生看板预览与页面跟随共用资格检查，等待偏好加载并排除回收站；清除共享选择意图，保留原版本。回归覆盖 pages / board 重挂载及延迟偏好 |
| 首帧 targets 与 selection 连续到达，React 尚未刷新导致第一次点击被丢弃 | bridge 在点击前同步发布资格；宿主按同一消息监听器内的最新资格验证，已验证的画布选择直接提交，宿主下拉仍校验当前资格。`selection-race.log` 含该回归 |
| 可执行 URL 属性仍被当成静态选区 | 预览运行时与服务端校验归一化后的协议，拒绝可执行链接、事件属性及其受影响范围；静态兄弟文字保持可用，普通链接与静态图片不一刀切禁用 |
| 片段字节未越界，但浏览器按上下文重排 HTML | 服务端要求候选保留单一同标签根元素，并按原祖先链检查保守静态内容模型；拒绝段落内块元素、嵌套链接/按钮及不合法列表等重排情形 |
| 超深嵌套导致解析开销失控 | 前端源码推导和服务端解析设置 256 层上限；超限立即拒绝，服务端选区校验包含原祖先深度 |
| 删除/恢复与排序键盘焦点丢失 | 打开删除弹窗前记录触发按钮，取消后恢复；删除或回收站恢复使按钮移除时回退到产物标题抓手。排序保存期间用 `aria-disabled` 和事件门控保留手柄焦点；最新恢复焦点修复后已有 2 项针对性回归通过 |
| 长标题换行和全屏/窄屏 CSS 覆盖 | 标题容器允许收缩，单行省略，版本徽标不收缩，保留完整标题提示。移除 3 处不必要的新增 `!important`；窄屏覆盖浮动内联坐标及高度的 2 处规则保留并说明原因 |

当前 reviewable 文件 **37/37 已审查、0 skip**，另 9 个工具排除项已人工审计；转树后全部 reviewable 指纹匹配。结构外审完成一次，对抗外审调用不可用，不能计为通过。独立结构外审原文保留于下述来源工作树的 `.context/checks/cockpit-ship/outside-structured.md`；主审按实际源码核验，不把外审建议直接计为缺陷：

- “已完成 AI 任务永久锁死新选区”是误报：客户端 `accept()` 将 SAVED / CANCELLED 从 `jobs` 移除，服务端 `list()` 也用 `status NOT IN ('SAVED','CANCELLED')` 过滤；完成说明保留在 `active` 不等于仍占用未完成任务列表。
- “恢复产物后焦点丢失”已修复；最新删除全链定向回归为 5 项通过，合并后整套回归已通过。
- 父→iframe 的 `postMessage('*')` 用于无 `allow-same-origin` 的 opaque-origin 沙箱；接收端严格核验窗口、opaque origin、通道、页面、版本、字段及唯一已知节点，消息本身不授权写入，服务端继续核验选区。未按该建议改宽沙箱或改造通信协议。
- 按住方向键逐次 PATCH 是低优先级性能建议；当前请求串行落库，后续可评估合并持久化，不将其列为已修复的数据正确性问题。

最后 Claude Code 设计外审原文见 `outside-design.md`：恢复列表 AI/版本副行与用户“仅标题”要求冲突，未采纳；方向键移动浮出符合当前交互；旧色彩令牌更名不扩入本轮。确认的 SAVED + 刷新失败错误回退文案已修复，并独立复核状态路径。外部调用返回内容，但缺少校验器要求的结尾 Recommendation 标记，工具状态按 `unavailable` 保留，不把格式缺口记作 clean。

## 当前公开候选：实际验证快照

浏览器、模型及审查原始证据保留在来源工作树 `/Users/hutou/.codex/worktrees/cockpit-ui-ux-ship/fuqing-crm-analytics/.context/checks/cockpit-ship/`；下表未标明“当前树”的文件名均相对此目录。该树继承 `no-push://private-history-use-public-snapshot`，因此从独立公开克隆导入确切公开祖先的本轮提交建立当前树，未修改保护配置。当前树 `.context/checks/cockpit-ship/public-transfer-evidence.json` 记录 37 项审查与 6 项模型源码哈希全部匹配，#35 仅改 Markdown。各测试层有重叠，不相加为总用例数。

| 层级 | 已取得结果及限制 | 证据 |
|---|---|---|
| B0 pipeline | 合并后完整 PASS：593 项 Python、核心 Node / 编译后 DOM 605 项，以及合同、类型、Ruff、Cordis 装配和干净重建；其他 Node 分组与核心有重叠，不相加 | 当前树 `.context/checks/cockpit-ship/prepush.log`；来源树 `integrated-final.log` / `b0-release.log` 保留 |
| 共享后端矩阵 | 277 个目标、12 组退出 0；JUnit 汇总 **2834 passed / 77 skipped，零失败、零错误**，另有 71 deselected。Ruff 和 Agent 入口通过；skip 不计通过 | 当前树 `.context/checks/20260920T184020184667Z/summary.json` 与 12 份 `group*.xml`；正常 pre-push 退出 0 |
| Chromium + FastAPI / SQLite | 合并后 15 项 PASS、无未处理异常；覆盖拖动/缩放/停靠/回收站/全屏/390px/HTML 编辑与选区保护。原生会话打开仍为夹具，真实模型证据独立 | `browser-release/results.json` 与截图 |
| 删除异步链及选区回归 | 5 项定向 DOM PASS，含 Office 关闭及偏好写入慢请求、失败/重试、正反 Tab、重复激活阻断和恢复焦点；已纳入完整 pipeline | `library-workspace.test.mjs`；`integrated-final.log` |
| 评估器与工具范围 | 11 项 Python oracle 回归 PASS；5 项 Node guard PASS（包括固定上游实际 scope registry），均为合成测试 | 后端矩阵；`eval-guard-final.log` |
| 真实模型评估 | **最终 5/5 PASS**：`minimax-cn/MiniMax-M3`，3 项修改双轮 present → collect → confirm → 独立连接读回版本 2；2 项越界拒绝，无候选并保留版本 1。最终六项源码指纹全部匹配 | `model-eval-final.json`；人工复核拒绝答复无虚构入口 |
| 未执行验收 | 完整 DSH 宿主浏览器、真实用户 HTML UAT、Office / PDF 兼容扩展、远端 CI、现役部署切换与状态降级验证 | 当前 `full_dsh_shell` 为 `NOT_RUN`；产品仍 PARTIAL |

早期 `b0-final.log`、`backend-final.log` 因并行修改标为 STALE，保留通过事实但不作最终内容绑定。合并后首次完整运行因为本次命令 PATH 漏掉 `/usr/sbin/lsof` 而在临时备份夹具失败；确认 fail-closed 原因、恢复正常系统 PATH 后，完整矩阵通过。`integrated-path-failure.log` 与原失败报告保留。综合通过运行期间另修一行 SAVED 刷新失败提示，包装器同样标 STALE；后端源码未变，最后 B0 冻结验证已通过，当前公开工作树随后在冻结代码上正常 pre-push 完整通过并推送，日志保留完整门禁结果。此前浏览器/模型失败和外审原文均保留，不覆盖为成功。

`model-eval-refined.json` 记录合计 **164420 tokens**：输入 37848、输出 6776、缓存读取 119796；供应商计费金额未知，不按 token 数推算费用。该次未重启现役服务、未改模型设置，临时 preset 已移除。工具边界由原生会话 scope guard 执行，记录中包含被拒绝的额外工具尝试，不能将其误记为实际执行了业务查询或 shell。

人工复核随后发现拒绝文案虚构了 CSS 选区入口，已在任务说明中明确本入口不提供 CSS/JS/资源选区或扩权操作；评估判据已拒绝重复 HTML 属性，11 项评估器回归通过。删除确认的同步门控覆盖编辑器关闭、偏好写入和收尾，按钮保持可聚焦；两条延迟/失败回归连同相关重挂载和选区测试合计 5 项通过。上述 refined 结果仍保留为中间证据。

最终 `model-eval-final.json`：**5/5 PASS**，使用修复后的真实 TASK.md、原生初始提示和评估器。三项修改经 present、收取、确认保存为版本 2，并独立读回；两项拒绝无候选且保持版本 1。合计 **164723 tokens**（输入 27472、输出 5504、缓存读取 131747），费用未知；临时 preset 已移除，无服务重启或默认模型设置变更。`model-eval-release.json` 的自动判定也曾通过，但人工读答复发现虚构 CSS 选区建议，因此没有把该次结果作为最终交付证据；修正提示后重新运行并人工核对最终答复。

本轮 Step 7 的 **AI 评估覆盖为 27/30 条关键路径（90%）**，不是仪器行覆盖。G1 已由非 live 源码确认的新增 DOM 回归补齐，G5 已有有限五案例真实模型证据；剩余 G2（浮动栏取消/边界）、G3（全屏失败恢复）、G4（删除 dirty / 慢请求 / 失败恢复完整流程）仍开放。G4 的焦点和 pending 修复只计部分覆盖，不提前关闭全部 dirty 路径。

复现入口仍为固定工具链下的 `scripts/dsh-b0/pipeline.mjs --check --python /absolute/python3.14`、共享路径检查器 `scripts/ci/run_checks.py` 和 `dsh-plugins/analytics-workbench/test/cockpit-ui-ux-browser-probe.mjs`。运行参数按对应日志及当前验证矩阵；不因文档说明自动启动服务、迁移现役状态或调用模型。

## 旧工作树历史：审查修复（2026-09-21）

以下记录属于旧 `codex/cockpit-ui-ux` 工作树，起点为旧仓库 #217 / `7c20bc4f`，只保留移植来源及历史证据。所有相对 `.context` 路径均相对于该旧树，不是新公开工作树的当前验证。

旧树 OCR delegate 审查覆盖 36/36 文件，发现 R1（P1）及 R2–R5（P2），均由合成 HTML 的真实浏览器复现确认。该阶段按“开始维修”的授权修复五项；原审查和复现失败行为保留在 `.context/checks/cockpit-ui-ux-review/`，不覆盖成修复后的记录。

| 问题 | 修复及回归 |
|---|---|
| R1：混合映射 ID 冲突，选择第二段却改第一段 | 临时 ID 避让已有映射及 DOM 标识，重复身份拒绝选择。真实鼠标、下拉和 AI 范围均定位第二段；确认保存后第一段不变 |
| R2：SVG 自闭合标签禁用整页静态选区 | 前后端识别只读 SVG/MathML 子树；区分自身只读与包含只读子节点，保留同一容器内图标前后的静态文字。普通 HTML 的畸形自闭合结构仍拒绝；标题 AI 任务通过真实 HTTP 校验 |
| R3：下拉绕过动态内容只读限制 | iframe 回传当前运行中核验通过的选区，画布、下拉、上级板块及 AI 共用；校验窗口、通道、页面和版本。观察后续脚本改写，退出可编辑状态并保留草稿；暂停/重载时重新核验 |
| R4：编辑输入丢失首尾空格 | 原始编辑值与展示摘要分开，保留文本空白；保存后的 HTML 与实际显示均验证 |
| R5：新 AI 错误藏在旧完成状态内 | 区分错误消息与完成说明，新错误在折叠区域外以 alert 展示；旧信息保持紧凑，重试成功后清除错误 |

修复后完整 B0 流程通过：575 项 Python、核心 Node/编译后 DOM 598 项、类型、合同、Ruff、插件构建及干净重建。真实 Chromium + FastAPI/SQLite 的最终探针 14 项通过，零未处理浏览器异常，包含原 9 项和新增 5 项审查回归；计数存在层级重叠，不相加。

共享后端矩阵同步通过：273 个目标、11 组，2770 passed / 77 skipped，零失败；Ruff、导入检查和 Agent 入口检查通过。详见 `backend-plan.log`、`backend-summary.json` 与 `backend-runner-summary.json`；原始 JUnit 位于 `.context/checks/20260920T162519756443Z/`。跳过项不计通过；测试生成的 CRM 离线文件移存 `generated-crm-validation-result.json`，未混入产品差异。

旧树该阶段证据位于 `.context/checks/cockpit-ui-ux-repair/`：`repairs.json`（五项关闭记录和源码哈希）、`pipeline-1.log`、`build-evidence.json`、`browser-final.log`、`browser-final/results.json` 和 `browser-final/04-visible-ai-error.png`。`browser-1.log` 保留测试定位到两个同名“恢复预览”按钮的失败，收窄到工具条后通过；`browser-2.log` 是补充容器内图标边界之前的成功检查。历史 lane-b 生成文件另存 `generated-lane-b/`，不纳入历史报告差异。该阶段未调用真实模型，未提交或切换现役。

## 旧工作树历史：初次实现验证与证据（2026-09-20）

| 层级 | 旧树该阶段结果 |
|---|---|
| 完整 B0 pipeline | PASS：571 项 Python；所选 Node / 编译后 DOM（核心集合 593 项）；Ruff、离线合同、Host / Client 类型、插件构建、真实 Cordis 合成装配、干净重建及产物一致性。各组有重叠，不相加 |
| 共享路径矩阵 | PASS：backend full + B0 + tooling + FilterBuilder 选择；273 个后端目标、11 组，2766 passed / 77 skipped，零失败；后端 Ruff、导入检查与 Agent 入口检查通过。skip 不算通过 |
| 真实 Chromium + FastAPI / SQLite | 9 项 PASS，零未处理浏览器异常；包含完整面板鼠标移动/缩放、刷新恢复/停靠、删除取消/确认/恢复、标题与 header、无标记 HTML 改字保存、AI 选区落盘、全屏及 390px 窄屏 |
| AI 范围负测 | 过期哈希、Unicode 偏移、畸形/绑定区域、范围外 HTML、共享 CSS 和事件处理修改被拒绝；合法范围内候选确认后由独立存储实例读回 |
| 该阶段未执行 | 真实模型生成、完整 DSH 宿主浏览器、真实用户多份 HTML 文件 UAT、Office / PDF 兼容扩展、远端 CI、部署切换 |

工具链：Node 24.19.0、Python 3.14.4、固定上游 `ddefc45fbc7f8e46dd73185e68295696d1297887`。只读复用已有固定上游和构建依赖，未安装或升级。浏览器探针使用合成数据和独立临时端口，退出时只关闭自己创建的服务与浏览器；原生会话入口用显式夹具，未调用真实模型。

旧工作树内证据：

- `.context/checks/cockpit-ui-ux/pipeline-verified.log`：完整 B0 成功日志。
- `.context/dsh-b0/build-evidence.json`：固定版本、构建阶段及输出 SHA-256。
- `.context/checks/cockpit-ui-ux/backend-plan.log`：共享 backend / tooling 检查日志。
- `.context/checks/cockpit-ui-ux/backend-summary.json`：合成后端汇总；原始 JUnit 与执行元数据位于 `.context/checks/20260920T154916822063Z/`。
- `.context/checks/cockpit-ui-ux/browser-verified.log`、`browser/results.json`：旧树初次实现的浏览器结果。
- `browser/00-floating-panel.png`、`01-compact-preview.png`、`02-fullscreen.png`、`03-mobile.png`：四张旧树实际浏览器截图（相对于上面的检查目录）。
- 旧树初期失败日志保留：初建时 LFS 品牌文件尚未检出、旧 DOM 选择器歧义、原有映射路径兼容、拖宽跨 iframe 事件丢失、全屏/窄屏异步等待及偏好测试单字段约定。对应问题均修正后通过；不覆盖失败日志来冒充首次成功。
- pipeline 自动生成的历史 lane-b 报告另存到 `.context/checks/cockpit-ui-ux/generated-lane-b/`，受版本控制的历史报告恢复原内容。
- 共享后端测试新生成的 CRM 离线验证文件移存 `.context/checks/cockpit-ui-ux/generated-crm-validation-result.json`，不混入该阶段产品改动。

旧树复现入口：固定工具链下运行 `scripts/dsh-b0/pipeline.mjs --check --python /absolute/python3.14`；共享计划运行 `scripts/ci/run_checks.py --files-from .context/checks/cockpit-ui-ux/changed-files.txt --only python`；浏览器入口为 `dsh-plugins/analytics-workbench/test/cockpit-ui-ux-browser-probe.mjs`，显式提供已有的 `B0_BUILD_UPSTREAM`、`FQ_B0_PYTHON`、`COCKPIT_PLAYWRIGHT`、`COCKPIT_CHROMIUM`。这些历史入口与计数不代替上方当前候选验证。

## 存储与兼容

产物组织设置是现有小型文件 SQLite 中新增的 `cockpit_preferences` 表，按 owner 隔离，不改文件/版本记录。删除仅影响驾驶舱可见列表，恢复不复制或丢失原版本；旧代码忽略新增表即可读取原产物。AI 选区写入现有任务 context JSON，不改变业务绑定合同。尚未对现役状态运行迁移或验证降级。
