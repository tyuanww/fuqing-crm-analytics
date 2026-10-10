# G0 宿主可行性证据（2026-10-02）

本证据只覆盖 public worktree 的 synthetic/离线验证。没有启动 DSH、CRM、DeepSeek、Tailscale、杭州 Windows/WSL2 或 Cloudflare，也没有读取真实 DuckDB。

## 实际结果

| 检查 | 命令 | 结果 |
|---|---|---|
| T17 host fixture + T2 compatibility fixture + lifecycle/transport/diagnostic 回归 | `node --test scripts/dsh-b0/host-feasibility.test.mjs scripts/dsh-b0/compatibility-matrix.test.mjs scripts/dsh-b0/lifecycle-observer.test.mjs scripts/dsh-b0/diagnostic-sink.test.mjs scripts/dsh-b0/transport-safety.test.mjs` | **33/33 PASS** |
| analytics-workbench 基础与 HTML 编辑链 | `pnpm test`（工作目录 `dsh-plugins/analytics-workbench`） | **24/24 + 78/78 PASS** |
| Node 语法检查 | `node --check scripts/dsh-b0/host-feasibility.mjs scripts/dsh-b0/host-fixture-process.mjs scripts/dsh-b0/compatibility-matrix.mjs` | **PASS** |
| 空间/补丁检查 | `git diff --check` | **PASS** |
| 固定 DSH checkout 只读扫描 | `node scripts/dsh-b0/compatibility-matrix.mjs --checkout-017 ... --checkout-020 ... --sha-020 639ed015...` | **静态 `SUPPORTED`**；运行时语义仍 `NOT_RUN` |
| synthetic CLI 总结 | `node scripts/dsh-b0/host-feasibility.mjs --output /tmp/dsh-host-feasibility.json` | **退出 2：预期阻断**；in-process unload=`BLOCKED`，exact DSH host=`NOT_RUN` |

## 已得到的 synthetic 证据

- 临时目录拥有独立 profile、journal、WAL、PID 和 loopback 随机端口；测试结束后清理。
- plugin profile 可以启动并保持 native loop；插件正常请求可完成。
- 挂起请求在 120ms synthetic timeout 后转为 `HOST_RESTART_REQUIRED`，不会伪造成功。
- 崩溃请求通过宿主退出被识别；重启后 native loop 可用，插件被显式标为 `NOT_AVAILABLE/PLUGIN_DISABLED`。
- synthetic session checkpoint 能在宿主替换后从 WAL 读取；journal 选择的 active profile digest 与新 native manifest digest 对账一致。
- in-process unload 仍明确记录为 `BLOCKED/IN_PROCESS_UNLOAD_NOT_PROMISED`。这正是当前保守 fallback，不代表真实 DSH 已证明不支持 unload。

## 尚未关闭的证据

- `.context/dsh-b0/` 已有两个 exact tag 的 ignored checkout，静态 source family scan 已完成；这不等于实际 host load/unload 或真实 shell/tool timeout 运行。
- DSH `0.2.0-rc.2` 的 SHA 已固定为 `639ed015…` 并保持 advisory，不阻塞 0.1.7 synthetic gate。
- T13 journal/profile 统一接线、T15 clean pack、T21 plugin candidate 和 T3/T7/T14 durable-save replay 仍未实现；本证据不授权 D15 保存、发布、杭州切换或 GitHub 操作。

## 可复核入口

- [兼容性矩阵](../../architecture/dsh-compatibility-matrix.md)
- [host feasibility runner](../../../scripts/dsh-b0/host-feasibility.mjs)
- [compatibility scanner](../../../scripts/dsh-b0/compatibility-matrix.mjs)
- [施工计划 T2/T17](../../plans/shinemage-plugin-platform-split.md)
