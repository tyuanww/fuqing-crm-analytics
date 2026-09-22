# 历史 HTML 校验记录（2026-09-22）

集成工作树 `codex/grok-integration-repair` 的校验改走生产 Node Graph、patch engine 和 EditContext。下面保留的旧计数来自另一工作树的重复索引器，不是本工作树的通过证据。浏览器冒烟是本地合成夹具，不是 cockpit E2E。未启动或 reload 6677，未连接公网，未读取凭据值，未改真实业务数据。产品仍 PARTIAL。

## 命令

```bash
export PATH="/Users/hutou/homebrew/opt/node@24/bin:$PATH"
export B0_BUILD_UPSTREAM="/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics/.context/dsh-b0/upstream"
node --test --test-concurrency=1 \
  dsh-plugins/analytics-workbench/test/validation-rollout-browser-smoke.test.mjs \
  dsh-plugins/analytics-workbench/test/validation-rollout-performance.test.mjs \
  dsh-plugins/analytics-workbench/test/validation-rollout-eval.test.mjs
```

2026-09-22 这一组 14 项通过，耗时 4.0s。jsdom 来自上述只读 upstream，没有新安装依赖。

## 浏览器

jsdom 与本机 Chrome 153.0.8010.48 headless 都走完同一条链，状态 `OK`：

1. 打开历史 standalone HTML。
2. sidecar 建立。jsdom 样本 18 个节点，flag 显式为 `on`。原 HTML 字符串未改。
3. 点击 `#lead`。
4. breadcrumb 为 `body / main / section / p`。段落可做 presentation；button、script、iframe、canvas、input、`#bound` 均不可编辑。
5. 直接编辑只形成预览。选区外「华东」保持不变，实时 DOM 仍是原文。
6. 进入本地 AI 修改上下文。这不是真实模型调用。
7. 收到并接受 `free-page-edit-operation/v1` presentation `set_text`。
8. 取消预览后原文仍在。
9. 确认保存到版本 2。
10. 重载后恢复「本周到店人数保持稳定，周末略增。」
11. 旧 base_version 得到 `VERSION_CONFLICT`，重新读取版本 2，重新选择，重新应用后到版本 3「重选后的到店说明。」

`createMemoryPageStore` 对同一 PagePackage 也复现了 `VERSION_CONFLICT`，HTML 字节仍是夹具原文。带 `sidecar` 字段的包被 schema 拒绝。

## 模型

固定矩阵：`minimax-cn/MiniMax-M3`，temperature 0，max_tokens 512，固定 prompt，选区 `#lead`，rubric `verdict_match`，阈值 1，baseline `free-page-eval-baseline/2026-09-22`。

离线门禁七项与基线一致，记录为 `canned_gate: MATCHED`，不是模型通过：

| 用例 | 判定 |
|---|---|
| 选区内文字 | ACCEPTED |
| 选区内样式 | ACCEPTED |
| 选区内结构 | ACCEPTED |
| 选区外修改 | OUT_OF_SELECTION |
| 逻辑越权 | LOGIC_OVERREACH |
| 非法 HTML | ILLEGAL_HTML |
| 绑定节点 | BOUND_NODE |

检查了 `MINIMAX_API_KEY`、`MINIMAX_API_TOKEN`、`FQ_MINIMAX_API_KEY`、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 是否非空，没有打印值，也没有发请求。结果：`MISSING_CREDENTIAL`，`live: NOT_RUN`。

## 性能

| 样本 | 结果 |
|---|---|
| 2000 节点 | `node_count` 2000，`build_ms` 22.4，未超软预算，未降级 |
| 10000 节点 | `node_count` 10000，`build_ms` 319.3，`above_soft_budget`，未降级 |
| 高频 MutationObserver | 200 次文本变更收成批次，最终文本正确 |
| 批次耗时 | 注入时钟 50ms，超过 32ms 后 `batch_budget` 降级 |
| 失效扇出 | 超过 `maxFanout` 3 后 `fanout` 降级，子节点文本保持 |
| 自反馈抑制 | `applyText` 增加 `observer_suppressed` |
| 超预算 | 硬上限 100 时 150 节点截断为 100，`over_hard_node_count` |
| iframe 替换 | `iframe_reloads` 增加，其余节点还在 |
| 资源 error | `resource_errors` 为 1，索引不降级 |

## 仍是 PARTIAL

- Playwright 包不在本机，也没有为它联网安装。完整 Playwright 主链未跑。已跑的是 jsdom 加本机 Chrome headless。
- 真实模型是 `MISSING_CREDENTIAL`。离线门禁匹配不能当成模型通过。
- 未挂载 6677，没有主人 UAT。
- 动态模板/数据身份、source byte splice、多步撤销重做都不在本切片。
- flag 默认 `off`。即使设为 `on`，本记录也不表示现役已切换。
