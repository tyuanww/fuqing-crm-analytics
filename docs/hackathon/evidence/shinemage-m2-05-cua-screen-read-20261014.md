# M2-05 Aside Computer Use 屏幕与焦点读取（2026-10-14）

本轮使用 Aside 的 Computer Use 在杭州隔离 candidate 页面进行人工屏幕读取和键盘焦点观察。只建立临时 SSH 隧道访问 `127.0.0.1:4332`，没有输入凭据、点击 CRM 连接、发送模型请求或修改业务数据。

## 页面状态

- 页面：`http://127.0.0.1:4332/`
- 页面标题：`伸美 AI 增长董事会`
- 工作区：`uat-probe-workspace`
- 模式：`标准模式`
- 访问模式：`工作区内修改`（本轮没有执行写操作）
- 可见入口：`连接 CRM`、`CRM 分析`
- 模型选择：`DeepSeek-V41-Flash High`
- 页面输入：`描述你想要构建的内容, / 调用指令, @ 文件或对话`

## 26 步 Tab 焦点序列

```text
1  添加文件或调用指令
2  访问模式，当前：工作区内修改
3  选择模型，当前 DeepSeek-V41-Flash，推理等级 High
4  打开语音输入引导
5  Bookmarks
6  Chats with Aside
7  我们需要进行前端审核，我有点迷茫这个设计，目前来看，这个设计做的很烂，然后你看下...
8  全部显示
9  （无焦点文本回执）
10 打开侧边栏
11 新建会话
12 插件
13 驾驶舱
14 数据员工
15 添加工作区
16 搜索会话
17 hutou
18 外观：跟随系统
19 设置
20 打开右侧边栏
21 选择工作区
22 标准模式
23 返回驾驶舱
24 连接 CRM
25 CRM 分析
26 描述你想要构建的内容, / 调用指令, @ 文件或对话
```

页面截图和 AX 状态显示，候选工作台的主要入口有可读名称，焦点可以从输入区遍历到 CRM 入口和 CRM 分析入口；第 9 步只有 Computer Use AX 回执缺失，未观察到页面跳转或失焦异常。此前 DOM 复核确认的隐藏 `type=file` 控件仍不在可见交互树中。

## 门禁结论

这次关闭了候选页面的人工 Computer Use 焦点观察子项，补强键盘焦点证据。它仍然不是系统 VoiceOver/NVDA 读屏验收，也不是 Windows 高对比度验收，因此 M2-05 继续保持：

```text
PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_PASS /
STANDALONE_PACKAGE_BROWSER_PASS / ACCESSIBILITY_KEYBOARD_PARTIAL
```

剩余真实读屏器和 Windows 高对比度仍需相应目标环境。远端 candidate runtime 保持隔离，live `4328`、主仓 profile/journal 和业务数据未修改。
