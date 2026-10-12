# 授权生产入口 live browser 可达性观察（2026-10-13）

在用户授权的真实入口 `https://app.tyuan.chat/` 上使用 Aside headed browser 做只读观察。没有点击、提交、保存、删除或修改设置，也没有读取或输出凭据。

页面初次打开会显示：

```text
HARNESS
Loading plugins…
```

这是组合 bundle 的加载阶段。等待约 15 秒后页面完成加载，显示“伸美 AI 增长董事会”、工作区、驾驶舱、数据员工、知识库问答和会话区。控制台错误数组为空。

| 观察项 | 结果 |
|---|---|
| live URL | `https://app.tyuan.chat/` |
| root `/` | `HTTP 200` |
| valid plugin bundle route | `HTTP 200` |
| bare `/plugins/` | `HTTP 404_EXPECTED_WITHOUT_BUNDLE_QUERY` |
| `/api/plugins` | `HTTP 404_EXPECTED_UNKNOWN_ROUTE` |
| driver | Aside headed browser |
| desktop 1440×900 | 页面加载完成后截图，真实工作台导航可见 |
| tablet 768×1024 | 页面加载完成后截图，真实工作台导航可见 |
| mobile 375×812 | 页面加载完成后截图，真实工作台导航可见 |
| console errors | `[]` |
| screen reader | `NOT_RUN` |
| keyboard focus | 12 次 Tab 均停留在内测声明“继续”按钮，`PARTIAL_MODAL_FOCUS_TRAP_OBSERVED` |
| Windows high contrast | `NOT_RUN` |
| candidate-bound browser | `NOT_RUN` |
| standalone | `NOT_RUN_REAL_COCKPIT_EXAMPLE_PACKAGE` |

截图保存在本目录。该观察不接入组合 candidate journal，不替代 candidate-bound browser、读屏、人工键盘焦点、高对比度或 standalone 页面验收；M2-05 保持部分完成，`release_ready=false`。
