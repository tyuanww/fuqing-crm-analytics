# M2-05 Aside 键盘焦点补充回执（2026-10-14）

本轮在当前杭州隔离 candidate 页面使用 Aside Computer Use 做只读键盘遍历。没有输入凭据、发送模型请求、连接 CRM、读取业务数据或执行页面写操作。

## 目标与范围

- candidate 页面：`http://127.0.0.1:4332/`
- 页面标题：`伸美 AI 增长董事会`
- 当前页面显示候选模型入口、CRM 入口和工作区输入区
- 观察方式：从当前焦点开始连续按 `Tab`，读取每一步的 AX 焦点回执

## 观察到的焦点序列

本次连续记录 28 步。由于观察开始时焦点位于“插件”，序列从该节点开始：

```text
1  驾驶舱
2  数据员工
3  添加工作区
4  搜索会话
5  hutou
6  外观：跟随系统
7  设置
8  打开右侧边栏
9  选择工作区
10 标准模式
11 返回驾驶舱
12 连接 CRM
13 CRM 分析
14 描述你想要构建的内容, / 调用指令, @ 文件或对话
15 添加文件或调用指令
16 选择模型，当前 DeepSeek-V41-Flash，推理等级 High
17 打开语音输入引导
18 Bookmarks
19 Chats with Aside
20 我们需要进行前端审核，我有点迷茫这个设计，目前来看，这个设计做的很烂，然后你看下...
21 全部显示
22 （无焦点回执）
23 打开侧边栏
24 新建会话
25 插件
26 驾驶舱
27 数据员工
28 添加工作区
```

第 22 步只表示 Computer Use 没有返回焦点名称；随后焦点回到了页面入口，并继续遍历。没有观察到页面跳转、控制台错误或失焦后无法恢复的情况。

## 门禁结论

这次补强了候选页面的键盘遍历证据，但不能关闭完整无障碍门禁。系统 VoiceOver/NVDA 读屏、人工逐控件焦点复核和 Windows 高对比度仍未执行，因此 M2-05 继续保持：

```text
PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_PASS /
STANDALONE_PACKAGE_BROWSER_PASS / ACCESSIBILITY_KEYBOARD_PARTIAL
```

本轮没有代码改动，也没有修改 DSH 上游、live runtime、主仓 profile/journal 或业务数据。
