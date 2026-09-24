# 历史 HTML 校验与发布记录

本文件描述集成工作树里的本地校验。不挂载 6677，不连接公网，不读取模型凭据，不改真实业务数据。产品仍 PARTIAL。

生产路径是 `source-index/node-graph.mjs`、`runtime/node-identity.mjs`、`free-page/patch/engine.mjs` 和 `PageEditContextStore`。`incremental-index.mjs`、`edit-gate.mjs`、`version-ledger.mjs` 不是生产实现，本工作树不装第二套索引器。

环境变量 `FQ_FREE_PAGE_SIDECAR_INDEX` 默认 `off`。浏览器里也可以设 `globalThis.FQ_FREE_PAGE_SIDECAR_INDEX`。`smoke` 和 `on` 都调用 `buildNodeGraph`，不改历史 HTML 字节。驾驶舱节点列表、直接文字预览和 `selectionBinding` 在开关打开时使用这张图；`off` 返回 `FLAG_DISABLED`，编辑器继续用现有 source index，不建第二套索引。回滚是把该变量设回 `off`。`VERSION_CONFLICT` 后删除旧 EditContext，调用方重新下载、重新选择、重新应用。

## 测试分层

| 测试 | 实际跑的东西 |
|---|---|
| 浏览器冒烟 | 本地合成夹具。不是 cockpit，也不是真实 HTTP |
| 性能 | 生产 Node Graph 的 2k/10k 建图预算 |
| 模型矩阵 | 生产 patch engine 的离线门禁。没有凭据时记 `MISSING_CREDENTIAL`，不记 live PASS |
| Playwright | 未安装时记 `MISSING_DEPENDENCY`，不记 PASS |

## 观测与回滚

生产 Node Graph 的预算在 `NODE_GRAPH_BUDGETS`：2k 节点 800ms，10k 节点 2500ms。超预算只断开观察器，已绑定身份仍可解析。`VERSION_CONFLICT` 和 `HASH_MISMATCH` 删除旧 EditContext，调用方重新下载、重新选择、重新应用。

presentation overlay 存在页面版本旁路表。取消预览不写这张表。读取旧版本看不到之后版本写入的 overlay。PagePackage 的 html/css/js 不被 overlay 改写。

## 兼容性

- `parsePagePackage` 接受 `html`、`css`、`js`、`resources`、`node_map` 及可选的 `presentation` 展示元数据；`presentation` 只描述版本化 overlay，不是可执行源码，也不能替代源码字段。sidecar 不是源码包字段。
- 打开历史 standalone HTML 只读原字符串。
- 重复锚点、已删除节点和动态重渲染后的失效身份要求重新选择，不扩大成 `whole_page`。
- 脚本、iframe、canvas 和绑定节点不能直接写入。

## 使用

在本工作树根目录，用 Node 24，只读复用已有 jsdom。不要启动或 reload 6677。

```bash
export PATH="/Users/hutou/homebrew/opt/node@24/bin:$PATH"
export B0_BUILD_UPSTREAM="/absolute/pinned/dsh-b0/upstream"
node --test --test-concurrency=1 \
  dsh-plugins/analytics-workbench/test/validation-rollout-browser-smoke.test.mjs \
  dsh-plugins/analytics-workbench/test/validation-rollout-performance.test.mjs \
  dsh-plugins/analytics-workbench/test/validation-rollout-eval.test.mjs
```

浏览器冒烟是本地合成夹具：打开历史 HTML、用生产 Node Graph 投影 NodeRef、确认原始字节不变。它不是 cockpit，也不是真实 HTTP。未安装 Playwright 时报告写 `MISSING_DEPENDENCY`。

模型矩阵仍登记 `minimax-cn/MiniMax-M3`。离线门禁调用生产 patch engine。没有凭据时报告写 `MISSING_CREDENTIAL`，不把离线门禁写成 live PASS。

证据目录 `.context/checks/validation-rollout/` 被 gitignore，不作为发布证明。日期记录见 [2026-09-22 校验记录](../hackathon/FREE-PAGE-VALIDATION-ROLLOUT-2026-09-22.md)。
