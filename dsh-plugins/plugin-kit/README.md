# ShineMage DSH plugin kit

这是插件构建期使用的共享工具链边界，不是 DSH 运行时，也不会进入插件 tarball。它负责把插件绑定到固定的 Node、pnpm、DSH SDK、上游 SHA、build-tools 闭包和显式锁定的领域包输入。插件运行时只能依赖自己的 `package.json`、DSH peer 和公开 capability 合同。

`toolchain.json` 与 `build-tools/` 的 manifest、锁文件、补丁由本 kit 维护。所有插件读取同一份固定配置；workbench 的业务类型检查留在 workbench 内。kit 不导入任何业务插件源码。

构建前可以单独做只读输入检查：

```sh
node dsh-plugins/plugin-kit/check.mjs \
  --upstream /absolute/pinned-upstream-0.1.7-rc.2 \
  --build-tools /absolute/installed-build-tools
```

`READY` 只表示源码 SHA/锁、工具版本与 26 个 SDK 的 main/types 入口可用，不能代替编译、依赖审计或发布签名；缺项返回 `BLOCKED` / 退出 2。命令不联网、不安装、不导入 SDK/编译器代码、不生成插件链接。实际 `bindToolchain` 复用同一检查，全部通过后才加载工具与绑定。

kit 现在有显式 package `files` 和 `./toolchain` export，可在隔离目录运行 `pnpm pack` 得到仅源码/锁/补丁的包，并通过 `@shine-mage/dsh-plugin-kit/toolchain` 导入。包继续 `private: true`，没有发布 registry；SDK、已安装的编译依赖和业务包都不打进 kit。独立插件构建须显式提供固定 upstream/build-tools；首次可用下方 kit 自身的准备入口生成，现有 workspace 构建入口保持兼容。后续分仓还需预编译 SDK/工具闭包分发、分发信任和整台干净机器验证，不能把本地 pack 称为已发布开发套件。

## 首次准备固定 SDK 与构建依赖

前置为 Node 24、随该 Node 可用的 Corepack、Git 和到官方 GitHub/npm 的网络。命令只支持 macOS/Linux，Windows 请在 WSL 中运行。安装 kit 后，在消费者工程运行：

```sh
node node_modules/@shine-mage/dsh-plugin-kit/prepare.mjs \
  --destination /absolute/new-sdk-inputs
```

目标父目录须已存在，目标目录必须尚不存在。命令创建自己的 HOME、Corepack、pnpm store 和日志目录，按 kit 固定的官方 SHA/锁文件冻结安装，仅执行官方 `build:lib:host`、`build:lib:client`，并安装与 kit 逐字节一致的 build-tools。不会安装到全局、启动 DSH、构建生产 runtime 或修改已有 checkout。HTTP(S)/ALL/NO proxy 只传给联网阶段；应用凭据与调用者的 Git/npm 配置不传入。源码和依赖下载仍有首次成本，同一 pin 验证成功的目录可供多个插件复用。

每阶段输出 RUNNING/PASS，`preparation.json` 保存版本、输入/日志摘要和结果。成功后构建参数为：

```sh
node node_modules/@shine-mage/dsh-plugin-kit/check.mjs \
  --upstream /absolute/new-sdk-inputs/upstream \
  --build-tools /absolute/new-sdk-inputs/build-tools
node build.mjs /absolute/new-sdk-inputs/upstream /absolute/new-sdk-inputs/build-tools
```

若 Node 报 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`，先核验当前网络的公共 CA 链；可以显式追加 `--ca-file /absolute/public-ca-bundle.pem`。只接受有限大小的普通公共证书文件，拒绝私钥；复制到自有目录并记录 SHA-256，只给联网阶段设置 `NODE_EXTRA_CA_CERTS`，TLS 验证保持开启，不自动安装系统证书。失败时退出 2、保留 BLOCKED 回执和日志；修复前置后选新的目标目录重试，不覆盖失败目录。中断/超时只终止本次拥有的子进程组。

此入口的 READY 只表示开发 SDK/工具输入准备完毕：`scope=development-sdk-only`、`production_runtime=NOT_BUILT`、`supply_chain=NOT_VERIFIED`、`release_ready=false`。它不是预编译包、数字签名、运行时安装或部署命令。

## 本地开发 SDK 归档与接收

`sdk-archive.py` 为同平台开发目录提供离线传输，使用 Python 3.14 与绝对路径的 Node 24。源目录必须是上述 `prepare.mjs` 生成的 READY 目录，其平台、架构、上游 SHA 和 pin 摘要须与当前 kit 一致。输出和接收目录必须不存在，父目录须已存在：

```sh
python3 node_modules/@shine-mage/dsh-plugin-kit/sdk-archive.py pack \
  --source /absolute/prepared-sdk-inputs \
  --output /absolute/new-sdk-archive \
  --node /absolute/node24

python3 node_modules/@shine-mage/dsh-plugin-kit/sdk-archive.py receive \
  --archive /absolute/new-sdk-archive/sdk.zip \
  --sha256 REVIEWED_ARCHIVE_SHA256 \
  --destination /absolute/new-received-sdk \
  --node /absolute/node24
```

`pack` 输出 `sdk.zip` 与 `receipt.json`，后者记录 archive/manifest 摘要。接收时的 SHA 必须来自已核对的打包回执或后续受信清单；与不可信包一起下载的摘要本身不能证明发布者身份。接收端在读取归档前后核对同一文件描述符的 SHA，校验 exact schema、pin、OS/arch/Node major、大小/条目/ZIP 目录限额、文件摘要和封闭链接图，再运行同一 `check.mjs`。不执行 SDK、安装 hooks 或联网下载。

归档只有内容寻址的普通文件和清单；相对符号链接在私有 staging 的所有文件验证后创建，不放宽生产解包规则。只允许 upstream/build-tools/corepack，排除调用者 HOME/store、Git 配置/hooks/logs 和敏感配置名；保留固定官方源码的两份公开 desktop `.env.*.example` 模板及 Git 校验必需的对象/index。成功时三个目录进入本次独占的目标目录；只有最终 `receipt.json` 为 LOCAL_READY 才表示接收完成。失败保留 BLOCKED 回执，清理本次 staging，既有目标绝不覆盖；不提供 resume/覆盖安装。

接收后显式把 `new-received-sdk/upstream` 和 `new-received-sdk/build-tools` 传给 `check.mjs`/插件 build。本地归档仍为 **development-sdk-only**：`secret_scan=NOT_RUN`、`supply_chain=NOT_VERIFIED`、`release_ready=false`，没有发布、签名或全量依赖内容审计。当前真实归档/消费者验证仅覆盖 darwin-arm64；Linux/WSL、libc/原生 ABI 的兼容性须另验，Mac 包不能用于 WSL。它也不是已收敛的最小 SDK 闭包。完整供应链门禁通过前只在受控本地开发中使用，不上传到 Release 或生产环境。

全部 10 个构建消费者（9 个插件与 board-components 领域包）已使用公开 package export 和精确 `0.1.0` devDependency，移除相邻 kit 源码 import。kit 不允许成为 runtime/optional/peer 依赖，也不能进入领域包的 `bundled-dependencies.json`。公开入口为 `./toolchain`、`./packaged-dependencies` 与只读 `./pin`；版本钉供开发测试读取，运行时代码不能导入 kit。

本仓工作区由 B0 pipeline、release preflight、CRM calibration 与本地 reload 显式调用 `scripts/dsh-b0/plugin-kit-link.mjs` 连接当前 kit；手动构建前可在仓库根运行 `node scripts/dsh-b0/plugin-kit-link.mjs "$PWD/dsh-plugins/shine-brand" "$PWD/dsh-plugins/plugin-kit"`。这只建立构建期链接，重复调用不改已有相同链接，其他安装拒绝覆盖。reload 只接线本仓真实目录，外部 checkout 必须使用自己安装的 kit，不注入本仓工具。只读 `check.mjs` 不调用此适配器。

隔离测试使用真实 pnpm、全新 store 和本地 kit tarball 离线安装，每次只复制一个消费者，在没有相邻插件或 `plugin-kit` 目录时逐一构建和测试全部 10 包。首批复用既有固定 SDK；后续已用上述入口在全新目录准备 SDK/工具，再完成 10/10 构建与测试、123781 个输入记录不变，见[证据](../../docs/hackathon/evidence/dsh-g0-kit-bootstrap-20261007.md)。这是当前 Mac 的新依赖目录，不是整台新机器/WSL 验收或 registry 发布。测试用临时父工程记录本地 tarball，插件自身继续声明精确版本，不把 `file:` 依赖写进发布包。

从仓库根执行既有 `scripts/dsh-b0/pipeline.mjs --prepare|--audit|--check --python /absolute/python3.14` 准备和验证；`--check` 不安装依赖。已有环境可以复用相同锁文件的依赖缓存，干净环境由 `--prepare` 安装到这里。显式传给 build 的 build-tools 必须与 kit 的 manifest、锁文件和补丁逐字节一致。

`scripts/dsh-b0/plugin-isolation.test.mjs` 把 kit 和单个叶子插件复制到独立临时目录，在没有 workbench 源码的情况下构建、测试并受控打包。测试 Git 提交只属于临时夹具，不能作为已审查的发布 SHA。当前仍是 workspace dev kit；正式独立 kit 分发、DSH 跨版本兼容和真实宿主安装按 G0 门禁推进。

`packaged-dependencies.mjs` 只处理构建输入协议：按消费者精确版本和 SHA-256 核验 tarball/公开导出/类型，不执行包 hooks、不读取兄弟包源码、不包含图表逻辑。绑定目标是当前插件 `node_modules/.shinemage-bundled/<digest>` 的包字节，消费入口仍用标准 package exports；它不是 `workspace:`/`file:` 依赖。旧摘要目录保留，不自动删除。变更/外部链接/未锁定输入失败即阻断。
