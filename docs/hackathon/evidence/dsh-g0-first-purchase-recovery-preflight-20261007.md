# 首购目标恢复矩阵前置核验（2026-10-07）

本步已开始 T2/T7 的目标在途/跨版本恢复工作，完成 **只读前置核验**。不是恢复测试通过；所有 crash、torn-frame、rc1↔rc2 读写场景仍为 **NOT_RUN**。上一批 Host/browser 审修已按正常 hooks 本地提交 `b6cecdb6`（29 文件），提交后工作树干净；本页属于随后新阶段。

本页记录前置核验当时状态；随后实际 WSL 演练及 UNKNOWN 投影缺口见[目标恢复验收](dsh-g0-first-purchase-recovery-wsl-20261007.md)，不回写或抹去本页的 NOT_RUN 历史。

## 已核对的目标事实

证据目录：`.context/checks/first-purchase-recovery-preflight-20261007/`。三次有界 SSH 只读命令经 Tailscale 执行成功，不启动/停止服务、不读取业务库、会话目录、凭据或配置正文。

| 项目 | 本轮实际结果 |
|---|---|
| 主机 | Linux x86_64，`6.18.33.2-microsoft-standard-WSL2` |
| 工具 | Node 24.21.0、Python 3.14.4、zstd 1.5.5 |
| 空间与端口 | /tmp 约 170 GB 可用；4335–4337 无监听 |
| 现役入口 | `current → /srv/shinemage/dsh/releases/dsh-0.20.0.0-r3`；VERSION 0.20.0.0，runtime package 为官方 `@deepseek-ai/dsh@0.1.7-rc.2` |
| 现役发布标记 | source `fcbd1324ac5a4b7367d9d7d2bb9bbebdbf32ba25`，artifact `e73852babf758ec4e74c43d7a6d2aeeb2f2476196765c1b8ccf1700012af9128`；仅核对元数据，没有重新验证供应链 |
| 现役监听 | 6677、18090、18092、18093、18094 均有监听；这里只查 socket/PID，没有重跑 HTTP/浏览器健康 |
| rc1 基线 | `/srv/shinemage/dsh/upstream`，commit `46a7f68b0922371ce7144b668b90e377d8e799f4`，package 0.1.7-rc.1，tracked clean；CLI 和 JSONL persistence 编译入口存在 |
| 旧 rc2 目录 | `upstream-0.1.7-rc.2-477b4f42` 有 package 0.1.7-rc.2，但不是有效 Git checkout；不能用目录名代替源码 SHA 验证 |

原候选继续固定 `861d6ef1…`、原四包和 Linux runtime `a049f061…`。现役 runtime 与原候选的 runtime 是不同核验对象，不能悄悄替换。下一步先在自有隔离目录核对 rc1 执行字节/依赖，再生成合成会话；不直接在保留的 rc1 checkout 或生产 session 上演练。

## 已定位的实际缺口

- `first-purchase-crm-host.probe.mjs` 的当前首购流程只有正常 stop/restart 与已提交事件前缀核对，不能证明在途强杀。
- `pinned-host-acceptance.mjs` 已有合成模型等待期间 SIGKILL、重启和持久前缀验证，但用于原 CRM/知识组合，不能自动当作当前四包的 WSL 证据。
- 固定 rc2 的 JSONL persistence 有 Zstandard torn-tail 解析和修复实现；必须对真实 runtime reader/writer 注入隔离的截断末帧，不能仅构造一份 PASS JSON。
- `scripts/release/compat-check.mjs` 没有提供 runtimeRunner 时仍返回 NOT_RUN；本轮没有放宽这个 gate。

`inputs.json` 已固定本步候选、rc1 SHA、rc2 pin/runtime digest 和五项待执行场景：当前候选在途崩溃、rc2 末帧恢复、rc1 写→rc2 读写、rc2 写→rc1 回读或明确拒绝、独立服务旧新状态 forward-fix。生产形状/身份/UAT、签名、activation/canary/rollback 与物理分仓继续开放。

本页和 STATUS/TODO 的本阶段更新尚未提交。上一批 commit 已完成；本阶段未 push、发布、切换生产或接入新的 PASS journal 事件。
