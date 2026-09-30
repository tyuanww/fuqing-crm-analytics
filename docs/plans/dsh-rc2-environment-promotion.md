<!-- /autoplan restore point: "/Users/hutou/.gstack/projects/weiweity-fuqing-crm-analytics/archive-tyuanww-main-autoplan-restore-20260926-142721.md" -->
# DSH rc2 全环境交付与用户使用逻辑计划

## Implementation plan

### 目标

把 DSH `0.1.7-rc.2` 与业务插件整理成可审查、可回滚、可由开发环境推进到测试环境再进入杭州生产的交付链。保持 DSH 上游独立，插件优先使用原生能力；默认情况下不覆盖原生标题、侧栏、主题和会话行为。消费者从登录、提问、查看证据、使用插件、保存结果到失败恢复都必须有明确的状态、权限和回执。

### 当前约束与事实

- 当前工作树 `archive/tyuanww-main` 有用户改动且与公共 `origin/main` 没有共同 merge-base，不能整树同步或直接作为生产发布候选。
- 公共 main 的杭州 `deploy/wsl` 交接文件仍按 rc1 运行层书写，而当前 archive 的 STATUS 已记录 rc2；两者是不同工作树/时间点，不能互相替代。正式候选必须从公共 main 固定 ref 后重新核对上游版本、产品 VERSION 和部署文件，再逐项移植。
- rc2 上游固定 SHA 为 `477b4f420553e8a52c2fbccc464d7561b239c443`，不修改上游源码。
- 杭州目标是 Windows + WSL2 + Docker + systemd，DSH、CRM、WeKnora 通过 loopback 和 Cloudflare Tunnel 暴露，禁止直接公开内部端口。
- 产品仍为 PARTIAL。DSH 升级验收不能代替真实模型、真实业务、完整文档格式和本人生产 UAT。

### 交付分层

1. **开发环境**：Mac 本地使用固定 Node/Python、rc2 上游副本和合成数据；插件默认 native-first；支持快速启动、诊断、冷构建和局部测试。
2. **集成测试环境**：使用干净 checkout、固定上游 SHA/lock、独立小库和隔离服务，验证 DSH 原生路径、插件路径、权限、保存/回滚、page HTTP、CRM/WeKnora 契约；不挂载 131GB 归档 DuckDB。
3. **杭州预发布**：只接收已通过 CI 的不可变 GitHub Release artifact，部署到新 release 目录，复用 durable runtime，保留已记录的 RC1 回退，先 loopback 健康检查，再做 release-level 浏览器 UAT。
4. **杭州生产**：只接收不可变 tag/release；先内部 healthcheck/UAT，再对现有 Cloudflare hostname 做限定 operator session 的验证，最后由产品负责人完成 UAT。当前没有 weighted/zero-traffic canary；稳定窗口关闭后才清理旧版本。

### 候选实现范围

- 从公共 main 建立 rc2 feature 分支，逐项移植 rc2 pin、plugin peer/build 路径、native-first guard、必要测试和文档。
- 移植 page 浏览器公网 origin 支持和 `app.tyuan.chat` CORS 支持；若未完成则生产关闭 page HTTP，不宣称页面文档可用。
- 将 `deploy/wsl` 运行层改为 rc2 路径，显式 `--shine-brand off`，默认保留 DSH 原生外观；品牌覆盖仅在单独开关和回归通过后启用。
- 修订 public main `deploy/wsl/README.md` 中沿用的 “Tunnel canary hostname” 旧措辞；当前配置没有 weighted/zero-traffic canary 或 operator-only Access 规则，候选必须把文档改为本计划定义的 hostname operator-only 验证/无隔离则停止内部 UAT，并随候选证据记录实际 gate method。
- 固定 `DSH_DEV_PAGE_PYTHON` 到已验证绝对 Python 路径，避免依赖系统 PATH。
- 产出包含插件 bundle、上游 SHA、lock SHA、Node/pnpm/Python 版本和 checksum 的 release manifest。manifest 采用 allowlist，构建门禁排除 `.env`、token、cookie、私有教材、真实金额、归档 DuckDB、WAL、runtime、日志和任何生产配置；`analytics-workbench/lib` 不依赖 Git 忽略产物，必须由构建过程生成并留证。
- 产品版本与 DSH 上游版本分开记录；当前 archive 文档口径是 `0.12.0.0`，不能沿用其他工作树的版本号。候选分支确认实际基线后再决定 patch 版本，并同步 CHANGELOG；不得把 DSH `0.1.7-rc.2` 自动当成产品版本。

### 开发流程

1. 读取 AGENTS、STATUS、TODOS、DESIGN 和现有杭州运行层，建立候选分支与恢复点；在候选分支记录 public main 的实际 ref、`VERSION`、DSH pin 和 `deploy/wsl` 文件清单，未固定前不进入 release。
2. 从公共 main 逐文件移植，优先复用已有 pin、诊断、构建、健康检查和 release 文档，不重写第二套流程。
3. 在本地运行 lint、类型/契约检查、B0 pipeline、上游诊断、插件冷构建和受影响测试；由 `scripts/release/dsh-manifest.mjs` 分两阶段调用：第一阶段生成 pre-manifest、allowlist/denylist、secret scan 和脱敏证据到 `.context/release-evidence/<tag>/`，上传 tarball 并取得 asset ID/URL 后第二阶段生成最终 `release-manifest.v1.json` 与 `SHA256SUMS`。两阶段缺任一文件则失败。artifact allowlist 明确包含 app source、`deploy/wsl`、已构建 DSH web/CLI runtime、所有生产启用 plugin `lib` 和 manifest；明确排除 `node_modules`（除非构建产物确实需要并被单独列为 runtime bundle）、凭据、`.env`、cookie、业务数据、WAL、生产 runtime 目录和日志。
4. 运行 gstack CEO、DX、Eng review；只有检测到新增 UI/视觉范围才运行 Design review。修复影响用户路径、升级安全和生产回退的发现。
5. 生成 PR，等待 CI，合并后以明确 tag 生成 GitHub Release；不以 `git pull` 或浮动 main 作为生产输入。PR、merge、tag、release、杭州重启、现有 hostname 验证、现役切换和旧版本删除均是独立授权停点，计划本身不授权执行。

### 测试流程

- 单元/源代码合同：版本 pin、lock、原生 slot ownership、browser origin、CORS、品牌默认关闭、失败关闭。
- 构建/契约：干净 rc2 上游、web dist、CLI、插件 bundle、B0 kernel/gateway/contract；CRM/WeKnora 只做当前 release 需要的接口/健康 smoke，不把真实业务闭环冒报为 rc2 通过。
- 浏览器路径：一次性 `?token=` 换 HttpOnly Cookie、原生对话、工具权限、插件加载、HTML Inbox、页面预览/编辑/保存、取消/冲突/重试/未知回执、刷新/重开。
- 发布验收：健康状态、未认证 `401`、loopback 端口、Cloudflare HTTPS、个人权限、来源与 `query_ref`；真实模型、完整业务映射、保存分析/驾驶舱持久引用和完整格式支持若未验收，标 `NOT_RUN/PARTIAL`。
- 未运行或只在合成夹具通过的项目必须保留 `NOT_RUN/PARTIAL`，不转写为生产通过。

### 生产部署流程

1. GitHub PR/CI 通过后先固定候选 `VERSION` 与 `release_tag`，再创建 release。资产命名固定为 `shinemage-dsh-${VERSION}-${SOURCE_SHA}.tar.zst`、`shinemage-dsh-upstream-${UPSTREAM_SHA}.tar.zst`、`release-manifest.v1.json`、`SHA256SUMS` 和 `ci-evidence-index.v1.json`；`release-publication.v1.json` 作为同一 release 的校验 sidecar 随交付保存。先生成只含源码/上游/lock/工具链、bundle 清单和 payload hash 的 pre-manifest，上传两个 tarball 取得 GitHub asset ID/URL；再生成最终 `release-manifest.v1.json`，写入两个 tarball 的 asset ID/URL、`retention_until`、`release_tag`、产品 VERSION、源码 SHA、DSH upstream SHA、lock SHA、Node/pnpm/Python 版本、bundle 路径、payload 文件 SHA-256、构建者和构建时间。最终 manifest 不记录自身 SHA 或 `SHA256SUMS` 的 SHA，随后生成 `SHA256SUMS`，列出最终 manifest 和 payload 文件但不列自身，避免自引用循环；上传 metadata 时同时上传 ci evidence index。至少保留当前 release 和上一份可回退 release 到回退窗口结束。杭州执行 publication sidecar 状态、schema、CI evidence index 引用检查和 `sha256sum -c` 后才可使用。
2. 杭州只读预检：记录旧 checkout SHA、旧 RC1 upstream SHA、systemd 状态、端口、磁盘、WAL、配置权限、Cloudflare route 当前值和回退路径；主机路径、用户、SSH key 和权限必须以现场结果为准，计划中的 `/srv`、`/etc` 只是默认约定，预检输出写入 `release-evidence/<tag>/host.json`。
3. 准备实际 `DSH_ROOT` 下的 `upstream-0.1.7-rc.2`，固定 SHA；CI 已完成 frozen lock、官方 web/CLI 和插件 bundle，生产不重新编译，缺 artifact 直接阻断。
4. 将 release artifact 解包到实际 `RELEASE_ROOT/<tag>`，更新实际 env 文件，执行 `preflight.sh` 和 compose config；本次 rc2 不做数据库 schema、数据目录、durable runtime 或 Cloudflare route 配置迁移。若候选已提供并通过独立 staging port/service 与 operator gate，可在切现役前用批准的 operator session 验证；若仍是现有 `app.tyuan.chat → 127.0.0.1:6677` 直连且没有边缘隔离，切 DSH service 就等于公网 cutover，禁止把后续 operator 访问称作 pre-cutover canary，必须在重启前取得正式切换授权。若必须改 route 才能隔离流量，则本次停止在内部 UAT，另立并授权 route 变更。
5. 只重启自有 DSH service，执行 `healthcheck.sh --all`；CRM/WeKnora 无变更时不重启。
6. 完成杭州内部浏览器 UAT。只有在独立 staging route/service 与 operator gate 的正负探针都通过时，才可进行现有 hostname 的 `operator-only-existing-hostname` 验证并把它作为正式切换前门禁；若没有隔离机制，现有 hostname 验证与 service 切换是同一个 cutover gate，必须先取得正式切换授权，观察至少 15 分钟后决定保留或回退。当前没有 weighted/zero-traffic Cloudflare canary。
7. 失败时恢复已记录的旧 checkout、RC1 upstream、env 和 runtime，保持数据库/WAL 不变，复验全链路健康；稳定窗口关闭后才清理旧版本。代码回退不代替数据库回退演练。

   回退记录固定写入 `.context/release-evidence/<tag>/rollback.json`，包含 `release_tag`、`old_checkout_sha`、`old_upstream_sha`、`old_env_sha256`、`runtime_path`、`old_cloudflare_config_sha256`、`trigger`、`owner`、`started_at`、`healthcheck_exit_code` 和 `completed_at`。触发条件包括 manifest 校验失败、systemd 未 active、DSH/page/CRM healthcheck 非预期、认证/CORS UAT 失败、任一关键路径 5xx 或用户确认阻断；由发布 owner 执行，产品 owner 记录 UAT 结果。实际恢复命令必须从现场 systemd/Cloudflare unit 读取并写入 receipt，禁止凭文档猜命令。

   **Artifact 合同和原子顺序**：候选实现提供 `scripts/release/schemas/pre-manifest.v1.schema.json`、`release-manifest.v1.schema.json`、`promotion-receipt.v1.schema.json`、`release-publication.v1.schema.json`、`ci-evidence-index.v1.schema.json`，并让 `dsh-manifest.mjs` 按固定状态机拒绝乱序调用。顺序只能是：`BUILD` 生成 pre-manifest（含源码/上游/lock/工具链、bundle 清单及其角色）和两个 tarball，并生成只引用 CI 报告路径/SHA/状态的脱敏 `.context/release-evidence/<tag>/ci-evidence-index.v1.json`；该 index 不引用后续生成的 publication/production receipt，二者作为独立交付 sidecar；pre-manifest 的 SHA、原文和生成日志留在 `.context/release-evidence/<tag>/pre-manifest.v1.json`，作为 CI 证据而不是生产 runtime payload；`CREATE_DRAFT_RELEASE` 创建不可下载的 draft；`UPLOAD_TARBALLS` 上传两个 tarball 并读取 asset ID/URL；`FINALIZE_MANIFEST` 生成含 `pre_manifest_sha256`、tarball asset ID/URL、`release_tag`、产品 VERSION、源码/上游/lock SHA、工具链版本、`build_time`、`retention_until`、bundle 路径和 payload SHA-256 的最终 manifest（不含自身或 `SHA256SUMS` SHA）；manifest 的 payload 条目只表示上传 tarball 本体，路径、角色、字节数和 SHA 必须逐一对应下载文件；`GENERATE_SUMS` 生成列出两个 tarball 和最终 manifest、但不列自身的 `SHA256SUMS`；`UPLOAD_METADATA` 上传最终 manifest、`SHA256SUMS` 和 `ci-evidence-index.v1.json`，并校验五类 asset 的名称、大小和 SHA；`PREPARE_PUBLICATION` 生成并校验 `.context/release-evidence/<tag>/release-publication.v1.json`（draft id、五类 asset ID/URL/size/SHA、manifest/SHA256SUMS SHA、evidence index SHA、预期 tag 和授权引用）；只有校验通过才 `PUBLISH_RELEASE`，发布后补写 `published_at`/`release_url` 并把 publication record 状态置为 `PUBLISHED_VERIFIED`，然后把该 sidecar 与 CI evidence index 一起复制到杭州 `RELEASE_EVIDENCE_ROOT/<tag>/`，再进入 `RECEIPT`。上传或校验任一步失败都保持 draft；若 GitHub publish 成功但 publication record 写入失败，状态明确为 `RELEASED_UNVERIFIED`，禁止杭州接收，自动重试/人工补写 publication record，不把它报作完成。receipt 记录五类 asset 的 ID/URL、publication sidecar 路径/SHA、manifest/SHA256SUMS 最终 SHA、`pre_manifest_sha256`、`ci_evidence_index_path`/`ci_evidence_index_sha256`、授权、保留期和现场验证证据，且不得回写已上传 manifest。

   **Existing-hostname 验证合同**：当前仓库没有 operator-only 实现，候选必须在 `deploy/wsl` 和证据模板中补齐。现场预检从以下机制中选择实际可用且得到授权的一种，并写入 `operator_gate_method`：Cloudflare Access 临时 service token/identity policy、Tailscale ACL + loopback 端口转发、或临时 IP/mTLS allowlist；不能凭空假设其中任意一种存在。必须完成正探针（批准 operator 身份访问返回当前 `release_tag`/`source_sha`）和负探针（未认证及非 operator 身份得到 401/403 或无法路由），记录 route config SHA、访问策略版本、请求时间、响应码和脱敏日志引用；`operator_probe_evidence` 固定包含 `positive_probe_ref`、`negative_probe_ref`、`route_config_sha256`、`observed_release_tag`、`observed_source_sha`、`started_at`、`ended_at` 和 `log_ref`。若现场没有可隔离 operator 流量的机制，`operator_gate_method=none`，只完成 loopback/internal UAT，禁止请求现有公网 hostname；此时计划状态为 `PARTIAL`，不得写“canary 通过”。

### 用户使用逻辑

- 首次访问先通过启动链接中的一次性 `?token=` 换取 HttpOnly Cookie，随后进入根路径；未认证根路径返回 `401` 属于预期。Tailscale SSH 启动链接只由访问辅助脚本读取和重写，token 不能写入日志、manifest、页面或聊天。
- 默认首页先呈现原生 DSH 对话和明确的输入/加载/结果/错误状态；插件能力在当前会话和权限范围内出现，不改变原生工具合同。
- 结果必须能回到来源、查询引用和当前权限；保存分析/驾驶舱持久引用当前未接通时，入口必须显示 disabled/NOT_AVAILABLE，不得伪造成功。保存、导出、发送等改变外部状态的动作需要明确确认和可验证回执。
- 取消、网络中断、版本冲突、权限撤销和服务不可用都提供恢复路径，不能把旧草稿或过期结果伪装成成功。
- 空状态、部分失败、无权限、未知数据和真实模型凭据未运行都应有可理解的解释。移动端完整适配属于未核准的后续 UX 范围，本轮记录 `NOT_RUN`，不作为 rc2 通过条件。

   release-level UAT 证据写入 `.context/release-evidence/<tag>/uat.md`，按 `auth/native/plugin/page/crm/weknora/recovery` 七组列出 owner、前置条件、通过标准、实际状态、时间和截图/日志引用；完整真实业务 UAT 另列 `PARTIAL/NOT_RUN`。

### 完成条件

- 候选基于公共 main，有可审查 commit、CI、gstack review、版本说明和回滚 manifest；生产只提升 manifest 已校验的 release artifact。
- 本地与集成测试通过，未执行项有明确账本、owner、证据路径和 `NOT_RUN/PARTIAL` 状态。
- 杭州内部 healthcheck、认证、DSH/page release-level 浏览器 UAT 和当前 release 需要的 CRM/WeKnora smoke 完成；完整真实业务 UAT、真实模型和产品 M1 仍按 PARTIAL 记录，不冒报完成。
- 现有 Cloudflare hostname 的 `operator-only-existing-hostname` 验证通过后才允许正式切换；当前没有 weighted/zero-traffic canary。旧版本在回退窗口结束后才删除。
- 若没有独立 staging route/service 和可审计的 operator gate，必须在 service 重启前取得正式 cutover 授权，并把公网验证记为 cutover gate；只完成内部 UAT 时状态为 `PARTIAL`，不得把 hostname 验证或 canary 写成通过。
- 交付后文档记录实际版本、上游 SHA、artifact checksum、配置变更、验证结果、未关闭风险和回退方式。

   本地旧 DSH checkout、旧 symlink、旧构建副本清理由当前任务另列清单并只删除本任务拥有的对象；运行 runtime、证据、用户配置和未授权工作树不在清理范围。清理前必须核对 preset/运行入口指向 rc2，保存删除清单和回执。

### Release security and promotion gates

- **Artifact build gate**：CI 或隔离构建机执行固定 Node/Python、rc2 upstream 和 frozen lock；生成 release manifest、bundle、`SHA256SUMS`、allowlist/denylist 报告和 secret scan 报告。缺少 bundle、出现 denylist 命中、secret scan 非零或 checksum 不一致，禁止创建 GitHub Release。
- **Artifact receive gate**：杭州只下载明确 tag/artifact，先校验 `release-publication.v1.json` 状态为 `PUBLISHED_VERIFIED`、release URL/tag 与 GitHub 对应、manifest schema/version、tag 与源码 SHA 绑定、第五个 `ci-evidence-index` asset 的 ID/URL/name/size/SHA 与 publication record 一致、GitHub tarball asset 名称/URL 与 allowlist；拒绝 `RELEASED_UNVERIFIED` 或缺 publication record 的 release。对两个 tarball 下载文件逐一核对 manifest payload 条目的路径/角色/字节数/SHA，再执行 `sha256sum -c SHA256SUMS`（其中包含两个 tarball 和最终 manifest，不包含自身），通过后才解包到新的 release 目录。`pre_manifest_sha256` 仅作为 CI evidence provenance，由 promotion receipt 引用其 `.context/release-evidence/<tag>/pre-manifest.v1.json`；若 receipt/evidence 未随交付保存，接收状态为 `PARTIAL`，不得宣称完整审计通过。服务器不从工作树自行补 bundle。
- **Auth gate**：验证有效一次性 token、过期 token、重复 token、无效 token、错误 origin、Cookie `HttpOnly/Secure/SameSite`、401 裸地址和日志/manifest/chat 脱敏。
- **Page gate**：只允许 `https://app.tyuan.chat` 的浏览器 origin 访问 page HTTP CORS，page browser base 为 `https://page.tyuan.chat`；预检、GET、错误和凭据行为都有实际证据。任一失败则 `--page-http off`。
- **Promotion gate**：内部 loopback healthcheck 通过、release-level UAT 七组全部通过后才允许对现有 Cloudflare hostname 做 `operator-only-existing-hostname` 验证；当前没有 weighted/zero-traffic 路由，验证动作本身按正式切换处理，只允许一个批准的 operator session，观察至少 15 分钟，期间任何未预期 5xx、认证失败、CORS/page 错误、控制台未处理异常或关键 UAT 回归立即回退。hostname 验证、正式切换和旧版本删除须取得对应明确授权。

### NOT in scope

- 真实模型逐格式编辑、P13、全图语义、产品 M1 收口、完整真实业务 UAT和移动端完整适配：继续列为 `PARTIAL/NOT_RUN`，不阻塞 rc2 基座候选的工程性检查，但阻塞产品正式能力宣称。
- GitHub Actions 自动 SSH、自动 promotion、自动 Cloudflare 切流：先保留人工 release 回执，待 secret、runner、审批和回退演练完成后另立任务。
- DSH 上游源码修改、第二 Agent Loop、真实 131GB DuckDB 复制/迁移、数据库 schema 变更、无授权的公网切换：本轮拒绝。

### What already exists

- `scripts/dsh-dev/cli.mjs`、`serve.mjs`、`diagnose.mjs` 和 page HTTP tests：已有固定上游、原生/品牌开关、认证脱敏和页面 origin 适配入口。
- `dsh-plugins/*/build.mjs`、`toolchain.json`：已有上游 SHA、Node 主版本、lock 和插件构建约束。
- public main 的 `deploy/wsl` 运行层：已有 WSL 目录约定、systemd、Compose、preflight、healthcheck 和 Cloudflare 配置模板；候选必须固定 public-main ref 后逐文件移植并记录差异。
- public main 的 `deploy/wsl` 当前只有普通 Tunnel ingress 模板，没有 weighted/zero-traffic canary 或 operator-only 访问策略；README 的旧 canary 说法属于待修订文档，不能当成现成生产能力。
- `docs/operating/dsh-production-access.md`、`scripts/ops/open-hangzhou-dsh.sh`：已有一次性 token 访问约束和不打印 token 的浏览器入口，但没有部署能力。
- `docs/operating/verification.md`、`.github/workflows/lint.yml`、`scripts/dsh-b0/pipeline.mjs`：已有本地/CI 检查选择与 B0 入口，需由候选的 manifest/证据层绑定。

### Dream state delta

当前 archive、public main、杭州 rc1 运行层和实际 bundle 来源分离。本计划把它们收敛到一个带版本、上游、构建、校验、UAT 和回退证据的 release contract。距离 12 个月理想仍缺自动 promotion、生产观测和完整产品验收，但这些不会伪装成 rc2 已完成。

### Error & Rescue Registry

| Capability / failure mechanism | User impact | Current safeguard | Rescue owner/action | Verification |
|---|---|---|---|---|
| Release manifest/checksum absent or mismatch | 杭州不能知道运行的 bundle 是否经过测试 | 计划新增 artifact gate | release owner 中止接收，保留旧版本 | `sha256sum -c` + manifest test |
| Secret/denylist hit in artifact | 凭据或真实业务资料可能外发 | allowlist/denylist + secret scan | release owner 删除 artifact、重建；不上传 | scan report exit nonzero |
| One-time auth token invalid/expired/replayed | 用户看到 401，无法进入 DSH | 原生 401 与 launcher redaction | 用户重新获取 launch URL；运维不复制 token | auth negative matrix |
| Browser origin/CORS/page base mismatch | 页面文档预览或保存失败 | browser-base/CORS gate | 关闭 page HTTP 或恢复旧 release | preflight/GET/browser UAT |
| Plugin bundle stale/absent | 原生 DSH 可用但业务入口未运行或错误 | cold build + bundle digest | 回退旧 bundle/release | loader/build tests |
| systemd/Node/Python/port unavailable | DSH 或 page 无法启动 | preflight + healthcheck | 恢复 env/runtime，修复 host 依赖 | systemd verify + healthcheck |
| Cancel/conflict/unknown receipt | 用户可能误以为保存成功或丢失修改 | existing CAS/idempotency paths | 保留草稿，显示未知/冲突，允许重试或放弃 | browser recovery matrix |
| Runtime/data/WAL incompatibility | 回退可能破坏持久状态 | rc2 禁止 schema/data migration | 停止 promotion，恢复旧代码和 runtime，独立做备份演练 | no-migration gate + WAL check |

### Failure Modes Registry

| CODEPATH | FAILURE MODE | RESCUED? | TEST? | USER SEES? | LOGGED? |
|---|---|---|---|---|---|
| release build | bundle/manifest/secret scan failure | Y | Y | no release created | Y |
| artifact receive | checksum/tag mismatch | Y | Y | old release remains | Y |
| auth launch | expired/replayed/foreign token | Y | Y | 401 + retry entry | Y, redacted |
| page HTTP | browser origin/CORS mismatch | Y | Y | page unavailable with reason | Y |
| DSH service | systemd/Node/Python/port failure | Y | Y | service unavailable, old release retained | Y |
| runtime action | cancel/conflict/unknown receipt | Y | Y | recoverable status and draft retained | Y |
| promotion | operator-gate or cutover-smoke health/UAT failure | Y | Y | old release retained or cutover rolled back | Y |
| data boundary | WAL/schema/real-data contamination | Y | Y | release blocked | Y |

### Promotion receipt contract

`promotion-receipt.v1.json` 由发布 owner 在每次杭州接收、验证、切换或回退时生成，固定写入本地证据目录 `.context/release-evidence/<tag>/promotion-receipt.v1.json`，并在杭州主机同步保存到实际 `RELEASE_EVIDENCE_ROOT/<tag>/promotion-receipt.v1.json`。它至少包含：`schema_version`、`release_id`、`release_url`、`published_at`、`release_state`、两个 tarball 的 `asset_id`/`asset_url`/`asset_name`/`asset_size`、`manifest_asset_id`/`manifest_asset_url`、`sha256sums_asset_id`/`sha256sums_asset_url`、`ci_evidence_index_asset_id`/`ci_evidence_index_asset_url`/`ci_evidence_index_asset_name`/`ci_evidence_index_asset_size`、`ci_evidence_index_path`、`ci_evidence_index_sha256`、`publication_sidecar_path`、`publication_sidecar_sha256`、`release_tag`、`source_sha`、`upstream_sha`、`build_time`、`pre_manifest_sha256`、`pre_manifest_evidence_path`、`old_release_tag`、`old_checkout_sha`、`old_upstream_sha`、`old_env_sha256`、`old_cloudflare_config_sha256`、`new_checkout_sha`、`manifest_sha256`、`sha256sums_sha256`、`authorization_ref`、`operator`、`cutover_gate_mode`（固定取 `operator-isolated`、`unisolated-cutover` 或 `internal-only-partial`）、`cutover_authorized`、`operator_gate_method`、`operator_probe_evidence`、`host`、`route_config_sha256`、`preflight_exit_code`、`healthcheck_exit_code`、`uat_path`、`uat_status`、`canary_mode`（固定取 `operator-only-existing-hostname` 或 `none`）、`canary_started_at`、`canary_ended_at`、`rollback_trigger`、`rollback_command_ref`、`retention_until` 和 `final_status`。没有 receipt 就不算完成发布。

### CEO diagrams

#### System architecture

```text
Mac dev / CI
  ├─ fixed Node24 + Python3.14 + DSH rc2 upstream
  ├─ scripts/dsh-dev + plugin build + B0 checks
  └─ release manifest + bundle + SHA256 + redacted evidence
             │ GitHub tag/release (immutable)
             ▼
Hangzhou Windows / WSL2
  ├─ release checkout + rc2 upstream + durable runtime
  ├─ systemd DSH 127.0.0.1:6677
  ├─ page HTTP 127.0.0.1:18091
  ├─ CRM 18093/18094 and WeKnora 18090/18092
  └─ Cloudflare Tunnel → app/page/board/learn/www
```

#### Data and evidence flow

```text
source + pinned upstream + lock
        → clean build
        → plugin bundle + manifest + checksums + secret/denylist report
        → GitHub Release
        → Hangzhou verify/decompress
        → loopback health/UAT evidence
        → authorized hostname validation or cutover smoke
        → release receipt / rollback receipt
```

Real data, credentials, runtime, WAL and logs stay on their owning host; synthetic fixtures and redacted evidence are the only test inputs that cross environments.

#### User state machine

```text
launch URL
  → token exchange
  ├─ invalid/expired/replayed → 401 + obtain new launch URL
  └─ HttpOnly Cookie
       → native conversation
       → plugin action
       ├─ loading → success/result reference
       ├─ cancel → CANCELLED + draft retained
       ├─ conflict/unknown → recovery state + retry/abandon choice
       ├─ permission revoked → denied + no write
       └─ service/page unavailable → explained failure + old release/recovery path
```

#### Deployment and rollback flow

```text
PR/CI
  → tag/release artifact
  → SHA/manifest/secret scan gate
  → Hangzhou read-only preflight
  → new release directory + env install
  → systemd verify + DSH healthcheck
  → release-level UAT
  → [authorized] existing hostname operator-only validation
       ├─ pass + [authorized] promote
       └─ fail/threshold → restore old env/checkout/upstream/runtime
```

### CEO completion summary (pre-Eng)

| Item | Status |
|---|---|
| Mode | SELECTIVE_EXPANSION |
| Spec review | Fresh recheck pending after two-stage manifest and hostname wording repairs |
| Architecture/error/security/data/deploy review | CEO sections pending full pass; current registries identify release, auth, page, runtime and data-boundary gates |
| Design phase | REVIEWED; native shell、登录/插件/page/动作失败状态均已纳入交互审查 |
| DX phase | REQUIRED, developer-facing release/build/deploy workflow |
| Product scope | PARTIAL; real model, M1, full business UAT and mobile UX remain deferred |
| Production authority | Merge, tag, release, canary, cutover, restart and deletion remain independent authorization gates |


<!-- autoplan-accepted:ceo -->
- Keep DSH upstream source independent and make native-first ownership explicit; plugin UI/action paths must fail closed to the native loop and never masquerade as native capability. The default product surface keeps native title, sidebar, theme, session and tool contracts; every override is an explicit opt-in with a regression result.
- Require immutable release artifacts, explicit source/upstream/lock/toolchain provenance, checksum and secret/denylist gates, and a receive gate that rejects unverified or mismatched assets. SHA-256 proves byte integrity only; provenance/signature/attestation remains a separately labelled deferred gate and is never implied by a checksum.
- Keep promotion in three explicit modes (`operator-isolated`, `unisolated-cutover`, `internal-only-partial`); without an independently verified operator gate, stop at internal-only and do not call the path canary. Tailscale, Cloudflare Access or mTLS may be used only when the actual route and negative probe prove the gate; a mere hostname or tunnel is not isolation.
- Prove the target WSL2/Node/Python ABI by cold-unpacking the exact artifact on a clean synthetic fixture, and record an rc1→rc2 read/write compatibility matrix for session state, runtime files and WAL. With no migration in scope, incompatible durable state blocks promotion; code rollback never rewrites the database.
- Treat auth, page/CORS, runtime/WAL compatibility, cancel/conflict/unknown receipts and rollback as release-blocking paths with redacted evidence and retained old release. Every mutable user action has one terminal receipt, and unknown outcomes remain recoverable rather than becoming false success.
- Keep one machine-generated promotion record authoritative for state and derive publication/host views from it; if separate manifests or sidecars remain for transport, their hashes, asset identities and states must be cross-checked and retries must be idempotent. Do not add evidence files without a receiving or recovery decision they enforce.
- Label real-model, full-business, M1, persistence and mobile capabilities PARTIAL/NOT_RUN in product and operator surfaces; do not imply infrastructure readiness is product readiness. Unsupported save/export/send actions remain disabled with an explanation.
- Before a pilot, publish a source/public-main functional-difference inventory, RACI with primary and backup owners for build/receive/UAT/cutover/rollback/cleanup, SLI targets and rollback thresholds (auth success, p95 response, 5xx, plugin/native failures, page/CORS and save/recovery). Record observed values in the release evidence instead of claiming them from design.
- Define a bounded operator pilot around one end-to-end CRM analysis scenario, including successful analysis, source/query reference, permission denial, cancel/unknown recovery and rollback drill. Expand access only after the scenario succeeds on synthetic integration data and the product owner records real-business UAT separately.
<!-- /autoplan-accepted:ceo -->

<!-- autoplan-accepted:dx -->
- Provide one copyable Quickstart from a clean checkout to native hello world, a `release doctor`/diagnose entry, expected output and cleanup; record TTHW as NOT_MEASURED until a real run, and add the same hello-world smoke to CI.
- Reuse one release command surface for local and CI with dry-run, offline/local build, validate, status, why-blocked, retry, resume and rollback-dry-run semantics, stable exit codes, idempotency keys and explicit config precedence (CLI > environment > file > safe default); do not create a second deploy runtime.
- Give every build, asset, publication, receive, operator-gate and rollback failure a stable machine-readable code, cause, recovery action, verification command and linked runbook/example; production safety gates cannot be bypassed by a convenience flag.
- Add a local/CI/target-WSL command matrix, sample manifest/publication/receipt/UAT evidence and a glossary for release and cutover states; use `internal-only-partial` instead of canary when no isolation exists.
- Define pinned toolchain installation and `doctor` checks for Node, pnpm, Python, Docker/WSL and required paths; provide a redacted profile/config example and mark immutable guardrails separately from overridable defaults such as ports, evidence directory, tag and synthetic fixture.
- Provide a thin, discoverable entry (for example `pnpm dsh <dev|test|release|verify|rollback>`) over existing scripts, with `--help` examples and no hidden GitHub credential requirement for local build/schema/secret-scan verification; remote upload/publish remains CI/authorized-only.
- Make recovery executable and inspectable: `preflight`, `promote`, `rollback` and `receipt verify` must dry-run first, show affected paths, support fresh-install and upgrade cases, and record actual host/systemd/route commands in the receipt.
- Provide a synthetic release test orchestrator that prepares and cleans an isolated small database/services, runs the seven UAT groups, and writes PASS/NOT_RUN/PARTIAL plus durations and evidence links to the CI index; add dev-only redacted auth token issue/negative-matrix entry points.
- Add `operator-gate verify --method cloudflare|tailscale|mtls|none` (or an equivalent existing command) that records positive/negative probes and route SHA; document how `none` is derived and keep operator gate, secret scan, denylist, loopback and immutable artifact guards non-overridable in production.
- Record TTHW, release lead time, blocked phase, change-failure rate, MTTR, successful operator sessions and citation/recovery coverage after the first two candidate runs; keep PARTIAL/NOT_RUN labels visible to developers, operators and users.
<!-- /autoplan-accepted:dx -->

<!-- autoplan-accepted:design -->
- 本轮保持 DSH 原生首屏和 `--shine-brand off`；任何未来品牌覆盖必须继续使用 `DESIGN.md` 的令牌/字体/可访问性约束并单独回归，不在 rc2 中散改上游或重新设计原生对话。
- 用户层级固定为：认证/入口状态 → 原生输入与流式结果 → 来源/query_ref 证据 → 插件入口与权限状态 → 保存/导出/发送动作；插件入口必须有可见的“插件/业务能力”标识，不能伪装成原生工具。
- `save/export/send` 在当前能力未接通时采用“可见但置灰 + 一行原因 + 可用条件/替代动作”，不能隐藏、不能让用户先完成昂贵分析才首次得知不可用；外部发送确认必须展示目的地、对象、影响范围和可取消出口。
- 认证失败显示不含 token 的明确页面文案（链接已过期/使用过/无效，请重新获取启动链接），而不是让用户停在裸 401；一次性 token 仍只在日志和页面之外处理。
- 长耗时分析显示进行中/已等待状态、取消动作和“不重复点击”提示；原生流式输出、空结果、部分结果、权限中途撤销、断网重连、未知数据和 page 不可用各有可理解文案与下一步 CTA。
- 来源证据在结果块的固定位置显示来源名、时间/范围、`query_ref` 和当前权限可见性；点击/展开查看详情，禁止暴露超出权限的原始 SQL/业务数据。空态提供重新查询或联系管理员，冲突/未知回执提供重试/放弃和草稿恢复入口。
- 页面、插件加载失败和恢复态必须保留原生对话可用性；失败关闭插件能力并说明原因，不把插件异常渲染成原生回答成功。状态/按钮支持键盘焦点、减少动态效果和中文/英文字体回退。
- UAT 以这些固定位置、文案类别、状态和 CTA 验证用户路径；本轮不增加移动端新布局，移动端仍 `NOT_RUN`。
<!-- /autoplan-accepted:design -->

<!-- autoplan-accepted:eng -->
- 接收端使用非 root 的临时目录解包 tar.zst，拒绝绝对路径、`..`、symlink/hardlink/device、tarbomb、超大文件和超多条目；通过文件数/总大小/权限/owner 限额、恶意归档夹具和原子移动后才进入 release root。
- page HTTP 的 CORS 只作浏览器兼容，不作授权；服务端执行 host/session/CSRF/Origin 校验，loopback 仅绑定内部地址，公网 route 必须有 Access/Tailscale/mTLS 或明确保持关闭。非浏览器、无 Origin、伪造 Origin 和跨租户 scope 均有拒绝测试。
- 一次性 token 采用短 TTL、持久原子消费、并发只成功一次、重启后消费状态保留、签发端点有 owner/审计/限流/轮换；交换后用 POST→303 清除 URL，`Cache-Control: no-store`、`Referrer-Policy: no-referrer` 和 edge/app 日志脱敏，Cookie 采用 host-only、明确 Domain/Path/SameSite，并分别验证 loopback 与 TLS 语义。
- 生产可信链至少绑定 protected tag/branch、reviewed commit、人类批准记录（tag/source/tarball SHA）和 GitHub release `draft=false`/不可变状态；在正式生产前没有 OIDC provenance/签名/attestation 时只能停在 internal-only/operator pilot，不把 SHA256 自校验当作来源证明。
- 以一个 durable `state.json`/journal 记录每个 release phase 的状态、锁、`idempotency_key`、started/committed 时间；按 tag 唯一化、远端 reconcile、按内容 SHA 去重、可安全 resume，崩溃注入和并发调用测试拒绝重复 draft/asset。manifest、publication 和 receipt 的重复字段由生成器机械派生，三路不一致即拒收。
- side-by-side 安装和原子 symlink/env 激活先写临时文件并 fsync；切换前后验证 version/source endpoint，systemd/page/DSH/插件分别声明 owner、artifact/version endpoint 和 restart dependency；任何半完成或健康失败自动恢复旧版本并先后写 receipt。
- 明确 rc1→rc2 只验证 DSH session、B0 SQLite、runtime/WAL 等本轮会触碰的状态文件；对真实 131GB 归档标 `NOT_RUN`。在 synthetic fixture 做旧→新读写、新→旧回读、并发锁、冷启动、回退和进程崩溃测试；失败阻断 promotion，不改真实库。
- 为 mutable action 定义服务端 `action_id`、幂等键、持久 terminal receipt、取消/中止语义、查询/重试窗口和重启恢复；客户端未知结果不推断成功，断网/杀进程/重复点击测试覆盖 save/cancel/conflict。按 2026-09-30 scope decision，完整 save/export/send action 合同延期到后续候选；本轮只保留原生回退与 `disabled/NOT_AVAILABLE` 能力边界。
- 最终 tarball 解包内容执行 secret scan，allowlist/denylist 与内容扫描独立；HTML/自由内容插件若无 CSP + sandboxed iframe + 净化，不得在公网触发，降级为 `disabled/NOT_AVAILABLE`。
- 为 manifest schema、allowlist、URL/size/path/range、unknown fields、时间统一 UTC ISO-8601、版本兼容和 canonicalization 定义 fail-closed 校验；补 malformed/duplicate/size mismatch/asset replacement/force-push tag 负测。
- 把负向 operator probe 的 timeout/网络丢包视为失败，不是通过；定义 p95、5xx、auth、plugin、page/CORS 的 SLI 阈值、探针频率、告警来源和回退条件，15 分钟观察还须满足最小 operator 会话/端到端场景数并记录。
- 统一生产/集成/开发 capability matrix，区分 page 可用、分析可用与保存/持久化可用；所有未接通能力在 UI、manifest、UAT 和文档保持 `PARTIAL/NOT_RUN/NOT_AVAILABLE`。
- 测试矩阵增加状态机、schema、remote reconcile、crash/chaos、非浏览器授权、token/Cookie、XSS/CSP、WSL reboot/suspend、依赖启动竞态、mixed-version、fresh-install/upgrade/rollback 和实际 receipt 可取性；每项写入 CI evidence index。
<!-- /autoplan-accepted:eng -->
## Review record

### Initial context

- 用户要求按全栈工程视角规划开发、测试、生产环境，建立不乱的开发逻辑和符合消费者使用逻辑的产品路径。
- 用户前序要求 DSH rc2 升级、native-first、旧本地版本清理，以及杭州生产部署流程。

### CEO Step 0 preliminary review

#### 0A. Premise challenge

真实问题不是“把 rc1 换成 rc2”，而是建立一条能证明版本、插件、上游依赖、用户行为和生产回退都属于同一候选的交付链。只做本地升级会留下三个直接风险：开发树和公共 main 分叉、杭州运行层依赖未移植的 page origin/CORS 支持、生产无法区分已构建插件和未构建源码。若不补齐，用户可能遇到原生界面被覆盖、远程文档打不开、生产运行了错误 bundle 或回退时状态不一致。

#### 0B. Existing code leverage

- `scripts/dsh-dev` 已有固定上游诊断、serve、page HTTP 和运行入口，复用这些入口比另起启动器更安全。
- `dsh-plugins/*/build.mjs` 与 `toolchain.json` 已有上游 pin、Node 主版本和 lock 检查，复用它们生成 release manifest。
- 公共 main 已有 `deploy/wsl`、`preflight.sh`、`healthcheck.sh`、systemd unit 和 Compose 覆盖文件，候选应按文件逐项移植并改 rc2，不重写第二套生产运行层。
- `scripts/ops/open-hangzhou-dsh.sh` 只负责读取现有启动 URL 和浏览器访问，不能被误用为部署器；生产部署仍需显式 release checkout、env、systemd 和回执。

#### 0C. Dream state mapping

```text
当前：本地 archive rc2 改动与公共 main 分叉，杭州运行层为手工 rc1，插件 bundle 和页面公网路径存在环境耦合
  ---> 本计划：公共 main 上形成固定 rc2 候选，CI 产出带 SHA/lock/checksum 的 release，杭州按 release 分阶段接收并可回退
  ---> 12 个月理想：GitHub Release 触发受控的杭州预发布与 canary，生产只提升不可变 artifact；每次变更都有自动健康门禁、用户 UAT 回执和一键回退
```

#### Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| CEO-01 / product owner | 需要选择本轮 review 深度和范围；用户要求的是全栈环境计划，不是单个 bug 修复 | 计划覆盖开发、集成测试、杭州预发布/生产和用户路径 | 以 SELECTIVE EXPANSION 审查，保留交付主线并接受同一 blast radius 内的发布、可回退和用户状态补强 | approved | autoplan 模式覆盖规则；不扩成第二运行时或产品重写 |
| CEO-02 / engineering owner | 公共 main 已有 `deploy/wsl`；archive 与 public main 无 merge-base | 手工从 dirty archive 复制会覆盖公共生产交接 | 从公共 main 建干净候选，逐项移植 rc2、browser-base、CORS、native-first 和 release manifest | approved by current user direction | 仅移植与 rc2 生产路径直接相关内容，不整树覆盖 |
| CEO-03 / release owner | `analytics-workbench/lib` 被 gitignore，service 不构建插件 | 仅发布源码无法保证生产 bundle 一致 | GitHub Release 先上传 tarball，再生成含 tarball asset ID/URL 与 retention 的最终 manifest，随后生成 SHA256SUMS；promotion receipt 记录五类 asset、publication sidecar、最终 hash、operator gate 和现场证据；杭州只接收固定 tag/artifact | approved | 两阶段 manifest/checksum、schema、上传顺序和 receipt 路径已定义 |
| CEO-04 / operations owner | 当前无 GitHub Actions deploy workflow，WSL 运行层为手工 custom deploy | “Release 后自动接收”尚未存在 | 先人工按 release 进行 staging/canary，稳定后再自动化，不把 `git pull` 当发布 | approved by current user direction | 不自动执行生产重启；发布仍需实际授权 |

#### CEO mode handoff

`SELECTIVE EXPANSION`，由 autoplan 的模式覆盖规则选定。保留 rc2 候选、native-first、GitHub release、杭州 staging、现有 hostname operator-only 验证和用户 UAT；只接受与这些路径直接相连的发布 manifest、browser origin/CORS、失败恢复和可观测性补强，产品新功能、第二运行时和真实大库迁移继续留在 PARTIAL/TODOS 边界。

#### CEO selective expansion scan

10x ambition：让一次 GitHub Release 成为开发、集成测试和杭州生产共同识别的不可变候选，任何环境都能回答“运行的是什么、由谁构建、如何验证、失败如何回退”。这比继续手工复制目录更有平台价值，但不改变 DSH 单一 Agent Loop。

Platonic ideal：开发者提交 PR 后，CI 生成带源码、上游、插件 bundle、lock、运行时版本和 checksum 的 release；杭州预发布只提升该 artifact，自动完成配置预检、loopback healthcheck 和 canary 门禁；产品负责人完成真实浏览器 UAT 后才正式提升，旧版本可在固定窗口内一键回退。当前计划先交付同一合同的人工执行版本。

候选及自动决定：

| 候选 | Effort | 决定 | 理由 |
|---|---|---|---|
| Release manifest、bundle checksum、上游/工具链记录 | M | ACCEPTED | 没有它无法证明杭州运行的是测试过的 bundle；属于现有构建和发布路径的直接补强 |
| page browser origin 与 app CORS 适配 | S | ACCEPTED | 生产 page HTTP 的远程浏览器路径会直接失败；属于上线前必要修复 |
| 固定 `DSH_DEV_PAGE_PYTHON` 和依赖导入预检 | S | ACCEPTED | 避免 systemd 依赖不可见 PATH，失败时应在 preflight 暴露 |
| 部署回执、健康检查、canary 和回退证据格式 | M | ACCEPTED | 让消费者故障和运维回退都有可追踪结果，复用现有 healthcheck 和 release 文档 |
| GitHub Actions 自动 SSH/切换杭州生产 | L | DEFERRED | 当前没有稳定的 secret、runner、批准和回退闭环；先完成人工 release 流程再自动化 |
| 真实模型、全格式编辑、P13、完整图谱语义和产品 M1 收口 | XL | DEFERRED | 是产品验收范围，不能混入 rc2 基座升级；继续由 STATUS/TODOS 维护 |
| 第二 Agent Loop 或替换 DSH 运行时 | XL | SKIPPED | 违反上游独立和单一 Agent Loop 边界，不能作为本轮升级方案 |

Delight scan：首屏能明确显示运行版本和来源、错误信息带修复动作、一次失败保留用户草稿、重开会话能回到同一结果引用、页面文档跨域失败能解释原因。这些只在已有路径中补状态和证据，不新增产品模块。

#### Accepted obligations

<!-- autoplan-accepted:ceo -->
- Keep DSH upstream source independent and make native-first ownership explicit; plugin UI/action paths must fail closed to the native loop and never masquerade as native capability. The default product surface keeps native title, sidebar, theme, session and tool contracts; every override is an explicit opt-in with a regression result.
- Require immutable release artifacts, explicit source/upstream/lock/toolchain provenance, checksum and secret/denylist gates, and a receive gate that rejects unverified or mismatched assets. SHA-256 proves byte integrity only; provenance/signature/attestation remains a separately labelled deferred gate and is never implied by a checksum.
- Keep promotion in three explicit modes (`operator-isolated`, `unisolated-cutover`, `internal-only-partial`); without an independently verified operator gate, stop at internal-only and do not call the path canary. Tailscale, Cloudflare Access or mTLS may be used only when the actual route and negative probe prove the gate; a mere hostname or tunnel is not isolation.
- Prove the target WSL2/Node/Python ABI by cold-unpacking the exact artifact on a clean synthetic fixture, and record an rc1→rc2 read/write compatibility matrix for session state, runtime files and WAL. With no migration in scope, incompatible durable state blocks promotion; code rollback never rewrites the database.
- Treat auth, page/CORS, runtime/WAL compatibility, cancel/conflict/unknown receipts and rollback as release-blocking paths with redacted evidence and retained old release. Every mutable user action has one terminal receipt, and unknown outcomes remain recoverable rather than becoming false success.
- Keep one machine-generated promotion record authoritative for state and derive publication/host views from it; if separate manifests or sidecars remain for transport, their hashes, asset identities and states must be cross-checked and retries must be idempotent. Do not add evidence files without a receiving or recovery decision they enforce.
- Label real-model, full-business, M1, persistence and mobile capabilities PARTIAL/NOT_RUN in product and operator surfaces; do not imply infrastructure readiness is product readiness. Unsupported save/export/send actions remain disabled with an explanation.
- Before a pilot, publish a source/public-main functional-difference inventory, RACI with primary and backup owners for build/receive/UAT/cutover/rollback/cleanup, SLI targets and rollback thresholds (auth success, p95 response, 5xx, plugin/native failures, page/CORS and save/recovery). Record observed values in the release evidence instead of claiming them from design.
- Define a bounded operator pilot around one end-to-end CRM analysis scenario, including successful analysis, source/query reference, permission denial, cancel/unknown recovery and rollback drill. Expand access only after the scenario succeeds on synthetic integration data and the product owner records real-business UAT separately.
<!-- /autoplan-accepted:ceo -->


### DX review

原生 DX 审查已完成；Claude Code 外部声音因认证/模型诊断不可用，不计入双声音共识。审查对象是开发者、CI 发布人、杭州 WSL 运维和 QA 四类角色。

主要发现：缺少从干净 checkout 到 hello world 的 Quickstart/TTHW 证据；发布阶段没有稳定的 dry-run/status/why-blocked/retry/rollback 命令合同；错误没有统一的原因、修复动作和 runbook 引用；配置覆盖顺序、状态词汇、ABI/运行时兼容和本地/CI 命令矩阵不够明确。接受这些作为本阶段的机械改进，TTHW 和发布时长只能记录实测值，不能写成设计目标已达成。

DX accepted obligations:

DX dual-voice findings: native and outside reviewers independently identified the same critical gaps: no executable clean-checkout-to-hello path or measured TTHW; no stable CLI/exit-code/offline contract; no cause/fix/docs links for tool failures; no copyable examples or information architecture; incomplete config override boundaries; and no unified synthetic test/recovery/operator-gate commands. Outside review completed through Claude Code; native review completed in-host. No dual-voice item is marked confirmed because the voices differ in detail and the acceptance block records the common mechanical floor.

<!-- autoplan-accepted:dx -->
- Provide one copyable Quickstart from a clean checkout to native hello world, a `release doctor`/diagnose entry, expected output and cleanup; record TTHW as NOT_MEASURED until a real run, and add the same hello-world smoke to CI.
- Reuse one release command surface for local and CI with dry-run, offline/local build, validate, status, why-blocked, retry, resume and rollback-dry-run semantics, stable exit codes, idempotency keys and explicit config precedence (CLI > environment > file > safe default); do not create a second deploy runtime.
- Give every build, asset, publication, receive, operator-gate and rollback failure a stable machine-readable code, cause, recovery action, verification command and linked runbook/example; production safety gates cannot be bypassed by a convenience flag.
- Add a local/CI/target-WSL command matrix, sample manifest/publication/receipt/UAT evidence and a glossary for release and cutover states; use `internal-only-partial` instead of canary when no isolation exists.
- Define pinned toolchain installation and `doctor` checks for Node, pnpm, Python, Docker/WSL and required paths; provide a redacted profile/config example and mark immutable guardrails separately from overridable defaults such as ports, evidence directory, tag and synthetic fixture.
- Provide a thin, discoverable entry (for example `pnpm dsh <dev|test|release|verify|rollback>`) over existing scripts, with `--help` examples and no hidden GitHub credential requirement for local build/schema/secret-scan verification; remote upload/publish remains CI/authorized-only.
- Make recovery executable and inspectable: `preflight`, `promote`, `rollback` and `receipt verify` must dry-run first, show affected paths, support fresh-install and upgrade cases, and record actual host/systemd/route commands in the receipt.
- Provide a synthetic release test orchestrator that prepares and cleans an isolated small database/services, runs the seven UAT groups, and writes PASS/NOT_RUN/PARTIAL plus durations and evidence links to the CI index; add dev-only redacted auth token issue/negative-matrix entry points.
- Add `operator-gate verify --method cloudflare|tailscale|mtls|none` (or an equivalent existing command) that records positive/negative probes and route SHA; document how `none` is derived and keep operator gate, secret scan, denylist, loopback and immutable artifact guards non-overridable in production.
- Record TTHW, release lead time, blocked phase, change-failure rate, MTTR, successful operator sessions and citation/recovery coverage after the first two candidate runs; keep PARTIAL/NOT_RUN labels visible to developers, operators and users.
<!-- /autoplan-accepted:dx -->


### Design review

原生与外部设计审查都确认：本计划虽然没有新品牌页面，但已经规定了可见的登录、原生对话、插件入口、来源引用、禁用动作、取消/冲突/未知回执和 page 错误状态，因此 Design 不能继续标记为 SKIPPED。外部审查完成但未读取磁盘快照，原生审查已读取完整快照；未把缺少双声音的细节写成确认共识。

<!-- autoplan-accepted:design -->
- 本轮保持 DSH 原生首屏和 `--shine-brand off`；任何未来品牌覆盖必须继续使用 `DESIGN.md` 的令牌/字体/可访问性约束并单独回归，不在 rc2 中散改上游或重新设计原生对话。
- 用户层级固定为：认证/入口状态 → 原生输入与流式结果 → 来源/query_ref 证据 → 插件入口与权限状态 → 保存/导出/发送动作；插件入口必须有可见的“插件/业务能力”标识，不能伪装成原生工具。
- `save/export/send` 在当前能力未接通时采用“可见但置灰 + 一行原因 + 可用条件/替代动作”，不能隐藏、不能让用户先完成昂贵分析才首次得知不可用；外部发送确认必须展示目的地、对象、影响范围和可取消出口。
- 认证失败显示不含 token 的明确页面文案（链接已过期/使用过/无效，请重新获取启动链接），而不是让用户停在裸 401；一次性 token 仍只在日志和页面之外处理。
- 长耗时分析显示进行中/已等待状态、取消动作和“不重复点击”提示；原生流式输出、空结果、部分结果、权限中途撤销、断网重连、未知数据和 page 不可用各有可理解文案与下一步 CTA。
- 来源证据在结果块的固定位置显示来源名、时间/范围、`query_ref` 和当前权限可见性；点击/展开查看详情，禁止暴露超出权限的原始 SQL/业务数据。空态提供重新查询或联系管理员，冲突/未知回执提供重试/放弃和草稿恢复入口。
- 页面、插件加载失败和恢复态必须保留原生对话可用性；失败关闭插件能力并说明原因，不把插件异常渲染成原生回答成功。状态/按钮支持键盘焦点、减少动态效果和中文/英文字体回退。
- UAT 以这些固定位置、文案类别、状态和 CTA 验证用户路径；本轮不增加移动端新布局，移动端仍 `NOT_RUN`。
<!-- /autoplan-accepted:design -->


### Engineering review

原生 Eng 审查已完整读取 `eng 693113ee96ec9e1d337a0b27977170b89f9f70f1633a1118000c4d06d6568581` 快照并发现 18 项；外部 Claude Code 审查完成并发现 23 项（其中包含信任根、CORS 授权、token 泄漏、Cookie/TLS 漂移、WAL 兼容和状态机幂等问题）。两边共同指向发布链必须先补安全边界和可恢复状态，不能以“checksum 通过”冒充来源可信，也不能以浏览器 CORS 代替服务端授权。

<!-- autoplan-accepted:eng -->
- 接收端使用非 root 的临时目录解包 tar.zst，拒绝绝对路径、`..`、symlink/hardlink/device、tarbomb、超大文件和超多条目；通过文件数/总大小/权限/owner 限额、恶意归档夹具和原子移动后才进入 release root。
- page HTTP 的 CORS 只作浏览器兼容，不作授权；服务端执行 host/session/CSRF/Origin 校验，loopback 仅绑定内部地址，公网 route 必须有 Access/Tailscale/mTLS 或明确保持关闭。非浏览器、无 Origin、伪造 Origin 和跨租户 scope 均有拒绝测试。
- 一次性 token 采用短 TTL、持久原子消费、并发只成功一次、重启后消费状态保留、签发端点有 owner/审计/限流/轮换；交换后用 POST→303 清除 URL，`Cache-Control: no-store`、`Referrer-Policy: no-referrer` 和 edge/app 日志脱敏，Cookie 采用 host-only、明确 Domain/Path/SameSite，并分别验证 loopback 与 TLS 语义。
- 生产可信链至少绑定 protected tag/branch、reviewed commit、人类批准记录（tag/source/tarball SHA）和 GitHub release `draft=false`/不可变状态；在正式生产前没有 OIDC provenance/签名/attestation 时只能停在 internal-only/operator pilot，不把 SHA256 自校验当作来源证明。
- 以一个 durable `state.json`/journal 记录每个 release phase 的状态、锁、`idempotency_key`、started/committed 时间；按 tag 唯一化、远端 reconcile、按内容 SHA 去重、可安全 resume，崩溃注入和并发调用测试拒绝重复 draft/asset。manifest、publication 和 receipt 的重复字段由生成器机械派生，三路不一致即拒收。
- side-by-side 安装和原子 symlink/env 激活先写临时文件并 fsync；切换前后验证 version/source endpoint，systemd/page/DSH/插件分别声明 owner、artifact/version endpoint 和 restart dependency；任何半完成或健康失败自动恢复旧版本并先后写 receipt。
- 明确 rc1→rc2 只验证 DSH session、B0 SQLite、runtime/WAL 等本轮会触碰的状态文件；对真实 131GB 归档标 `NOT_RUN`。在 synthetic fixture 做旧→新读写、新→旧回读、并发锁、冷启动、回退和进程崩溃测试；失败阻断 promotion，不改真实库。
- 为 mutable action 定义服务端 `action_id`、幂等键、持久 terminal receipt、取消/中止语义、查询/重试窗口和重启恢复；客户端未知结果不推断成功，断网/杀进程/重复点击测试覆盖 save/cancel/conflict。
- 最终 tarball 解包内容执行 secret scan，allowlist/denylist 与内容扫描独立；HTML/自由内容插件若无 CSP + sandboxed iframe + 净化，不得在公网触发，降级为 `disabled/NOT_AVAILABLE`。
- 为 manifest schema、allowlist、URL/size/path/range、unknown fields、时间统一 UTC ISO-8601、版本兼容和 canonicalization 定义 fail-closed 校验；补 malformed/duplicate/size mismatch/asset replacement/force-push tag 负测。
- 把负向 operator probe 的 timeout/网络丢包视为失败，不是通过；定义 p95、5xx、auth、plugin、page/CORS 的 SLI 阈值、探针频率、告警来源和回退条件，15 分钟观察还须满足最小 operator 会话/端到端场景数并记录。
- 统一生产/集成/开发 capability matrix，区分 page 可用、分析可用与保存/持久化可用；所有未接通能力在 UI、manifest、UAT 和文档保持 `PARTIAL/NOT_RUN/NOT_AVAILABLE`。
- 测试矩阵增加状态机、schema、remote reconcile、crash/chaos、非浏览器授权、token/Cookie、XSS/CSP、WSL reboot/suspend、依赖启动竞态、mixed-version、fresh-install/upgrade/rollback 和实际 receipt 可取性；每项写入 CI evidence index。
<!-- /autoplan-accepted:eng -->

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|---|---|---|---|---|---|
| 1 | CEO | 采用 SELECTIVE EXPANSION | Mechanical | 完整性 + 行动偏好 | 在 rc2 交付主线内补齐生产直接缺口，避免第二运行时和产品范围膨胀 | SCOPE EXPANSION、HOLD、SCOPE REDUCTION |
| 2 | CEO | 接受 release manifest/checksum | Mechanical | 完整性、显式优先 | 解决源码和实际 bundle 不一致，直接复用现有构建脚本 | 仅发布源码 |
| 3 | CEO | 接受 browser origin/CORS 与固定 Python | Mechanical | 用户结果优先 | 远程 page、systemd 解释器是上线硬依赖 | 先上线再补 |
| 4 | CEO | 推迟 GitHub 自动部署 | Taste | 可逆、风险最小 | 现有仓库无 deploy workflow，先保留人工审批和回退能力 | 本轮直接新增自动 SSH 部署 |
| 5 | CEO | 推迟产品 M1 和第二运行时 | User direction preserved | 上游独立与范围边界 | 这些工作不属于 rc2 升级，保留 PARTIAL 和 TODOS | 混入本轮候选 |

#### Scope note

当前没有新增 UI 组件或视觉重设计，设计 phase 按 autoplan 规则跳过；用户使用逻辑仍作为 CEO 数据流、错误恢复和 Eng 测试范围审查。计划是 developer-facing system，DX phase 必须运行。

#### CEO spec review loop

Reviewer inputs were fully readable. Quality score: **4/10**, overall **FAIL**.

- Completeness: FAIL. Added explicit auth token exchange, synthetic/real-data boundary, verification evidence paths, fixed rollback record, and disabled/NOT_AVAILABLE semantics for persistence gaps.
- Completeness: FAIL. Added an artifact allowlist/denylist and secret scan so public releases cannot contain env files, credentials, cookies, private教材, real amounts, DuckDB, WAL, runtime or logs.
- Consistency: FAIL. Corrected the mixed product version claim, separated the archive STATUS from the public-main deployment baseline, and made release artifact the only production input.
- Clarity: FAIL. Added manifest fields, SHA-256 verification, owners/thresholds to be completed by Eng, exact browser origin/CORS gate, and host-path verification as a preflight assumption.
- Scope: FAIL. Removed full business UAT and mobile UX from rc2 completion; retained release-level browser UAT and CRM/WeKnora smoke while keeping product M1/real-model work PARTIAL.
- Feasibility: FAIL. Added no-database-migration gate, artifact retention/build responsibility, RC1 SHA capture, WAL/config/route rollback evidence, and explicit distinction between artifact build and production restart.

The loop's findings were factual and directly within the plan blast radius, so autoplan applied them without changing the user's requested native-first and GitHub-release direction.

#### CEO native voice (latest fresh snapshot)

`INPUT: ceo 65c3122c250914d3a271606928dd20f71573947a35b91b4cc5879ff0665585dc` completed. The latest pass reconfirmed the same strategic challenge set and added explicit concerns about production SLI/rollback thresholds, artifact provenance, platform/OCI alternatives, target WSL ABI, and RACI. Verdict: **REVISE**. The reviewer challenged the priority and feasibility assumptions below; these are preserved as user decisions for the final approval gate rather than silently changing the requested rc2/native-first direction.

| Challenge | Severity | Why it matters | Decision state |
|---|---|---|---|
| Make one measurable CRM vertical task (login→question→evidence→plugin→save/receipt) the release outcome, with accuracy/latency/completion metrics and 2–3 operator trials | High | A complete release chain can still ship without a useful end-to-end user result | USER CHALLENGE: final gate |
| Prove a Hangzhou-like WSL contract matrix for rc2/plugin/runtime, absolute Node/Python, token/CORS on loopback and HTTPS | High | Current archive has no production candidate or same-host evidence | Accepted as promotion prerequisite; implementation scope unchanged |
| Preconfigure staging route/service and operator gate before the release reaches deployment | High | Existing Tunnel has no isolation, so service restart is cutover | Accepted as blocking prerequisite; no-gate path remains explicit cutover gate |
| Treat unisolated hostname validation as cutover smoke with explicit thresholds, not statistical canary | High | Fifteen minutes without traffic split is not a canary | Accepted; plan uses `cutover_gate_mode` and no weighted-canary claim |
| Add protected-tag/signature/provenance/SBOM/CVE controls and reproducible archive parameters | High | SHA alone does not prove builder or immutability | USER CHALLENGE: final gate; deferred unless explicitly included |
| Define idempotency, retry, partial upload cleanup, API limit recovery and RACI/SLA | Medium-high | Manual release has operational drift risk | Accepted as Eng implementation detail |
| Run durable runtime/WAL rollback drill and compatibility probe before promotion | High | No schema migration does not prove runtime rollback safety | Accepted as promotion prerequisite |
| Trigger Design review for any user-visible flow change, including plugin discoverability and page/save states | Medium | User-facing paths can change without a visual redesign | USER CHALLENGE: final gate; current phase skipped Design because no new visual scope was detected |
| Add token/Access lifecycle, audit, SLO/resource thresholds and incident handling | Medium-high | Release evidence does not replace runtime operations | Accepted as promotion/operations follow-up |
| Produce file/commit-level migration map from public main/archive/RC1 and compare behavior | Medium-high | Dirty archive has no merge-base with public main | Accepted as candidate-start prerequisite |
| Compare minimal staging/OCI/signed artifact alternatives and define when to adopt full receipt | Medium | Full manual receipt may cost more than the first user pilot | USER CHALLENGE: final gate |
| Define local permission/evidence/accuracy differentiator and upstream compatibility window | Medium | rc3 or a SaaS copilot could outpace an operations-heavy release | USER CHALLENGE: final gate |
| Lock provisional product VERSION when candidate starts; any change invalidates pre-manifest | Medium | Otherwise release_tag and evidence can drift | Accepted as release-build rule |

The accepted mechanical items are carried into DX/Eng review. The five rows marked `USER CHALLENGE` require the product owner to choose at the final approval gate; no production action or release claim is authorized by this plan.

#### CEO dual voices — consensus table

Native in-host review completed on the latest snapshot. The outside Claude Code review was attempted with the prescribed repository boundary but returned `status=unavailable`, authentication failure (`Claude Code authentication failed`, provider diagnostic `unrecognized_model`), so it receives no completion credit. This is absent coverage, not a PASS.

| Dimension | Codex (in-host) | Claude Code outside | Consensus |
|---|---|---|---|
| Premises valid? | Challenged: WSL/plugin/runtime/operator assumptions need same-host probes | N/A | N/A |
| Right problem to solve? | Challenged: add measurable CRM operator pilot before broad product claim | N/A | N/A |
| Scope calibration correct? | Platform candidate is coherent but should be labeled restricted | N/A | N/A |
| Alternatives sufficiently explored? | Compare OCI/attestation/blue-green and smaller pilot | N/A | N/A |
| Competitive/market risks covered? | Upstream rc3/SaaS copilot may outpace release protocol | N/A | N/A |
| 6-month trajectory sound? | Reframe as operator pilot; avoid evidence theater and provenance gaps | N/A | N/A |

`CONFIRMED` is not claimed because outside coverage was unavailable. Native findings stay separate; user challenges are carried to the final gate.

### CEO review sections

#### Current scope and Section 1: Architecture Review

当前采用 `SELECTIVE_EXPANSION`：候选只收纳 rc2 pin、native-first、browser origin/CORS、固定工具链、可审计 artifact、杭州接收/回退和用户路径验证。产品 M1、真实模型、第二运行时、真实大库迁移、自动 SSH/Cloudflare 切流和签名 provenance 仍是待最终审批或 TODOS 的边界；archive 不直接成为生产输入。

系统边界如下，`public main` 是候选基线，archive 只提供已核对的迁移项：

```text
public main ref + rc2 pin + toolchain/lock
        │ 逐文件移植 + 行为/契约检查
        ▼
clean candidate ──► CI build/test ──► five release assets + evidence sidecars
        │                                      │
        │                                      ▼
        │                              GitHub draft → PUBLISHED_VERIFIED
        │                                      │
        ▼                                      ▼
synthetic integration                 Hangzhou receive gate
  ├─ native DSH loop                    ├─ manifest/SHA/publication verify
  ├─ plugin bundle                      ├─ new release directory
  ├─ page/CORS                          ├─ loopback health/UAT
  └─ CRM/WeKnora smoke                  └─ operator-isolated or cutover smoke
                                                     │
                                                     ▼
                                           Cloudflare hostname / rollback
```

核心数据流的四条路径：

```text
Happy: fixed source → clean build → signed-by-checksum assets → receive verify → native/plugin request → redacted evidence
Nil:   absent pin/asset/token → explicit preflight/auth failure → no build/401/blocked receive
Empty: empty plugin bundle/report/query → schema or contract rejection → user sees unavailable/NOT_AVAILABLE
Error: build/API/systemd/CORS failure → typed failure record → retain old release or show recoverable user state
```

发布对象状态机禁止跳跃：

```text
BUILD → DRAFT → TARBALLS_UPLOADED → MANIFEST_FINALIZED → SUMS_READY
      → METADATA_VERIFIED → PUBLICATION_PREPARED
      ├─ PUBLISHED_VERIFIED → HANGZHOU_RECEIVABLE
      └─ RELEASED_UNVERIFIED → blocked, retry publication record
```

用户会话状态机保持原生 loop 合同：

```text
launch → token exchange → HttpOnly cookie → native conversation
                                  ├─ plugin action → result/query_ref
                                  ├─ 401/permission → explain + retry/renew
                                  ├─ cancel/conflict/unknown → draft + explicit recovery
                                  └─ service/page error → no false success + old-release/retry path
```

禁止的状态转换是 `BUILD → production`、`DRAFT → Hangzhou`、`RELEASED_UNVERIFIED → receive`、`operator_gate_method=none → operator-isolated` 和 `NOT_AVAILABLE → saved`. Schema、publication sidecar、receive gate、用户回执分别阻止这些转换。新增耦合集中在 release generator、GitHub asset API、杭州 evidence root 和现有 Tunnel；这些都是发布边界的必要耦合，不能侵入 DSH upstream。十倍负载首先会压到单机 DSH/CRM、page HTTP、磁盘/WAL 和人工 UAT；百倍负载需要独立服务/队列与容量设计，本轮只要求明确阻断与观测，不宣称已扩展。单点故障是单个杭州主机、Cloudflare Tunnel、GitHub Release 权限和单一发布 owner；旧 release、loopback、不可变 checksums 与 receipt 提供回退，但不消除这些单点。

每个生产集成的最小失败情形均有处理：GitHub API 部分上传保留 draft 并按 asset 名称/幂等键重试；systemd/Node/Python 失败保留旧 release；CORS/page 失败自动关闭 page HTTP；CRM/WeKnora smoke 失败阻止 promotion；Tunnel 无 operator gate 时切换为 `unisolated-cutover` 或停在 `internal-only-partial`。回滚目标是已记录的旧 checkout、RC1 upstream、env、runtime 与 route 配置，恢复后重新跑 healthcheck 和最小 UAT；数据库/WAL 不在本轮迁移。

Decision gate：接受上述边界和状态机；签名/attestation、真实业务指标和新公网隔离机制仍保留为最终用户挑战，不在此处默认扩大。

#### Section 2: Error & Rescue Map

本节按具体 codepath 记录异常，不使用 catch-all 作为证明：

| METHOD/CODEPATH | WHAT CAN GO WRONG | EXCEPTION CLASS | RESCUED? | RESCUE ACTION | USER/OPERATOR SEES |
|---|---|---|---|---|---|
| manifest state machine | wrong phase, absent asset, schema mismatch | `StateTransitionError` / `SchemaValidationError` | Y | stop, keep draft, write redacted error | release blocked with phase |
| GitHub upload | timeout, 429, partial asset | `TimeoutError` / `RateLimitError` / `AssetUploadError` | Y | idempotent retry with backoff; clean only owned draft asset | retryable publish status |
| SHA verification | changed bytes, wrong name/size | `ChecksumMismatchError` | Y | quarantine asset, never publish/receive | old release retained |
| secret/denylist scan | token, env, real data match | `SecretScanError` | Y | fail build, delete untrusted artifact, rebuild | no release created |
| token exchange | expired/replayed/foreign token | `AuthError` subclasses | Y | return 401, issue no cookie, redact log | renew launch URL |
| page/CORS | wrong origin, preflight or page service failure | `OriginError` / `PageHealthError` | Y | disable page HTTP or rollback | page unavailable reason |
| plugin/native action | malformed/empty/refusal/timeout result | `PluginContractError` / `TimeoutError` | Y | bounded retry or explicit unavailable state; preserve native loop | no false success |
| systemd/healthcheck | port, interpreter, dependency or service crash | `ServiceHealthError` | Y | keep/restore old release, record exit code | service unavailable |
| operator probe | positive/negative probe mismatch | `OperatorGateError` | Y | set `internal-only-partial` or authorized cutover smoke | no pre-cutover claim |
| rollback | old runtime/WAL incompatible | `RollbackCompatibilityError` | Y | stop, preserve evidence, escalate; no data rewrite | blocked recovery |

Every rescue writes attempted action, release/request id, owner and next action. AI responses distinguish malformed JSON, empty output, refusal and invalid claims; none is swallowed. Unknown receipt, conflict and cancel return a recoverable state with draft retention. Decision gate: no unrescued high-impact path is accepted; unresolved runtime compatibility remains a promotion prerequisite.

#### Section 3: Security & Threat Model

| Threat | Likelihood | Impact | Mitigation / remaining proof |
|---|---|---|---|
| token leaks in URL/log/chat | Medium | High | one-time exchange, HttpOnly/Secure/SameSite cookie, redaction and negative matrix; verify in both loopback/HTTPS |
| non-operator reaches existing hostname during cutover | High with current Tunnel | High | require independent Access/Tailscale/IP/mTLS gate or classify as `unisolated-cutover` with pre-authorized switch; negative probe is mandatory |
| asset replacement or wrong tag | Medium | High | protected tag, publication sidecar, five asset hashes and receive gate; signature/provenance remains user challenge |
| secret/private data in tarball | Medium | High | allowlist, denylist, secret scan, synthetic-only boundary; scan report must be non-zero blocking |
| path traversal/unsafe archive | Low-Med | High | schema/name allowlist, extract to new release root, reject absolute/parent paths; implementation test required |
| plugin privilege escalation/IDOR | Medium | High | native permission contract, user/role-scoped IDs, no direct object trust, auth negative tests |
| page CORS origin abuse | Medium | High | exact `https://app.tyuan.chat` allowlist, credentials behavior tests, page off on failure |
| prompt/LLM injection or invalid claims | Medium | Medium-High | treat tool output as untrusted, schema validate, source/query_ref required, refusal/invalid JSON paths |
| release evidence exposes PII | Low-Med | High | redacted CI index and logs, no real DuckDB/WAL/amounts, evidence review before upload |

New release endpoints are operator/CI scoped; production receives read-only assets, and user actions remain session/role scoped. Secrets stay in host env/Access policy, never manifest or bundle. Audit fields include actor, authorization reference, release id, route SHA and response codes. Signature/SBOM/CVE controls are deliberately recorded as a final-gate user challenge, so SHA-only integrity is not overstated as provenance.

#### Section 4: Data Flow & Interaction Edge Cases

The release data path is explicit:

```text
source/pin → validate ref/lock → build bundle → scan/manifest
  → upload draft assets → verify bytes/schema → publication sidecar
  → receive to new root → preflight/health → UAT → operator gate or cutover smoke
```

Nil/empty/wrong-type paths reject at the nearest boundary: absent SHA blocks build, empty bundle blocks release, malformed manifest blocks receive, absent token returns 401, empty query results retain a no-data state, and unknown save receipts never become success. Archive extraction rejects parent paths and unexpected files. For mutable actions, the invariant is “one user action has one visible receipt”; idempotency key and CAS/conflict status prevent duplicate writes.

Concurrent save/cancel schedule:

```text
User A: submit(k) ── await server ── receipt success
User B: cancel(k) ── await server ── cancel response
Shared:  PENDING ────────────────► exactly one terminal state
```

Both completion orders must be tested. The server owns the terminal transition by idempotency key/CAS; the client renders the returned state and never infers success from a timeout. Double-click, refresh, navigate-away, stale result, permission revoke, duplicate retry, zero/large result, encoding error and backlog each have a row in the UAT ledger; absent persistence remains disabled/NOT_AVAILABLE. Decision gate: controlled pause/release tests are required for overlapping cancel/save and unknown receipts.

#### Section 5: Code Quality Review

The design reuses `scripts/dsh-dev`, `dsh-plugins/*/build.mjs`, `toolchain.json`, public-main `deploy/wsl`, existing healthchecks and the B0 pipeline. It must add one release generator plus schema files rather than a second deploy runtime; the generator should keep phase transitions as named functions and typed error classes, with archive naming/path validation in a small pure module. Avoid duplicating checksum/JSON redaction logic already present in diagnostics. The public-main-to-candidate migration list must bind every copied file to one test or evidence item; no hidden archive copy is allowed. Before implementation, require a complexity check for the state machine and a dry-run against a clean checkout; no code is yet claimed complete.

#### Section 6: Test Review

```text
unit: schemas/path/allowlist/redaction/state transitions
integration: clean build + plugin/native + page/CORS + auth + synthetic CRM/WeKnora
system: draft upload/publication sidecar/receive/rollback on WSL fixture
browser E2E: launch → native → plugin → evidence → save/unknown/cancel/reopen
operator probes: positive identity + unauth/non-operator negative + route SHA
chaos: partial upload, 429, corrupt tarball, absent Python, port collision, page off, WAL lock
```

Happy-path tests assert exact version/upstream/source, bundle digest, native branding off, 401 before exchange, HttpOnly cookie after exchange, query_ref/source visibility, and `PUBLISHED_VERIFIED` before receive. Failure tests assert draft retention, no production directory mutation, no false save, no token/log leakage, old release retained, and explicit `PARTIAL/NOT_RUN`. Edge tests cover nil/empty/wrong type/oversized paths, Unicode/HTML injection, double-click and both completion orders. The Friday 2am test is a clean candidate to a synthetic WSL receive and rollback; hostile QA corrupts one asset and removes one operator permission; chaos kills upload or service at every state boundary. Tests requiring real model, full business formats, full graph and mobile remain `NOT_RUN/PARTIAL` and are not converted into release proof.

#### Section 7: Performance Review

The release path is infrequent and dominated by tarball hashing/upload; stream hashes rather than loading archives in memory, cap archive size, and write evidence incrementally. Runtime hot paths remain DSH/CRM/page calls; collect p50/p95/p99 latency, request timeout, CPU/memory, disk and WAL watermarks in the integration/production checklist. No new database query or worker is authorized, so N+1/index/job claims are not invented; if plugin actions add a frequent query, the Eng phase must add a query plan and bounded connection-pool budget. At 10x, GitHub API limits and single-host CPU/disk are first risks; at 100x, this architecture requires queueing/replicas and is outside rc2.

#### Section 8: Observability & Debuggability Review

Every release phase logs structured `release_id`, phase, asset name/size/SHA, actor and outcome without secrets. Metrics include build failures by phase, asset retry/429 counts, receive rejection reason, healthcheck exit code, auth 401/replay counts, page CORS failures, plugin/native action latency, 5xx rate, CPU/memory/disk/WAL and rollback count. Operator evidence records positive/negative probe response codes, route config SHA, release tag/source SHA and a 15-minute observation interval; a no-gate path records `cutover_gate_mode=unisolated-cutover` or `internal-only-partial`. Alerts are blocking for checksum/secret/publication mismatch, service unhealthy, auth/CORS regression, unexpected 5xx or disk/WAL threshold. Runbooks map each Failure Modes Registry row to owner, receipt field and recovery command reference; a three-week-later incident can reconstruct source, upstream, asset, route and UAT state.

#### Section 9: Deployment & Rollout Review

There is no schema/data migration in rc2, so rollout is artifact-first: verify immutable assets and publication sidecar, preflight the actual host, install a new release directory, keep durable runtime untouched, run loopback health/UAT, then follow the two explicit cutover branches. With an isolated staging service: `internal UAT → positive/negative operator probes → authorization → service promotion → hostname observation`. Without isolation: `internal UAT → pre-authorized service restart + cutover smoke → 15-minute observation → retain or rollback`; this is one cutover point and must not be called canary. The first five minutes check systemd, ports, auth, page/CORS and native/plugin paths; the first hour checks observation evidence, logs, resource/WAL thresholds and user UAT. Rollback restores recorded old refs/env/runtime and re-runs health/UAT; durable runtime/WAL compatibility drill is a promotion gate and unresolved until evidence exists.

#### Section 10: Long-Term Trajectory Review

The plan introduces operational debt (manual release owner, evidence sidecars, schema upkeep) but keeps DSH upstream independent and makes future automation possible. Reversibility is **4/5** for code/artifact promotion and **2/5** for an unisolated public cutover; no database migration and retained RC1 improve recovery. A new engineer needs the plan, schema files, `deploy/wsl` diff, evidence index and receipt to understand the path; the candidate must add a file/commit migration map and a runbook before release. Phase 2 can add protected tags/signatures, SBOM/CVE/provenance, automated staging and metrics; Phase 3 can add weighted canary/automatic promotion only after access, runner and rollback drills are proven. The platform value is a reusable release/evidence contract for future plugins, while real business correctness and upstream compatibility remain the leading indicators. The rejected expansions (second runtime, real data migration, automatic public cutover) are correctly outside this rc2 candidate; native CEO challenges on product metrics, provenance and alternative OCI delivery remain final-gate decisions.

## Implementation Tasks

Synthesized from CEO、DX、Design 与 Eng 审查的已接受发现。以下任务是实现 backlog；复选框只在实际交付和证据完成后勾选。

- [x] **T1 (P1, DONE)** — Candidate baseline — 固定 public-main ref、rc2 upstream、产品 VERSION 与 archive→candidate 功能差异清单
  - Surfaced by: CEO/Eng — dirty archive 与 public main 无 merge-base，生产不能直接消费 archive
  - Files: `STATUS.md`, `docs/plans/`, `deploy/wsl/`, release evidence templates
  - Verify: clean checkout migration map；逐项记录 source commit、upstream SHA、VERSION、owner 与对应验证证据
- [x] **T2 (P0, DONE — public receive gate; current aggregate 78/78 isolated tests)** — Artifact receive — 实现安全解包、allowlist/schema fail-closed、大小/条目/权限限制和最终 tarball 内容扫描
  - Surfaced by: Eng — 拒绝绝对路径、`..`、symlink/hardlink/device、tarbomb、超大归档与恶意权限
  - Files: `scripts/release/`, `scripts/release/schemas/`, `deploy/wsl/`
  - Verify: path traversal、duplicate、size mismatch、secret/denylist、symlink/权限和 scan failure fixtures 全部阻断；`pnpm dsh receive` 对 synthetic artifact 的历史接收证据保留；当前 allowlist packed-artifact regression 已补入 release tests；历史证据见 `docs/release/dsh-rc2-candidate/archive/t2-receive-gate-20260926.md`
- [ ] **T3 (P0, PARTIAL — loopback HTTP adapter synthetic PASS; browser/host NOT_RUN)** — Auth boundary — 完成一次性 token 的原子消费、TTL/限流、host-only Cookie、POST→303、CSRF/Origin 与日志脱敏
  - Surfaced by: Eng — CORS 不是授权；并发兑换、重放、Referer/history/access-log 泄露必须 fail-closed
  - Files: `deploy/wsl/`, page auth/token endpoint、auth tests、runbooks
  - Verify: valid/expired/replayed/concurrent/foreign-origin/non-browser matrix；loopback 与 HTTPS 的 Cookie 行为均有证据
- [ ] **T4 (P0, PARTIAL — protected evidence/OIDC/publication PASS; protected-ref negative tests NOT_RUN)** — Release trust — 保护 branch/tag、绑定 reviewed commit 与人工批准；保留 provenance/签名证据，否则固定为 internal-only/operator pilot
  - Surfaced by: CEO/Eng — SHA 只证明字节完整性，不证明构建来源
  - Files: `.github/workflows/`, release schemas/generator、release runbook
  - Verify: force-push、未保护 tag、release state 与 provenance 的负测仍需补齐；当前 r3 的 protected evidence/OIDC/publication workflow 已成功，杭州仍必须拒绝 `RELEASED_UNVERIFIED`
- [ ] **T5 (P1, PARTIAL — journal/reconcile/crash/stale-lock synthetic PASS; promotion statePath/tag history now covered; remote CI NOT_RUN)** — Release state machine — 引入 durable state/journal、锁、`idempotency_key`、远端 reconcile、resume 与 crash recovery
  - Surfaced by: Eng — 上传、publication、receipt 中断或并发调用不能留下重复 draft/asset
  - Files: `scripts/release/dsh-manifest.mjs`, state store、schemas、CI tests
  - Verify: 每个 phase 可恢复；重复 tag/asset、429、进程杀死和并发执行都保持幂等且可审计
- [ ] **T6 (P1, PARTIAL — owner-bound scripts/readiness synthetic PASS; shared host-control and mandatory statePath covered; service/host NOT_RUN)** — Promotion/rollback — side-by-side release、fsync 后原子 symlink/env 激活与服务 ownership/restart dependency
  - Surfaced by: Eng — 代码、env、systemd、page、插件和 receipt 不得半切换或混用版本
  - Files: `deploy/wsl/`, systemd units、promotion/rollback scripts、receipt schema
  - Verify: 切换前后 version/source endpoint 一致；每个故障点均可恢复旧 release 并完成健康检查
- [ ] **T7 (P1, PARTIAL — synthetic fixture PASS; WSL2/ABI NOT_RUN)** — Compatibility/host gate — 在目标 WSL2 + Docker + systemd 冷环境验证 Node/Python ABI、rc1→rc2 session/runtime/WAL 读写与回退
  - Surfaced by: CEO/Eng — 无 schema migration 不等于 durable runtime 可回退
  - Files: `scripts/release/compat/`, `deploy/wsl/`, synthetic fixtures、CI matrix
  - Verify: old→new、新→旧、冷启动、锁、重启、磁盘不足与损坏恢复；失败阻断 promotion，真实 131GB 库保持 `NOT_RUN`
- [ ] **T8 (P1, DEFERRED BY D1 — keep native fallback and `disabled/NOT_AVAILABLE`; full action contract NOT_RUN)** — User action contract — 为 save/cancel/conflict/unknown 定义服务端 `action_id`、幂等键、终态 receipt、重试/放弃与 capability matrix
  - Surfaced by: Eng/Design — 客户端超时不能推断成功，未接通保存/导出/发送必须显示 `NOT_AVAILABLE`
  - Files: action API、native/plugin adapters、browser UAT、capability docs
  - Verify: 双击、断网、杀进程、权限撤销、两种完成顺序和刷新重开均保留草稿及可恢复状态
- [ ] **T9 (P1, PARTIAL — ephemeral probe/synthetic scheduler PASS; route/15m/real HTTP 10x NOT_RUN)** — Operator gate and capacity — 实现正负身份探针、route SHA、SLI 阈值、15 分钟最小场景数与 10x backpressure 测试
  - Surfaced by: CEO/DX/Eng — hostname/tunnel 不是隔离；timeout 不能算负探针通过
  - Files: `deploy/wsl/operator-gate`, health/metrics scripts、synthetic release orchestrator
  - Verify: `operator-gate verify --method ...` 写入证据；p95/5xx/auth/plugin/page 阈值、慢客户端、断线和资源上限可复现
- [ ] **T10 (P1, PARTIAL — CLI/config synthetic PASS; cold host/TTHW NOT_RUN)** — Developer workflow — 提供 Quickstart、`doctor`、`pnpm dsh <dev|test|release|verify|rollback>`、dry-run/offline/status/why-blocked/retry/resume 与稳定退出码
  - Surfaced by: DX — 当前 TTHW 未测量，开发/CI/WSL 需要同一命令契约和配置优先级
  - Files: `package.json`, `scripts/dsh-dev/`, `scripts/release/`, `docs/operating/`
  - Verify: clean checkout 从 hello world 到 synthetic release；CLI/env/file/default precedence 与错误 runbook 均可复制
- [ ] **T11 (P1, PARTIAL — evidence/HTML synthetic PASS; public/browser gate NOT_RUN)** — Evidence and content safety — 生成不可变、脱敏、可长期读取的 CI/publication/promotion/rollback evidence；无 CSP/sandbox/净化的 HTML 插件公网关闭
  - Surfaced by: CEO/Design/Eng — hash 不保证证据可读取，自由 HTML 可能成为 XSS 入口
  - Files: `.context/release-evidence/`, schemas、plugin loader/page HTTP policy、retention docs
  - Verify: evidence index 可取、SHA 对齐、敏感字段扫描 fail-closed；插件降级为 `disabled/NOT_AVAILABLE` 时 native loop 仍可用
- [ ] **T12 (P2, PARTIAL — seven-group/RACI/metrics/cleanup contracts synthetic PASS; UAT NOT_RUN)** — UAT and operations — 固化七组 release-level UAT、RACI/备份 owner、failure-mode runbook、TTHW/lead-time/MTTR 指标与清理回执
  - Surfaced by: CEO/DX/Design — 生产判断需要可执行证据、未运行项必须保留 `PARTIAL/NOT_RUN`
  - Files: `docs/operating/`, `.context/release-evidence/`, `CHANGELOG.md`, cleanup receipt template
  - Verify: 一次 CRM 分析 operator pilot 含成功、权限拒绝、取消/unknown、回退演练；旧版本只清理本任务拥有且已过稳定窗口的对象
- [x] **T13 (P1, DONE)** — Plan consistency — 修正旧 completion summary 中 `Design phase: SKIPPED` 与已完成设计审查的冲突，并让 accepted decision ledger、实施状态与最终报告一致
  - Surfaced by: Autoplan close verification — 当前计划尾部仍保留过时的 Design skipped 文案
  - Files: `docs/plans/dsh-rc2-environment-promotion.md`
  - Verify: `rg` 不再出现与实际 review coverage 矛盾的 summary；最终 report 与 review log 状态一致

## Worktree parallelization strategy

The implementation has four disjoint lanes after T1 fixes the candidate baseline. Shared release schemas, evidence contracts and `deploy/wsl` are merge-conflict points and must be merged in order.

| Step | Modules touched | Depends on |
|---|---|---|
| Lane A — artifact trust and receive | `scripts/release/`, release schemas, CI workflows, evidence generator | T1; T2 before T4/T5 |
| Lane B — auth and user action contract | page auth/token endpoint, native/plugin adapters, browser UAT, capability docs | T1; T3 before T8 |
| Lane C — Hangzhou promotion and compatibility | `deploy/wsl/`, systemd units, operator gate, compatibility fixtures, rollback scripts | T1; T2/T5 before T6/T7/T9 |
| Lane D — developer workflow and runbooks | `package.json`, `scripts/dsh-dev/`, `docs/operating/`, RACI/UAT templates | T1; consumes contracts from A–C |

Execution order: launch Lane A and Lane B after T1; launch Lane C once artifact schemas and auth boundaries are stable; merge A/B/C into the candidate; then complete Lane D, run the full synthetic release orchestrator, and perform Eng/review/CI gates. Do not parallel-edit shared schema files or the same `deploy/wsl` unit. T13 is a documentation-only repair and can land after the review record is frozen, before the final release candidate.

## Prior GSTACK REVIEW REPORT (historical)

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| CEO / spec | 用户要求从开发、测试到杭州生产建立完整工作流 | 需要先锁定边界、原生优先和用户结果 | Native completed；outside attempted but unavailable（认证/模型诊断） | REVISE | 12 项战略/边界问题；已接受候选基线、operator pilot、SLI、RACI、无隔离不得称 canary 等约束 |
| Design | 认证、原生对话、插件、page、保存/恢复均属于用户可见状态 | 需要避免插件覆盖原生和不可用动作伪装成功 | Native completed；outside Claude Code completed（未读取磁盘快照，不作完整证据） | REVISE | 12 项交互/可访问性问题；已锁定 native shell、层级、证据、禁用文案、长耗时/取消/冲突/恢复状态 |
| DX | 计划包含本地构建、CI、Release、杭州接收与回退命令 | 开发者、发布者、运维和 QA 必须有同一命令合同 | Native completed；outside Claude Code completed | REVISE | 共同暴露 Quickstart、doctor、稳定退出码、dry-run/offline、错误 runbook、配置优先级、synthetic orchestrator 和 operator-gate verify 缺口 |
| Engineering | 计划涉及 artifact、认证、状态机、WSL、systemd、回退和容量 | 这些边界若不落地会造成安全绕过或半发布状态 | Native completed: 20 issues；outside Claude Code completed: 23 issues | ISSUES OPEN | 两路在 6/6 工程维度重合；P0/P1 已收纳为 T2–T12，正式生产仍被安全解包、token/CSRF、来源信任、持久状态机、原子激活、兼容性和 SLI/operator gate 阻断 |

### Outside Coverage

- CEO outside voice：未完成，原因为 Claude Code 认证/模型诊断失败；不计入完成或共识。
- Design outside voice：完成，但明确未读取本地快照；仅作为外部挑战输入，不把它当作完整磁盘证据。
- DX outside voice：完成，通过 Claude Code；与原生审查共同识别 DX 机械缺口。
- Engineering outside voice：完成，通过 Claude Code；与原生审查共同识别发布信任、认证、状态机、兼容和回退缺口。

### Cross-model coverage

Eng 的 native 与 outside 两路均完成，6/6 维度（artifact trust、auth/page boundary、durable release state、atomic promotion/rollback、state/host compatibility、operator/test evidence）均有交集，未出现直接矛盾；外部意见只在实现粒度上更严格。CEO 因 outside 不可用不宣称共识；Design 因外部未读快照不宣称完整共识；DX 的共同问题已落入 accepted obligations，但细节仍需实现验证。

### Completion summary

- Step 0: Scope Challenge — scope accepted as selective expansion；保持 DSH 单一 Agent Loop、native-first 与固定 rc2，不扩第二运行时、真实大库迁移或自动 SSH 切流。
- Architecture Review: 12 项战略/边界问题，已转入候选基线、artifact、杭州接收和回退门禁。
- Code Quality Review: 11 项发布/认证/状态/归档安全问题，已转入 T2–T8、T11–T12；本候选已落地 synthetic contract，现场/远端 gate 仍未完成。
- Test Review: 已产出单元→集成→系统→浏览器→operator→chaos 分层矩阵，至少 13 个实施任务；真实模型、完整业务、131GB 归档、移动端均保持 `NOT_RUN/PARTIAL`。
- Developer experience: Quickstart、doctor、统一 dsh CLI、offline/status/resume/why-blocked 已落地；Node24 冷环境与 TTHW 仍 `NOT_RUN/NOT_MEASURED`。
- Plan state: `IMPLEMENTATION_PARTIAL / RELEASE_BLOCKED`。T1/T2/T13 文档、基线与本地 artifact receive gate 已完成；T3–T12 的合同、脚本或合成夹具已部分落地，但对应现场/远端执行证据仍为 `PARTIAL/NOT_RUN`；不能把合同存在写成 gate 已通过。证据见 `scripts/release/` 与 `docs/release/dsh-rc2-candidate/`。
- Current execution: 已建立 public-main rc2 候选并完成 T1、T2、T13；PR #83/#84/#85 已合并到 main，产品版本为 `0.19.0.0`；T3–T12 的实现骨架、WSL artifact 脚本、Quickstart、evidence verifier 和 operations ledger 已落地，但不是完整 gate 通过。PR #84 后的 artifact 快照已完成本地 build/receive/doctor，但后续文档提交使其失效；最终 artifact 必须在固定 reviewed SHA 后重新生成，证据保存在仓库外。GitHub tag/release、杭州重启/切换、Cloudflare route 和旧版本删除仍未执行。

### Verdict

**REVISE — 计划可以进入实现排期，不能据此宣布 rc2 已发布或杭州已部署。** 当前候选已完成 T1、T2、T13；T3–T12 的实现骨架或合成合同部分落地，但 auth/trust/state/promotion/compatibility/action/operator/UAT operations 的执行证据仍保留 `PARTIAL/NOT_RUN`，安全审查与现场门禁尚未闭合；下一步是固定 Node24 冷 checkout、接 CI provenance/受保护 tag、做 WSL2 冷验证、operator gate 和七组 UAT；只有 release 进入 `PUBLISHED_VERIFIED`、杭州 receive receipt 完整、兼容性和回退演练通过，才讨论现有 hostname 的正式切换。没有 OIDC/provenance/signature 或没有真实 operator 隔离时，最高状态保持 `internal-only-partial`/operator pilot。

**UNRESOLVED DECISIONS:**

- 产品负责人是否在正式生产前纳入 OIDC provenance、签名、SBOM/CVE 与受保护 tag；未决定前默认只允许 internal-only/operator pilot。
- PR #84 后的历史候选 SHA 为 `a9da916170be67f9a2bb8a79a8060163d7d8b563`，当前产品 VERSION 为 `0.19.0.0`；该快照已完成本地 build/receive，但后续 main 提交使其失效。最终 reviewed SHA、发布 owner、GitHub provenance、tag/release 仍待 T4；最终 artifact digest 以仓库外不可变 manifest 为准。
- 杭州现场可用的 operator gate 是 Cloudflare Access、Tailscale、mTLS/IP allowlist 还是 `none`；`none` 时是否接受一次有明确授权的 unisolated cutover。
- 杭州目标机的真实 WSL2、Docker、systemd、Node、Python、路径、权限和 Cloudflare route 事实；需由 T7/T9 的冷验证与负探针给出证据。
- 一个 CRM operator pilot 的最小场景数、p95/5xx/auth/plugin/page 阈值及产品 owner 的真实业务 UAT 结论。
- T13 的 Design summary 已修正；RACI、稳定窗口和旧版本清理仍需杭州现场 owner/授权后落定。
- 以上决定和 P0/P1 任务均关闭前，不得把 GitHub Release、杭州接收或旧版本删除描述为已完成。

## 2026-09-30 当前执行覆盖（收尾）

本节覆盖前文在候选尚未发布时的状态描述；前文 review、历史测试和任务复选框不回写。当前事实以 [r3 收尾记录](../release/dsh-rc2-candidate/closeout-20260930.md) 为准：

- `dsh-0.19.0.0-r3` 已由 reviewed source `32abb00b…` 生成并发布为 immutable GitHub Release；preflight、protected evidence/OIDC 和 publication workflow 均通过。杭州 `current` 已原子指向 r3，DSH/CRM/B0 loopback smoke 通过。
- T2/T13、本地 artifact contract、publication/activation 证据已具备；这不关闭产品级 T3–T12。r3 durable journal/reconcile、浏览器/真实模型 UAT、rc1↔rc2 WAL、operator gate/15 分钟 SLI、10x backpressure、真实 save/export/send 与 rollback drill 继续保持 `PARTIAL/NOT_RUN`。
- r3 immutable source tarball 不含 `node_modules`；runtime bundle 包含固定 upstream `node_modules` closure，但插件工作树的 peer scope 链接未随 source 包提供。本次杭州安装后手工生成了 8 个 `@deepseek-ai` peer links；自动生成该链接的安装器修复在本地提交 `3fdf1efc`，未 push，因此下一次 release 需要审查、合并并从新 SHA 重建 artifact。
- CRM backend immutable image、Python 3.14 wheel 包和 runtime-binding receipt 是杭州 sidecar，不是当前 GitHub Release 的资产。若要求“一个 Release 包含全部生产输入”，需另开修复任务，不能通过修改已发布 immutable Release 达成。
- 生产 `release-state.json` 仍是旧 r1 journal；r3 的 active receipt 是现场事实，不能把旧 journal 自动改写成 r3 状态。rollback wrapper 只切 symlink/写 receipt，不恢复 env/runtime/image 或重启服务，本次没有执行回退演练。
- 当前无 open PR；本地 `3fdf1efc` 提交未 push。本节不授权 push、tag、Release 修改、旧版本删除或再次生产切换。

## 2026-09-30 plan-eng scope decisions

- **Feature scope:** T8 完整 `action_id`/save-export-send 合同延期；本轮保留原生对话回退以及 `disabled/NOT_AVAILABLE` 能力矩阵，不宣称未接通动作可用。
- **现场 scope:** T9 采用 Tailscale operator 正负探针、synthetic 10x backpressure 与 15 分钟内部场景；不改 Cloudflare route、不读取真实 131GB DuckDB。
- **Operations scope:** T12 本轮执行最小 synthetic operator pilot，包含 7 组 UAT、RACI/指标、取消/unknown 恢复和 rollback 证据。
- **Structure:** 采用较小的四个控制面模块：`release-control` 统一 artifact/state/evidence；`deploy/wsl` 统一 host activation/rollback；backend 保持 action 边界；`pnpm dsh` 与文档只作薄适配。上述结构不减少已确认的安全、测试、兼容性或回退合同。
- **Artifact boundary:** DSH、CRM 镜像、Python wheels 与 runtime binding 保持独立 artifact，但 CRM/Python/runtime digests 必须进入同一 release manifest 和 receive gate；不把真实数据或大镜像强行打进每次 DSH 小版本包。
- **Compatibility gate:** 接通真实 pinned rc1/rc2 runtime/session/WAL synthetic runner；矩阵失败阻断 promotion，真实 DuckDB 仍保持 `NOT_RUN`。
- **State gate:** durable journal/state、远端 reconcile、`statePath` 传递和 env/runtime/CRM/service ownership 回退演练均为 release-blocking。
- **Pending remedies:** T3–T12 的具体实现缺口、GitHub/OIDC provenance 是否纳入、杭州 route 是否保持 `none`，均在后续工程评审中单独解决。

## 2026-09-30 plan-devex review

### Developer Perspective

**Product type:** CLI + release platform. The primary developer is the individual enterprise-project maintainer who builds on a Mac, prepares GitHub evidence, and operates the Hangzhou Windows/WSL host through Tailscale. Tolerance for unexplained steps is low because the same person owns code, artifact, service ownership, rollback and the release decision.

**Approved clock:** from a clean worktree and known toolchain to a reviewable immutable candidate: current trajectory 12–25 minutes locally; remote host acceptance is measured separately. The local `verify --scope local` hello-world result should be a short green path, but it never substitutes for the release gate.

**Empathy narrative:** The maintainer is not only writing code. They must align Node, Python, the pinned DSH runtime, plugin peer links, manifest, GitHub evidence, Tailscale, WSL and CRM ownership before an internal team can use a small feature. Today those checks are spread across scripts, documents and remote state. A local test can be green while the Release has no sidecar or Hangzhou still points at an older checkout, so the maintainer repeats build, upload and diagnosis work. The desired path is one preflight that exposes environment blockers early, one immutable artifact that every environment receives, and one receipt that makes PASS, BLOCKED or UNKNOWN obvious. A failed attempt must retain the old release and say whether the cause is artifact integrity, permission, service ownership, compatibility or rollback evidence.

### Competitive DX benchmark

The clock is deliberately not a warm-cache command timer. Public documentation confirms command boundaries, but does not provide equivalent human measurements; peer times below are estimates and are not claims about this repository.

| Tool | Start → useful result | Time/evidence | DX choice | Source |
|---|---|---|---|---|
| GitHub CLI | Existing tag/assets → immutable Release | 2–5 min estimate from official command path | `gh release create` verifies tag, uploads assets and can fail on no commits | [gh release create](https://cli.github.com/manual/gh_release_create) |
| Vercel Git/CLI | Connected project → preview URL | 2–5 min estimate from official setup path | Preview per push, hosted build and instant rollback | [Vercel deployments](https://vercel.com/docs/deployments/overview) |
| Fly CLI | App directory → deployed instance | 5–10 min estimate from official launch/registry path | CLI creates deployment config, but host/volume/release-command semantics remain visible | [Fly registry/deploy](https://www.fly.io/docs/blueprints/using-the-fly-docker-registry/) |
| This project | Node24/Python3.14/runtime bundle/clean tree → candidate + evidence | 12–25 min current estimate; local evidence inspected, host evidence separate | Offline artifact generation, fail-closed receive, durable receipt and explicit rollback | `docs/operating/dsh-rc2-quickstart.md` |

The selected target is the current trajectory, not a promise to hide safety work behind a two-minute command. The selected magical moment is **one traceable artifact receipt**: the same SHA, manifest, sidecar digests, journal phase and remote receipt are visible from local candidate through receive/verify/reconcile, with the old release retained on failure.

### Developer journey map (DX TRIAGE)

| Stage | Developer does | Evidence-backed friction | Accepted disposition |
|---|---|---|---|
| Install | Read README, select Node24/pnpm/Python, run doctor | README still described RC1/“not released”; doctor omitted runtime, Python and dirty-tree readiness | DX1 updates the entry; DX2 adds read-only `doctor --release` |
| Hello World | Run verify, preflight, release and receive on synthetic/isolated inputs | `verify` mixed synthetic PASS with release exit 2; preflight had one-line help and no phase visibility | DX3 separates local/release scopes; DX4 adds preflight check/events/codes |
| Real usage | Receive exact artifact, reconcile receipt and activate under owner gate | Required host/state/rollback evidence remains an engineering release blocker | T3–T12 gates; no new DX expansion in TRIAGE |
| Debug | Inspect stable code, journal and runbook | Existing codes are useful but statePath/remote receipt and phase context are incomplete | Engineering blockers plus DX2/DX4; verify with failure fixtures |
| Upgrade | Compare pinned DSH/runtime and run compatibility fixture | DSH 0.2.0 and full migration guide are outside this candidate | Explicitly deferred; preserve rc1 and add later migration work |

### First-time developer confusion report

```text
T+0:00  README says Release/Hangzhou install is not executed and RC1 is active; STATUS/closeout say otherwise.
T+0:30  doctor shows four PASS lines but does not mention Python, pnpm, runtime bundle or clean tree.
T+1:00  verify shows synthetic compatibility/backpressure PASS, then exits 2 with RELEASE_BLOCKED; the scope is unclear.
T+2:00  preflight help is one line; the real command will run online prepare/build/runtime steps without phase markers.
T+3:00  the maintainer must manually connect runtime path, manifest, sidecars and remote receipt to answer whether the same SHA reached Hangzhou.
Final   Code may be healthy, but the maintainer pauses for document and state archaeology instead of shipping.
```

### Review passes and scorecard

The Hall of Fame reference file was unavailable in the installed skill bundle, so these scores use the inspected repository evidence and the approved DX TRIAGE scope. Scores are current behavior → expected plan state; they are not production acceptance.

| Dimension | Current | After accepted plan | Finding |
|---|---:|---:|---|
| Getting Started | 4/10 | 7/10 | Stale README and uncovered readiness checks block the first session |
| API/CLI | 5/10 | 7/10 | Thin facade exists; scope and state semantics need clearer defaults |
| Error messages | 4/10 | 7/10 | Stable codes exist, but phase/cause/recovery context is incomplete |
| Documentation | 4/10 | 7/10 | Quickstart is useful but README and current runtime facts conflict |
| Upgrade path | 3/10 | 3/10 | DSH 0.2.0 migration is explicitly outside rc2 |
| Developer environment | 5/10 | 7/10 | Node24 is pinned; Python/runtime/zstd checks need one read-only gate |
| Community | 2/10 | 2/10 | Internal personal project; no community surface is required this round |
| DX measurement | 4/10 | 6/10 | SLI exists; TTHW and blocked phase need durable evidence fields |

**Overall:** 4/10 current, 6/10 after the accepted scope. **Competitive tier:** Needs Work, with a deliberate 12–25 minute candidate clock. **Mode:** DX TRIAGE. The local hello-world path can be short after DX3, while release readiness remains evidence-bound.

### What already exists

- `pnpm dsh` is a discoverable facade with `doctor`, `test`, `preflight`, `release`, `receive`, `reconcile`, `verify`, `rollback`, `status`, `why-blocked`, `retry` and `resume`.
- `docs/operating/dsh-rc2-quickstart.md`, `docs/reference/dsh-rc2-release-artifact.md`, `docs/operating/dsh-rc2-runbook.md` and `docs/operating/verification.md` already separate local, CI, host and real-data evidence.
- Release commands reject dirty worktrees, absent runtime bundles, reused evidence directories, malformed manifests and unsafe archives with stable machine-readable codes.
- Synthetic compatibility/backpressure and operator-gate evaluators already fail closed when real evidence is not provided.
- The chosen work reuses these contracts and keeps DSH upstream, CRM and real DuckDB outside the default local path.

### Explicitly not in scope

- Full T8 save/export/send action contract: deferred by D1; native fallback and `disabled/NOT_AVAILABLE` remain required.
- DSH `0.2.0-rc.2` migration: future upgrade work needs its own pinned runtime/session/WAL comparison and rollback proof.
- A synthetic runtime that could be mistaken for a production candidate: rejected by D9.
- One-command automatic Hangzhou cutover, route changes or service restart: requires separate authorization and host evidence.
- Community, hosted playground, cross-language SDKs and full Real Usage/Debug/Upgrade DX polish: outside DX TRIAGE.

### DX implementation checklist

- [x] README/Quickstart gives a three-step path to `doctor --release`, local verify and immutable candidate preparation (local docs validation PASS).
- [x] `doctor --release` is read-only and reports every release prerequisite with a stable code and recovery command (runtime not provided/dirty tree BLOCKED as expected).
- [x] `verify --scope local` returns 0 only for local contracts; default/release remains fail-closed (local PASS, release exit 2).
- [x] Real preflight exposes check, phase, artifact path and failure cause without secrets or business data (read-only check covered; formal build NOT_RUN).
- [x] The selected preflight evidence carries TTHW, phase timings, retry count and evidence coverage (synthetic contract PASS; formal online run NOT_RUN).
- [ ] StatePath, runtime/WAL runner, sidecar digest binding, streaming hash and full rollback remain release blockers until their engineering evidence is complete.

### Implementation tasks from this review

- [x] **DX1 (P1, IMPLEMENTED — docs PASS)** — README and docs entry — align current rc2 facts and the copy-paste install path. Files: `README.md`, `docs/README.md`, `docs/operating/dsh-rc2-quickstart.md`. Verify: fresh reader reaches `doctor --release` without RC1/“unreleased” contradictions.
- [x] **DX2 (P1, IMPLEMENTED — readiness PASS/BLOCKED)** — doctor readiness — add read-only `doctor --release` checks and stable remediation codes. Files: `scripts/dsh.mjs`, `scripts/release/readiness.mjs`, CLI tests, Quickstart/reference. Verify: absent toolchain/runtime/clean-tree inputs fail before build and never touch real data.
- [x] **DX3 (P1, IMPLEMENTED — local PASS/release BLOCKED)** — verify scope — add `verify --scope local|release` while preserving the default release gate. Files: `scripts/dsh.mjs`, CLI tests, Quickstart/reference. Verify: local PASS exits 0; release with host evidence not provided exits 2.
- [x] **DX4 (P1, IMPLEMENTED — check PASS/BLOCKED; formal build NOT_RUN)** — preflight observability — add `--check`, phase events, artifact paths and interruption/partial-output codes. Files: `scripts/release/preflight.mjs`, `scripts/release/readiness.mjs`, CLI tests, Quickstart/reference. Verify: errors surface before network/build and logs are redacted.
- [x] **DX5 (P2, IMPLEMENTED — synthetic evidence PASS; formal run NOT_RUN)** — DX measurement — persist TTHW, phase timing, retry and evidence coverage in `release-preflight.json`. Files: release evidence module and preflight runner. Verify: one evidence record can reconstruct the selected 12–25 minute candidate clock once formal preflight runs.

## GSTACK REVIEW REPORT

### Combined review status

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | not requested | No product-scope review in this run | 0 | SKIPPED | User asked for engineering and DevEx plan review only |
| Outside Review | explicit self-review preference | Independent reviewer was intentionally disabled for this task | 0 | SKIPPED | Aside unavailable; no outside completion credit |
| Eng Review | stable `0.1.7-rc.2` delivery plan | Architecture, state, rollback, compatibility, tests and performance | 1 | REVISE | 78/78 local tests pass; host/state/WAL/rollback/sidecar evidence remains release-blocking |
| Design Review | release-control plan | No UI redesign requested | 0 | N/A | Outside DX TRIAGE scope |
| DX Review | CLI/release onboarding and delivery path | Remove first-run blockers without weakening fail-closed release gates | 1 | ISSUES_OPEN | 4/10 current → 6/10 after accepted plan; TTHW target remains 12–25 min for a candidate |

**OUTSIDE COVERAGE:** explicitly skipped by the user; Aside was unavailable. No outside reviewer was used and no uncovered area is counted as a pass.

**VERDICT:** ENG REVIEW REQUIRED. The plan is coherent but release-blocked until the engineering evidence listed below is executed. DX TRIAGE decisions D1–D9 are resolved and the five DX tasks are recorded in `docs/hackathon/TODOS.md`; implementation and host evidence remain pending.


### Target and review context

- Target: `docs/plans/dsh-rc2-environment-promotion.md` on `codex/release-evidence-download-fix`.
- Goal: define a fast, repeatable and reversible delivery path for DSH `0.1.7-rc.2`; DSH `0.2.0-rc.2` remains a separate future candidate.
- Evidence read: `DESIGN.md`, current release/closeout records, `scripts/release/`, `deploy/wsl/`, `scripts/dsh.mjs`, toolchain bindings, current tests and plan history.
- Current local verification: `PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH pnpm dsh test` → **78 passed, 0 failed**; `git diff --check` → pass. This does not close host, browser, WAL, operator or rollback evidence.
- External voice: skipped because the user previously explicitly requested self-review without an independent reviewer. Aside was unavailable; no external web result is used as acceptance evidence.

### Scope decisions and disposition

- D1: defer the full T8 save/export/send action contract; keep native fallback and visible `disabled/NOT_AVAILABLE` behavior.
- D2: execute Tailscale positive/negative operator probes, synthetic 10x backpressure and a 15-minute internal scenario without Cloudflare changes or real DuckDB access.
- D3: execute the minimum synthetic operator pilot with seven UAT groups, RACI/metrics and rollback evidence.
- D4: use four control planes: `release-control` for artifact/state/evidence; `deploy/wsl` for host activation/rollback; backend keeps action boundaries; `pnpm dsh` and docs stay thin adapters.
- D5: make one durable state source plus complete env/runtime/CRM/service rollback release-blocking.
- D6: connect a real pinned rc1/rc2 runtime/session/WAL synthetic runner; compatibility failure blocks promotion.
- D7: keep DSH, CRM image and Python wheels as separate artifacts, but bind all immutable digests in the same manifest and receive gate.
- D8: replace whole-file digest reads with streaming hash and bounded-size tests.

### Scope Challenge findings

1. **[P1] (confidence: 10/10) stale completion wording could turn a contract into a passing gate.** The previous summary said “T3–T12 的本地合同/synthetic gate 已完成” while the current closeout records T3–T12 as `PARTIAL/NOT_RUN`. The summary now distinguishes implementation skeletons from executed evidence. No release decision may rely on the old wording.
2. **[P0] (confidence: 10/10) split promotion state can bypass the journal.** `scripts/release/promotion.mjs:268` accepts `statePath` and only records at `:298` when it is provided, while `deploy/wsl/rollback-release.sh:12` invokes `rollbackRelease` without it. D5 makes state propagation, reconcile and complete rollback a release blocker.
3. **[P1] (confidence: 10/10) compatibility acceptance is not wired to a pinned runtime reader.** `scripts/release/compat-check.mjs:5-8` returns `NOT_RUN` when `runtimeRunner` is absent, and `scripts/release/compat.test.mjs:13-25` only mutates synthetic JSON. D6 requires a real isolated pinned runner before promotion.
4. **[P1] (confidence: 9/10) the peer closure was discovered after deployment.** `docs/release/dsh-rc2-candidate/closeout-20260930.md:30-34` records eight manually created peer links and says the installer repair `3fdf1efc` is outside r3. The next artifact must include the reviewed installer fix and prove a clean-host install without manual links.
5. **[P1] (confidence: 9/10) sidecar drift is currently possible.** The closeout says CRM/Python/runtime-binding inputs are not Release assets (`closeout-20260930.md:10-11`). D7 retains independent lifecycles but requires sidecar digests and compatibility metadata in the same manifest/receive gate.
6. **[P1] (confidence: 9/10) duplicate upstream pins can drift.** `dsh-plugins/analytics-workbench/toolchain.json:4-13` is the toolchain source of truth, while `scripts/dsh.mjs:33-38` independently checks a literal pin. The four-control-plane structure moves pin loading and release decisions behind one release-control contract.
7. **[P1] (confidence: 9/10) artifact hashing has an avoidable memory spike.** `scripts/release/artifact.mjs:16-19` reads the whole file before hashing. D8 requires streaming hash with the existing receive byte limits preserved.

### 1. Architecture review

The approved architecture is a single release control plane with projections to host and GitHub state:

```text
clean Node24/Python3.14 checkout
  -> release-control: build + manifest + state/journal + reconcile
  -> immutable DSH source/runtime artifacts
  -> sidecar digest bindings (CRM image / Python wheels / runtime receipt)
  -> GitHub publication and evidence
  -> deploy/wsl: secure receive -> side-by-side install -> atomic activation
  -> systemd/page/CRM ownership checks
  -> Tailscale operator gate -> seven-group synthetic pilot
  -> authoritative receipt + retained rollback target
```

The state flow must have one owner:

```text
state.json/journal (authoritative)
  -> publication projection
  -> host activation projection
  -> promotion/rollback receipt
  -> status/resume/why-blocked
```

Architecture verdict: the four-control-plane arrangement is smaller and safer than the original scattered 13-task arrangement, provided the following invariants are implemented together: `statePath` is mandatory for mutating release operations; manifest, publication and host receipt are projections of the journal; sidecar digests are checked before activation; rollback restores every owner listed in the marker; and unknown remote outcomes stop rather than retrying blindly.

### 2. Code quality review

- Reuse decision: keep `state.mjs` as the journal primitive and `reconcile.mjs` as the side-effect-free comparison helper. Existing first-party callers are `scripts/dsh.mjs:10-11` (`readState`, `reconcileState`, `resume`) and `scripts/release/promotion.mjs:5` (`recordEvent`). The new `release-control` facade should wrap, not duplicate, these contracts.
- Reuse decision: keep `artifact.mjs` as the single allowlist/hash/receive primitive. `scripts/dsh.mjs:7-9` and `scripts/release/promotion.mjs:4,74-100` already consume its outputs; moving hash/manifest logic elsewhere would recreate the current drift.
- Required cleanup: remove the duplicated inline Node invocations in `deploy/wsl/activate-release.sh:12` and `rollback-release.sh:12`, replace them with a shared release-control entry that always receives `statePath`, owner and restart dependency. Expected implementation movement is roughly 8–12 shell lines removed, 40–70 facade lines added, and 80–120 contract/integration test lines added; the net code count may grow, but the number of state owners decreases.
- Required cleanup: make `scripts/dsh.mjs` load the pinned toolchain contract instead of repeating the upstream SHA at `:33-38` and `:74`. Keep command parsing thin and move release decisions to the facade.
- Error handling that remains mandatory: state journal conflict, unknown remote receipt, absent sidecar digest, stale lock, runtime peer-root absence, service owner mismatch, and rollback health failure must all return stable machine-readable codes and preserve the old release.

### 3. Test review

Detected framework: Node built-in `node:test` through `pnpm dsh test`; project B0/backend checks remain separate commands documented in `docs/operating/verification.md`.

Coverage map from the reviewed code and current tests:

```text
CODE PATHS                                                USER FLOWS
[+] scripts/dsh.mjs release/receive/verify                [+] Clean checkout -> offline build
  ├── [★★ TESTED] option/config precedence                ├── [★★ TESTED] doctor/help/version
  ├── [★★★ TESTED] dirty/absent-runtime rejection         ├── [GAP→E2E] exact tag receive on clean WSL
  ├── [★★★ TESTED] schema/checksum/payload checks          ├── [GAP→E2E] peer closure + plugin import
  └── [GAP] sidecar digest + final publication gate       └── [GAP→E2E] rollback after service failure
[+] scripts/release/state.mjs/reconcile.mjs               [+] Release state recovery
  ├── [★★★ TESTED] phase order and journal integrity      ├── [★★★ TESTED] crash -> UNKNOWN -> resume
  ├── [★★★ TESTED] idempotency/conflict/remote drift      ├── [GAP→E2E] statePath through WSL scripts
  └── [GAP] active host projection and env restore         └── [GAP→E2E] old/new runtime readback
[+] auth-http/operator-gate/backpressure                  [+] Operator access
  ├── [★★★ TESTED] token/Origin/CSRF/cookie negatives      ├── [★★★ TESTED] synthetic positive/negative probe
  ├── [★★ TESTED] synthetic scheduler backpressure        ├── [GAP→E2E] real Tailscale positive/negative probe
  └── [GAP] 15-minute real HTTP SLI samples                └── [GAP→E2E] 15-minute internal scenario
[+] compat-check/local-verify                             [+] Compatibility
  ├── [★ TESTED] NOT_RUN fail-closed behavior              ├── [GAP→E2E] pinned rc1 -> rc2 -> rc1 fixture
  ├── [★ TESTED] synthetic JSON mutation                    └── [GAP→E2E] WSL2 cold ABI/runtime/WAL
  └── [GAP→EVAL] real runtime/session/WAL readers

Coverage: 15 named code/user paths; 9 have unit/synthetic evidence, 6 remain host/E2E gaps.
Quality: ★★★:8  ★★:3  ★:2  | Gaps: 6 (all release-blocking for the affected claim).
```

Required proof to add alongside implementation:

- **CRITICAL unit/integration:** make `statePath` mandatory in activation/rollback wrappers; assert journal and receipt agree after activate, failure and rollback.
- **CRITICAL integration:** run the pinned runtime/session/WAL reader fixture in both directions, cold start and crash recovery; do not substitute JSON-only mutation.
- **CRITICAL host E2E:** install the exact immutable source/runtime artifact on a clean WSL fixture, verify peer closure, Node/Python ABI and service ownership, then perform side-by-side activation and rollback.
- **CRITICAL operator E2E:** Tailscale positive identity probe, unauthenticated/non-operator negative probe, 10x real HTTP backpressure and a 15-minute SLI ledger. Timeout is failure/`NOT_RUN`, never negative success.
- **CRITICAL operations E2E:** seven rows (`auth`, `native`, `plugin`, `page`, `crm`, `weknora`, `recovery`) with owner, timestamps, evidence reference and explicit `PASS/PARTIAL/NOT_RUN/FAIL` status.
- **Deferred:** T8 full save/export/send action contract and DSH `0.2.0-rc.2` compatibility are not part of this candidate.

### 4. Performance review

- D8 closes the largest avoidable release-time memory risk: stream SHA-256 reads and keep receive `max-bytes`/entry limits. Add interruption and large synthetic file tests.
- `runBackpressure` intentionally retains per-request results in memory (`scripts/release/backpressure.mjs:3,9`). This is acceptable for the selected synthetic 10x run, but the host runner must cap retained evidence to aggregates plus a bounded sample; do not turn it into an unbounded production load tool.
- The 15-minute SLI evaluator (`scripts/release/operator-gate.mjs:28-37`) correctly refuses short windows, but the host collector must record real observation timestamps, p95, 5xx, auth, plugin and page failures. Scheduler-only results remain synthetic evidence.
- No real DuckDB query, copy, migration or WAL access is required for this candidate. CRM API smoke must use its owning HTTP service and synthetic/approved bounded probes.

### Required execution order after this review

1. Land/review the local peer-link installer fix and rebuild a fresh immutable artifact from the reviewed SHA.
2. Introduce the four-control-plane facade; make `statePath` mandatory and extend rollback to env/runtime/CRM/service owners with idempotent receipts.
3. Add the pinned rc1/rc2 runtime/session/WAL fixture and fail-closed promotion gate.
4. Add sidecar digest bindings to manifest/receive checks and switch artifact hashing to streaming.
5. Run Node24 local gates, clean-host cold install, Tailscale positive/negative probes, synthetic 10x and 15-minute internal SLI, then the seven-group operator pilot.
6. Reconcile the authoritative journal with the active host receipt. Any conflict, unknown outcome or evidence not provided keeps the release blocked and retains the old release.
7. Only after all release-blocking evidence is complete should a separately authorized GitHub push/tag/release or Hangzhou cutover be considered.

### Review verdict

**REVISE / RELEASE_BLOCKED.** The plan is now coherent and intentionally smaller, but `0.1.7-rc.2` is not yet a stable delivery candidate because state/journal integration, real compatibility runner, complete rollback, sidecar digest binding, streaming artifact verification, Tailscale/SLI evidence and the operator pilot remain to be executed. The local contract suite is green at 78/78; that is a useful gate, not a production sign-off.

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Engineering | Stable `0.1.7-rc.2` delivery plan | Validate boundaries, state, rollback, compatibility and host gates | Native plan review | REVISE | StatePath, runtime runner, sidecar binding and rollback are release blockers |
| Code quality | Four-control-plane structure | Remove duplicated pins and shell entrypoints | Native source audit | REVISE | Reuse `state.mjs`/`reconcile.mjs`; thin `pnpm dsh` facade |
| Tests | Release, auth, operator and host paths | Separate synthetic evidence from host/E2E claims | Native test audit | REVISE | 78/78 local; WSL/Tailscale/WAL/rollback gaps remain |
| Performance | Artifact and backpressure paths | Avoid memory spikes and false capacity claims | Native performance audit | REVISE | Stream hashing; bound retained backpressure evidence |

### Completion summary

- Approval readiness: **PASS** — engineering D1 through D8 were explicitly answered by the user; accepted scope, structure and release-blocking remedies are recorded above.
- Saved test plan: `/Users/hutou/.gstack/projects/tyuanww-fuqing-crm-analytics/root-codex-release-evidence-download-fix-eng-review-test-plan-20260930-125124.md`.
- Local evidence: `pnpm dsh test` 78/78; `git diff --check` pass.
- Outside coverage: skipped by explicit user preference; Aside unavailable.
- Product and real-data boundary: product remains `PARTIAL`; real DuckDB, real model, full browser UAT, WSL2 compatibility, Tailscale SLI and rollback remain `NOT_RUN` until the required execution order runs.
- Next review action: implement the listed release-blocking work, then run `/qa` against the saved test plan before any separately authorized `/ship` or deployment action.

### DevEx completion summary

- Persona: individual enterprise-project maintainer owning Mac build, GitHub evidence, Tailscale/WSL receive, CRM/DSH ownership and rollback.
- Product type/mode: CLI + release platform / DX TRIAGE.
- Approved clock: 12–25 minutes from clean worktree and known toolchain to candidate; remote host acceptance measured separately.
- Selected vehicle: one traceable artifact receipt spanning candidate, manifest, sidecars, journal, receive, verify and reconcile while retaining the old release on failure.
- Accepted decisions: D6 README entry, D7 `doctor --release`, D8 `verify --scope local|release`, D9 preflight `--check` plus phase/error events; DX1–DX5 all added to `docs/hackathon/TODOS.md`.
- Current local evidence: Node24 `pnpm dsh test` 82/82; focused promotion/state and CLI tests pass; `pnpm dsh verify --scope local` returns 0 while default/release remains exit 2 because WSL2/WAL/15-minute SLI/host HTTP evidence is not run; `git diff --check`, shell syntax and Node syntax checks pass. Formal online preflight and remote host evidence remain NOT_RUN.
- Upgrade and community polish are explicitly deferred; no DSH upstream source, real DuckDB, production host or remote release was changed.

NO UNRESOLVED DECISIONS
