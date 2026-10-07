# T15：v2 SDK WSL 冷准备与同一领域包消费（2026-10-08）

## 边界与固定输入

本轮通过既有 Tailscale/SSH 连接，在杭州 WSL2 x86_64 的独占临时目录准备开发 SDK。复用主机既有 Node 24.21.0、Corepack 0.36.0、Python 3.14.4 和 glibc 2.39；全新 HOME/store/Corepack 依赖环境，没有重建整台主机。进程用低优先级、2 核/6 GiB 上限的有限期 transient unit；测试用非 root 消费者，全部业务输入为合成夹具。

生产 runtime、release、数据目录在消费者 namespace 内不可读；source/SDK/工具只读，外网禁用，仅允许合成 loopback。不读取真实 DuckDB，不更新生产 current、候选 journal、Cloudflare 或系统工具链。**开发 SDK 实验不等于生产上线或完整干净机器验收。**

固定 DSH 仍为 `0.1.7-rc.2 / 477b4f420553e8a52c2fbccc464d7561b239c443`，pin SHA `8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe`。本轮使用以下 Linux 产物，后续恢复必须复用同包，不重 prepare：

| 产物 | bytes | SHA-256 |
|---|---:|---|
| 完整 SDK | 835,780,783 | `b12b1e6dbeb18947587f07223fe4ce1cf163082323d2716ec0b2c46e0faf5d9a` |
| 缩减 SDK | 65,311,699 | `68e6532d01b1441be35153ee77604692b9ca3b857e71a689dfdbff96a6cfb9a6` |
| 缩减 closure | — | `4bfbc351d6403e58b72eee3d53fc9771611211799ac6275c253e9549e50688d6` |
| 原领域 tar | 1,955 | `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182` |

## 冷准备与首轮实测

已安装的 kit 实际新目录 prepare **READY（256.411 秒）**，官方 manager **11.7.0**、插件 manager **11.28.2**，26 SDK / 32 bindings；冻结依赖安装、官方 host/client SDK 构建、自有 build-tools 安装均通过。完整 pack/receive、缩减 projection/pack/receive 首轮通过，没有借用 Mac node_modules、可选包历史恢复或旧依赖缓存。完整归档 140857 条、缩减清单 30546 条；具体阶段、命令与耗时在 `.context/checks/sdk-wsl-v2-20261008/REPORT.md` 和 `retrieved/*-command.json`。

第一次上传的 732 文件 bundle SHA 为 `93007e3c6c31541f52bd890528544dcab8c60dea9ddcfbcd223dbcac908d727e`，基线 commit fd3ed8b6 加当时 dirty manifest；该轮不继承后续 HTML 修复。

初期三个控制器问题均保留失败记录：隐藏 `/srv` 遮住现有 Python 的真实安装位置；父 tooling bind 挂载遮住子挂载；自有 Node 执行目录未提供 pnpm shim。分别通过精确 Python prefix 只读挂载、修正挂载顺序、仅补自有工具入口解决，没有改系统环境或放开生产目录。最终隔离预检 13 项通过后，首个完整消费者结果为 **6/10、12 PASS / 5 FAIL / 0 SKIP**；四个失败消费者与父测试均如实记录。

## 跨平台摘要差异的根因

Mac 原领域包摘要 `22245ab9…` 与 Linux 重建的 `66d53381095e93f38dbaa7385780f20b677f68ca2692702cb270849f3392853e` 不同。实际比较证明：

- 解压后的 **10,240 bytes tar 完全相同**，SHA 都是 `0a8a2214df075294acfe01fe2da89dd9ee90d7d4cf411cb462d4636ddf4b922b`；五个成员的内容、集合、元数据完全一致。
- gzip OS 字节分别为 19/3；Mac Node 内置 zlib 1.2.12，Linux 为 1.3.2.1-motley-8002e91，deflate 字节也不同。只改 gzip OS 字节不能恢复原摘要。
- 原消费锁正确拒绝 Linux 新包；没有通过换锁或忽略压缩包摘要来修复。

证据：`domain-comparison.json`、`domain-diagnosis.json`、只含公开领域源码的 `domain-linux.tgz`。这说明“跨平台重打相同 gzip”不应成为消费已发布领域包的前置条件；运行内容一致也不能冒充传输包身份相同。

## 最小修复

仅调整既有 `scripts/dsh-b0/plugin-kit.test.mjs` 验收入口。显式绝对 `DSH_PACKAGE_INPUTS` 提供已经锁定的原 tar：构建前检查普通目录/文件，使用 kit 公开校验器核对 funnel、waterfall、workbench 三份锁一致及原 tar 精确 SHA/身份/allowlist；错误输入直接拒绝。

board-components 仍在独立新目录实际重建，完整 manifest 和所有文件成员/字节须与原包一致，用于构建内容验证；**其他消费者始终使用原 tar**。测试结束再次核对原包摘要与三份锁字节。默认未传变量仍保留原来的精确 SHA 断言与自生成路径。没有改生产接收器、领域包 build、消费锁、SDK 或上游源码。

本机修复验证：固定输入 board/funnel 与负测 **6/6 PASS**；自包含 tar 负测 **3/3 PASS**；不设置变量的旧 board 路径 **2/2 PASS**。负测验证同内容、不同 gzip 字节也必须被原 SHA 拒绝，测试不依赖已有缓存。日志与命令在 `.context/checks/kit-immutable-domain-20261008/`；这不是全部十消费者结果。主 Agent 全文审查、原生复核单文件无未解决发现，fixture 由原生 reviewer 按摘要审查。

## WSL 恢复 R2：实际十消费者通过

恢复在新 owned 目录执行，复用上表同一 Linux 缩减归档，没有重新 prepare 或重建 SDK。源码为本轮已提交 HTML 修复 `e48a6ad3adc408ff2970dcc3e27f36519e603950`，加已审核、冻结的验收脚本改动；该脚本 SHA-256 为 `bb18d282b561e4890e0a3af00fb50916cc993097151e10d8850c164a2f7d1a62`。这不是 clean release。新 source bundle **734 文件 / 1,113,603 bytes**，SHA-256 `029a81827932bf05e1907b3877563a51b818091aa55053c807ac776bf4e7585e`，全部源码逐项核验。

| 阶段 | 实际结果 | 秒 |
|---|---|---:|
| kit 安全解包 | PASS | 0.114 |
| 同一缩减 SDK 接收 | PASS | 10.780 |
| 隔离预检 | 15/15 PASS | 0.615 |
| 十消费者安装、build 与入口选定测试 | 20 PASS / 0 FAIL / 0 SKIP | 145.410 |

消费者为 board-components、shine-brand、shine-query、shine-board、shine-crowd-action、shine-funnel、shine-waterfall、crm-knowledge、knowledge、analytics-workbench，均实际执行；workbench 此入口只选八个既有测试文件。**这包含 e48 HTML 源码构建，不代表 WSL 跑过本机全部 111 项 HTML 测试。**

真实入口为 `node --test --test-reporter=tap source/scripts/dsh-b0/plugin-kit.test.mjs`。控制器先 `unshare --mount --net --pid --fork --mount-proc`，再降权 nobody；只读挂载本次 source/received/tooling/domain、固定 Python prefix，隐藏生产和原 SDK，禁外网而允许隔离 loopback。新 received 下显式提供 `B0_BUILD_UPSTREAM`、`B0_BUILD_TOOLS`、`COREPACK_HOME`、`DSH_SDK_CLOSURE_SHA256` 和原领域目录 `DSH_PACKAGE_INPUTS`，`COREPACK_ENABLE_NETWORK=0`。精确 argv/cwd/env、900 秒时限与原始 TAP 见 `recovery/final-r2/retrieved/consumers-command.json`、`consumers-result.json`、`consumers.stdout`，所有相对路径均位于 `.context/checks/sdk-wsl-v2-20261008/`。

原领域包与三个消费者锁最后再次通过检查；Linux 重建的五文件 map/manifest 与原包相同，新压缩包没有被用于消费。新 unit 上限为 MemoryHigh 2 GiB / MemoryMax 4 GiB、CPU 200%、TasksMax 256、RuntimeMax 1800 秒；最后独立探针证明 `inactive / dead / MainPID=0 / Result=success`。

## 输入、生产保护与证据收取

runner 实际重算后证明：原 prepare **216700 条**、原 received **30548 条**、新 received **30548 条**记录及 **734** 源码文件保持；SDK archive、原领域包摘要保持。三份消费锁既有摘要没有改写。原候选与 journal 本机另外核对不变，见 `.context/checks/kit-immutable-domain-20261008/candidate-protection.json`。

生产 current 始终是 `/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3`；6677、18090、18092、18093、18094 五个监听的完整 PID 行与首次准备前快照相同。这只证明 current/监听/PID 保持，不扩大为完整生产健康或业务验收。未启用新的首购候选，未读真实业务库。

首次恢复 dispatch 与结果下载各遇到一次 SSH 连接超时；只读 Tailscale 探针显示在线但经 DERP 中继。保留失败后恢复上传/下载，没有因此重跑消费者。测试在有限期单元运行，连接断开不会重新构建。取回的证据归档 **1,316,544 bytes**，SHA-256 `6222b9acf05f71066c2826e5d3bd050d53a4e9c9c3aedfe2dc2d6c34bf77e891`，**37 文件**逐项校验通过。`recovery/final-r2/REPORT-R2.md`、`final-result-r2.json`、`handoff-manifest-r2.json` 为最终证据；旧 `REPORT.md` 的失败状态和摘要保持，没有覆盖为绿色。

## 当前结论与后续

本项关闭 **T15 的 v2 SDK WSL 受控冷依赖准备、同平台归档往返、原领域包不可变消费**。SDK 来源另见[上游信任复核](dsh-g0-sdk-upstream-trust-20261008.md)：仍有 7 个上游依赖版本/29 条公告，完整组成/发布者身份/撤销与二进制安全尚未关闭，**SDK 分发 BLOCKED / 产品 PARTIAL / release_ready=false**。

未执行整台新机器验收、全 B0/release、远端 CI、111 项 HTML 的 WSL 全量测试、真实浏览器/业务 UAT、生产 runtime 构建、receive/reconcile 或切换。本机 Mac SDK 与 Linux SDK 各自准备，不能混用平台归档；领域包则跨平台消费同一封存原 tar。实际源码/测试、文档和局部复核随本批本地提交记录；不自动 push、发布、物理分仓或部署。
