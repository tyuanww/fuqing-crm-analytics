# 开发 SDK 本地归档与接收（2026-10-07）

从 `90d5012d` 及前轮四份未提交文档继续 T15。保留原工作树、候选与证据；本轮只做本地开发输入传输，不提交、推送、发布或操作杭州。整体 **PARTIAL / release_ready=false**。

## 新增合同

kit 内的 `sdk-archive.py pack/receive` 是显式开发入口，不接入生产 receiver。源码包 files、clean-build 复制清单、真实安装测试和 B0 Python 测试清单同步。

- pack 要求固定 prepare 的 READY 记录，核对 platform/arch/upstream SHA/pin，复用 `check.mjs` 校验输入；只打包 upstream/build-tools/corepack。Git 配置、hooks、日志、调用者 HOME/store 不入包。固定官方源码的两份 desktop 公开环境模板保留，以便 Git tracked-clean 校验。
- ZIP 中只有严格 manifest 与 SHA-256 内容寻址的普通文件。目录/相对链接以清单表示；拒绝未知字段、大小写/规范化冲突、路径逃逸、链接环/断链、文件父路径和 ZIP 自带链接/设备。
- receive 强制指定已核对的 archive SHA，同一文件描述符在恢复前后验 SHA；在 ZipFile 分配目录元数据之前检查 ZIP/ZIP64 尾部、条目数和目录大小，再检查 manifest、每个 blob/恢复文件的大小和摘要。配额为 200000 条目、4 GiB 逻辑字节和 64 MiB manifest/ZIP 目录。
- 目标必须为新目录。内容先写入独有 staging，验证后创建链接，运行同一只读输入预检，再填入本次独占的目标并写 LOCAL_READY 回执。失败保持 BLOCKED、回收本次 staging，不覆盖任何既有目标；没有生产原子激活或 resume 语义。
- 回执显式保留 `secret_scan=NOT_RUN`、`supply_chain=NOT_VERIFIED`、`production_runtime=NOT_INSTALLED`、`release_ready=false`。本地摘要证明字节一致，不能证明发布者身份；未实现完整内容秘密扫描或签名，不得把本包直接上传为发布就绪 SDK。

## 本次真实结果

原始命令与回执在 `.context/checks/kit-sdk-archive-20261007/`，固定输入来自[此前 SDK 准备](dsh-g0-kit-bootstrap-20261007.md)，不是主仓旧依赖或生产 runtime。

| 项目 | 实际结果 |
|---|---|
| pack-r2 | LOCAL_READY，约 55 秒；darwin-arm64 / Node 24，固定官方 SHA `477b4f420553e8a52c2fbccc464d7561b239c443` |
| 归档 | `811766966` 字节（约 812 MB）；96570 个去重内容块，141091 条 manifest 条目（含目录） |
| archive SHA-256 | `9ceeb884c014fa374a65c593b0e402396b9d06c509aceeed44f42b32b38056d5` |
| manifest SHA-256 | `53d96c979fb804df57b62a63e4a34066a7956200655ad42194e49e9717a5ec07` |
| receive-r1 | 新目录恢复、固定 Git/锁/26 SDK 入口预检 LOCAL_READY，32.124 秒 |
| 隔离消费者/边界回归 | **38 PASS / 0 FAIL / 0 SKIP，66.715 秒**；全部 10/10 消费者无相邻源码构建/测试，4 个叶子包受控打包通过 |
| archive 负测 | **16 PASS、25 subtests PASS**；含腐坏流错误脱敏、超限目录提前拒绝、错误 pin/平台/摘要、源准备记录、链接图及失败清理 |
| 边界清单 | 11 包 / 34 边 / 642 源文件 / 74 动态测试引用 PASS；同步 kit 新 files 清单 |
| 输入保护 | 原 SDK 124231 个文件/链接记录、接收目录 141091 条 manifest 记录、1318 个旧证据文件保持；原候选与 journal seq 6 摘要保持 |

消费者验证使用 `consumer.sb`：原 SDK、上一轮迁移副本、旧 `.context/dsh-b0`、public checkout 以及打包目录不可读；外网禁用，loopback 可用，收到的 upstream/build-tools 只读。Corepack 也来自这个归档，HOME、store 与测试目录是新的。38 项包含 kit 套件，不再将其 15 项另加计数。实际已安装 kit 的 Python archive help 也验证通过。

主要命令：

```sh
python3 dsh-plugins/plugin-kit/sdk-archive.py pack --source /absolute/prepared-sdk \
  --output /absolute/new-pack --node /absolute/node24
python3 dsh-plugins/plugin-kit/sdk-archive.py receive --archive /absolute/new-pack/sdk.zip \
  --sha256 REVIEWED_SHA256 --destination /absolute/new-received --node /absolute/node24
python3 -m pytest --noconftest -W error::ResourceWarning -q scripts/dsh-b0/test_sdk_archive.py
# 实际绝对路径、sandbox 和环境：consumer-command.json
node --test scripts/dsh-b0/plugin-kit.test.mjs scripts/dsh-b0/clean-build.test.mjs \
  scripts/dsh-b0/plugin-isolation.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs \
  scripts/release/plugin-boundary.test.mjs
```

两次开发期单测失败均为测试对限额错误码的预期过窄；收敛为独立的 manifest/目录限额并修正断言后，上述新跑结果通过。初次 pack-r1 保留；随后补源准备记录绑定，重新生成 pack-r2。最终又加入腐坏压缩流错误脱敏，新增负测实际通过；不把历史套件计为本轮全量 pipeline 或生产验收。

证据还包括 `pack-r2/receipt.json`、`receive-result.json`、`consumer-result.json`、`guards.log`、`consumers.log`、`verify-protection.py`、`integrity.json` 及各阶段精确命令。pack-r2 当时的控制器源码保存在 `packer-r2.py`，后续接收防护和错误脱敏由当前工作树源码负责。它们均未作签名构建证明。

## 仍开放

这是本机已有 Node/Git/Python 上的真实本地归档往返，未验证整台干净机器、WSL/Linux 或 native ABI/libc 跨版本兼容。归档还包含较大的完整 SDK/依赖输入，不是最小闭包。下一步依既有顺序推进内容审计和分发信任、对应目标平台闭包与安装验收，再处理物理分仓；生产只接收插件/运行时产物，不安装本开发包。

前轮[目录迁移验证](dsh-g0-kit-relocation-20261007.md)继续有效；本轮没有改 DSH 上游、启动生产服务、访问真实 DuckDB 或追加候选 journal。
