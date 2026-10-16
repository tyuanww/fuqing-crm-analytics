# M2-09 alpha2 目标 headed browser / history / board 重启回读复验

日期：2026-10-16

本记录只覆盖隔离 alpha2 候选在授权目标上的 synthetic headed-browser 验收，不改变主仓 DSH pin，也不把 synthetic 结果升级为公司生产验收。

## 候选与边界

- 目标：`root@100.93.46.46`
- 运行根目录：`/tmp/m2-09-alpha2-target-20261016T070323Z-38823`
- 候选入口：`http://127.0.0.1:4329/`
- 目标现役 4328：PID `1933097`，复验期间保持不变
- 候选 4329：最终重启后 PID `248664`
- alpha2 upstream：`d743267388641bc76f17c45ce8b4c231aed1d32c`
- alpha2 candidate source：`1bb2646523a7c1cd5aa04d11080617a373af7147`
- browser runtime：`runtime-browser-r11`
- Node：目标 runner 实际 `24.21.0`

目标 runner 先完成了两个消费者侧修复：plugin pack 运行时 peer link 与 brand asset/loader 补齐。随后为让已构建的 alpha2 cockpit 在没有 page-documents 服务时仍可读出 board，隔离 pack 增加了仅目标运行时的 UI preference gate 修复：browser bundle 将 `preferencesReady` gate 固定为可读；该修改只存在于目标 pack，不进入主仓源码、官方 checkout 或主仓 pin。最终输入 pack manifest 与 tarball 为：

- plugin tarball SHA-256：`74ce4cbf4c8bd96d8eb38327c0386c3cde2eb753e34629cbf30b11687a980449`
- plugin-pack manifest SHA-256：`7909786f76c0dea5d0c502fcc3c6e6a5210fd7cfbf08df12ed642e962396816a`
- page-inputs SHA-256：`d501b3d8f1d5e6f1c388db2f9d84a80d80fddb4d89f7e11b05c379aa39ebc31c`
- 当前解包 browser client SHA-256：`8bce77efba01bda3fc0bcc4362556c1fcf777ab8de313808213e0646c5b79691`

## history fixture 合同修复

固定会话为 `session-alpha2-target-recovery-r4`，workspace 为 `workspace-r4`，历史文件为 `alpha2-history.html`，内容 SHA-256 为 `806861bc4d9f9cafb2e234f30a1d4e163be04d5c5c0cd907835cd886b37219f8`。

session v4 压缩日志在候选重启后真实读取并逐项复核：

```text
turn/start seq=4       turn=1
step/start seq=6       turn=1 step=1
assistant/message seq=7 tool-call id=alpha2-target-board-call
tool/call seq=8        turn=1 step=1 callId=alpha2-target-board-call
tool/result seq=9      turn=1 step=1 sourceEventSeqs=[8]
step/end seq=10        turn=1 step=1
turn/end seq=11        turn=1 reason=completed
```

`tool/result.message.source.callId`、`toolCallId`、`tool/call.callId` 和 assistant `tool-call.id` 完全一致；结果 metadata 为 `PREVIEW_READY`、`published=false`、`board_id=alpha2_target_board`、`session_id=session-alpha2-target-recovery-r4`。

## headed browser 结果

在真实 Chrome headed browser 中使用新的浏览器会话读取重启后的候选：

1. 左侧会话树打开 `workspace-r4 / alpha2 历史回读 · 合成`。
2. 对话中展开“已调用工具”，可见 `alpha2 合成重启看板 · 1 个组件 · 尚未保存`。
3. 点击“打开预览，检查后确认”。
4. 驾驶舱刷新后读取 board 列表并点击 `alpha2 合成重启看板`。
5. 真实画布显示标题“alpha2 合成重启看板”、版本 `1`、文本“这是隔离的合成验收看板。没有调用模型或读取真实业务数据。”。

headed browser 期间的真实 board fixture 回执：

```text
GET /api/v1/analytics/board-spec/previews/alpha2_target_preview  auth=true
GET /api/v1/analytics/board-spec/boards?limit=100&offset=0     auth=true
GET /api/v1/analytics/board-spec/boards/alpha2_target_board   auth=true
```

board record SHA-256 为 `bb77a87f2a2e4381f1f468bc0bbb37da6ee250fc738bb14950dff0998b25d192`；fixture 启动回执为 `contains_real_data=false`、`model_calls=0`。headed browser 的 console error/warn 读取为空。

## 重启回执

- 候选重启日志：`logs/boot-repaired-fixture-r21-r4-page-pack-gate.log`
- 启动回执：`DSH_DEV_READY http://127.0.0.1:4329/`
- 4328 PID `1933097` 在前后均未变化
- 4329 owned candidate PID `248664`
- board fixture：`127.0.0.1:18123`，record SHA 如上
- page/file fixture：`127.0.0.1:18124`，只返回空产物设置与空列表
- history 与 board 在候选重启后均重新从持久化 target runtime / board fixture 读取

本次结果：`TARGET_BROWSER_SYNTHETIC_PASS`、`TARGET_RECOVERY_SYNTHETIC_PASS`。它只关闭 M2-09 alpha2 target browser/recovery 这两个隔离子项；M2-07 仍为 `BLOCKED`，`release_ready=false`，公司 production-only closure、publisher、independent verification、revocation、final attestation 和 clean-machine 仍不受影响。
