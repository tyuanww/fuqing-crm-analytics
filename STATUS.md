# 项目状态 (Project Status)
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。本页是当前运行与交付边界的 SSOT。

## 当前快照（2026-09-30，DSH 0.1.7-rc.2 / VERSION 0.20.0.0）

| 项 | 状态 |
|---|---|
| Git 基线 | 产品 VERSION 为 `0.20.0.0`；`dsh-0.20.0.0-r1` immutable Release 已发布，源 SHA 为 `073c576c8d75d6ab16e2bac48b2cc99adf4a68bf`，DSH 上游 SHA 为 `477b4f420553e8a52c2fbccc464d7561b239c443`；main CI、exact-SHA preflight、evidence 和 publication workflow 均通过。 |
| 产品 | **PARTIAL**；r3 已在杭州 current 运行并完成 DSH/CRM/B0 loopback smoke，但完整浏览器、真实模型、WAL 兼容、operator gate、10x backpressure、真实业务 UAT 和回退演练仍未完成。 |
| DSH | 官方上游固定为 `477b4f42`（0.1.7-rc.2），不修改上游源码；杭州 current 仍为 `/srv/shinemage/dsh/releases/dsh-0.19.0.0-r3`，`dsh-0.20.0.0-r1` 已通过 Tailscale 只读复核并保留在 incoming，尚未 activate。 |
| CRM | 杭州 backend `127.0.0.1:18093`、frontend `127.0.0.1:18094` 健康；backend 镜像固定为 `sha256:bbcea629…`，容器内 DuckDB 为 `1.5.6`；真实库未读取。 |
| WeKnora | 页面 `127.0.0.1:18090`、API `127.0.0.1:18092` 健康；数据卷与登录由 WeKnora 自身管理。 |
| 公网入口 | `www.tyuan.chat`、`app.tyuan.chat`、`page.tyuan.chat`、`board.tyuan.chat`、`learn.tyuan.chat` 经 Cloudflare Tunnel；HTTP 已强制跳 HTTPS。 |
| 安全响应头 | 全域 HSTS 6 个月；`learn` 使用 Permissions-Policy 和 CSP Report-Only，暂不启用 preload/includeSubDomains。 |
| 数据与备份 | 生产 DuckDB 保留在杭州 `/srv/shinemage/data`，D 盘备份已校验；`incoming` 只读保留，不进 Git。 |

### 独立查询包的宿主组合（2026-10-07，当前进度）

- 从 clean `43630981` 继续，新增显式查询内核演练包：46 个允许文件固定取自该 Git SHA，15 个依赖按仓库锁安装到独立 venv（含 DuckDB 1.5.6）。原 workbench/CRM/保存服务三包复用；查询 API、dispatcher 和实际 worker 从解包目录运行。见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-kernel-host-20261007.md)。
- 最终保护/model **30 PASS / 0 SKIP**，启动失败/回收 **5 PASS**；workspace HTTP、v2 保存服务 HTTP、v3 全包 HTTP、v3 Chrome 各 **1 PASS**，Chrome **5 场景**。查询服务独立重启、同请求重放仍只有一个 worker/分析；19 个记录的自有 PID 已退出，旧 437 文件与 journal seq 3 不变。
- **仍 PARTIAL**：关闭本机查询包组合子项。演练包不是生产 release；保存与查询仍共享 RunStore/SQLite 合同，CRM/model 为合成端点。服务间存储边界、新包目标 WSL/恢复、供应链与生产 gate 尚未关闭；本轮未操作杭州。

### 独立保存服务包的宿主组合（2026-10-07，上一阶段）

- 从 clean `212005bc` 继续，复用 workbench/CRM 包及原 `d7025f75…` 服务 archive，在独立离线 venv/进程加载保存服务。未重新打包；原生登录、查询、保存和回执链通过，保存服务单独重启后经 Host 重放同一请求，分析记录仍为 1。见[本轮证据](docs/hackathon/evidence/dsh-g0-first-purchase-service-host-20261007.md)。
- 当前保护/model **27 PASS**、后端 **5 PASS**；workspace HTTP、artifact HTTP、artifact Chrome 各 **1 PASS**，Chrome **5 场景**。最终 9 个自有 Host/服务 PID 已退出、5 个端口无监听，旧证据 437 文件与 journal 未变。
- **当时 PARTIAL**：关闭本机“插件包 + 保存服务包”组合子项；当时查询 kernel/worker 仍为源码夹具，后续查询包组合见上节。新包 WSL/恢复、供应链和生产 gate 尚未关闭，该阶段未操作杭州或发布。

### 精确插件包的宿主与浏览器（2026-10-06，上一阶段）

- 复用 `9611589c` workbench 包，并从 clean `d3fe7f94` 构建固定 CRM 包；通过新的显式 artifact 模式在私有目录解包，复用生产接收器的 peer 链接，用真实 candidate digest 验证。未改业务插件或 DSH 上游。
- 官方 Host HTTP **1 PASS**，紧接运行的 Chrome headless **1 PASS / 5 项观测**；保护/model 测试 **21 PASS**、受影响后端 **3 PASS**。已修复演练缺 transitive SDK、固定端口 TIME_WAIT 和父初始化错误被遮蔽的问题；见[本次证据](docs/hackathon/evidence/dsh-g0-first-purchase-artifact-host-20261006.md)。
- **当时 PARTIAL**：该阶段只证明精确插件包组合，服务/查询内核由源码夹具运行。旧候选 83 文件及 journal seq 3 未改，临时监听和 Host 已回收；保存服务 archive 的后续进展见上节。

### 原生命令 clean 候选（2026-10-06，上一阶段）

- 原生命令/Chrome 批次已按 OCR delegate 审修并正常提交 `9611589c`，随后从干净 SHA 构建 workbench 和独立首购服务包。本次源码/实际双包兼容各 **9/9 PASS**，相关测试 **106 PASS**，同一服务 archive 的合成 CRM 保存链 **6/6 PASS**。见[候选证据](docs/hackathon/evidence/dsh-g0-native-command-candidate-20261006.md)。
- 候选 `ca79774b…` 绑定插件 `b3571f04…`、服务 `d7025f75…`，本机回执进入 journal seq **3**。重试 52 个当前文件不变，旧 195 个证据文件保留；旧 WSL 回执以 `SERVICE_TARGET_PAIR_MISMATCH` 拒绝。
- **当时 PARTIAL / 激活 BLOCKED**：该阶段只是 workbench 与服务的本地候选绑定；后续精确插件包的宿主/浏览器见上节。独立服务组合、新包目标机、供应链和生产 gate 未关闭。

### 原生首购命令与 Chrome 接线（2026-10-06，上一阶段）

- 从 `f3b7c0cc` 干净工作树继续。workbench 使用官方 `commands.register` 提供 `/first-purchase`、`/first-purchase-status` 和精确任务取消；复用原 kernel/Agent Loop，不修改上游、共享 RPC 或原生输入框。命令只在显式合成 profile 启用，CRM 登录与查询/保存归属保持一致。
- 固定 rc2 的 **Chrome headless 整链 1 PASS / 5 项观测**：未登录拒绝、原生 CRM 登录、输入框查询与显式保存、刷新同一回执、未连接 CRM 的普通原生对话。修复空会话拒绝提示不可见、卡片误依赖其他插件开关、取消范围和迟到回执问题。最终 Host HTTP **1 PASS**、命令/编译卡片 **12 PASS**、相关后端 **35 PASS**，Node24 构建通过。见[本轮证据](docs/hackathon/evidence/dsh-g0-native-command-browser-20261006.md)。
- OCR delegate 已复核本批 **27/27** 文件，修复浏览器初始化/诊断写入异常时的资源泄漏；保护回归 **8 PASS**、真实 Chrome 再跑 **1 PASS / 5 项观测**。正常 hooks 提交为 `9611589c`。
- **当时 PARTIAL**：本地源码和隔离合成数据已验证；后续 clean 候选见上节。headed/移动端/读屏、真实模型与业务数据、目标主机及供应链/生产 gate 未关闭。杭州现役与生产保存未变。

### 官方宿主 CRM / 首购 HTTP（2026-10-06，上一阶段）

- 查询归属复审已正常提交 `c7bbf3ae`。随后在未修改的固定 rc2 Web CLI 实跑 CRM 登录、真实原生 loop/worker 查询、同账号保存、ACK 核对和宿主重启；新整链测试 **1 PASS / 0 SKIP**，启动保护/model adapter **7 PASS**，两个插件构建通过。已核对[本次证据和失败根因](docs/hackathon/evidence/dsh-g0-official-crm-http-20261006.md)。
- 官方 Cookie 在相同 authority 的重启后可复用；CRM 内存凭据清空，重新登录后重放原 run 不重复派发/保存。本次自有 Host/worker/临时 HTTP 服务已回收。
- **当时 PARTIAL**：该阶段从私有 kernel HTTP 准入，未接浏览器原生输入框；后续原生命令和 Chrome 接线见上节。headed 浏览器、clean 候选/目标环境/生产 gate 仍开放。没有 push、杭州切换或真实数据访问。

### CRM 查询归属复审（2026-10-06，上一阶段）

- OCR delegate 已补审 `9d1a9acf` 全部 **29/29** 文件；复现并修复运行中身份瞬时 503 被误写 UNKNOWN 的分支。保留原任务与 Host 状态，暂停新派发并给出身份故障诊断，恢复不重发。
- 本次修复后相关后端 **94 PASS**、Node **15 PASS**，合同/边界/Ruff/差异检查通过；已核对[本次审核与失败证据](docs/hackathon/evidence/dsh-g0-native-crm-review-20261006.md)。仍 PARTIAL；接续固定官方宿主登录、查询准入与保存整链，不继承旧 HTTP 夹具作为宿主通过。

### CRM 账号到原生查询归属（2026-10-06，上一阶段）

- 从 `95b78e8f` 干净工作树继续。新增显式 CRM session 身份模式，复用现有 Host bridge、CRM 可撤销 lease 和公开服务身份检查；新查询/保存使用同一认证账号，不缓存 CRM 凭据或身份观察，不把 synthetic-demo 映射为管理员。
- 原生 session 的 owner 持久绑定；换账号/旧 fixture 改归属明确拒绝。身份服务暂不可用只暂停派发；退出登录或明确撤权才撤销查询权限，恢复仍用原任务。默认模式、上游 DSH 和生产 profile 未改。
- 本轮后端 **294 PASS**、Node **26 PASS**、编译卡片 **1 PASS**、实际独立包 **11 PASS**、边界检查 **9 PASS**，两个插件固定 rc2 构建通过；OCR 确认的故障误判撤权与状态读取副作用均已修复，见[本轮证据](docs/hackathon/evidence/dsh-g0-native-crm-owner-20261006.md)。真实 HTTP 已串起合成 CRM 登录、查询 worker、同账号保存、ACK 丢失后核对与精确重放；Host 调度接收器仍是夹具，不能称为官方 DSH/浏览器通过。
- **仍 PARTIAL**：需接固定官方宿主的登录/admission，验收 Cookie/路由、重启和浏览器，再准备 clean 插件/服务候选与目标主机证据。旧 B0 gateway 的登录前查询权限门禁不能直接当 CRM 入口。供应链、生产放行及物理分仓未关闭；本次未 push、操作杭州或接触真实数据。

### CRM 身份到首购保存卡片（2026-10-06，上一阶段）

- 从 `codex/plugin-boundary-review@ca64f9ca` 干净工作树继续。CRM 提供可撤销的可选会话能力，token 仅在 CRM host 内；workbench 通过生成的微型合同调用公开首购服务，移除该卡片旧 `/b0/analyses` 保存路径。默认未配置仍禁用，未改生产 profile。
- 当前卡片支持核对来源/权限、显式保存、原请求持久保留、SAVE_UNKNOWN 核对和同请求重试；未接通的驾驶舱/导出/发送可见禁用。时效沿用用户决定，以服务端 `NOT_CHECKED` 展示，不在客户端推算陈旧/过期。
- 本次相关后端 **132 PASS**；提交前修复后 Node **51 PASS**、编译卡片 **7 PASS**，真实 HTTP 集成重跑 **1 PASS（7 项观测）**，两个插件在固定 rc2/Node24 下构建通过。OCR 复现并修复登录失效残留回执、旧候选仍提示重试、转义凭据回显三项；已核对[本轮证据](docs/hackathon/evidence/dsh-g0-save-ui-20261006.md)与[保存合同](docs/operating/first-purchase-save-admission.md)。
- **该阶段 PARTIAL**：当时查询内核仅固定 `synthetic-demo`，没有把它映射为 CRM 管理员；后续可选归属接缝见上节。实际宿主内的账号/run 归属、Cookie/路由/浏览器、clean 插件候选、供应链与目标主机关闭时效链仍待验收；生产保存未启用。该阶段没有 push、杭州操作或真实数据访问。

### 结果时效暂缓与 clean 候选（2026-10-06，上一阶段）

- 用户明确“陈旧和过期，暂时不考虑”。已增加服务 owner 显式关闭结果年龄检查的策略；返回 `NOT_CHECKED / DISABLED_BY_POLICY`，不标成 FRESH。账号/session、候选准入、完整来源、幂等保存与 UNKNOWN 恢复继续校验。
- 实现阶段五文件回归 **163 PASS**，实际独立包的时效开启/关闭两种模式 **2 PASS**，包含保存、重启、回放与 forward-fix；OpenAPI/TypeScript 已同步。见[实现证据](docs/hackathon/evidence/dsh-g0-save-time-policy-20261006.md)。
- 实现已提交 `48e7ddfc`，随后从该 clean SHA 生成新服务包 `8f096a13…` 并绑定候选 `9f00fadb…`。本次源码与实际离线双包各 **9/9 PASS**，构建及相关 **95 PASS / 0 SKIP**；同一 archive 的 CRM 合成身份→关闭时效→保存→重新打开状态回放 **6/6 PASS**，真实 HTTP 响应通过当前插件 decoder。
- 同一服务双包在杭州 WSL2/Python 3.14.4 完成 **14/14 synthetic 验收**，真实 CLI 追加 journal seq **4**，重试 131 文件不变、旧 67 文件保留。10 个临时进程与本次远端目录已回收，现役监听/PID 快照一致。见[本次候选与现场证据](docs/hackathon/evidence/dsh-g0-save-time-policy-candidate-20261006.md)。
- WSL 固定场景使用合成 A64 准入和开启时效模式；CRM 身份/关闭时效组合的 6 项属于本机验证。未登录真实 CRM、接通保存 UI 或切换生产；T3/T7 继续 PARTIAL。下方历史阶段中的“时限待确认”以本节为准，响应超时和 SAVE_UNKNOWN 门禁未取消。

### 现有 CRM 账号适配（2026-10-06，本地增量）

- 按用户确认沿用现有 CRM 管理员账号，不新建账号体系。新增首购服务可选 `CRMFirstPurchaseIdentityResolver`，经既有 `/api/v1/auth/me` 校验 Bearer；不保存密码或 token，不导入旧 CRM 实现。显式账号名单与当前管理员权限均须匹配，每次重新校验；身份成功不等于保存准入。
- 本次五文件保存/恢复/身份回归 **134 PASS**，实际独立包 **1 PASS**（含 5 项新 CRM 身份观测）；OpenAPI/TypeScript 和 Ruff 通过。复用现有固定 `h11`，13 项依赖未变；DSH、插件运行时代码和默认服务启动未改，仅同步生成的合同摘要。见[本轮证据](docs/hackathon/evidence/dsh-g0-crm-identity-adapter-20261006.md)。
- OCR 审核发现并修复旧写入口绕过准入：外部身份一律要求版本化保存，负测先 201 失败、修复后拒绝且不落盘；134 项回归、90 项服务门禁与独立包已重跑通过。
- 审修后正常 hooks 提交 `7edf7710`；该 clean SHA 源码兼容与实际离线双包各 **9/9 PASS**，同一新 archive 的 adapter **5/5 PASS**，固定包 79049 B / `26b07aa7…`。现有控制面重验通过，旧目标回执拒绝，生产激活仍阻断。
- 新服务包尚未绑定新的 plugin candidate/journal，未在杭州或真实 CRM 登录验证；下节 WSL 14 项只属于 `80aba9c1` 的原包。陈旧/过期判断已按用户决定暂缓，不再等待阈值确认；真实候选准入、供应链、目标 DSH/UI 与物理分仓保持开放；没有生产保存/激活或 GitHub 操作。

### 首购身份接口与 clean 服务候选（2026-10-06）

- 上一批 clean 首购绑定文档经 OCR delegate 全量审核、修正并通过正常 hooks 提交为 `c95751f8`。随后按既定顺序补服务身份接缝，不改 DSH、插件或生产配置。
- 首购 HTTP factory 改为服务 owner 可注入的同步身份接口；校验 Bearer 和不可变身份/权限，统一身份与策略 provider 的错误脱敏，保留每次请求及保存事务内的撤权重验。默认空 B0 注册表仍拒绝访问，候选 digest 不充当身份或准入授权。
- 当前源码保存/恢复回归 **74 PASS**（含 19 个新增边界用例）；实际首购包的仓库外最小依赖 HTTP 场景 **1 PASS**，合同/TypeScript、Ruff 和差异检查通过。见[本地接缝证据](docs/hackathon/evidence/dsh-g0-service-identity-boundary-20261006.md)。
- 提交前 OCR delegate 覆盖全部 **8/8** 文件，未确认新阻塞缺陷，通过正常 hooks 提交 **`80aba9c1`**。已核对 74 项测试报告与提交前 Python 检查输入摘要一致，本次不将复核说成重新执行。
- 从该 clean SHA 完成源码兼容 **9/9 PASS**、两个实际包的离线 venv/HTTP **9/9 PASS**；新服务包 76478 B / `270cf084…`。新候选 `4e49cc04…` 绑定同一服务证据，真实 `plugin verify-service` 进入 journal 第 3 条事件，重试及旧 WSL 误用拒绝保持 58 文件不变。
- 插件包仍为 421582 B / `5efdbec5…`，与上一候选逐字节相同；DSH、插件源码、依赖锁与上游均未改动，无需重建。旧 129 个输入/回执/journal 原样保留。
- 同一 `80aba9c1` 服务双包随后在杭州 WSL2/Python 3.14.4 完成 **14/14 synthetic 验收**，新回执经真实 CLI 进入原 journal 第 4 条事件；重试 131 个文件不变，旧 129 个证据文件不变。10 个临时进程、安装目录与本次传输目录已回收，现役端口/PID 快照一致。生产身份、真实 candidate allowlist 与时限策略仍未接通，保存 UI 与激活门禁不变；该结果不能证明上方新增 CRM adapter。

### 当前 clean 首购插件／服务候选（2026-10-06）

- 完整增量审核后已本地提交 `2be518e5`，随后从该 clean SHA 生成首购服务 `0.1.0rc1` 候选。源码兼容 **9/9 PASS**、两个实际包的离线 venv/HTTP 兼容 **9/9 PASS**；两包打包来源均 `worktree_dirty=false`，见[本次服务候选证据](docs/hackathon/evidence/dsh-g0-service-clean-candidate-20261006.md)。
- 新候选 archive 为 75811 B / `190050f6eaecdaf199c87ca516e3ff9323e72187995721709e448f764c9217db`。已绑定 clean 插件来源 `78779206`，候选 digest `afcdae56…`；本轮构建及相关 **100/100** 测试通过。插件、服务分别记录来源，未因文档提交重打服务包。
- 同一新服务双包已在杭州 WSL2/Python 3.14.4 完成 **14/14 synthetic 验收**，真实回执经 `plugin verify-service` 进入原控制面的 candidate journal seq **4**。重试保持同一 seq/digest，129 个输入/产物/回执文件不变；旧 WSL 回执误用仍拒绝。见[本轮接线与现场证据](docs/hackathon/evidence/dsh-g0-service-candidate-binding-20261006.md)。
- 10 个临时服务进程和安装目录已回收；6677/18090/18092/18093/18094 的监听/PID 快照一致。本次是服务隔离验收，没有生产切换或发布，也不替代 DSH 宿主/浏览器验收。
- 本批提交前 OCR delegate 已补审全部 **4/4** 文档，修正“服务包回执失效”与“插件变化”的归因；本次门禁测试 **70 PASS**，既有回执 CLI 重验、129 文件不变通过。现场 14 项属于上一阶段结果，此次审核未重新操作杭州。
- 生产身份/候选策略、时限/UNKNOWN、供应链与目标 DSH runtime 仍开放，`release_ready=false`、激活 BLOCKED、保存 UI 继续 NOT_AVAILABLE。下方 CRM/知识库候选及其来源保持不变。

### 已提交的完整候选链复审（2026-10-06）

- OCR delegate 已覆盖 `2a89790b..0a183b6f` 的 **22/22 文件**，未确认新的代码缺陷；修正服务兼容说明及接线证据中的两处过期状态。当前回归合计 **251 个不同用例 PASS**，固定宿主保护检查的条件跳过项已补跑，见[完整审核记录](docs/hackathon/evidence/dsh-g0-candidate-full-review-20261006.md)。
- 重新核验既有 bundle、双插件 journal 与 WSL 首购 journal；120 个输入/产物/回执文件不变。审核修正已提交 `2be518e5`；后续 clean 首购候选见上节，生产 gate 不变。

### 当前 CRM／知识库干净候选（2026-10-06）

- 从审核后的 clean SHA `9902bdd93bee4b0ba7f30efb3d35e8928db62380` 生成 `dsh-preflight-crm-9902bdd9`：prepare/audit/build/runtime/release/test/receive/evidence **8/8 PASS**，release suite **244 PASS / 0 SKIP**，7 文件 bundle 已重新校验。成功轮次使用热缓存，用时 118590 ms，不含此前排错与宿主演练。
- CRM **233968 B**、知识 **14461 B** 两份独立候选绑定相同 source/profile。实际官方 rc2 Web CLI **10/10 PASS**，覆盖加载、重启、在途会话恢复和原生回退；两份包各自 `verify-host` 写入 journal seq 3，重试不改候选/包/journal，5 个临时宿主 PID 已退出。见[候选验收证据](docs/hackathon/evidence/dsh-g0-clean-candidate-20261006.md)。
- 只证明本机 Darwin arm64、合成模型/会话；`release_ready=false`、生产 activation `NOT_RUN`。本 profile 不启用首购保存 service binding。WSL DSH runtime、生产身份/时限、签名/SBOM/CVE、浏览器/真实 UAT、远端激活与物理分仓保持开放；杭州生产状态本轮未复查或切换。
- 下列网络/准备记录是本轮失败到修复的历史过程；最终候选 source 固定为 `9902bdd9`，后续纯证据文档提交不改写此来源。没有 push 或发布。

### 本轮候选准备故障与修复过程（2026-10-06）

- WSL 回执接线已通过正常 hooks 提交为 `356862bf22a1c4fc67f96904f1baffa21fadc2c2`，提交后工作树干净。正式 CRM＋知识库 profile preflight 已实际执行：固定 DSH 准备/构建通过，在线 audit 因未继承本机代理而失败；没有把失败记为候选通过。
- 已定位并修复 B0 环境白名单丢弃显式代理的问题，只向 Git/pnpm 在线命令透传标准代理变量。真实 audit 修复后 PASS；专项子进程/环境回归通过，完整验证及审核结果见[网络修复证据](docs/hackathon/evidence/dsh-g0-preflight-network-20261006.md)。生产状态未改变。
- 代理修复已提交 `8a70667f`。新 clean preflight 进一步复现 pnpm 重复 fetch 后 install 快捷返回、丢失 `tsx` 链接；已收敛 frozen 参数关闭这项优化，隔离两轮安装与实际固定 DSH prepare/build 修复后通过。失败和修复证据见同一记录；正式完整候选仍需使用修复后的 clean SHA。
- 重复安装修复已提交 `0e978f9e`；该 SHA 的 prepare、audit、双插件 build、离线 runtime 打包已通过，release 被宿主演练脚本的长合成 key 字符串拦住。已改成短占位值，扫描规则未改，1846 个发布清单文件重扫通过；旧字符串仍被拒绝。该候选 attempt 未记为完整 PASS。
- 两份 `356862bf` 独立插件包已生成，但不代表完整 preflight 或生产就绪；修复提交后从新 clean SHA 重跑正式候选。本机旧 SDK 链接已保留备份并绑定本次固定 checkout，未修改 DSH 源码。生产身份/策略、时限/UNKNOWN、供应链、目标宿主/浏览器和物理分仓仍开放。

### 已提交的 WSL 回执与候选 journal 接线（2026-10-06）

- 上一批 WSL 记录已按 OCR delegate 覆盖 **7/7** 文件，修正进程数量及准备/验收时间范围两处低风险表述，复核原始包/回执后，通过正常 hooks 提交为 `2a89790b42326376f0808e0896b0a78877bd28ba`；提交后工作树曾干净，未 push。见[审核记录](docs/hackathon/evidence/dsh-g0-service-target-acceptance-review-20261006.md)。
- 提交后的下一步已扩展现有 `plugin verify-service`，显式接收 `--target-evidence` / `--target-input`，核对固定验收脚本、28 个输入文件、双包/依赖、14 场景及清理 sidecar，再向原 journal 幂等追加 `CANDIDATE_SERVICE_TARGET_OBSERVED`。没有新增状态账本或远端执行入口。
- 新接线 **37 PASS**，本次完整 release suite **243 PASS / 0 FAIL / 0 SKIP**；原真实 WSL 回执经本地 CLI 核验进入 seq **4**，重复执行同一 seq/digest，108 个输入/证据文件的内容与 mtime 不变，前三条 journal 保留。见[接线证据](docs/hackathon/evidence/dsh-g0-service-target-gate-20261006.md)。
- 本批接线已完成提交前 OCR delegate 审核：原始 **14/14** 覆盖，没有确认新缺陷，本次 release suite **243 PASS**，实际 CLI 重试不改输入/journal，见[审核记录](docs/hackathon/evidence/dsh-g0-service-target-gate-review-20261006.md)。本地提交号以 Git 为准；仍为未签名的合成观测，`release_ready=false` / 激活 BLOCKED。下一步从审核后的干净 SHA 准备候选，再补生产身份/策略、生产时限/UNKNOWN、供应链和 DSH 宿主/浏览器；其他服务与物理分仓也未完成。本步未重新执行杭州验收或改生产。

### 已提交的 WSL 首购服务隔离验收（2026-10-06）

- 延续 `codex/plugin-boundary-review@79434033`，同一旧/新不可变服务包已在实际杭州 WSL2 / Python 3.14.4 完成 **14/14 检查**：两个独立 venv 各安装 13 个固定 wheel，并完成合成身份/状态、HTTP 保存、权限/冲突拒绝、SIGKILL 后幂等恢复、只读回退、备份恢复与未知 schema 拒绝。见[现场验收证据](docs/hackathon/evidence/dsh-g0-service-target-acceptance-20261006.md)。
- 逐文件传输超时后改用单个固定包；首次运行的合成状态目录权限错误已定位并修正夹具，保留 FAIL 后在新目录重跑。服务 archive 与依赖未改动。成功轮次 10 个、失败轮次 1 个临时进程均已回收，安装/状态目录已清理，生产 6677/18090/18092/18093/18094 的监听/PID 快照一致。
- 仅关闭首购服务的 WSL **synthetic** 冷安装/恢复子项。旧 writer 仍禁止可写降级；真实身份/策略、生产时间窗口、供应链、DSH 宿主/浏览器和其他服务仍未关闭。`release_ready=false`，保存 UI/生产激活保持关闭。验收时目标回执尚未接 journal；后续接线见上节。本阶段文档已随 `2a89790b` 提交，未 push 或生产切换。

### 上一阶段 WSL 平台依赖准备（2026-10-06）

- 预检及 OCR 修复已通过正常 hooks 本地提交为 `7943403319eeefcb3a191e03e4e1dc03772a0cc3`（12 文件）；提交后工作树曾干净，未 push。本节为当时提交后的准备记录，后随 `2a89790b` 审核提交。
- 已通过现有 Tailscale/SSH 只读核验杭州：Linux x86_64、WSL2 内核、glibc 2.39、Python 3.14.4、pip 26.0.1，取得实际解释器的 1226 个兼容标签。没有启动/重启或配置生产服务。
- 在本地按原服务 manifest 的 13 项精确版本、目标标签和官方 PyPI 元数据准备 Linux wheelhouse，共 **3,262,610 字节**；逐包 SHA-256、版本、目标标签和文件集合复核通过。没有安装这些 wheel。见[平台准备证据](docs/hackathon/evidence/dsh-g0-service-target-platform-20261006.md)。
- 该准备阶段的目标预检、冷安装及恢复当时为 NOT_RUN；后续实际 WSL 合成验收见上节。来源签名、生产身份与候选门禁尚未关闭，激活保持 BLOCKED。

### 已提交的目标主机预检审核（2026-10-06）

- OCR delegate 已覆盖原始 **11/11** 路径（2 个工具选中、测试与 8 份文档补审），没有跳过。已验证并修复 wheel 安装元数据/标签漏检，以及 active Requires-Dist 未核对两类问题；6 项复现负测先失败后通过。
- 修复后共享 bounded 预检 **35 PASS / 0 SKIP**，完整 release suite **206 PASS / 0 SKIP**；实际 13 个 wheel 通过新增格式/依赖检查，Mac 仍因不是 WSL2 正确 BLOCKED，14 个输入内容/mtime 不变。见[审核记录](docs/hackathon/evidence/dsh-g0-service-target-preflight-review-20261006.md)。
- 本批通过正常 hooks 提交为 `79434033`；审核阶段未操作杭州或真实数据。提交后的只读环境核验与依赖准备见上节；生产激活、现场服务恢复与供应链门禁仍保留。

### 审核前目标主机只读预检（2026-10-06）

- 上一批服务包接线及 OCR 修复已通过正常 hooks 本地提交为 `1b443646132a8e90b002988c9635b5993ed55d4b`（18 文件），未 push；本节为提交后的下一步增量，尚未提交。
- 新增 `pnpm dsh plugin service-preflight`：按外部已核验的 manifest SHA 检查 Python、WSL2、精确 wheel 闭包、ABI/平台标签与 Requires-Python，拒绝错包/篡改/链接/FIFO，不安装、不联网、不启动服务或改 journal。
- 本次共享 bounded 预检 **24 PASS / 0 SKIP**，release suite **206 PASS / 0 SKIP**；实际候选与 13 个 wheel 的 CLI 检查正确返回 macOS 非 WSL2 的 BLOCKED，14 个输入内容/mtime 不变，Ruff/语法检查通过。见[本轮证据](docs/hackathon/evidence/dsh-g0-service-target-preflight-20261006.md)。
- T3/T7/T15/T21 仍 PARTIAL。预检不代表 WSL 实机、离线冷安装、身份/状态注入或 HTTP 恢复已通过；本机 pydantic-core 是 macOS arm64 wheel，目标 WSL 需准备自己的固定平台 wheel。下一步接目标平台冷安装与服务验收回执，激活继续 BLOCKED；本轮未操作杭州、真实数据或发布。

### 上一批服务包接线审核（2026-10-05）

- OCR delegate 原始范围 **15/15** 路径全部覆盖（5 个代码/测试、10 个文档），另补审修复涉及的 state owner 和测试。确认并修复 3 类问题：journal 前置关系丢失、状态特殊文件阻塞、CLI 回显未受信任内容。
- 4 项负测从 **0 PASS / 4 FAIL** 修至 **4/4 PASS**；本次完整 release suite **206 PASS / 0 SKIP**。原真实双包通过修复后 CLI，重复执行保持同一 seq/digest，候选和 journal 字节不变。见[审核证据](docs/hackathon/evidence/dsh-g0-service-artifact-gate-review-20261005.md)。
- 已通过正常 hooks 本地提交为 `1b443646`。目标主机/供应链仍 NOT_RUN，激活继续 BLOCKED；提交后的只读预检增量见上节，未操作杭州或真实数据。

### 审核前服务包证据接线（2026-10-05）

- 上一批服务包及 OCR 修复通过正常 hooks 提交为 `82c1f5cdeb0cac3f5f0ac89ec7eafdb799383e95`（22 文件）；提交后工作树曾干净，未 push。本节是提交后的下一步，尚未提交。
- `pnpm dsh plugin verify-service` 已核对候选/profile/源码回执、两个实际 archive 的内外 manifest/文件/依赖记录，再向原 journal 幂等追加 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`。不修改候选，不启动服务。
- 新门禁 **29 PASS**，完整 release suite **199 PASS / 0 SKIP**；此前两份实际服务包经 CLI 核验通过，重复执行保持同一第 3 条 journal，3 项篡改负测拒绝且候选/journal 不变。首次 OpenAPI 版本比较和 help 回归失败已修复并保留日志，见[本轮证据](docs/hackathon/evidence/dsh-g0-service-artifact-gate-20261005.md)。
- T3/T7/T15/T21 仍 PARTIAL：本机证据仍 `release_ready=false`，目标主机和供应链 NOT_RUN。下一步补 WSL 目标主机服务合同、受控身份/状态注入、冷安装与时限/UNKNOWN 验收；DSH 保存 UI/浏览器及 G0 后物理分仓仍开放。本轮没有杭州、真实数据或发布操作。

### 上一批服务包审核与提交（2026-10-05）

- OCR delegate 覆盖原始 **21/21** 文件（11 个选中、10 个补审），无跳过。确认并修复 Git replacement 破坏精确 SHA 归属，以及取消打断退出回收两个问题；新增两项负测先失败后通过，详见[审核记录](docs/hackathon/evidence/dsh-g0-service-artifact-review-20261005.md)。
- 修复后共享后端 **25 PASS / 0 SKIP**（内部 **10** 个包场景），实际双包重新 **9/9 PASS**；Ruff/语法/diff 检查通过，已提交为 `82c1f5cd`；下方“未提交”是当时的实现阶段快照。
- T3/T7/T15 仍 PARTIAL；继续接 artifact/依赖证据与目标主机验证器，生产激活、WSL、真实身份与保存 UI 门禁保留。未 push、发布或操作杭州。

### 上一阶段精确服务包配对（2026-10-05，审核前未提交）

- 从 `codex/plugin-boundary-review@809a9367` 的既有修改继续，打包旧 `56198c32` / 新 `a50bd424` 的实际代码；manifest 分开绑定历史服务 SHA、历史依赖锁与当前打包清单/文件摘要，没有切换工作树或改业务 API。
- 两个真实 archive 安全解包后，各自在新 venv 从预备 wheelhouse 离线、带 hash 安装 13 项精确依赖；Darwin arm64 / Python 3.14.4 完成 **9/9 预期观测**，旧服务可写降级会丢失来源，仍明确 BLOCKED。两版历史锁中的依赖版本恰好相同，不是跨依赖升级证明。
- 当前共享后端 **25 PASS / 0 SKIP**（内部包测试 **8 个实际集成场景**）；实际配对命令的 SIGTERM 探针返回退出码 2 / `SERVICE_PAIR_CANCELLED`，保留 FAIL 回执且自有端口关闭。旧临时 Python 依赖不匹配的失败已保留，另建隔离锁环境完成验证。详见[本轮证据](docs/hackathon/evidence/dsh-g0-service-artifact-pair-20261005.md)。
- 新 artifact 回执尚未接入现有源码证据门禁，`release_ready=false`；T3/T7/T15 仍 PARTIAL。下一步接精确 artifact/依赖摘要与目标主机证据验证器，再做 WSL 冷安装、生产身份/状态注入和现场验收；DSH 保存 UI/完整候选供应链仍开放，G0/stop-go 后物理分仓。本轮未 commit、push、发布或操作杭州。

### 上一阶段首购分析服务独立包（2026-10-04，本地未提交）

- 上一批服务兼容门禁已按 OCR delegate 审核修复，正常 hooks 提交为 `809a9367a94bc8be3c7c329868d8680deeae1377`；26/26 文件覆盖，提交前 release suite 170 PASS。未 push。
- 继续复用既有服务打包器，增加首购分析服务独立清单、13 项精确依赖和同包生成的 OpenAPI；默认无身份/状态配置。实际 tarball 在仓库外、最小依赖进程完成保存、重启后回执查询/回放、权限/冲突拒绝、SAVE_UNKNOWN 和保留来源的 forward-fix。
- 当前共享 bounded 验证 **17 PASS / 0 SKIP**，其中实际执行 **7 个服务包集成场景**；已修复依赖版本导致的包内 OpenAPI 漂移，并加入 FIFO/合同生成副作用负测。证据见[本轮记录](docs/hackathon/evidence/dsh-g0-analysis-service-package-20261004.md)。本批业务 API 源码未改，未重新运行完整 B0。
- 本次新包只验证同版本隔离部署，不替代旧/新服务包配对、平台依赖冷安装、主机证据验证器、WSL 或生产授权。T3/T7/T15 仍 PARTIAL；`release_ready=false`、保存 UI NOT_AVAILABLE、现场激活仍阻断。下一步是配对精确旧/新 artifact 与各自依赖，再接目标主机证据；G0/stop-go 后物理分仓。

### 上一批服务兼容证据门禁（2026-10-04，已本地提交）

- 上一批兼容验证器/文档已完成 OCR delegate 全范围审核 **10/10**，正常 hooks 本地提交为 `d321971f6d56b5148c5715ad0461410290665f66`；固定源码对重跑 **9/9**、CLI 负测 **4/4**。随后门禁代码/文档已获审核修复后本地提交授权，最新提交以 Git 为准；未 push。
- 显式保存 profile 的服务源码、API/状态版本、访问模式与实际兼容回执已绑定到 candidate、release payload/profile、安装 marker 和既有 journal。激活/回退及幂等重试在改变指针前检查；旧服务可写降级、缺证据/错版本/篡改和安装绑定丢失均拒绝。
- 本轮 release suite **169 PASS / 0 SKIP**；完整 B0 **退出 0**，Python **665 PASS**，Node 阶段合计 **1508 PASS / 1 SKIP**（含 clean 重跑）。真实插件 candidate 已生成，真实回执的主机 CLI **3/3 拒绝负测**通过；指针和 journal 保持不变。首次失败、修复及证据见[本轮记录](docs/hackathon/evidence/dsh-g0-service-gate-20261004.md)。
- 随后的提交前 OCR delegate 审查发现并修复 `preflight` 未校验/传递服务证据的问题；真实只读 CLI 负测先失败后通过，修复后 release suite **170 PASS / 0 SKIP**。上段 B0 属实现阶段结果，本次仅改发布入口，没有冒作重新执行完整 B0。见[提交前审核](docs/hackathon/evidence/dsh-g0-service-gate-review-20261004.md)。
- T3/T7 仍 **PARTIAL**：目前只有本机源码兼容证据，所有声明 D15 服务的现场激活明确阻断。下一步补精确服务包/依赖与主机证据，再接 DSH 保存 UI、生产形状时限/UNKNOWN 与浏览器/WSL 验收；G0/stop-go 后推进物理分仓。生产 profile/provider 与保存 UI 未启用，本轮未操作杭州。

### 上一批服务跨版本状态验证（2026-10-04）

- D15 审核修复已正常 hooks 本地提交为 `a50bd42492195040efaa6989c90e4fe84030551c`，提交后工作树曾干净，未 push；本节验证器/文档当时为新增工作，现已随 `d321971f` 提交。
- 固定旧服务 `56198c32` 与新服务 `a50bd424` 的实际源码，在独立进程完成 **9/9 预期观测**：旧状态升级、旧服务只读、恢复新版精确回放、标题 forward-fix、小库备份恢复与未知 schema 拒绝；另有 **4/4 CLI 负测**通过。见[证据](docs/hackathon/evidence/dsh-g0-service-save-compat-20261004.md)。
- 已验证旧服务可写会让新标题版本失去 provenance；该组合明确 **BLOCKED**。插件/profile 回退应保留新版分析服务和 durable state；旧服务仅可用只读身份恢复访问。详见[兼容窗口](docs/architecture/first-purchase-service-compatibility.md)。
- 该阶段候选/激活门禁尚未消费兼容证据，后续接线见上节；精确服务包/依赖窗口、生产形状时限、UI/浏览器/WSL 仍开放，T3/T7 仍 PARTIAL。保存 UI 保持 NOT_AVAILABLE；该阶段无生产操作。

### 上一批 D15 服务保存审核（2026-10-04）

- OCR delegate 审核原始变更 **29/29**：15 个工具选中文件与 14 个补审文件全部覆盖，未跳过。修复两项已确认问题：回执必须在同一事务快照内核对实际分析版本与来源；持久化回执/provenance 缺字段或被模型归一化时 fail closed。
- 7 个隔离负测先失败后通过；修复后保存两文件 **42 PASS**，相关 bounded 六文件 **78 PASS / 0 SKIP**；完整 B0 **退出 0**，Python **665 PASS**，Node 各阶段合计 **1506 PASS / 1 SKIP**（含 clean 重跑），生成合同、类型、边界与 clean rebuild 通过。见[本次审核证据](docs/hackathon/evidence/dsh-g0-save-review-20261004.md)。
- 本轮已获本地提交授权，准确提交号以 Git 为准；下一步是以固定新旧服务源码验证持久状态兼容和 forward-fix。T3/T7 仍 PARTIAL，生产保存 UI 仍 NOT_AVAILABLE；本次未 push、发布或操作杭州。

### 审核前 D15 服务保存门禁增量（2026-10-04）

- 承接回执存储，完成独立版本的结果/provenance/freshness、服务端精确候选 allowlist、受控公开保存 API 与严格插件 decoder。新保存在写锁内重验当前权限、候选、来源和有效期；旧保存接口在启用 D15 策略的服务内不能绕过门禁。
- 分析、回执双索引与保存来源同事务落盘；提交后丢失响应，可在无 RunStore/无候选策略时精确重放原回执。保留旧 v1、SQLite schema 1 与 PINNED 语义，标题 forward-fix 保留原来源。
- 本次共享 bounded backend 六文件 **71 PASS / 0 SKIP**；完整 B0 **退出 0**，Python **658 PASS**，Node 各阶段合计 **1506 PASS / 1 SKIP**（含 clean 重跑），生成合同/完整类型检查/clean rebuild 均通过。首轮断言失败和修复记录见[本轮证据](docs/hackathon/evidence/dsh-g0-save-admission-20261004.md)，接口见[操作说明](docs/operating/first-purchase-save-admission.md)。
- 此节记录审核前未提交增量，当时 HEAD 为 `56198c32`；本次修复及更新结果见上节。D15/T3/T7 仍 **PARTIAL**：服务跨版本窗口、生产形状时限/UNKNOWN、DSH UI 接线与浏览器/现场门禁尚未关闭。生产策略/profile 未启用，保存 UI 保持 `NOT_AVAILABLE`，物理分仓仍在 G0/stop-go 后。

### 上一轮 D15 保存回执增量（2026-10-04）

- 上一轮 31 文件的宿主/journal 审核修复已通过正常 hooks 本地提交：`56198c32a52d9822c7a3338d92b0fa077d1c61bc`，提交后工作树曾干净，未 push。
- 继续 T3/T7：首购保存 owner 新增 candidate/correlation/action/幂等身份与 durable state key 回执，复用既有 SQLite 事务和幂等表；两个身份索引与分析记录同事务落盘，不新增发布账本或数据迁移。新只读 `save-receipts/reconcile` 不依赖 RunStore，不重跑模型/查询。
- 新增 13 项回执测试；共享 bounded backend 的 4 个相关文件 **44 PASS**。正式 B0 **PASS**：Python **636 PASS**、Node 各阶段合计 **1506 PASS / 1 SKIP**（含 clean 重跑）；OpenAPI/TS、领域边界、完整插件类型检查与干净构建均通过。详细结果及首次 drift 失败见[本轮证据](docs/hackathon/evidence/dsh-g0-save-receipt-20261004.md)。
- 此阶段当时只是 G0 存储和查询合同（后续服务门禁见上节）：D15 写 API/插件 UI 尚未启用；服务端 freshness、候选准入、跨服务版本窗口/恢复与完整候选门禁仍开放，`save: NOT_AVAILABLE` 不变。本节为提交后的未提交增量，不能算入 `56198c32`。

### 上一轮候选与宿主接线审核（2026-10-04）

- OCR delegate 覆盖原始变更 **30/30**（含工具排除的文档/Python 补审），修复特殊文件输入阻塞与安装内容未直接绑定 tarball 两个问题。负测先失败后通过；没有剩余已确认的本轮代码审查缺陷。见[审查记录](docs/hackathon/evidence/dsh-g0-host-journal-review-20261004.md)。
- 修复后 release suite **146 PASS / 0 SKIP**、profile/入口负测 **9 PASS / 0 SKIP**、首购保存恢复/分析/native **31 PASS**；固定官方 rc2 Web CLI 重新完成 **10/10**，CLI journal 重试幂等，所有自有宿主已回收，上游 tracked source 干净。
- 已授权本地 commit，实际提交以 Git 为准；下一步为 T3/T7 D15 保存回执与 UNKNOWN 查询。生产、目标平台、供应链和物理分仓门禁仍保留，不触发 push 或杭州切换。

### 审核前候选与宿主接线（2026-10-04，本地增量）

- 在既有固定宿主增量上增加 `pnpm dsh plugin verify-host`：candidate 携带 profile 原字节快照，核对固定 DSH、双包版本/摘要、实际 composition、会话文件与十项 v2 宿主证据后，幂等写入原 journal；不改写 candidate。默认七插件 profile 不变，首期显式选 CRM＋知识双包。
- 本轮重新执行真实官方 Web CLI **10/10 场景**，独立 CLI 写入 `CANDIDATE_HOST_VERIFIED`，重复调用保持相同 journal 和候选字节。release suite **142 PASS / 0 SKIP**。隔离源码保持已审核的 `1737adc3`，两个 tarball 与上一轮逐字节相同；验收器未提交源码另有摘要绑定，见[本轮证据](docs/hackathon/evidence/dsh-g0-host-journal-20261004.md)。
- T3/T7 新增 **5 个**真实子进程/隔离 SQLite 故障场景；含既有首购分析与原生链路共 **31 PASS**。已证明同版本提交前后崩溃、丢失响应重放、冲突/权限拒绝与 forward-fix；D15 candidate/correlation/UNKNOWN receipt 合同仍未完成，保存门禁保持 `NOT_AVAILABLE`。
- T13/T21 的本机观测接线已完成，整体仍 PARTIAL：`release_ready: false`，生产 activation、远端 reconcile、目标平台/供应链/canary 未关闭。kit 独立 dev dependency 和物理分仓仍待后续 G0/stop-go；本轮未 commit、push、发布或操作杭州。

### 上一阶段固定宿主验收（2026-10-04，本地增量）

- CRM/知识拆分与 OCR 修复已本地提交为 `1737adc3cffeb9db5fbbcee222fb044526324d40`，未 push。提交后新增固定官方 Web CLI 验收入口和 profile 加载修复；这些增量的提交状态以 Git 为准，不能冒作该 commit 内容。
- 真实 rc2 宿主此前不会加载生成的旧 preset 目录；现已增加官方 `@deepseek-ai/dsh-agent-preset` 声明补丁。固定双包 tarball 在本机官方 Web CLI 完成 **10/10 场景**：加载/组合、实际工具降级、正常重启、在途崩溃后的原生 v4 会话恢复、挂死进程回收、原生回退和恢复旧组合。父命令中断回收也通过，入口负测/profile **9 PASS / 0 SKIP**。详见[固定宿主证据](docs/hackathon/evidence/dsh-g0-pinned-host-20261004.md)。
- 移除 preset 只禁止新绑定，已有会话仍持有旧工具，整体切换按 `HOST_RESTART_REQUIRED`；任意同进程插件隔离不承诺。T2/T17 本机子项已验证；T13/T21 本机接线与 T3/T7 存储恢复的后续结果见上节。WSL/跨版本、浏览器、真实模型/业务、供应链和现场 canary 仍开放；物理分仓继续受 G0/stop-go 约束。

### 上一阶段 CRM/知识插件拆分（2026-10-04，已本地提交）

- 上一轮 OCR 修复已本地提交为 `ff7fc5fc0fa0295969fe789bc0bd7983a670c73a`。本轮从该干净基线继续 `codex/plugin-boundary-review`，完成本地拆分、OCR 审查修复和验证；本地提交以 Git 为准，未 push、发布或操作杭州，VERSION 与固定 DSH 未变。
- CRM 包保留身份 `@shine-mage/dsh-crm-knowledge`，候选版本 `0.0.0-crm.1`；知识工具迁入 `@shine-mage/dsh-knowledge@0.0.0-candidate.1`。两包无相互业务源码导入，可分别构建/打包；profile v3 独立装配每个模块，拒绝把旧合包和新知识包混装。公开解释不需要 CRM，私有教材当前通过可撤销身份合同使用 CRM Host，不共享密码/令牌。
- 本轮统一验证入口通过：后端定向 **206 PASS**、Node **160 PASS / 0 SKIP**；额外页面组合纳入全插件回归 **162 PASS / 0 SKIP**。真实 CLI 已分别生成 CRM-only、knowledge-only、含页面的组合 profile，均仅 CONFIGURED_NOT_RUN。最终 B0 **PASS**（Python **618 PASS**，Node 阶段合计 **1473 PASS / 1 SKIP**，含 clean 重跑）；独立 tarball 与失败修复记录见[插件拆分证据](docs/hackathon/evidence/dsh-g0-crm-plugin-split-20261004.md)。
- 本次 OCR delegate 覆盖 68/68 原始变更路径，修复卸载后公开知识和 CRM 工具迟到成功的问题；修复后双包构建、受影响插件 **166 PASS / 0 SKIP**、隔离打包/边界 **16 PASS / 0 SKIP**。详见[本次审核证据](docs/hackathon/evidence/dsh-g0-crm-split-review-20261004.md)；上段 B0/后端数字属于拆分实现阶段，未冒作本次修复后重跑。
- T15 本地插件拆包子项完成，整体仍 PARTIAL。提交后的精确宿主本机证据见上节；T3/T7 保存/UNKNOWN 回放、供应链/canary/现场回退和 clean reviewed candidate 仍开放，物理分仓在批准的 G0/stop-go 之后。本轮没有浏览器、真实模型/数据或杭州 UAT，新包没有上线。

### 上一轮本地 rc2 候选门禁（2026-10-03 审查修复）

- 本次从公共仓库 `main@d4261aa3` 开始，保留 13 个本地提交及原工作树修改。DSH 仍固定 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，VERSION 未变。前置审核修复为 `f55908df`，独立分支为 `codex/plugin-boundary-review`；原 public main 未切换或清理。本次提交收拢其后的 CRM slot、页面/主题、服务边界与独立应用包成果及 OCR 修复，准确提交号以本分支 Git 历史为准。未 push、发布或修改杭州。
- 上一轮八阶段 preflight、102/102 测试及 candidate 回执只证明其绑定的旧 SHA；**本次修改后正式 preflight 尚未重跑**。最终候选必须从 clean reviewed SHA 重建，不复用旧 PASS。
- 本轮修复 OCR-01–07：runtime 私有副本与原始包 integrity、插件最终包安全/入口校验、receive 恢复、跨 tag 身份与精确 Git tree 扫描。专项回归 **123/123 PASS**；真实固定上游 prepare、现有 build-tools audit、离线 runtime 构建，以及 workbench/shine-brand pack 通过。详见 [修复与规划审核证据](docs/hackathon/evidence/dsh-g0-review-fixes-20261003.md)。本机包是 Darwin arm64 验证产物，不是 WSL2 上线包。
- 大型拆分计划已全文复核：统一 G0 → 首期 workspace 试点 → stop/go → 物理分仓的顺序，保留独立 CRM/知识库插件与官方 DSH 底座目标。T1 已完成边界设计、10 包机器清单、唯一构建 DAG 与漂移检查；T15 已把 pin/build-tools 归入 kit，并验证 brand/query 独立 build/test/pack。board-components 的固定 tarball/公开类型已替换 6 条源码引用，workbench 独立重建/pack 通过；CRM 的 slot、页面与主题私有源码引用均已解除，生产源码例外为 0；合成服务 HTTP 边界与独立应用打包已推进，细目见下方 2026-10-04 记录；真实服务合同与物理分仓仍开放。T2/T17 精确宿主、签名/SBOM、canary/rollback 与远端 receive/reconcile 仍 `PARTIAL`/`NOT_RUN`。
- 同日上一阶段验证（不是下方新增改动的全量重跑）：48 项锁定依赖的隔离环境中，共享合成 backend **2922 PASS / 77 SKIP / 71 deselect**，Vue build 与 **223/223**，release 专项 **119/119**，最终 B0 pipeline **PASS**（Python **618/618**；Node 各阶段合计 **1370 PASS / 1 SKIP**，含 clean 重跑）。实际 8 插件 build、两叶子隔离包、workbench clean rebuild 通过；详见 [边界与隔离构建证据](docs/hackathon/evidence/dsh-g0-boundaries-20261003.md)。
- 图表解耦本轮证据、命令、包 SHA、测试结果与剩余项见 [图表解耦记录](docs/hackathon/evidence/dsh-g0-board-components-20261003.md)。产物均是本地构建/临时 Git 夹具，不是新 Release；VERSION、DSH pin 与生产 profile 未改变。
- 本轮没有重跑完整原生 DSH profile 生命周期、WSL2/WAL、真实 HTTP SLI、浏览器/模型或业务 UAT；B0 Loader/合成服务测试不替代上述门禁。杭州状态沿用上方注明日期的现场快照，未作新的上线判断。
- 提交前 OCR 全范围审核及修复见 [解耦审核](docs/hackathon/evidence/dsh-g0-decoupling-review-20261003.md)：恢复误写的验证矩阵，堵住 TypeScript import-equals 的依赖漏检。本次 Node 回归 **176/176**、图表后端 **43/43**；后续 CRM 增量与该已提交审核分开记录。

- 上一阶段 CRM slot 增量：领域 v1 JSON → 双方本地生成合同，源码例外 **5→4**。本轮完整 B0 **PASS**（Python **618/618**；Node 阶段合计 **1413 PASS / 1 SKIP**），CRM host/client 构建与编译后 UI **9/9** 通过。证据见 [CRM slot 解耦](docs/hackathon/evidence/dsh-g0-crm-slot-20261003.md)；未提交增量不冒充 `f55908df` 内容。

- 最新 CRM 端：workbench 生产源码例外 **4→0**，页面工具归公开入口并由 profile 显式组合，主题归品牌领域合同。单包 build/test/pack 与 CRM 全部合成回归 **135/135** 已通过；最终 B0 **PASS**（Python **618 PASS**；Node 阶段合计 **1425 PASS / 1 SKIP**），7 份产物 clean rebuild 一致。实际 CRM 单包/含页面候选 profile 配置生成通过，未加载宿主；结果见 [CRM 端解耦证据](docs/hackathon/evidence/dsh-g0-crm-decoupling-20261003.md)。本轮仍未提交，未推进生产。

### 上一阶段 CRM 服务调用解耦（2026-10-04，本地未提交）

- 在原有 45 个未提交文件基础上继续实现，保留 `codex/plugin-boundary-review@f55908df` 与旧修改；本轮没有 commit、push、Release 或杭州操作。
- CRM 插件已移除相对主仓路径和 Python 子进程调用。合成指标与公开知识解释分别通过显式 HTTP origin 和领域 API 1.0.0 调用，服务未配置/版本不符/断连时明确 NOT_AVAILABLE；已有真实 CRM 登录、账号权限和看板工具保留。独立知识 ASGI app 与旧 metrics/explain 兼容 adapter 并存，服务实现和知识资源仍在现仓。
- profile 改为 `crm-profile-assets/v2`，不再要求 Python；旧 `--python` 返回迁移提示，只生成新 profile。新请求头约束已进入 OpenAPI/生成类型，不把版本协商当作认证。配置生成仅是 CONFIGURED_NOT_RUN。
- 当前 CRM 回归 **146 PASS / 0 SKIP**，后端定向 **67 PASS**；实际双服务进程与单服务停止、独立 build/test/pack、最终 tarball 安全解包后固定 SDK 加载已通过。详细命令、最终 B0、失败记录及文件清单见 [本轮证据](docs/hackathon/evidence/dsh-g0-crm-service-boundary-20261004.md)。
- T15/T3 仍 PARTIAL：服务独立打包、CRM/知识插件最终拆包、真实服务版本窗口、D15 保存/UNKNOWN 回放矩阵、精确宿主/WAL、签名/SBOM/CVE、canary/回退和杭州上线未完成；上轮 OCR 只覆盖其原始源码快照。

### CRM/知识服务独立应用包（2026-10-04，审核前阶段记录）

- 继续在 `codex/plugin-boundary-review@f55908df` 的现有工作树修改，既有未提交成果保留。指标与知识服务各有明确文件/资源 allowlist、独立依赖锁、API/软件版本和不可变 `.tar.zst`；只打包公开 synthetic 输入，知识服务不再加载指标引擎或 DuckDB。旧 factory/CLI adapter 保留，独立指标入口不再提供知识解释。
- 实际包已在仓库外、仅含声明依赖的临时 venv 中完成 3 种指标查询、知识解释、OpenAPI 核对与单服务停止验证；篡改/缺资源/链接/额外文件/错误依赖/secret 均拒绝，输出目录不可覆盖。最终 artifact 摘要与实际 HTTP 测试中的包一致，详见[服务包证据](docs/hackathon/evidence/dsh-g0-crm-service-packaging-20261004.md)和[运行入口](docs/operating/crm-service-packages.md)。
- 本轮真实验证：服务包 **4/4** 集成场景；共享全量合成后端 **2936 PASS / 77 SKIP / 71 deselect**；CRM **146 PASS / 0 SKIP**；B0 **PASS**（Python **618 PASS**，Node 阶段合计 **1435 PASS / 1 SKIP**，含 clean 重跑）。离线合同/类型、Ruff、边界清单和差异检查通过。失败的首次包断言与过期 inventory 日志保留，不作为当前通过证据。
- T15 只新增“服务应用独立打包/资源清单”子项完成。下一步是 CRM/知识组合插件的最终拆包；服务物理分仓、平台依赖冷安装、真实 CRM 合同、D15 保存/UNKNOWN、精确宿主/WAL、签名/SBOM/CVE、canary/回退仍开放。候选 `release_ready=false`，没有 commit、push、远端 CI、Release 或杭州切换；不把已配置 CI 当成已经远端通过。

### CRM 增量提交前审核（2026-10-04，当前结果）

- 用户授权 OCR delegate 审核、修复后本地 commit。本轮覆盖原有全部 87 个未提交路径：OCR 61/61，另补审 26 个默认排除的文档、生成物、测试和删除项；同宿主对抗性复核没有额外发现。完整记录见[CRM 提交前审核](docs/hackathon/evidence/dsh-g0-crm-review-20261004.md)。
- 修复 API 错误合同：实际 400/403/409/422 使用 `status/code`，现在 OpenAPI 与生成类型同步声明 `ServiceError`，不再误报 FastAPI 默认 `detail`。新增 3 项回归先复现失败再通过；同步服务打包进度与 Ruff 版本文字。
- 修复后本轮重跑：完整合成 backend **2939 PASS / 77 SKIP / 71 deselect**；CRM **146 PASS / 0 SKIP**；B0 **PASS**（Python **618 PASS**，Node 阶段合计 **1435 PASS / 1 SKIP**，含 clean 重跑）。16 项服务 API 测试、实际服务包隔离运行、离线合同/类型、Ruff、边界清单均通过。下方及上方历史阶段的“未提交”和包 SHA 仅描述当时快照，不是新提交的 release 证据。
- 本轮审核无未关闭 P0/P1；产品仍 PARTIAL。CRM/知识插件最终拆包、真实数据/API、完整宿主/WAL、冷安装和供应链/回退仍待完成。没有远端 CI、push、Release 或杭州操作；正式候选须从 clean reviewed SHA 重建。

## 本轮施工计划

> r3 现场收尾记录见 [r3 收尾记录](docs/release/dsh-rc2-candidate/closeout-20260930.md)；r1 的 immutable Release、fetch receipt 和杭州 current 状态以本页与 runbook 为准。下方较早段落保留历史候选与未部署时的证据语境；不要用其“尚未执行”字样覆盖 2026-09-30 的事实。

- 截至 2026-09-29 的历史候选快照：rc2 候选验证账本见 [verification-20260927](docs/release/dsh-rc2-candidate/verification.md)；T2–T12 gate 见 `docs/release/dsh-rc2-candidate/`；固定上游 checkout、dsh-dev、B0 clean rebuild、PR #61 CI 和当时的 main CI 均通过；真实模型、131GB DuckDB、rc2 冷验证、杭州 route/重启和真实 HTTP backpressure 当时仍 `NOT_RUN`。当前 r3 事实见 [收尾记录](docs/release/dsh-rc2-candidate/closeout-20260930.md)。
- 本机候选 worktree 不含 DuckDB/WAL 文件；这里只使用 synthetic fixture 和隔离小库，杭州生产数据状态不由本地文件推断。PR #84 合并提交 `a9da9161` 的 `dsh-0.19.0.0-candidate` 曾在 Mac 隔离目录完成 build/receive/doctor；该快照在后续 main 提交后仅作历史证据，正式包必须从最终 reviewed SHA 重建，未上传或写入杭州现役目录；目标仍只有 Python 3.12.3，未满足项目 Python 3.14+ 冷运行时要求。
- 历史 merged-main internal artifact 仍使用 provisional tag `dsh-0.18.0.1-main-00823ff5`；source SHA `00823ff533b4cc32861cc70e3f8bda5d374f3b14`、app tarball SHA-256 `b11c4b43436eb06f1821c1891121b690e5488effa0c75d421f285e051c8fbf35`、manifest SHA-256 `4642f4614d81b6f2f8777485793b20f2c140eb3523efa46475831fe4398d36d7`、entries `1676`；pinned upstream `477b4f42` git-archive tarball SHA-256 `ddc0cb7b74c938e097f918f44e88e67a83bdde555db18f49cb7a3c9740744e32` 已在隔离 `/tmp` 生成，尚未上传或绑定 publication sidecar；manifest 以 `.context/release-evidence/dsh-0.18.0.1-main-00823ff5/release-manifest.v1.json` 为唯一来源；接收目录为一次性 synthetic 临时目录，未创建 draft/tag/release。`0.18.0.2` 及其 pre-review 包只保留为历史证据；`0.19.0.0` 的 `a9da9161` 候选快照已完成本地 checksum/receive，后续 main 提交使其失效；最终包以仓库外的不可变 manifest/CI evidence 为准，仍为 internal-only-partial。

- Artifact Inbox 数据层、自由 HTML 候选保存、原生 `write/edit/present` 接收、轮询和单卡片局部 patch 已合入并在杭州运行。
- 历史 PR #61 与合并后 main CI 已完成；Tailscale SSH host preflight 与 CRM+DSH/page loopback healthcheck 已通过；本候选的 PR/CI、杭州 CRM/DSH/WeKnora 切换、Cloudflare 入口和安全收尾仍按现场门禁处理；本地与生产均不改 DSH 上游。
- 隔离合成环境的 Playwright headed 旅程已通过（页面生成/预览、局部编辑、保存新版本、回滚和脏数据离开保护）；该 fixture 的生成步骤走 live adapter fallback，不能当作浏览器级 Artifact Inbox intake 证据。完整 DSH shell/生产收件箱旅程与本人 UAT 尚未执行，真实模型逐格式编辑、P13、扫描 PDF OCR、复杂 Office、图谱剩余语义核对仍未完成，不能记为产品全量通过。

## 当前边界

Mac 公共 checkout 负责开发、测试和 PR；杭州 Windows + WSL 只运行批准 SHA。生产服务、真实 DuckDB、WeKnora 数据卷和密钥不进入 Git。无宿主实时事件时，原生 HTML 发现依赖驾驶舱打开后的有界轮询和手动刷新，这是平台能力边界。

<!-- STATUS-AUTO-START -->
| pytest collected | **3036** | Sprint 59 自动抓 |
| pytest skipped | **0** | Sprint 59 自动抓 |
| 当前债数 | **?** | Sprint 59 自动抓 |
| 最近 sprint | **?** | Sprint 59 自动抓 |
<!-- STATUS-AUTO-END -->
