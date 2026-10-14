# M2-05 candidate 未命名 input 复核（2026-10-14）

本轮承接 `candidate-keyboard-focus.json` 中记录的 43 个交互节点、42 个有名称和 1 个未命名 `input`，在同一杭州隔离 candidate runtime 恢复 SSH 隧道后做只读 DOM 复核。没有执行模型请求、CRM/WeKnora 查询、写操作或配置变更。

## 目标与运行时

- candidate web：`http://127.0.0.1:4332/`
- candidate bridge：`http://127.0.0.1:4336/`
- 远端 runtime：`m2-06-candidate-r4`
- live `4328`：未修改
- 浏览器：Aside headed，新建只读标签页
- 控制台错误：`[]`

## 复核结果

页面当前有 3 个 `input`：

1. 会话搜索框，有 placeholder `搜索会话名称`，可见但 `tabindex=-1`，由旁边的搜索按钮和焦点管理承载交互；
2. 文件选择框，`type=file`、`hidden=true`、`display:none`、尺寸 `0×0`，不出现在交互可访问树；
3. 驾驶舱草稿标题输入框，有 `id=analytics-b0-draft` 和 `data-testid=analytics-b0-title-input`，尺寸为 `0×0`，属于隐藏的草稿状态控件，不是页面可见焦点目标。

因此，前一份回执里的未命名节点对应隐藏文件上传控件，不是用户可见或可通过 Tab 到达的页面控件；本轮没有发现需要修改仓库 source-owned 页面包的命名缺陷。

## 门禁结论

该复核消除了“可见未命名输入”的疑点，但不能关闭完整无障碍门禁。真实读屏器、人工完整键盘焦点和 Windows 高对比度仍未执行，M2-05 继续保持：

```text
PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_PASS /
STANDALONE_PACKAGE_BROWSER_PASS / ACCESSIBILITY_KEYBOARD_PARTIAL
```

本轮仅新增证据和状态解释，没有代码改动，也没有修改 DSH 上游。
