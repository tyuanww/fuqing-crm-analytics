# 授权生产入口 live browser 可达性观察（2026-10-13）

在用户授权的真实入口 `https://app.tyuan.chat/` 上使用 Aside headed browser 做只读观察。没有点击、提交、保存、删除或修改设置，也没有读取或输出凭据。

页面可以打开，但等待 20 秒后仍停在：

```text
HARNESS
Loading plugins…
```

控制台错误数组为空，页面没有可操作元素。桌面、平板和移动 viewport 都完成了截图，因此只证明入口能够返回壳页面，不证明工作台插件完成加载。

| 观察项 | 结果 |
|---|---|
| live URL | `https://app.tyuan.chat/` |
| driver | Aside headed browser |
| desktop 1440×900 | 截图完成，页面仍 Loading plugins |
| tablet 768×1024 | 截图完成，页面仍 Loading plugins |
| mobile 375×812 | 截图完成，页面仍 Loading plugins |
| root `/` | `HTTP 200` |
| `/plugins/` | `HTTP 404` |
| `/api/plugins` | `HTTP 404` |
| console errors | `[]` |
| screen reader | `NOT_RUN` |
| keyboard focus | `NOT_RUN` |
| Windows high contrast | `NOT_RUN` |
| candidate-bound browser | `NOT_RUN` |
| standalone | `NOT_RUN_REAL_COCKPIT_EXAMPLE_PACKAGE` |

截图保存在本目录。该观察不接入组合 candidate journal，不替代 candidate-bound browser、读屏、人工键盘焦点、高对比度或 standalone 页面验收；M2-05 保持部分阻塞，`release_ready=false`。
