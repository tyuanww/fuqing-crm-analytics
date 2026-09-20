# 驾驶舱 UI / UX · 0.13.0.0 发布候选（2026-09-21）

当前候选位于公开仓库 `fuqing-crm-analytics` 的隔离工作树，本轮审计起点为 `origin/main` / `106717e6`，分支为 `codex/cockpit-ui-ux-ship`。主任务计划同步到 `73ee74c6`，本文不将该计划记为已完成。仅移植旧 `codex/cockpit-ui-ux` 的本任务补丁，没有合并旧仓库历史；旧工作树与证据保留。用户已选择版本 **0.13.0.0**，要求先补真实模型评估再创建 PR。真实 MiniMax-M3 已取得 **5/5 中间评估通过**；其后又补充任务说明、评估判据和删除焦点修复，最终模型评估及 pipeline 尚待执行。未创建本轮 PR、合并或切换现役 6677。产品仍 PARTIAL。

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

独立外审原文保留于 `.context/checks/cockpit-ship/outside-structured.md`；主审按实际源码核验，不把外审建议直接计为缺陷：

- “已完成 AI 任务永久锁死新选区”是误报：客户端 `accept()` 将 SAVED / CANCELLED 从 `jobs` 移除，服务端 `list()` 也用 `status NOT IN ('SAVED','CANCELLED')` 过滤；完成说明保留在 `active` 不等于仍占用未完成任务列表。
- “恢复产物后焦点丢失”已修复；最新 `restore-focus.log` 为 2 项通过，最终整套回归仍待补。
- 父→iframe 的 `postMessage('*')` 用于无 `allow-same-origin` 的 opaque-origin 沙箱；接收端严格核验窗口、opaque origin、通道、页面、版本、字段及唯一已知节点，消息本身不授权写入，服务端继续核验选区。未按该建议改宽沙箱或改造通信协议。
- 按住方向键逐次 PATCH 是低优先级性能建议；当前请求串行落库，后续可评估合并持久化，不将其列为已修复的数据正确性问题。

## 当前公开候选：实际验证快照

以下结果均来自本工作树 `.context/checks/cockpit-ship/`，各测试层有重叠，不相加为总用例数。

| 层级 | 已取得结果及限制 | 证据 |
|---|---|---|
| B0 pipeline | 该次运行 PASS：593 项 Python、核心 Node / 编译后 DOM 603 项，以及类型、合同、Ruff、插件构建与干净重建；早于最新恢复焦点修复，不能当作最终候选已全量通过 | `b0-final.log` |
| 共享后端矩阵 | 275 个目标、11 组全部退出 0；JUnit 汇总 **2808 passed / 77 skipped，零失败、零错误**，另有 71 deselected；Ruff 和 Agent 入口检查通过。skip / deselected 不计通过 | `backend-final.log`；原始 `summary.json` 与 11 份 JUnit 位于 `.context/checks/20260920T172126749667Z/` |
| Chromium + FastAPI / SQLite 合成探针 | 15 项 PASS，包含“浏览器无未处理异常”一项；含可执行链接只读、HTML 手动保存、选区任务落盘及既有 UI 回归。原生会话入口仍是夹具，未调用模型；不覆盖其后最新恢复焦点修改 | `browser-final/results.json`、`browser-final.log` 与同目录截图 |
| 源码/bridge 针对性回归 | 12 项 PASS，含深度上限与 opaque-origin 消息校验；首帧选择与重挂载组合另有 3 项 PASS | `source-targeted.log`、`selection-race.log` |
| 最新恢复焦点修复 | 2 项 PASS；只证明该次针对性回归，最终 pipeline 待跑 | `restore-focus.log` |
| 非 live 源码选区确认 | G1 新增 3 项针对性测试 PASS，覆盖本地源码范围确认分支；最新完整 pipeline 待跑 | 当前候选的非 live store 定向回归 |
| 真实模型评估 | **中间 5/5 PASS**：现役原生 `minimax-cn / MiniMax-M3`、独立合成目录、临时专用 preset；3 项修改经过双轮对话、present、真实 collect/confirm 和独立版本重开，2 项越界需求拒绝且保留版本 1。其后修复尚未包含在此结果内 | `model-eval-refined.json`；浏览器探针自身的 `real_model: NOT_RUN` 仍如实保留 |
| 未执行验收 | 完整 DSH 宿主浏览器、真实用户 HTML UAT、Office / PDF 兼容扩展、远端 CI、现役部署切换与状态降级验证 | 当前 `full_dsh_shell` 为 `NOT_RUN`；产品仍 PARTIAL |

`b0-final.log` 和 `backend-final.log` 的证据包装器均提示运行期间工作树发生变化，未记录完整内容指纹、评级为 STALE。原始运行通过事实保留，但不能冒充冻结后的最终差异已验证；最终 pipeline、最终真实模型评估及其证据待主任务完成后补记。此前失败的 `b0.log`、`backend.log`、浏览器初次/中间日志、真实模型 `model-eval-first.json` / `model-eval-guarded.json` / `model-eval-recovery.json` 与外审原文保留，不覆盖失败结果。

`model-eval-refined.json` 记录合计 **164420 tokens**：输入 37848、输出 6776、缓存读取 119796；供应商计费金额未知，不按 token 数推算费用。该次未重启现役服务、未改模型设置，临时 preset 已移除。工具边界由原生会话 scope guard 执行，记录中包含被拒绝的额外工具尝试，不能将其误记为实际执行了业务查询或 shell。

人工复核随后发现拒绝文案虚构了 CSS 选区入口，已在任务说明中明确本入口不提供 CSS/JS/资源选区或扩权操作；重复 HTML 属性的评估判据拒绝回归仍在补齐。删除确认 pending 状态的焦点修复及 DOM 回归也在进行。因此上述模型 PASS 是有限五个合成案例的中间证据，不能提前证明最终提示词、判据或 UI 已验证。

本轮 Step 7 的 **AI 评估覆盖为 27/30 条关键路径（90%）**，不是仪器行覆盖。G1 已由 3 项定向测试补齐，G5 已有有限五案例真实模型证据；剩余 G2（浮动栏取消/边界）、G3（全屏失败恢复）、G4（删除 dirty / 慢请求 / 失败恢复完整流程）仍开放。G4 的焦点和 pending 修复只计部分覆盖，不提前关闭全部 dirty 路径。

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
