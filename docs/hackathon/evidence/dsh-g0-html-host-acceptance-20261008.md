# 固定官方 DSH 下的 HTML 编辑链隔离宿主验收（2026-10-08）

以下为该阶段封存执行记录，源码SHA和“未提交”均指采集当时；随后验收器的中断/截止时间/iframe就绪修复及同包最新17项复验见[提交前OCR审修](dsh-g0-host-tool-ocr-review-20261008.md)，不得把本表旧runner摘要当作之后源码摘要。

本轮结论：**最新独立 workbench 包在固定官方 DSH Host + headless Chrome 中实际完成 17/17 场景，已证实的本轮 HTML 缺陷修复完成。** 这是隔离 synthetic 验收，不是杭州生产发布，也不证明真实 DeepSeek 已写入候选。产品仍为 PARTIAL，`release_ready=false`。

本轮工作位置为 `/Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics`，分支 `codex/plugin-boundary-review`，源码基线 HEAD `5bf2bc77bde1e00ae82832a8b5aa2d6726563e38`。本轮代码尚未 commit；包对应**实际未提交源码**，没有冒称 clean SHA。原有六份未提交证据文档、所有旧包及失败输出保留。共享 STATUS/TODOS/计划/验证入口/runbook 由主 Agent 维护。

## 验收对象与不可变输入

- 官方 DSH 固定 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`。复用已构建的官方 checkout，Git tracked 状态干净；不改上游，不重新 prepare SDK。
- 官方 CLI `apps/cli/lib/bin.js` SHA256：`935e95d05f4dc70a8a013eea59da80028946b5c139e45c6351dcaf2810ca00a1`。
- toolchain pin SHA256：`8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe`。
- 复用 `received-r3` SDK closure：`37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4`。这项仅证明复用同一隔离 SDK 输入；不关闭其他组登记的 SDK 分发/信任门禁。
- kit 包 SHA256：`251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901`；board-components 包 SHA256：`22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`。
- 最终插件包：`/var/folders/tz/wswl3q3117v437rw68yd90gh0000gn/T/html-host-author-preview-sjrZqn/workbench.tgz`，SHA256 **`285f882ab9544da9043fb76cf15c55346fc4f84477575acc6724a0ea2af50d7b`**。
- 当前 **574 份**源文件/测试/锁定输入与独立作者目录逐字节相符；8 个打包成员与作者 lib/manifest 相符，接收后先检查整个解包树，再建立固定官方 peer links。pnpm pack 唯一 manifest 转换是去除开发用 `packageManager` 字段。
- 作者真实目录：`/private/var/folders/tz/wswl3q3117v437rw68yd90gh0000gn/T/html-host-author-preview-sjrZqn/outside-parent/author/plugin`。offline/frozen 安装、构建、测试、打包使用同一已准备 SDK；构建 sandbox 禁止联网及读取本业务仓的 dsh-plugins/scripts/docs/backend/config/node_modules，不通过根仓 lib 或临时修改上游绕过作者边界。
- 全部当前源摘要、原 570 份输入到当前 574 份的实际变化、Git dirty 状态、tracked diff SHA 在 [inputs-preview-final.json](../../../.context/checks/html-host-acceptance-20261008-r1/inputs-preview-final.json)；作者来源核对在 [artifact-audit.json](../../../.context/checks/html-host-acceptance-20261008-r1/author-preview-final-validation/artifact-audit.json)。

## 修复的实际缺陷

1. **新会话第一份 HTML 产物无法打开。** 原插件以内部 `tabsIn(sessionId).length > 0` 判断就绪，已 mounted 但零 tab 的新 seat 被阻塞。attempt-12 中 job.session_id、adapter.current.key、官方 public mounted 相同，tabs 为空，包字节与作者一致。改为等待 public `mounted`、开窗前重核目标会话，再调用 public `openResource`；不改官方 tab kind/track 或源码。
2. **卸载后迟到开窗。** 同一 client 在 mounted 等待中 dispose 后仍可能打开产物。插件拥有 AbortController，由官方 `ctx.effect` 释放；每个 await 后的 UI 副作用前检查 lifetime；helper abort 立即清 timer/订阅，真实错误向调用方传播。业务 job/context 保留，不把插件卸载当作取消任务。真实编译 Cordis client 的 dispose 回归通过。
3. **后端 raw-block 跳过范围双算。** `closing.end()` 已包含起始偏移，旧式 `start()+end()` 导致长 style/script/template/textarea/title 后的正常元素未补映射，前后端来源范围不一致。修为 `tag_end + 1 + closing.end()`；五类回归均使用真实 PageDocumentStore 落盘、回读及节点范围核验。
4. **完整 HTML 文档预览显示 literal `</head>`。** 保存合同允许完整 document，但直接塞入 trusted wrapper 再 escape 根 close tags 会把这些文字显示在页面。新增仅用于预览的结构投影：复用已有 quote-aware source scanner，从单一完整 html/head/body 取原 body 和 head 内容，保留 html/body 属性与样式；head 实际 meta/base 由宿主负责。原源码、hash、node_map、presentation 校验对象不变；片段及不完整/重复 wrapper 沿原 fail-closed neutralization。原 CSP、meta/close-tag escaping、CSS/JS 防突破和 iframe sandbox 未弱化。
5. 独立只读核对发现投影后 root/body 属性中的 `resource:hero` 未走既有资源改写；已对两份 opening tags 同样使用 `rewriteResources` + 原 neutralization，正式 renderer 测试覆盖四处 alias。C 的首次 FAIL 只有原实跑工具输出，**没有来得及封存首次 FAIL 源码 SHA**，记录为 `NOT_CAPTURED_BEFORE_FORWARD_FIX`，没有重构旧实现冒充原字节。

旧范围任务恢复边界：读取旧 revision 会补映射，不重写旧快照；已经创建的 AI job 仍保留原 `source.json`，修 parser 不能原地修旧 job。旧失败或 WAITING 范围任务应先取消，再重新 begin 得到新 ID；本轮不覆写旧 source，不做业务数据迁移。

## 正式可复跑入口与验收脚本维修

正式 opt-in 入口为 `scripts/dsh-b0/html-host-browser.probe.mjs`，配套 inputs/cleanup 模块与 owned Host/HTTP fixtures。它只接收固定包，不为普通插件更新重新构建 runtime/prepare SDK；先进行只读输入检查，再在明确 `--run-isolated-host` 时启动自己拥有的实例。

inputs guard 要求 Node24、绝对解释器、固定 pin/CLI、当前源与作者 source 相符、包 SHA、8 成员合同、新独占输出位置及隔离端口。真实安全解包入口拒绝多余文件及 symlink。只读 Git 用独立最小环境及绝对 Git，禁用 ambient GIT_DIR/GIT_WORK_TREE/INDEX/config/replacement/fsmonitor，不联网、不读业务数据。

cleanup 模块逐项独立 attempt browser/host/model/http，全部清理后才写日志；close 或日志异常明确 FAIL，不能跳过其他 owned 资源。HTTP 含 graceful + 有界 TERM/KILL，外层 32 秒覆盖完整内部最坏 30 秒；Host 外层 12 秒覆盖 TERM8 + KILL3。这里只证明本次拥有的直接实例，不宣称隔离任意 hostile 后代进程。

最终 CI 路径核对发现新 HTTP fixture 的逗号 import/单行复合语句触发 Ruff 的 16 条 E401/E701/E702。原 Ruff FAIL 在 `.context/checks/parallel-next-20261008-r1/html-fixture-lint-before.log`，原 fixture 字节封存为 `http-fixture-before-format.py`；只拆 import/展开语句及格式化后，Ruff PASS。`http-fixture-format-ast-proof.json` 明确 raw AST 不同（Import 节点分组拆开），在将每个 Import 的 names 规范化为单一 alias 后 AST 相同，源码位置排除；没有宣称原始 AST 完全相同。原 r1 17/17 回执保留，同一插件包在新 r2 17/17 重验，绑定格式修正后的 HTTP fixture SHA `18b1278116d8fcae3d1405fcb4f5f37f6223153eb8c552b5b79ff2fa26f2e46c`。

当轮 `.context` 中的作者 driver、输入 audit、旧 attempt/debug fixture、日志/截图属于证据，不是新的日常构建入口。正式 probe/guards/cleanup fixtures 可复跑；guard tests 已由主 Agent 纳入 B0 验证入口，renderer 8 项已进入插件默认 `test:html-edit`。

以下命令均在本工作树实际执行。正式作者 driver 的每一步 argv/cwd/exit 在 [validation.json](../../../.context/checks/html-host-acceptance-20261008-r1/author-preview-final-validation/validation.json)。

```bash
/Users/hutou/homebrew/Cellar/node@24/24.19.0/bin/node \
  .context/checks/html-host-acceptance-20261008-r1/author-preview-final-build.mjs

/tmp/fuqing-fastapi141-v2-venv/bin/python -m pytest \
  backend/tests/test_page_documents.py backend/tests/test_cockpit_ai.py

/Users/hutou/homebrew/Cellar/node@24/24.19.0/bin/node --test \
  scripts/dsh-b0/html-host-browser-cleanup.test.mjs \
  scripts/dsh-b0/html-host-browser-inputs.test.mjs \
  dsh-plugins/analytics-workbench/test/open-native-html-artifact.test.mjs \
  dsh-plugins/analytics-workbench/src/free-page/preview/srcdoc-builder.test.mjs

/Users/hutou/homebrew/Cellar/node@24/24.19.0/bin/node \
  scripts/dsh-b0/html-host-browser.probe.mjs \
  --input /Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics/.context/checks/html-host-acceptance-20261008-r1/inputs-preview-final.json \
  --output /Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics/.context/checks/html-host-acceptance-20261008-r1/formal-preview-final-check-r2 \
  --python /tmp/fuqing-fastapi141-v2-venv/bin/python \
  --playwright /Users/hutou/.gstack/repos/gstack/node_modules/playwright/index.mjs \
  --check

# 正式运行使用相同参数，--output 指定 formal-preview-final-r2，
# 将 --check 换为 --run-isolated-host，实际启动 isolated Host。
# 再次运行需使用另一个尚未创建的 --output；原输出/失败不会被覆盖。
/tmp/fuqing-fastapi141-v2-venv/bin/python -m ruff check \
  backend/services/analytics/page_documents.py \
  backend/tests/test_page_documents.py \
  scripts/dsh-b0/html-host-browser-http.fixture.py

git diff --check
```

## 本轮实际验证结果

| 验证 | 本次结果 | 证据 |
|---|---|---|
| 独立作者 `pnpm build` | PASS，正式 host/client typecheck | author-preview-final-validation/formal-pnpm-build.log |
| 独立作者 `pnpm test` | 35 基础 + 129 HTML PASS | author-preview-final-validation/formal-pnpm-test.log |
| 独立作者 `pnpm test:built` | 2/2 PASS | author-preview-final-validation/formal-pnpm-built.log |
| 冻结资源/bridge/schema/source-index 合同 | 25/25 PASS | author-preview-final-validation/local-contracts.log |
| 编译原生提示注入及卸载 | 10/10 PASS | author-preview-final-validation/native-prompt-injection.log |
| PageDocumentStore/CockpitAI | 56/56 PASS，3 warnings | backend-fixed-five-raw-tests.log |
| mounted/input/cleanup/renderer 负测 | 32/32 PASS（10/10/4/8） | formal-final-guards-r5.log |
| C 限定只读 renderer/独立负例 | 8/8 + 7/7 PASS | parallel-next-20261008-r1/full-document-preview-review/results.json |
| 正式官方 Host + Chrome | 17/17 PASS，headless Chrome 154.0.8037.98 | formal-preview-final-r2/results.json |
| 受影响 Python Ruff | PASS | final-ruff.log |
| Python 编译检查、Git whitespace | PASS | 本次实际 compile() 与 git diff --check |

主 Agent 追加使用 pipeline 相同隔离旗标真实运行后端：`PYTHONDONTWRITEBYTECODE=1 /tmp/fuqing-fastapi141-v2-venv/bin/python -m pytest --noconftest -W error::ResourceWarning -o 'addopts=-ra --strict-markers' backend/tests/test_page_documents.py backend/tests/test_cockpit_ai.py`，56/56 PASS，无 ResourceWarning。3 warnings 为一条现有 Starlette httpx TestClient 弃用提示、两条现有 model_copy 篡改负例的 Pydantic 序列化提示；不为本轮升级依赖或删除旧负例。日志 `.context/checks/parallel-next-20261008-r1/backend-pipeline-scope.log`。

所有相对证据路径在 `.context/checks/html-host-acceptance-20261008-r1`；C 的路径在 `.context/checks/parallel-next-20261008-r1`。本表中的数量不替代项目全量 pipeline/CI 或生产 UAT。

17 个 Host/browser 场景实际覆盖：

1. 不可变 8 成员包安全接收及 official peer link。
2. 生成、预览与显式确认 3 个页面，保持源码包合同。
3. 固定官方壳及原生 composer。
4. 新包客户端 slot 加载并打开持久化 HTML。
5. 完整文档无 wrapper 文字、原 head style 生效（body margin16px）。
6. 父/子元素独立选中与文案修改。
7. 编辑态按钮、链接、表单不触发页面动作。
8. Canvas/SVG 受控源码入口，不隐式保存。
9. 页面内修改预览不落库，明确保存后 v2。
10. 版本历史回退产生 v3，保留 v2。
11. 页面切换不泄漏旧 source draft。
12. 绑定页 AI 选区路由至受控 CSS-only，HTML/JS 禁用。
13. CSS-only 保存保持 HTML/JS，保留来源合同。
14. 真实隔离 HTTP 拒绝绑定 HTML/JS candidate。
15. 原生 AI handoff 使用同一 selection/session/workspace。
16. actual candidate 文件收取、修改前后预览、明确确认及 v4 回读。
17. 无未捕获浏览器错误。

## 候选文件、截图与清理回执

原生 DSH Agent Loop 实际发起请求至本次拥有的 loopback SSE text-only fixture，返回明确 synthetic 文本。**候选是测试 writer 实际写入 job 指定文件，不是 DeepSeek 模型写入。** writer 用 `O_EXCL` 写入 owned workspace 的 `candidate.json`，后续收取/预览/保存走真实 CockpitAI/PageDocumentStore 合同。

- Job ID：`ai_d31c1e56-6919-4233-ad7c-e682e7ff191d`。
- 相对 owned workspace：`http-state/pages/files/ai-workspaces/ai_d31c1e56-6919-4233-ad7c-e682e7ff191d`。
- candidate：2676 bytes，SHA256 `98c73a331cf01bcd2bf62e695dc70758373af8ec9818278ce04d3802c74b47db`。
- 确认后的 version4 回读：[ai-saved-v4.json](../../../.context/checks/html-host-acceptance-20261008-r1/formal-preview-final-r2/ai-saved-v4.json)，SHA256 `42467c7a24b963b20ae4feeb3a8b85857f226678cd2a4b83c453eded1eaf1944`。
- [实际候选预览截图](../../../.context/checks/html-host-acceptance-20261008-r1/formal-preview-final-r2/03-ai-candidate-preview.png) / [确认保存截图](../../../.context/checks/html-host-acceptance-20261008-r1/formal-preview-final-r2/04-ai-saved.png)。本轮人工查看截图确认无 literal `</head>`；不把它宣称为完整视觉/移动/读屏 QA。
- HTTP PID `53615`、Host PID `53644` 均 exit0、已 reaped；browser/model close PASS，owned4328端口释放，cleanup.errors=[]。结束后再次只读核对两个 PID 均已退出。未终止他人进程。
- 正式回执 [results.json](../../../.context/checks/html-host-acceptance-20261008-r1/formal-preview-final-r2/results.json)：SHA256 `9f1e8d147c1899bfdbb089b1342fcf4be53a778f8baff416c520165ae4443a6f`。
- 实际 probe SHA256：`ac0bc7ba7922f02ab2b60aa0d060bd84458b156d3c247310c94b028bd5a04f88`。五份执行侧模块（probe/inputs/cleanup/Host fixture/HTTP fixture）均保存原字节和 SHA；四份 backend 文件也记录实际 digest。
- 输入审计 SHA256：`f6d7357f63f5b91c246a24347173a879cc1d8c3aab230beaeb47a4b2f8a9fe3f`；作者 validation SHA256：`edbb9148356a0ed20dbdf6d1dd1a6ac75208c19259281462fcbcdcf47be2cb77`。

## 失败证据与新旧包分别记账

| 对象 | 原实际结果 | 保留与最终状态 |
|---|---|---|
| 原包 `445565c63280e6ee7e97fbd101cf1db0b27e205654a5afbce5c89c3110eea936` | 当前原570份源相符；attempt-12 12场景PASS后 first artifact FAIL | 原包/inputs/12个attempt保留；readonly-host-snapshots.json证实mounted有目标但tabs为空 |
| 首修包 `876dceefc0fa408c3150d2211c85ff1a13ec9a1fdd10044b08d4edc4fa3ebe5d` | formal-fixed-r1 first tab修复后暴露后端范围FAIL | 原包、formal-fixed-r1 job/source/失败保留；不当作最新包通过 |
| lifetime+rawblock 修包 `7a0797a909917a425d7ca0d19d4159a13318b3f3bacfae9cd6611b340f051f9e` | formal-final-r2 16/16 PASS；截图发现 literal closing text | 原包及旧PASS收据保留；full-document-preview-before-fail.log封存 renderer实际FAIL |
| 最终包 `285f882ab9544da9043fb76cf15c55346fc4f84477575acc6724a0ea2af50d7b` | 正式作者构建与17/17完整链PASS | 当前574份输入、8成员、新截图、新五模块cleanup回执 |
| 原 teardown 缺陷复现 | dispose后listener=1、迟到opened=1，预期不开窗FAIL | parallel-next-20261008-r1/native-artifact-review/原5份源码+teardown-repro.mjs+results保留 |
| root/body资源alias | C实际纯函数FAIL，后修复PASS | C原工具输出保留；首次FAIL源码SHA未捕获，明确记录，不伪造 |

临时 runner 的早期失败单独记录：旧 preview selector、onboarding 时序、历史侧栏已自动关闭、产物列表折叠、rollback 回读过早、writer路径写错、诊断对象循环序列化，以及一次调用 cwd 错误。这些是 runner/fixture 问题，不作为产品缺陷关闭；对应原 attempt/log/snapshot 未覆盖。cleanup异常与ambient Git 缺口由主 Agent 静态审阅发现，新增 fake-owned 负测证明修后的边界，没有把成功路径旧收据冒充失败原复现。

## 修改范围与开放项

本组产品改动：backend `page_documents.py` 与其 tests；workbench `package.json`、`src/client/index.tsx`、新 `open-native-html-artifact.mjs/.d.mts`、两个 native/helper tests；`src/free-page/preview/srcdoc-builder.mjs`、其 tests、新 `document-content.mjs`。formal opt-in scripts 7 份及本证据报告。没有修改共享 initial-session、Staff、session/controller 或 DSH 上游。

未完成或本次不证明：

- 真实 DeepSeek 工具调用实际写入候选：**NOT_RUN**。本次真实文件写入 producer 明确为 synthetic。
- headed Chrome、移动/320–1280详细响应式、读屏与完整无障碍：**NOT_RUN**；实际 viewport1440x1000/headless。
- 固定包在 WSL2 的此次浏览器链与 session/WAL 冷验收、杭州当前生产、真实权限/网络/容量：**NOT_RUN**。
- 视频/音频/iframe 动态元素的现场端到端体验未由此次17项覆盖，Canvas/SVG受控入口实际覆盖。
- SDK 公布来源/分发准入、生产 shape/operator/SLI/promotion/release 条件以主 Agent 与其他组账本为准；本组PASS不使release_ready变true。
- 原有失败AI任务需取消后新建ID，不能把修 parser 当成旧source/job迁移。
- 当前代码尚未 commit。最终候选artifact对应实际dirty源；进入正式发布需在已授权的提交/候选门禁下绑定新reviewed commit，并按全项目当前范围完成门禁。
