# HTML 保存提示修复：独立交付准备（2026-10-08）

驾驶舱保存或放弃 HTML 草稿后，原界面会残留“有未保存修改”；干净退出编辑还会显示“退出编辑未保存”。本修复删除暂态离开警告的持久副本，并把干净退出状态改为“浏览中。已结束编辑”。原 LeavePrompt 继续负责未保存提醒、三项选择及失败提示。

## 功能范围

本次交付限定七文件：`cockpit-workspace.tsx`、`free-html-library/store.mjs`、这两处对应的 `store.test.mjs` / `library-workspace.test.mjs`，以及 CHANGELOG、本说明和[验证 JSON](shinemage-html-fix-delivery-validation-20261008.json)。提交清单与完整补丁位于 `.context/checks/html-fix-delivery-20261008/{commit-files.json,delivery.patch}`。

实际产品修改只有两行行为变化；不改保存/确认/版本控制或 dirty、busy、unknown 保护，不新增功能。新增三条行为回归核对干净退出、留在当前页后保存、放弃后重新编辑并保存：离开保护仍出现，留在/放弃不新增版本，最终保存恰好新增一版并回读新正文。

SDK、WSL 历史证据及 STATUS/TODOS/verification 的混合进度差异不纳入这个功能提交。

## 验证与审查

- 先前新增三用例修前 3 FAIL、修后相关四文件专项 **103 PASS / 0 FAIL / 0 SKIP**。本轮逐字节核对四个源码/测试文件及原日志摘要一致，复用这批证据，没有重新执行测试。原始失败保留。
- 本轮新建独立作者工程，以既有 `author-inputs.mjs`、固定开发 kit / board 输入、SDK 和 pnpm 缓存执行原 `pnpm build`。OS sandbox 禁止联网，写入限定本次私有目录；准备与构建均 exit 0，构建耗时约 **8.63 秒**。
- 原构建的 **host full typecheck / client full typecheck 均通过**；18 个 JS/map 输出已逐个核对大小和摘要。没有重建 DSH、迁移数据库或重跑 SDK 审计。
- 定向代码审查和主 Agent 反向检查确认本地/宿主 LeavePrompt 均保留，保存失败消息仍显示，退出未冒称保存；未发现可行动问题。测试入口重新 bundle 当前源码，未复制旧实现冒充验证。未新增外部 OCR 审查。

作者产物明确标记 **WORKTREE_UNCOMMITTED**，基础 HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09` 不是该快照的干净源码提交。`agent-a/source-snapshot.json` 逐文件绑定实际输入，576 个源码/夹具文件与工作树一致并在构建后保持；这只是修后工作区的开发构建，不是正式插件包、candidate 或发布产物。

## CI 与后续顺序

现有 `scripts/ci/run_checks.py --plan-only` 对七文件增量实际退出 0，仅选择 B0；未执行检查正文。缓存 `origin/main` 与 merge-base 为 `fcbd1324ac5a4b7367d9d7d2bb9bbebdbf32ba25`，到当前 HEAD 的 631 文件差异与拟提交七文件合并为 635 文件；原选择器实际选择后端 full、B0、前端、tooling、deployment、双依赖审计和 filterbuilder。未 fetch、推送或运行正式 CI；未来按实际待推 SHA/基线重新选择，不能用七文件增量替代整条分支。

后续获相应授权后，正常本地提交这七文件，再以新提交和原服务绑定构建正式包、生成独立新 candidate/journal，按新候选要求验证。当前 b75 / candidate `993daf31…` / journal seq 6 保持原字节，已有 headed 和 WSL 验收只属于该封存包，不转记给本修复。

standalone、原生菜单/焦点、真实设备/模型/业务等仍等待各自原定输入；本次未制造示例页、重试旧 CUA、第三次续跑外审或扩展平台任务。SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false 保持。本地提交、push、PR、合并、发布和部署均未执行。
