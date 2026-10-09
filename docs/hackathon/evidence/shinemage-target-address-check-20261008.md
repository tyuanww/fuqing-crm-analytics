# 单目标连接预检

用户提供的 `100.114.157.0` 经本机 Tailscale daemon 单地址筛选，明确为 **Self / hutou 的 MacBook Air / macOS / Online**。因此它是当前本机地址，不是正式 validator 要求的 WSL2 Linux x86_64 目标。没有扫描或披露其他 tailnet 节点。

`ssh -G` 仅保留 user=hutou、hostname=100.114.157.0、port=22 等非敏感字段。获直接只读测试授权后，仅进行一次 SSH：BatchMode=yes、ConnectTimeout=8、ConnectionAttempts=1、StrictHostKeyChecking=yes、UpdateHostKeys=no。退出 255：该 IP 没有已知 ED25519 host key，严格校验拒绝。远端 hostname/uname/id/runtime/端口命令没有执行；不修改 known_hosts、不重复尝试、不猜其他用户名。

当前不应为这个 macOS Self 地址绕过 host key 或尝试运行 WSL 验收。继续既有目标任务实际需要非生产 WSL2 x86_64 的地址、SSH 身份、可信主机密钥基础及允许的 owned 目录。当前 candidate/journal 仍封存旧包，主 Agent 的本地提示修复另行验收，不把旧 candidate 用作新包通过。

正确目标确认后的最小只读远端步骤仍是 `hostname; uname -srm; id`，随后查看固定 Python/Node 版本及 6677、4335–4337 的监听元数据；先判明系统/身份再决定下一步，不创建目录、不运行验收。必须沿现有 source/terminal validator 的 actual-WSL2/Linux/x86_64/uid65534/Python3.14 条件，不放宽为 macOS 或 Docker 仿真。

本轮只创建 A 自己的新证据文件；未修改主树、旧回执、candidate 或 journal，未执行验收/SSH 后续/远端写入。
