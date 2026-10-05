# 杭州目标平台确认与固定依赖准备（2026-10-06）

此阶段发生在预检审核提交 `7943403319eeefcb3a191e03e4e1dc03772a0cc3` 之后。该提交包含 12 个文件并通过正常 hooks，提交后工作树曾干净，未 push。本文为下一步操作记录，不属于该提交。

## 实际目标信息

通过仓库已有的 Tailscale SSH 地址和密钥配置，以 BatchMode、严格 host key 校验和连接超时进行只读查询。没有读取凭据内容、数据库或业务 runtime；没有创建目标目录、安装、启动/重启、切换服务。

| 现场读取 | 结果 |
|---|---|
| 系统 / 架构 | Linux / x86_64 |
| 内核 | `6.18.33.2-microsoft-standard-WSL2` |
| libc | glibc 2.39 |
| Python | `/usr/local/bin/python3.14`，3.14.4 / CPython |
| pip | 26.0.1 |
| 解释器支持的标签 | 1226 项，从该解释器的 packaging 读取 |

原始记录位于 `.context/checks/service-target-platform-20261006/`：`ssh-platform-key.log`、`platform.json`。平台 JSON SHA-256 为 `84a2662ca36b5e73f4c1c8670f4df3a87975f8b4ed1891ad325616be99ab6f2e`。

## 在 Mac 本地准备的依赖

仍绑定原服务 manifest digest `29b63d9609a4af8ec0f6464dbdd7ca7a3d6feb89ef5f32db54bf1f950783bc07`；没有修改依赖版本或服务包。按现场标签优先级，从固定版本 PyPI 元数据选择非 yanked 二进制 wheel，HTTPS 下载后核对官方公布的 SHA-256 与大小；没有执行或安装包。

- 13 个 wheel，总计 **3,262,610 字节**，保存在 `linux-cp314-wheelhouse-v2/`。
- 原生依赖为 `pydantic_core-2.46.5-cp314-cp314-manylinux_2_17_x86_64.manylinux2014_x86_64.whl`；SHA-256 为 `54d510bac3ee52247af28ed4bb18a1e799f040ac60fd2bf5ccd4c92f1fbe786f`。
- `wheel-preparation-v2.json` 记录每份文件、固定版本、来源 URL、字节数、SHA-256、源 metadata SHA 和匹配的现场标签；回执 SHA-256 为 `4da05b0e27a9d3e588be06070a91da7ae1a134515eb7175f5adb7dd5f9e13b5b`。
- `local-static-validation.json` 再次核对 13 份实际文件的 hash/大小、包名/版本、与现场标签交集以及无额外文件，结果 PASS。范围是 **local-static-selection-only**，不是目标服务预检或安装成功。

现场读取和本地下载不证明发布者签名、完整安装兼容或二进制可加载性。本准备阶段回执的 `release_ready=false`；当时 target_preflight、cold_install、HTTP recovery、supply-chain attestation、activation 均 NOT_RUN。后续 WSL 合成验收见末节链接，原回执不追改。

## 保留的失败与修复

1. 初次 SSH 没有指定仓库配置的密钥，publickey 认证失败；按现有操作文档使用指定身份后成功，没有改 SSH 配置或放宽 host key 检查。
2. 初次 Python HTTPS 请求因本机默认 CA 配置报 `CERTIFICATE_VERIFY_FAILED`。第二次明确使用已有 pip/certifi 的受信任 CA 包，TLS 校验保持开启，未修改系统证书或关闭验证。原始失败回执、日志和第一份空输出目录保留；第二次使用新目录，没有覆盖失败证据。

## 下一步

本准备阶段没有向杭州传送依赖包，也没有安装或生产配置/数据变更。当时下一步是目标预检、冷安装、合成身份/状态与保存恢复；同日后续已完成[首购 WSL 隔离验收 14/14](./dsh-g0-service-target-acceptance-20261006.md)。目标回执验证器与候选 journal 接线、真实身份/策略和供应链仍未完成，不能据此放行生产激活或物理分仓。
