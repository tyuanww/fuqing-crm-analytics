# M2-04 candidate-bound browser preflight（2026-10-13）

本轮只做 candidate-bound 浏览器目标的可达性前置核验。source HTTP 与 terminal 已有同一 candidate 的 seq 3/4 回执；本轮没有把 live browser 结果或历史 synthetic 结果写入 candidate journal。

## 实际核验

按 `browse` skill 的流程启动 Aside 前置检查后，依次执行了以下只读检查：

```text
Aside readiness: READY: aside
127.0.0.1:4332: connection refused
127.0.0.1:4332 curl: failed to connect
127.0.0.1:4332/4336: no local listener
SSH root@100.93.46.46: connect timed out
Aside browser daemon: fetch failed / ConnectTimeoutError
```

尝试使用 gstack browser fallback 时，`gstack-browser-ensure` 在 `/Users/hutou/.codex/skills` 下找不到可安装的 `package.json`，因此没有建立可用浏览器控制面。该 fallback 没有启动候选服务，也没有修改 live 入口。

## 结论

- 初次前置核验的 `NOT_RUN_CANDIDATE_RUNTIME_UNAVAILABLE` 仍保留为失败尝试记录；
- 随后杭州目标的 candidate 进程恢复监听 `4332/4336`，建立临时 SSH 隧道后，真实 Aside headed 页面加载成功；
- 生成了交互树、页面正文、console 结果和 375/768/1440 三种 viewport 截图，`console_errors=[]`，只读模式可见；
- 在同一 headed candidate 页面执行 12 次实际 `Tab`，记录到按钮焦点序列；DOM 语义快照有 43 个可交互节点，其中 42 个有名称、1 个 `input` 未命名，`console_errors=[]`；该结果只算键盘焦点的部分观察，不替代人工完整焦点复核；
- composition browser envelope 已通过 `validateCompositionHostEvidence`，并在候选 journal 追加 seq 5：`COMPOSITION_BROWSER_HOST_OBSERVED`；
- M2-04 当前为 `TERMINAL_PASS / BROWSER_PASS`；terminal 阶段已有 seq 4 的进程丢失恢复证据，browser 阶段没有发起模型、CRM 或 WeKnora 请求；
- screen reader、人工完整键盘焦点、Windows 高对比度、standalone 页面包仍属于 M2-05 的独立门禁；本轮只把 headed Tab 观察记录为 `ACCESSIBILITY_KEYBOARD_PARTIAL`。

## 正式回执

回执目录为 `docs/hackathon/evidence/shinemage-m2-04-candidate-browser-20261013/`，包含：

- `input.json`：candidate digest、目标 origin、headed driver 和三个 viewport；
- `receipt.json`：5 个浏览器场景、console 空错误集、只读模式和截图摘要；
- `envelope.json`：`dsh-composition-host-evidence/v1` browser 阶段封套；
- `observation.json` 与三张 JPEG：实际 Aside 页面 DOM/正文和移动、平板、桌面截图；
- `candidate-keyboard-focus.json` 与 `candidate-keyboard-focus.jpg`：headed Tab 序列、DOM 语义快照和限制；
- `runner.txt`：本轮 gstack/Aside 驱动说明。

封套目标摘要：

```text
candidate=125c8e538816835cad212048b8fd0302d98588d704b09de559789df9bf6e6bdb
input_sha256=5968561ae965be28f2e2054ab90b3df99ccffdcae26031497ac1a52edcb0454a
receipt_sha256=d5f99386e2b550d1c5f392eeb408903f532fe1f577c328ea38b89fab553570e1
runner_sha256=b7f515bd1e9e956ee6db2242aeb560a9c834479427ae86320e22cc4050dd3305
journal_seq=5
```

本轮关闭 candidate-bound browser 子项，并补充键盘焦点部分观察；`release_ready=false`、`activation=NOT_RUN` 保持不变。没有修改代码，也没有为该 accessibility 观察追加 journal 事件；未启动、重启、部署、切换 live 或读取业务数据。
