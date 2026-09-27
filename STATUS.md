# 项目状态 (Project Status)
> 当前短表；编年与旧运维事项见 [STATUS-HISTORY.md](docs/history/STATUS-HISTORY.md)。本页是当前运行与交付边界的 SSOT。

## 当前快照（2026-09-27，DSH 0.1.7-rc.2 / VERSION 0.18.0.1，main 合并后）

| 项 | 状态 |
|---|---|
| Git 基线 | 候选分支 `codex/dsh-rc2-candidate` 从 public main `ba2f887b1ec55f26d7cb3849d327072140abbd95` 建立；当前 immutable runtime artifact/reviewed source SHA 为 `a7f8a7f493bd448910899aed5d547e82bff00a78`，PR [#61](https://github.com/tyuanww/fuqing-crm-analytics/pull/61) 已合并到 `main`，merge commit 为 `00823ff533b4cc32861cc70e3f8bda5d374f3b14`，合并后的 main CI 已通过。 |
| 产品 | **PARTIAL / RELEASE_BLOCKED**；T2 已完成，T3–T12 的本地合同与 synthetic 验证已完成（当前 66/66），GitHub main/tag protection 和 evidence environment 已配置，但独立 reviewer/OIDC、浏览器/host、WSL2 冷验证、route/15 分钟 SLI/杭州 HTTP backpressure、public HTML、现场 owner 和 UAT 未完成。既有 HTML 收件箱能力保持，完整浏览器 UAT 仍开放。 |
| DSH | 官方上游固定为 `477b4f42`（0.1.7-rc.2），不修改上游源码；杭州切换未执行。 |
| CRM | 杭州 backend `127.0.0.1:18093`、frontend `127.0.0.1:18094` 健康；生产 checkout 固定在 `47f49616`。 |
| WeKnora | 页面 `127.0.0.1:18090`、API `127.0.0.1:18092` 健康；数据卷与登录由 WeKnora 自身管理。 |
| 公网入口 | `www.tyuan.chat`、`app.tyuan.chat`、`page.tyuan.chat`、`board.tyuan.chat`、`learn.tyuan.chat` 经 Cloudflare Tunnel；HTTP 已强制跳 HTTPS。 |
| 安全响应头 | 全域 HSTS 6 个月；`learn` 使用 Permissions-Policy 和 CSP Report-Only，暂不启用 preload/includeSubDomains。 |
| 数据与备份 | 生产 DuckDB 保留在杭州 `/srv/shinemage/data`，D 盘备份已校验；`incoming` 只读保留，不进 Git。 |

## 本轮施工计划

- rc2 候选验证账本见 [verification-20260927](docs/release/dsh-rc2-candidate/verification.md)；T2–T12 gate 见 `docs/release/dsh-rc2-candidate/`；固定上游 checkout、dsh-dev、B0 clean rebuild、PR #61 CI 和合并后的 main CI（run `36300591922`）均通过，main/tag protection 与 evidence environment 已配置，真实模型、131GB DuckDB、独立 reviewer/OIDC attestation、GitHub Release、杭州重启/route、15 分钟 SLI 与真实 HTTP backpressure 均 `NOT_RUN`。
- 本机候选 worktree 不含 DuckDB/WAL 文件；这里只使用 synthetic fixture 和隔离小库，杭州生产数据状态不由本地文件推断。
- 当前 merged-main internal artifact 证据使用 provisional tag `dsh-0.18.0.1-main-00823ff5`；source SHA `00823ff533b4cc32861cc70e3f8bda5d374f3b14`、app tarball SHA-256 `b11c4b43436eb06f1821c1891121b690e5488effa0c75d421f285e051c8fbf35`、manifest SHA-256 `4642f4614d81b6f2f8777485793b20f2c140eb3523efa46475831fe4398d36d7`、entries `1676`；pinned upstream `477b4f42` git-archive tarball SHA-256 `ddc0cb7b74c938e097f918f44e88e67a83bdde555db18f49cb7a3c9740744e32` 已在隔离 `/tmp` 生成，尚未上传或绑定 publication sidecar；manifest 以 `.context/release-evidence/dsh-0.18.0.1-main-00823ff5/release-manifest.v1.json` 为唯一来源；接收目录为一次性 synthetic 临时目录，未创建 draft/tag/release。

- Artifact Inbox 数据层、自由 HTML 候选保存、原生 `write/edit/present` 接收、轮询和单卡片局部 patch 已合入并在杭州运行。
- PR #61 与合并后 main CI 已完成；Tailscale SSH host preflight 与 CRM+DSH/page loopback healthcheck 已通过；杭州 CRM/DSH/WeKnora 切换、Cloudflare 入口和安全收尾仍未执行；本地与生产均不改 DSH 上游。
- 隔离合成环境的 Playwright headed 旅程已通过（页面生成/预览、局部编辑、保存新版本、回滚和脏数据离开保护）；该 fixture 的生成步骤走 live adapter fallback，不能当作浏览器级 Artifact Inbox intake 证据。完整 DSH shell/生产收件箱旅程与本人 UAT 尚未执行，真实模型逐格式编辑、P13、扫描 PDF OCR、复杂 Office、图谱剩余语义核对仍未完成，不能记为产品全量通过。

## 当前边界

Mac 公共 checkout 负责开发、测试和 PR；杭州 Windows + WSL 只运行批准 SHA。生产服务、真实 DuckDB、WeKnora 数据卷和密钥不进入 Git。无宿主实时事件时，原生 HTML 发现依赖驾驶舱打开后的有界轮询和手动刷新，这是平台能力边界。

<!-- STATUS-AUTO-START -->
| pytest collected | **3036** | Sprint 59 自动抓 |
| pytest skipped | **0** | Sprint 59 自动抓 |
| 当前债数 | **?** | Sprint 59 自动抓 |
| 最近 sprint | **?** | Sprint 59 自动抓 |
<!-- STATUS-AUTO-END -->
