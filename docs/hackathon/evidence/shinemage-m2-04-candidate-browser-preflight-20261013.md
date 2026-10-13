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

- candidate-bound browser receipt：`NOT_RUN_CANDIDATE_RUNTIME_UNAVAILABLE`；
- 没有生成截图、页面 DOM、console 或可绑定 journal 的 browser envelope；
- M2-04 继续为 `TERMINAL_PASS / BROWSER_NOT_RUN`；
- 当前阻塞是候选 runtime/隧道不可达，属于外部运行时状态，不是代码或 profile 合同失败；
- 下一步是恢复已授权 candidate runtime 与隧道，再在同一 candidate、同一目标重跑 browser 和 recovery 证据；不使用 live 页面或 synthetic 页面替代。

本轮没有代码、配置或运行时改动；没有启动、重启、部署、切换 live 或读取业务数据。
