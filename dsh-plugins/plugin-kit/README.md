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

`sdk-archive.py` 为同平台开发目录提供离线传输，使用 Python 3.14 与绝对路径的 Node 24。默认完整模式的源目录必须是上述 `prepare.mjs` 生成的 READY 目录，其平台、架构、上游 SHA 和 pin 摘要须与当前 kit 一致；缩减模式需要显式摘要，见下节。输出和接收目录必须不存在，父目录须已存在：

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

### 分发前的仓库级内容审计

仓库维护者可显式运行下面的只读入口（不随 kit 安装，不是每个插件的日常构建步骤）：

```sh
node scripts/release/sdk-content-audit.mjs \
  --archive /absolute/new-sdk-archive/sdk.zip --sha256 REVIEWED_SHA256 \
  --root /absolute/new-received-sdk --python /absolute/python3.14 \
  --output /absolute/evidence/new-sdk-audit.json
```

Node 使用固定 24.x；输出必须是 SDK 之外的新文件。先复用 `sdk-archive.py` 验证归档/清单/每个 blob，再核对接收树的清单内文件与链接；不执行 SDK，不联网，不修改原回执。只扫描清单内固定输入，不把接收目录里的额外文件当成受审内容，也不支持并发修改输入树。

现有秘密模式检测不豁免 vendor/test 目录；报告只包含相对路径、摘要和分类，不包含命中值。16 MiB 以上文件只校验摘要，二进制、Git 对象和嵌套归档记录覆盖缺口。疑似命中返回 `BLOCKED`，有覆盖缺口返回 `PARTIAL`，两者退出码为 2；即使 `PATTERN_SCAN_PASS` 也只说明本次模式检查，始终 `release_ready=false`，不能代替来源、签名、SBOM 或完整内容审查。旧 pack/receive 的 `secret_scan=NOT_RUN` 不会被这个独立报告改写。

### 缩减的插件构建输入

完整 checkout 继续用于 SDK 维护和固定源码准备。仓库维护者可以从已核对的本地 SDK 归档，在**新目录**提取插件构建输入；该操作不联网、不安装依赖，也不改原上游：

```sh
node scripts/release/sdk-closure.mjs \
  --source /absolute/received-sdk --destination /absolute/new-build-sdk \
  --archive /absolute/sdk.zip --sha REVIEWED_ARCHIVE_SHA256 \
  --python /absolute/python3.14
```

提取器使用仓库已有、固定 6.0.3 的 TypeScript parser；须先有仓库 build-tools 环境。它从 26 个固定 SDK 入口和固定编译工具出发，跟随已安装 dependencies/peer/optional 关系，再扫描已发布声明文件的实际裸包与 `@types` 引用。原生平台缺少的 optional 依赖记录在回执；已声明的必需依赖缺失则拒绝。原完整输入也无法解析的声明引用列入 `unresolved_declarations`，不猜测安装；仅有提取回执不能宣称类型兼容，必须完成目标消费者的完整类型检查。纯类型依赖只携带声明/包元数据/许可证，不带其运行程序。少数上游声明没有直接依赖边时，只绑定同一固定源码内唯一的官方包或 kit 已固定的 React/SDK 输入，不修改上游 package.json。

为保持现有验收，提取器还保留官方 `agent-loop-testkit`、client modules 注册器及其必需运行依赖，以及清单中明确列出的八个宿主合同测试文件（LayoutController 编译文件与七个对应源码文件），以及原固定输入里的 JSDOM 和 Store 测试所需 Zustand/Immer。这些输入用于开发验证，不增加插件生产依赖，也不代表可以运行完整 DSH 宿主。工作台测试通过 kit 的 `inspectToolchain` 校验输入，使用它返回的 bundler/React 加载器；不再自行进入 `apps/web` 或要求缩减输入包含 Git 目录。测试使用外置构建输入时同时设置 `B0_BUILD_UPSTREAM`、`B0_BUILD_TOOLS` 和对应的 `DSH_SDK_CLOSURE_SHA256`。

`receipt.json` 提供独立的 `closure_sha256`，指向 `sdk-closure.json`。摘要须通过已核对的本地提取结果或后续受信清单取得；本地摘要不证明发布者身份。每次使用前校验清单、来源 pin、OS/arch/Node、锁文件、全部文件/链接/模式和额外文件；没有 Git checkout 时，不会自动降级为跳过校验。

插件作者使用已准备的缩减输入：

```sh
node node_modules/@shine-mage/dsh-plugin-kit/check.mjs \
  --upstream /absolute/new-build-sdk/upstream \
  --build-tools /absolute/new-build-sdk/build-tools \
  --closure-sha256 REVIEWED_CLOSURE_SHA256

DSH_SDK_CLOSURE_SHA256=REVIEWED_CLOSURE_SHA256 \
  node build.mjs /absolute/new-build-sdk/upstream /absolute/new-build-sdk/build-tools
```

省略 closure 摘要时仍要求原完整 Git 输入；错误摘要拒绝，不回退。提取回执的 `consumers=NOT_RUN` 不会因后续构建自动改写，消费者和审计结果分别留证。缩减内容仍须显式审计：

```sh
node scripts/release/sdk-content-audit.mjs --root /absolute/new-build-sdk \
  --closure-sha256 REVIEWED_CLOSURE_SHA256 --output /absolute/evidence/new-closure-audit.json
```

缩减目录通过同一个归档器的显式模式传输：

```sh
python3 node_modules/@shine-mage/dsh-plugin-kit/sdk-archive.py pack \
  --source /absolute/new-build-sdk --output /absolute/new-compact-archive \
  --closure-sha256 REVIEWED_CLOSURE_SHA256 --node /absolute/node24

python3 node_modules/@shine-mage/dsh-plugin-kit/sdk-archive.py receive \
  --archive /absolute/new-compact-archive/sdk.zip --sha256 REVIEWED_ARCHIVE_SHA256 \
  --closure-sha256 REVIEWED_CLOSURE_SHA256 \
  --destination /absolute/new-received-build-sdk --node /absolute/node24
```

`--sha256` 固定传输包，`--closure-sha256` 固定内部 SDK 清单，两者均由调用者显式提供。缩减归档采用 `shinemage-development-sdk-closure-archive/v1`，与完整格式区分；接收器不根据包内容猜模式，遗漏或错误摘要不能回退。原始 `sdk-closure.json` 字节保留，因此接收后仍使用同一 closure 摘要构建和审计。内外条目清单、固定 pin/平台、每个 blob、文件权限、整条链接路径均校验，继续复用原来的 ZIP 资源限额、独占目录、私有 staging 和失败回收。打包拒绝把输出写入源 SDK，包括目录别名路径。

本地同平台往返与消费者验证不能代替目标平台验收：**不是数学意义的最小集合、签名分发包或生产 runtime**。回执保留原完整归档 SHA 作为来源记录，但该记录不是发布者签名；目标平台/WSL、完整内容审计、签名/SBOM/CVE/撤销仍须单列完成，`release_ready=false`。上述 SDK 维护动作不加入每个业务插件的日常构建流程。

### SDK 供应链盘查（仓库维护入口）

```sh
# 默认只读、离线；输出目录须已存在，报告不能已存在或位于 SDK 内。
node scripts/release/sdk-supply-chain.mjs --root /absolute/new-received-build-sdk \
  --closure-sha256 REVIEWED_CLOSURE_SHA256 --output /absolute/evidence/new-inventory.json

# 确认离线清单的待查询名称后，显式查询 OSV；不安装或执行依赖。
node scripts/release/sdk-supply-chain.mjs --root /absolute/new-received-build-sdk \
  --closure-sha256 REVIEWED_CLOSURE_SHA256 --output /absolute/evidence/new-advisories.json --osv
```

这两个命令从本仓根目录执行，不属于已安装 kit 的运行时 API。`--osv` 向固定 `api.osv.dev` 发送去重的安装依赖名称/版本；排除工作区及声明 `private:true` 的清单，但不代表已经核验私有 registry 的可见性。清单的 CycloneDX `bom` 保留 `incomplete`：包内隐藏/打包合并的依赖、依赖边、发布者身份和撤销未核验；`package.json` 摘要不冒充整包摘要。`NO_KNOWN_ADVISORIES` 只适用于本次查到的名称/版本，网络/分页失败为 `UNKNOWN`；报告分别计数 `requested/queried/completed/requests_sent`，逐包保留 `NOT_QUERIED/INCOMPLETE/COMPLETE`，失败不冒充全部查完；发现公告为 `BLOCKED`，其余未关闭条件为 `PARTIAL`，退出码均为 2，始终 `release_ready=false`。

TLS 信任失败返回 `SDK_SUPPLY_OSV_TLS_TRUST`。本机实际使用 `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem` 的系统公共 CA 后完成查询，不关闭 TLS；其他机器应按自己的信任配置处理。2026-10-07 旧 pin SDK 命中 10 个依赖版本 / 42 条不同公告，见[历史证据](../../docs/hackathon/evidence/dsh-g0-kit-sdk-supply-chain-20261007.md)；当前 v2 缩减包重查为 **7 个版本 / 29 条不同公告，分发仍 BLOCKED**，见[v2 分发记录](../../docs/hackathon/evidence/dsh-g0-kit-sdk-v2-distribution-20261007.md)。不能以 build/test 通过替代该条件。

上一阶段审修排除了 pnpm 11.11.0 完整候选（内置依赖仍有公告），完成了固定 11.28.2 的包来源与 27 份带版本清单查询。见[候选核对与剩余任务](../../docs/hackathon/evidence/dsh-g0-kit-sdk-supply-review-20261007.md)。随后完成了隔离安装/兼容验证，当前默认 pin 的职责拆分见下节；DSH 0.2.0-rc.2 也不能自动关闭当前依赖问题。

### 包管理器候选验证

默认工具链使用 `dsh-b0-toolchain/v2`：`upstream_pnpm=11.7.0` 保留官方固定源码的构建声明，`pnpm=11.28.2` 用于 ShineMage 插件/kit/build-tools。`prepare` 在同一独占缓存中分别验证两个真实版本，按工作目录的 packageManager 选择；不会修改上游清单或关闭版本检查。准备回执同时记录两者，官方 runtime 准备回执继续记录上游版本。CI 从项目声明与工具链读取自有版本，不再重复写死版本常量。

新 pin 改变 SDK 身份摘要，旧 SDK 不会被新 kit 静默接受；需要显式准备新的开发输入，旧 kit/SDK 按旧 pin 继续保留。工具链准备属于维护步骤，不在日常插件 build 中自动执行。

v2 的本机首次准备和消费者实测见[工具链拆分证据](../../docs/hackathon/evidence/dsh-g0-kit-manager-split-20261007.md)。完整准备环境保留两套 manager；`sdk-closure.mjs` 生成的插件开发包只保留 pin 中 `pnpm` 对应的完整版本目录，并验证包名/版本，不携带官方构建 manager 或其他缓存。该包用于消费已构建 SDK，不用于重新构建官方宿主。

当前 v2 包的同平台 pack/receive 和 10/10 消费者实测已完成，见[分发复验](../../docs/hackathon/evidence/dsh-g0-kit-sdk-v2-distribution-20261007.md)。准备成功不代表完整依赖图可归档：可选依赖下载失败可能留下悬空链接，归档器仍拒绝；须在新输入目录补齐精确来源并留证，不能删链接或放宽校验。当前仅开发范围，完整供应链、目标平台/WSL 继续开放。

现有安装测试支持显式 `B0_TEST_PNPM_VERSION=11.28.2`。须先将该精确版本及摘要对应的 manager 准备到独占 `COREPACK_HOME`，再结合 `B0_BUILD_UPSTREAM`、`B0_BUILD_TOOLS`、缩减模式的 `DSH_SDK_CLOSURE_SHA256` 运行 `node --test scripts/dsh-b0/plugin-kit.test.mjs`。候选模式要求前三个路径显式为绝对路径，缺项/相对路径以 `KIT_TEST_CANDIDATE_INPUT_REQUIRED` 在打包前失败，不允许跳过消费者或回退本仓工具/个人缓存。测试禁用 Corepack 网络/自动 pin，核验实际版本；候选声明只写自有 kit/插件副本，不改官方 SDK 和仓库 pin，也不改消费者的领域包摘要锁。不设置该参数就按原声明运行。

2026-10-07 本机 11.28.2 与 11.7.0 各 10/10 消费者通过，图表 tarball 摘要一致；新空 store 的构建工具冻结安装与严格类型检查另通过。见[候选验证范围](../../docs/hackathon/evidence/dsh-g0-kit-pnpm-candidate-20261007.md)。这仅是测试入口，不能放进生产 prepare 作为版本检查豁免，旧候选证据不证明当前 v2 SDK 已重新构建；v2 的准备/消费者结果须另外留证。
