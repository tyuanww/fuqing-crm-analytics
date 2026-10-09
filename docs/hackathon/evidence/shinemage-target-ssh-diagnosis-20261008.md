# 目标 SSH 公钥错误归因（2026-10-08）

用户要求排查是否 Tailscale 卡住后，进行一次有界、严格主机密钥校验的 SSH verbose 只读连接与本机 agent 身份列表查询，没有更改配置或读取/展示私钥内容。

实际证据：TCP 连接建立；对端自报 OpenSSH 9.6p1 Ubuntu-3ubuntu13.19；已知 ED25519 主机密钥匹配；服务器允许的认证方法为 publickey。本机 agent 返回 no identities，当前有效配置的五个默认 identity 路径均不存在，日志没有 Offering public key。最终退出 255，远端命令没有执行。

本次具体原因是当前 SSH 配置下无可用客户端登录密钥，不是 Tailscale 卡住，也不能说服务器拒绝了某把已提交公钥。远端 hutou 账号是否存在、正确用户名、WSL2/架构/解释器条件仍未确认。未搜索或借用其他主机私钥，未生成密钥、修改 authorized_keys/known_hosts/SSH 配置或重启 Tailscale。

后续需要正确目标用户名及已授权登录身份，或为该目标配置专用公钥。密码/私钥不应发送到对话中。原 255 回执保留，本记录只补充归因；正式组合验收、candidate/journal 和 release_ready 状态不变。

[机器记录](shinemage-target-ssh-diagnosis-validation-20261008.json)；原日志位于集成树 `.context/checks/target-ssh-diagnosis-20261008/`。
