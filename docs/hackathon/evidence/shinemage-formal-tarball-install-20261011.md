# 官方 npm 宿主安装当前正式 tarball（2026-10-11）

七个固定正式 `.tgz` 经官方 `@deepseek-ai/dsh@0.1.7-rc.2` 的 `plugin --profile web add <tgz> --offline --ignore-scripts` 实际安装，**七条命令退出码均为 0**。本次 profile 七条依赖是 `file:绝对路径.tgz`，安装目录在独占 profile 的普通 node_modules 中，不是源码 link。Workbench 包为 `e41df9f5…`，固定来源 `fd46b34d`；新作者提交 `d038f357` 未参与本轮包执行。

同一包执行 macOS 开启→原生关闭→恢复三个进程，PID 25172、25191、25193，均正常退出 0。开启/恢复七项 enabled，关闭七项 disabled，import failures 为 0；同一合成会话标题与 seq 3 在重启中保留。原生入口与 bridge 的鉴权 401/200 按原合同验证；bridge health ready=false，原生关闭时 bridge 端口空闲。

安装与宿主运行拒读完整主仓和九个作者仓，十项负对照 EPERM；只允许 loopback 网络，HOME 未改。七包 38 成员安装后逐字节与密封 tarball 一致，本次 PID 已退出，4326/4328 无 listener。结束时主仓原 114 项、九个作者仓、46 个受保护输入和六个固定 npm runtime 文件未变；之后 Workbench 的授权 Git 交付在[独立接续](shinemage-workbench-core-git-delivery-20261011.md)记录。

收尾验证第一次误把普通 node_modules 当成 .pnpm 安装结构，检查退出 1；失败记录保留。修正验证脚本的路径假设后核对实际 owned 路径及每个成员通过，没有重跑安装/宿主或改包。[此前目录 link 的同包宿主证据](shinemage-current-page-formal-host-20261011.md)保留；两轮范围分别记账。

本次仅证明固定 tarball 的安装、HTTP/RPC 宿主加载与合成会话进程回退。当前正式服务、模型、浏览器、WSL2、candidate/journal、真实业务以及发布/部署仍 NOT_RUN；不是任意无重启热插拔或全量发布通过。SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false。

原始输入、7 条安装日志、三份 phase JSON、host 日志、成员校验与清理：[原始交接](/Users/hutou/.codex/tasks/shinemage-formal-tarball-install-20261011-tkj_s3kn/HANDOFF-r1.md)、[机器索引](shinemage-formal-tarball-install-20261011-validation.json)。原始绑定 74 份，包含失败记录。
