# 新目标 SSH 登录预检（2026-10-08）

用户在第一地址识别为本机 Mac 后，提供 `100.93.46.46` 并授权直接测试。仅查询该地址的本机 Tailscale 元数据与现有 SSH 配置，随后进行一次严格主机密钥检查、BatchMode 公钥认证和有界超时的只读连接。

Tailscale 精确匹配 Peer / `DESKTOP-FAEJK8S` / Linux / Online=true。现有 SSH 配置为 `hutou@100.93.46.46:22`；连接已通过主机密钥检查，但 1.304 秒后退出 255，原错误为 `Permission denied (publickey)`。没有执行远端 uname/id/hostname，也没有取得 Python、架构或 WSL2 证据，不能仅凭设备名/Linux 状态认定准入通过。

原始五文件已逐字节复制到集成树 `.context/checks/target-100-93-46-46-20261008/`，摘要见[机器回执](shinemage-target-ssh-auth-validation-20261008.json)。没有更改 known_hosts、创建远端目录、安装工具、猜其他用户名或重试认证。candidate、插件包和 journal 未改，正式组合验收仍 NOT_RUN，release_ready=false。

接续所需输入已经收窄为正确 SSH 用户名或既有成功连接命令/别名；不要发送密码或私钥。连通后才能继续只读检查实际 WSL2、x86_64、固定解释器、端口和独占目录，再走原 combined runner。本轮第一地址记录保留，不覆盖成第二地址的结果。

后续按用户要求的诊断已将原因收窄为本机未提供可用登录密钥，并非网络失败或一把已提交公钥被拒；见[实际归因](shinemage-target-ssh-diagnosis-20261008.md)。
