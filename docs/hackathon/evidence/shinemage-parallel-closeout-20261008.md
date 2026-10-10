# SDK 与 HTML 并行交接集成（2026-10-08）

本轮只集成交接和证据索引，不修改产品源码、校验器或运行包。集成树仍 detached HEAD `e577f41b9247e3ac56052e21f84daed9dd32f163`；两棵执行树均为同一 HEAD，继承的 34 个未提交文件逐字节与集成起点一致。未 reset/stash/checkout/commit/push/PR/合并/发布/部署。

## 接收范围与核验

- SDK 执行树：`/Users/hutou/.codex/worktrees/grok-sdk-trust-closeout/fuqing-crm-analytics`。
- HTML 执行树：`/Users/hutou/.codex/worktrees/shinemage-t14-html-ocr/fuqing-crm-analytics`。
- 两份交接按原字节复制到本树：[SDK 交接](grok-sdk-trust-closeout-20261008.md)、[HTML 交接](shinemage-t14-html-ocr-20261008.md)。原执行树没有编辑。
- 主 Agent 读取原始 JSON，核对 33 个原始文件/包/截图的摘要，核对六份审查对象等于其审查 HEAD，并检查 complete/failed coverage 与续跑指纹。对原生缩放 r2 截图作了可见内容核对。
- [机器记录](shinemage-parallel-closeout-validation-20261008.json)固定每份来源绝对路径、SHA-256、大小及 mtime。控制器与起始快照在 `.context/checks/abc-parallel-closeout-20261008/`。
- SDK `product-delta.patch` 的 SHA-256 为 `f215853ba0aff364df9f500a1974dce46e234752b2f4e39f32d3c0d1fede30b8`，只核对摘要，没有应用。`sdk-embedded-map.mjs` 和对应测试仍在执行树，未导入集成树；任务树的 5 PASS 是既有实测日志，本轮未重跑。

## SDK：只推进证据子项

| 项 | 集成后状态 |
|---|---|
| `EMBED-INLINE-BYTES` 证据账本 | **PARTIAL** |
| 新函数 `inline_function_bytes` / 默认 `embedded_components` | **NOT_VERIFIED / NOT_VERIFIED** |
| `SDK-EMBEDDED-COMPOSITION` | **PARTIAL** |
| 八条顶层门禁新增通过 | **0** |
| 分发 / release_ready | **BLOCKED / false** |

官方 release 记录与本地 `source-maps.tgz` 的摘要匹配。两份外部 map 对密封 bundle 的位置结果为 CONSISTENT/outside 0；未映射尾部记录为许可证注释。分析记录包含 883 个唯一仓库源 blob 一致、68 个 registry 成员字节一致。graceful-fs map 等于部署副本，不等于未打补丁 registry 原文，补丁没有重放。

这些不能证明变换后的 bundle 等于固定 recipe 输出。15 个 lib 编译产物、86 个 null 源、2483 个未比较 store 文件、42 条 tarball 缺路径，以及212个仅有lock声明的installed-package字节仍未补齐。已核对执行树 `analysis.json` 的 PE 记录：4 个 PE 的证书表为空只证明嵌入签名缺失，未执行它们。上游7版本/29公告未重查；身份/撤销、native安全、资源解析、干净主机和最终签名门禁保持原状态。不接入日常插件更新或 pipeline，不勾完 T5/T15/T19。

## HTML：五项外审关闭，一项保持未完成

审查范围固定为 `cb6f723c..e577f41b` 的各自单文件 diff，当前六份文件与该 HEAD 字节一致。

| 原待补文件 | 结果 | 原始记录 |
|---|---|---|
| cockpit-workspace-style.ts | COMPLETE，0 findings | review-1-style.json |
| html-host-browser-ui-args.mjs | COMPLETE，0 findings | review-4-args.json |
| cockpit-page-editor.tsx | COMPLETE，0 findings | resume-editor.json |
| html-host-browser-ui-args.test.mjs | COMPLETE，0 findings | resume-args-test.json |
| cockpit-workspace.tsx | COMPLETE，0 findings | resume-workspace.json |
| html-host-browser-ui.probe.mjs | INCOMPLETE，timeout | review-6-probe.json、resume-probe.json |

五项完成记录的 `coverage.failed` 为空；三项成功续跑及探针失败续跑的 selected/item/fingerprint 与首轮一致。探针续跑为0 token、0工具调用，plan_task等待响应头300008ms。包装脚本退出0不计作外审成功。本轮未发起任何OCR，没有第三次续跑或提高预算。此前已完成的两个 bridge 文件不重审；人工/本机21/21不能抵扣剩余探针外审。document-release 外部审查超时也不由此关闭。

## 原生 200%：只接收固定包上的有限观察

`native-zoom-200-r2/result.json` 为PASS，截图可见「项目驾驶舱」、`html-ui-plain` 与「合成 HTML 标题」。Chrome隔离profile设置原生缩放，无Playwright viewport、无Emulation CDP；outer 1280×826、inner 640×369、DPR 4、visualViewport.scale 1、documentScrollWidth 640。接受范围为该固定包驾驶舱的横向重排及正文可见。

r1停在宿主会话页，仍为NOT_RUN；r2未验证View菜单点击、200%键盘焦点环、真实读屏、触控/移动设备或Windows高对比度。结果中的程序化focus outline-style为none不能作为键盘焦点通过。原探针 `browser_zoom_ui: NOT_RUN` 仍描述其CDP模拟项，未改写。

包 `ecaa86ddd41a88e563ae411be08897aeadb3a2ef408c00377f2b905dfaecae42` 与 runner `de75f75c222b72199b577298bf2bd28ebef79a082fcf680a144a464e54937d38` 已再次核对摘要；没有重打包或重跑headed 25/25。回执记录本次自有listener/pid均已清空，该清理结论属于任务执行时点，本轮未启动服务或浏览器。

## 保持开放

standalone缺真实页面包，继续NOT_RUN，不搜索或制作替代页。真实模型/业务/目标包现场/生产未验收；正式candidate/journal仍NOT_LINKED，正式CI仍NOT_RUN。未重跑B0、服务专项、shell/tool、查询冷安装、十场更新或headed。没有读取真实DuckDB或操作杭州、6677、旧CRM、WeKnora、固定DSH上游。物理分仓与DSH升级仍服从原stop/go，产品PARTIAL / release_ready=false。
