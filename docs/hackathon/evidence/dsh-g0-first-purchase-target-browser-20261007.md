# 首购目标浏览器接入与准备（2026-10-07）

历史阶段结论（12:21）：**BLOCKED_REMOTE_CONNECTIVITY / 目标浏览器 NOT_RUN**。继续使用候选 `861d6ef1c42b23b5f2ad4427ba9a19ecb032651c61efa6414303e0729feea4d4`、源码 `f9726f68` 的查询/保存包、原 workbench/CRM 包和固定 DSH rc2 Linux runtime。当前 Git HEAD 为 `4d792eeb`，上一轮未提交增量保留。本轮仅检查连接、准备本机驱动并更新状态文档，没有新业务实现、Git 提交、发布或生产操作。

> 接续：用户恢复连接后，实际杭州 WSL headless 五场景已通过，见[后续目标浏览器记录](./dsh-g0-first-purchase-target-browser-wsl-20261007.md)。本页保留当时失败证据，不再代表当前连接状态。

## 本次实际结果

证据目录：`.context/checks/first-purchase-target-browser-20261007/`。最后保存的连接复查为 **2026-10-07 12:21:26 +08:00**。

| 检查 | 结果 | 范围与证据 |
|---|---|---|
| Tailscale status | 本机 Running，目标 `100.93.46.46` 显示 Online，Relay 为 `sfo`，当前直连地址为空 | `network-check.json`；在线标志不等于数据路径可达 |
| SSH IPv4 | 三次 TCP/22 连接超时；最后一次 exit 255 | 前两次终端观察，最后一次 `ssh-ipv4-final.json`；未进入 SSH 认证或执行远端命令 |
| SSH IPv6 | 一次连接超时，exit 255 | 本轮终端观察；同一 Tailscale 目标地址 |
| Tailscale ping | 先 3 次、最终复查 2 次均无回应 | 最后一次命令 exit 1，`tailscale-ping-final.json`；不是应用 HTTP 失败 |
| 本机 tailscale netcheck / route | IPv4、IPv6、UDP 均可用；目标路由到 utun4 | 终端观察；本机可联系中继，不能据此证明杭州机器正常 |
| 本机浏览器驱动 | Playwright **1.62.1**、Chrome **154.0.8037.98**，Darwin arm64、headless、1280×900，隔离 context 进入 about:blank 后正常关闭 | `local-browser-readiness.json`；不访问业务 URL，不算目标浏览器或用户流程通过 |
| 固定输入与 journal | 15 个输入摘要/大小/mtime 与上一轮一致；journal 保持 seq 5 | `input-baseline.json`、`final-checks.json`；不追加 browser PASS 事件 |

没有修改 Tailscale、SSH、防火墙、路由或主机服务配置。远端接入失败使 WSL 状态、sshd 状态、目标浏览器是否安装均未获得本次确认。不能把原因断言为 Windows 休眠、WSL 停止或业务应用故障；需要杭州本机状态或恢复连接后的证据。

## 恢复后的顺序

1. 确认杭州 Windows 唤醒与 WSL 运行。可先在 Windows 本机执行只读 `wsl --list --verbose`；WSL 内检查 `tailscale status`、`systemctl is-active ssh` 和 `ss -lnt '( sport = :22 )'`。这一步不要求重启生产服务。
2. SSH 恢复后先核验目标 Node/Python、Chrome/Playwright、空闲临时空间与测试端口归属，保存现役监听快照。浏览器缺失时明确记录，不能用本机驱动结果代替。
3. 为本轮创建独有隔离目录，复用已核对的同一 Linux runtime/四包、Linux wheels；控制器输入单独固定摘要。原证据目录与 journal 保留。
4. 复用 `backend/tests/test_analytics_first_purchase_official_host.py` 的 v5 输入及显式 `B0_NATIVE_CRM_BROWSER_MODULE`，执行现有五场景：登录前拒绝、原生 CRM 登录 slot、原生命令/worker/确认保存、刷新恢复同一回执、无业务 preset 的原生对话。
5. 保存真实浏览器版本、截图、场景/安装摘要、进程和清理证据；只停止本轮自有实例，核对生产监听与原候选输入未变。另行核验后才记录对应 browser observation，不能覆盖原 HTTP 回执。

本轮不重复运行未变化的 311 项 release suite；上一轮测试结果仍归其原证据。移动端/无障碍、在途/跨版本恢复、真实模型与业务 UAT、供应链、activation 仍开放，`release_ready=false`。
