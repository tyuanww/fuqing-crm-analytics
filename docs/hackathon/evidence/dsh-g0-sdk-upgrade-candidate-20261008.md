# T15：官方 DSH 升级候选与供应链核验（2026-10-08）

## 本轮结果

基线 `68845ad0dfce2737d5e7b017916f16d4c8ec5255`。**没有官方可用修复候选，依赖修复被上游 release 状态阻塞。** 本轮重新读取 GitHub、npm、OSV 原始响应；没有借用上轮查询或测试结果充当本轮通过。现用 `0.1.7-rc.2 / 477b4f420553e8a52c2fbccc464d7561b239c443` 保留，未改工具链、锁、上游源码、旧 SDK 或 candidate/journal。

证据根目录：`.context/checks/sdk-upgrade-candidate-20261008/`。`run-summary.json` 记录完整 UTC / Asia-Shanghai 查询时间、覆盖和运行边界；`evidence-index.json` 记录文件摘要。请求从 **2026-10-08 01:23:04 +08:00** 开始，最后一次公共读取为 **2026-10-08 01:38:11 +08:00**；各原始响应和请求日志保留精确时间。本轮只写该新目录和本文；工作树中并行任务的改动不属于本报告。

## 官方发布状态与锁

[官方 GitHub releases](https://github.com/deepseek-ai/deepseek-harness/releases) API 完整返回 **25 releases / 26 tags**，两个列表均没有下一页。高于现用 pin 的三个 release 均实际读取 tag → 完整 commit → package.json / pnpm-lock.yaml / pnpm-workspace.yaml：

| 官方 tag | 完整 SHA | 发布 UTC | 当前相关锁结果 |
|---|---|---|---|
| `dsh-v0.2.1-alpha.1` | `5badb15009ae1756c3afe0ae0cef1faafc290ccc` | 2026-10-03 06:42:19 | 原七版本仍全部存在，另有 undici 6.28.0 |
| `dsh-v0.2.0-rc.2` | `639ed015397290b3745d163aafe02ffee4aa3f84` | 2026-09-29 09:42:36 | 同上 |
| `dsh-v0.2.0-rc.1` | `4878cdabd87d4041bdaff61d04c966883b9fd07a` | 2026-09-28 12:36:21 | 同上 |

最新 alpha 的固定锁 SHA-256 为 `2893d71a9ef07d2d72d47b2199e581b9e8d90638a15ee151908eebf69dfc637c`，packageManager 仍为 `pnpm@11.7.0`。依据：[该固定 commit 的锁](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/pnpm-lock.yaml)、`release-summary.json`、`lock-matrix.json`、`requests-official.json`。

本轮也读取官方仓库元数据与默认分支。默认分支是 **master**，当前 SHA 正好等于上述 alpha SHA，锁字节相同；没有发现默认分支领先 release 的修复 commit。先请求 `/commits/main` 得到 422，失败留在 `requests-compatibility.json`，随后依据仓库 `default_branch` 查询，未猜测或执行浮动分支。见 `requests-default.json`、`default/`。

[npm 官方 CLI 索引](https://registry.npmjs.org/%40deepseek-ai%2Fdsh) 实际列出 **30 个版本**：`alpha=0.2.1-alpha.1`，`latest=next=0.2.0-rc.2`；按发布时间没有更晚版本。alpha npm 发布时间为 `2026-10-03T04:53:22.343Z`，与 GitHub release 发布时间分别记录。见 `npm-release-index.json` 和 `registry/dsh-packument.json`。npm 的 `latest` 不是 GitHub 最新预发布，未将二者混用。

## 当次公告查询

OSV 一次批量查询 **15 个精确版本**：锁内八个版本和七个依赖修复候选；15/15 返回完整结果，没有 `next_page_token`。另读取全部 **29 条不同公告**的完整原文。原七版本仍为 40 个版本/公告对；计入完整官方锁的 undici 6.28.0 后为 43 对，去重仍是 29 条。这是选定依赖的查询，未冒充全锁 SBOM 扫描或业务可利用性验证。

| 依赖 | 官方候选锁版本 | 公告数（逐版本） | 本轮存在且查询为 0 公告的精确修复候选 |
|---|---|---:|---|
| fast-uri | 3.1.3 | 8 | 3.1.8 |
| js-yaml | 4.2.0 / 4.3.1 | 3 / 1 | 4.3.2 |
| KaTeX | 0.16.47 | 1 | 0.18.2 |
| source-map-js | 1.2.1 | 1 | 1.2.2 |
| undici | 6.28.0 / 7.28.0 / 8.10.0 | 3 / 15 / 11 | 6.28.1 / 7.29.1 / 8.10.2 |

依据：`osv/batch.json.request.json`、`osv/batch.json`、`osv/GHSA-*.json`、`security-summary.json`、`requests-security.json`。修复候选的 npm 精确版本元数据也实际读取并核验签名；这些包存在不等于官方 DSH 已采用它们。未对官方锁做 override、手工重算或替换。

## 来源、签名与尚未关闭的身份条件

- 最新 alpha 的 Git tree 未截断，共 16,225 条。读取的 **77 份官方源码/清单/升级文档**和三份根输入，全部按 Git blob 算法重算并匹配该固定 tree；三份根输入另存 SHA-256。见 `requests-compatibility.json`、`requests-slots.json`、`root-source-verification.json`。按 commit 地址请求 tree 的顶层 SHA 曾回显 commit，最终核对拒绝后，改读 commit 明确引用的 tree `a9d30743edbe97adac9c8cb0811b648a0d9f6660`，规范 tree 身份匹配且全部条目与前次一致；失败和补证见 `finalize-first-attempt.json`、`requests-canonical-tree.json`。这是字节与固定源码身份的关联。
- 本轮读取 **42 个精确 npm 版本**：八个受影响版本、七个依赖修复候选、26 个 SDK binding 包和官方 CLI。使用当次 npm 公钥验证 **79 个签名**，签名与篡改负测全部通过。签名内容绑定名称、版本、integrity。见 `registry-verification.json`、`verify-registry.log`。
- source-map-js 1.2.1 使用历史公钥，先因缺少发布时间无法判定而拒绝；补读官方 packument 后核实发布时间 `2024-09-08T16:22:55.645Z` 早于 key 的 `2025-01-29T00:00:00.000Z` 到期日，再验证签名，未绕过到期检查。首次失败和补证分别留存。
- 下载两个精确官方 npm 压缩包用于纯字节核验：`@deepseek-ai/dsh@0.2.1-alpha.1` SHA-256 `857f93aa6c85cbd92be3422380e5516f236dc5c49cda0405a958cbdf1865e8db`；`@deepseek-ai/dsh-tools@0.2.1-alpha.1` 为 `b8a47518f2a64907b907a466b29f888f269a532003d4825ac371a305a34e49f9`。两者实际 SHA-512 均匹配签名所绑定的 npm integrity；只在内存读取 package.json，名称/版本/exports 与元数据一致，没有解压到安装目录或执行。
- **作者/构建者身份仍未关闭。** GitHub 返回四个检查 commit 均为 `verified=false / reason=unsigned`；27 个 SDK/CLI npm 精确元数据均没有 gitHead，26 个 binding 没有 dist.attestations。虽然 26/26 npm/source 清单的名称版本、main/types、exports 一致，不能据此证明 npm 编译产物由该 commit 构建，也不能把 registry 签名当作作者签名。见 `npm-source-manifest-matrix.json`。完整依赖组成、撤销、最终 SDK 分发签名和不透明内容的执行安全仍是独立开放项。

## 静态兼容矩阵与实际拒绝探针

`bindings-matrix.json` / `bindings-matrix.md` 覆盖现用 **26/26** bindings，每项记录路径、旧/新版本、main/types、exports 差异、当前实际引用的文件行号。26 个名称和路径保留，main/types 路径全部不变；本仓扫描到的 **29 个 SDK import specifier** 均仍由候选 exports 覆盖。这不证明导出符号和调用语义兼容，也不替代编译。

| 接口或硬约束 | 当次证据 | 升级影响 |
|---|---|---|
| SDK 版本 | 25 个 DSH bindings 变为 0.2.1-alpha.1；cordis 从 4.0.2 到 4.0.5-alpha.1 | 当前 toolchain 的精确 SHA/锁/SDK 版本检查应继续拒绝新身份，不能仅改宿主环境变量 |
| 插件 peer | 9 个插件仍精确依赖 DSH 0.1.7-rc.2；crm-knowledge、knowledge 另精确依赖 cordis 4.0.2 | 官方候选的 plugin-compatibility 仍按 peer 范围核对；须在未来候选副本更新并验证，不能添加兼容例外放行 |
| profile | 实际导入现仓 validateProfile，两个现有 profile 均通过；在内存换为 alpha 身份均拒绝 `PROFILE_DSH_PIN_MISMATCH` | 四个断言实际通过，未修改 profile 文件。`profile-probe.json` / `.log`；首次脚本相对 import 路径错误单独留证，修正后重跑 |
| invariant | agent、llm、session、tools、commands、ui-renderer 共六个 binding 删除 `./invariant` | 本仓当前 SDK 引用和两个业务 profile 未引用这些入口；未来外部 overlay / SDK-minimal 配置需按官方指南清除旧项，未盘查用户运行目录 |
| 子路径清单 | 9 个业务包没有 `<subpath>/package.json` export，现 profile 读取的是包根 package.json | [官方迁移指南](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/upgrade-guide/v0.2.0-rc.2/subpath-plugin-display-manifest/guide.md)明确包根清单仍使用；不能为此删除现 profile 的根清单检查 |
| 实际 slot | `slots-matrix.json`：12 个实际注入名称；11 个上游 slot 的 kind/scope 均保留，cockpit.crm 由业务插件声明和提供 | 包括 conversation.input.dock、conversation.composer.dock、main、shell.overlay、sidebar.right.pane.tab 等；未运行界面，不认证生命周期或渲染兼容 |
| composer stats | [官方 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.1)声明拆成 activity/usage；本仓实际 slot 注入未替换 stats | 当前未发现需要迁移的 stats 注入；新导出和 slot 名存在不构成浏览器回归通过 |

## 最小后续入口与未运行范围

下一次应从官方新 release 的**完整 SHA 与原始锁**重新开始，在新 owned 目录保存与本轮相同的 release/tag/npm/OSV 门槛证据；首先确认上述旧版本已从所需 SDK/宿主依赖闭包移除或被官方修复版本替代。当前默认 master 同样未修复，没有可直接采用的“已修复未发布 commit”。无需在已知未修复的 alpha 上重装来重复证明相同阻塞。

出现可用官方候选后，独立复制 plugin-kit 和消费者到新 owned 目录，仅在该副本登记候选完整 SHA/锁摘要/SDK 版本/实际 managers，复用 `dsh-plugins/plugin-kit/prepare.mjs` 的 fresh HOME/store、固定 manager、冻结锁安装与官方 SDK-only build；现用 kit 仍固定旧 pin，不能直接让其接受新 SHA。安装前补齐候选执行所需的来源证据和明确尚未关闭的身份条件。随后按真实编译结果调整 peer/bindings，验证 YAML/Ajv/HTTP/Markdown、26 bindings、12 slot 合同、两 profile 与跨平台消费者；KaTeX 跨次版本和 cordis 变化单独验证。候选验证通过后才另行讨论切换，不能把 profile 拒绝或未声明兼容当作需要删除的安全检查。

本轮实际命令为 `python3` 执行 `fetch-official.py`、`query-security.py`、`fetch-compatibility.py`、`fetch-npm-sdk.py`、`fetch-slots.py`、`analyze-compatibility.py`、`analyze-slots.py`；固定 Node 24.19.0 在禁网 sandbox 内运行 `verify-registry.mjs`、`probe-profile.mjs`。补充默认分支、npm版本索引与 tar 内清单检查的请求和结果分别留存。所有脚本位于上述证据根目录，网络请求使用公共 CA 并保留 TLS 校验。

**NOT_RUN：候选依赖安装、编译、SDK 消费者运行、宿主/浏览器兼容、真实模型或业务 UAT、完整 release pipeline、远端 CI、发布/部署。** 本轮没有执行下载代码、启动服务或访问生产数据。来源核验及静态接口核对的通过不解除 29 条公告导致的升级候选阻塞，现用 SDK 分发仍 BLOCKED，产品仍 PARTIAL。
