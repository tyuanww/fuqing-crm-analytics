# 旧 HTML 编辑链语义收口与修复（2026-10-08）

## 结果

从集成工作树 `codex/plugin-boundary-review` 的 commit d78c7cd5 继续，使用 `open-code-review-delegate` 对旧 HTML 工作树的 43 项差异逐项盘查。旧树 HEAD 为 `fe5243ff883923041162a14f410a98ca30f19fb9`，旧树与未提交成果保持原样；不进行整文件回灌、清理或删分支。

**34 项语义差异已全部归类：22 项已接入并扩展、7 项被当前实现替代、3 项为历史文档证据、2 个源码文件有真实遗漏/回归。** 另有八项内容完全相同、一项既有提交版本差异。OCR 选择的 31 项全部已审，过滤外 12 项也纳入，合计 43/43、零跳过。具体表见下方；原始 diff/hash/规则和调查日志在 `.context/checks/html-semantic-triage-20261008/`。

## 已修复的五个行为

1. **预览失败保留草稿**：实际 patch-preview 503 后，旧代码吞掉错误并清稿，错误允许离页。现在无 preview 就返回失败，保留文字。失败原行为没有发送 confirm，不应误称为“保存旧包”。
2. **画布文字进入保存链**：恢复接收经现有 iframe source/origin/channel/page/version/target 校验的 `textValue`；原值按页面、版本、节点保存，兼容多次输入、runtime targets 刷新、富文本和还原原文。浏览态、绑定页、inspectOnly 与旧 frame 消息仍拒绝写入。
3. **源码与多节点文字草稿互斥**：切换选区后的暂存文字仍参与保护，两个方向都先处理已有草稿。
4. **显式放弃能离页**：同时清理 textDraft/textDrafts/textDraftNodes；已保存源码及版本保持不变。
5. **测试入口补回 17 项**：`test:html-edit` 原路径错误，Node 24 多文件模式仍报 78 项成功，实际漏跑 AI client 17 项。修正到真实 test 目录并增加 16 项行为回归，现完整入口为 111 项。

新增组件测试通过 kit 公开 `inspectToolchain/loadBundler/loadBrowserModule` 获取固定编译器和 React，可以使用缩减 SDK；没有把完整 DSH/Vite 源码重新作为插件测试的隐式依赖。未改上游、接口生成物、业务数据或视觉布局。

## 本次验证与失败恢复

主 Agent 应用补丁后，在新的 `clean-plugin` 副本使用 Node 24.19.0、固定缩减 SDK `received-r3`（closure `37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4`）验证，源码逐文件 SHA 在 `.context/checks/html-integration-20261008/clean-source-manifest.json`。仅副本生成 lib/依赖链接，现有工作树指向历史依赖的链接未被覆盖。

| 实际入口 | 本轮结果 | 证据 |
|---|---|---|
| 文档已有 kit-link + `node build.mjs <upstream> <build-tools>` | host/client 完整 strict 类型检查与全部 host/client/view 构建通过，8.60 秒 | `html-integration-20261008/build-r3.log`、`result-r3.json` |
| package.json `test` 的四个基础 Node 文件 | **35 PASS / 0 SKIP** | `base-test-r3.log` |
| 修正后的 `test:html-edit` 所列全部文件 | **111 PASS / 0 SKIP** | `html-test-r4.log`、`result-r4.json` |
| `node --test test/built.test.mjs` | **2 PASS / 0 SKIP**，实际构建后入口 | `built-test-r4.log` |
| backend `test_cockpit_ai.py test_page_documents.py`（Python 3.14.4） | **51 PASS** | 语义审查目录 `python-targeted-r2.log` |
| 旧树抽取的五个关键兼容用例 | **5 PASS**；只将旧 positional 参数适配为当前 keyword，隔离小库 | `python-legacy-compat.log` |
| 当前 Node 语义基线 15 个文件 | **145 PASS / 1 SKIP**；真实 standalone 样例变量未提供，明确保留 SKIP | `node-targeted-r2.log` |
| 新回归先运行旧实现 | 15 项中 **7 FAIL**，另显式放弃 **1 FAIL**；随后最终 16 项均通过 | `regression-current-baseline.log`、`regression-discard-before.log`、修复后完整入口 |

执行测试脚本前逐项核验文件存在，避免错误路径再次静默漏测。实际测试 argv/cwd/退出码保留在两个目录，不将模拟 fetch/JSDOM 说成真实浏览器或生产 HTTP。

失败证据保留：首次直接 `pnpm build` 触发自动安装，因插件私有开发依赖未登记在旧 registry lock 中而被 frozen-lock 拒绝；没有关闭 frozen 检查或改锁。按现有 kit 文档显式接线后，原工作树中的历史 antd 链接与新 SDK 不同，正确拒绝覆盖，随后改用完整源码副本做正式 build。该副本首次 HTML 测试未复制现有 3 KB 合成 frozen-contract 夹具，110/111；按原测试的仓库相对位置补齐同 SHA 夹具后 111/111，`contract-fixture.json` 留存来源摘要。**本次通过的是既有显式 kit/Node 构建入口；不宣称直接 pnpm 包装入口已通过，也不宣称测试完全不需要共享合同夹具。** 分仓前仍应收敛私有依赖安装入口与测试夹具的独立供给。

提交前主 Agent 全文审查五个业务/测试文件，原生子 Agent 五项复核无新发现（测试仅按摘要/装配审查）；文档另由主 Agent 核对。正常 hooks 本地提交，不 push。真实模型、6677/旧 CRM、浏览器 E2E、远端 CI 和 HTML 包的杭州运行 **NOT_RUN**；不把 WSL SDK 对旧上传源的结果转授给本次 HTML 增量。

## 逐文件历史差异结论

以下结论依据本轮真实源码、生成物摘要和定向执行；“真实遗漏需修”标识初次审查归类，对应修复已经应用并通过上述验证。旧树继续保留。

|序号|路径|原分组|本次结论|语义证据|
|---:|---|---|---|---|
|01|`backend/contracts/analytics-page.openapi.json`|requires_semantic_review|已接入并扩展|旧25个schema的全部properties保留；当前37个schema新增正式NodeRef/presentation/context/CAS合同，OpenAPI声明/计算/types三者digest完全一致。|
|02|`backend/contracts/page_documents.py`|requires_semantic_review|已接入并扩展|PageFocusRef/source范围及PagePatchPreview校验保留；新增正式节点编辑模型；bound package presentation拦截更强。|
|03|`backend/services/analytics/cockpit_ai.py`|requires_semantic_review|已接入并扩展|UTF-8 32000字节上下文、页面版本校验、候选文件安全读取/冻结/hash/confirm、绑定页CSS-only保留；Python旧5例经仅签名兼容后全通过。|
|04|`backend/services/analytics/cockpit_ai_routes.py`|requires_semantic_review|已接入并扩展|begin route仍把edit_context交给service；本轮新增rendered_selection和keyword-only参数是当前合同，不能搬回旧positional API。|
|05|`backend/services/analytics/page_documents.py`|requires_semantic_review|已接入并扩展|source范围/token/hash/HTML树/CSS唯一范围/JS行范围校验保留；bound save不再仅限制manual，并保护presentation/resources/node_map。|
|06|`backend/tests/test_cockpit_ai.py`|requires_semantic_review|新实现已替代|当前测试覆盖候选落盘、作用域、绑定页、实际HTTP等；旧5个删除测试抽取到独立兼容测试全部通过，不是能力删除。|
|07|`backend/tests/test_page_documents.py`|requires_semantic_review|已接入并扩展|旧scope/CSS-only/越界负测语义保留且增加正式上下文、presentation、CAS等；定向51例含此文件。|
|08|`docs/operating/cockpit-ai-edit.md`|requires_semantic_review|历史文档证据|旧操作说明混有当时调用/端口/人工接链描述；当前说明已有原生任务、候选、只确认保存及后续合同；不把旧段落当新待办。|
|09|`dsh-plugins/analytics-workbench/README.md`|requires_semantic_review|历史文档证据|旧插件说明对应旧产品名/版本/布局，当前SDK边界和工作区为新基线；不恢复旧依赖/品牌/架构。|
|10|`dsh-plugins/analytics-workbench/package.json`|matches_prior_committed_blob|已有提交版本差异|此前分类为prior committed blob；架构差异不回灌。但本次实测test:html-edit错误src/client路径静默漏17个AI client tests，需单行修正。|
|11|`dsh-plugins/analytics-workbench/src/client/cockpit-ai-client.d.mts`|requires_semantic_review|已接入并扩展|BeginRequest.edit_context与selected source合同保留；当前完整任务/receipt/stream context边界扩展，不回退types。|
|12|`dsh-plugins/analytics-workbench/src/client/cockpit-ai-client.mjs`|requires_semantic_review|已接入并扩展|原生任务要求写candidate文件、SELECTED.json宿主上下文、32KB前置检查、候选hash确认保留；当前重试身份和跨页/版本/范围隔离更强。|
|13|`dsh-plugins/analytics-workbench/src/client/cockpit-page-editor.tsx`|requires_semantic_review|真实遗漏需修|旧choose消费selection_hints.textValue在新commitSelection中丢失；真正React/JSDOM组件复现画布输入不进draft。附兼容当前runtime/richText的修复。|
|14|`dsh-plugins/analytics-workbench/src/client/cockpit-workspace-style.ts`|requires_semantic_review|新实现已替代|旧rail/toolbar样式被当前sidebar/floating shell布局替代。已读DESIGN，无证据要求恢复旧视觉实现。|
|15|`dsh-plugins/analytics-workbench/src/client/cockpit-workspace.tsx`|requires_semantic_review|新实现已替代|当前工作区保留源码选区/整页入口，新增产物收件箱与正式确认/全屏/离开守卫等；旧布局组件不可整体回灌。|
|16|`dsh-plugins/analytics-workbench/src/client/free-html-library/html-edit-kernel.mjs`|matches_current_HEAD|内容完全相同|SHA256相同；旧kernel已经逐字接入。|
|17|`dsh-plugins/analytics-workbench/src/client/free-html-library/html-edit-kernel.test.mjs`|matches_current_HEAD|内容完全相同|SHA256相同；旧kernel tests已经逐字接入。|
|18|`dsh-plugins/analytics-workbench/src/client/free-html-library/html-import.mjs`|requires_semantic_review|新实现已替代|旧导入能力保留，主动外联转quarantine/离线资源处理，并保存origin_content_hash；module/defer/async边界仍拒绝，勿恢复旧无条件外链拒绝。|
|19|`dsh-plugins/analytics-workbench/src/client/free-html-library/html-import.test.mjs`|requires_semantic_review|已接入并扩展|导入失败/候选/确认基础行为仍测；新增外联隔离与哈希路径语义，旧导入测试意图保留。|
|20|`dsh-plugins/analytics-workbench/src/client/free-html-library/live-adapters.mjs`|requires_semantic_review|已接入并扩展|源码preview/save/manual origin与完整patch context保留；新增artifactInbox、显式confirm和正式presentation通道是当前边界。|
|21|`dsh-plugins/analytics-workbench/src/client/free-html-library/p12-live-adapters.test.mjs`|requires_semantic_review|已接入并扩展|原HTTP适配、source scope和绑定限制仍覆盖；新增收件箱与receipt行为。定向Node及修复套件通过。|
|22|`dsh-plugins/analytics-workbench/src/client/free-html-library/store.d.mts`|requires_semantic_review|新实现已替代|current.d.mts保留sourceDraft/page edit API，新增多文字/收件箱/正式上下文；旧UI用history时间字段展示已被简化版本行替代，非持久化数据丢失。|
|23|`dsh-plugins/analytics-workbench/src/client/free-html-library/store.mjs`|requires_semantic_review|真实遗漏需修|旧单文字草稿被多文字方案替代，未同步处理preview失败/双向源码互斥/discardForLeave maps清理；真实store回归已复现并修复于snapshot。|
|24|`dsh-plugins/analytics-workbench/src/client/html-selection-bridge.d.mts`|requires_semantic_review|已接入并扩展|selection hints声明保留；节点扩展为editableText/inspectOnly/runtime/richText，补丁按当前类型接入。|
|25|`dsh-plugins/analytics-workbench/src/client/html-selection-bridge.mjs`|requires_semantic_review|已接入并扩展|edit模式capture事件阻断、input payload/已知目标/channel/source/origin/version验证都在；runtime MutationObserver和大小限制更强，问题在接收者editor。|
|26|`dsh-plugins/analytics-workbench/src/client/html-selection-bridge.test.mjs`|requires_semantic_review|已接入并扩展|浏览交互保留、编辑事件阻断、重复/stale目标与frame来源等旧测试意图仍在。|
|27|`dsh-plugins/analytics-workbench/src/free-page/contract/page-contract.generated.d.ts`|requires_semantic_review|已接入并扩展|生成types与当前OpenAPI digest一致；已核对旧 schema 属性全部保留。不要手动回灌旧generated类型。|
|28|`dsh-plugins/analytics-workbench/src/free-page/resource/package-normalize.mjs`|requires_semantic_review|新实现已替代|当前normalizer仍处理full document，改进引号内>和data-svg；presentation加宿主marker避免source hash不匹配。旧实现回灌会倒退。|
|29|`dsh-plugins/analytics-workbench/src/free-page/resource/package-normalize.test.mjs`|requires_semantic_review|已接入并扩展|旧normalize/资源边界测试保留，新增data-svg引号>回归，修复后包入口全绿。|
|30|`dsh-plugins/analytics-workbench/src/free-page/source-index/parse.mjs`|requires_semantic_review|已接入并扩展|旧source parse/html/css/js定位全部保留，新增scanHtmlElements/侧车图；Unicode token在index边界已改codepoint不可倒退。|
|31|`dsh-plugins/analytics-workbench/src/free-page/source-index/source-index.test.mjs`|matches_current_HEAD|内容完全相同|SHA256相同；source-index旧测试逐字接入。|
|32|`dsh-plugins/analytics-workbench/test/cockpit-ai-client.test.mjs`|requires_semantic_review|已接入并扩展|17项当前AI client tests实际存在且通过，包括候选身份、版本、scope、未知回执及重试；当前package脚本路径漏执行，附修复。|
|33|`scripts/dsh-dev/README.md`|requires_semantic_review|历史文档证据|旧dev说明为旧构建与运行证据，当前kit构建路径/独立插件基线已替代，不根据旧说明启动服务。|
|34|`scripts/dsh-dev/cli.mjs`|requires_semantic_review|新实现已替代|当前parseArgv帮助/非法参数/自有实例与独立kit构建更完整；旧help小改不应覆盖当前CLI。|
|35|`dsh-plugins/analytics-workbench/src/client/free-html-library/source-draft.test.mjs`|matches_current_HEAD|内容完全相同|SHA256相同；旧source-draft基础测试逐字接入，但不能覆盖新多文字互斥，本次补负测。|
|36|`dsh-plugins/analytics-workbench/src/free-page/edit/intent-router.d.mts`|matches_current_HEAD|内容完全相同|SHA256相同；旧intent类型逐字接入。|
|37|`dsh-plugins/analytics-workbench/src/free-page/edit/intent-router.mjs`|requires_semantic_review|已接入并扩展|原source_range/presentation/明确整页路由保留；新增正式present/structural分类，失败不会静默扩到整页。|
|38|`dsh-plugins/analytics-workbench/src/free-page/edit/intent-router.test.mjs`|requires_semantic_review|已接入并扩展|旧路由意图保留，当前新scope测试已通过。|
|39|`dsh-plugins/analytics-workbench/src/free-page/edit/selection-context.d.mts`|matches_current_HEAD|内容完全相同|SHA256相同；selection-context旧声明逐字接入。|
|40|`dsh-plugins/analytics-workbench/src/free-page/edit/selection-context.mjs`|requires_semantic_review|已接入并扩展|旧受限范围/edit_context/32KB payload保留；新增codepoint偏移边界，与Python字符串位置对齐。|
|41|`dsh-plugins/analytics-workbench/src/free-page/edit/selection-context.test.mjs`|requires_semantic_review|已接入并扩展|旧32KB、无映射/多页隔离等语义保留；新增偏移与正式范围测试。|
|42|`dsh-plugins/analytics-workbench/test/dynamic-chart-browser-seam.test.mjs`|matches_current_HEAD|内容完全相同|SHA256相同；动态chart seam测试逐字接入且实际执行通过。|
|43|`dsh-plugins/analytics-workbench/test/fixtures/html-edit/manifest.json`|matches_current_HEAD|内容完全相同|SHA256相同；fixture manifest是测试输入证据，保留。|
