# 生成合同材料的作者归属交付（2026-10-11）

三个独立作者仓已按用户授权应用、提交并推送合同导出增量；当前精确提交的真实 Ubuntu PR CI 和合同工件均完成独立核对。主仓仍在 `5390667cc990fa558b0445aa455b086d325a6c77`，本轮只同步证据和当前说明，未应用新的合同消费入口、未提交主仓，也未合并、发布或部署。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

## 实际作者 Git 与 CI

| 作者仓 | 当前精确提交 | 当前 PR CI | 导出材料 | 新增合同/守卫阶段 |
|---|---|---|---|---|
| workbench | `6c5adc9faa04f692d5d4b3028af4f945ab49dfe4` | [38126014921](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38126014921) / SUCCESS | 28 / 439077 字节 | 12 PASS / 0 FAIL / 0 SKIP |
| crm | `c4b1c91eaa4fa645deb7951614c1937eb76db143` | [38126019403](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/38126019403) / SUCCESS | 2 / 4252 字节 | 12 PASS / 0 FAIL / 0 SKIP |
| brand | `0b8c8a793b585c22c980b9d3afe8b9839d7632ec` | [38125655260](https://github.com/tyuanww/dsh-shine-brand/actions/runs/38125655260) / SUCCESS | 1 / 1973 字节 | 9 PASS / 0 FAIL / 0 SKIP |

Workbench 与 CRM 的首次增量各为 8 路径，shine-brand 为 6 路径，各一笔独立提交。Workbench 初次 `a0d979f3` 与 CRM 初次 `dcb864a4` 的 CI 在导出时因 `scripts/ci/__pycache__/process_group.cpython-314.pyc` 而失败；分别追加单路径 `fix(ci): prevent bytecode from dirtying contract sources`，仅在工作流设置 `PYTHONDONTWRITEBYTECODE=1`。干净源码门禁未放宽，没有删除或忽略失败证据。三仓工作区与暂存区均干净；现有 PR #1 保持 OPEN。

这些测试数字各自属于新合同检查步骤，不能与原本包测试、历史 CI、本地复跑或其他插件相加。CI 全部步骤成功由 run/jobs API 核对；工件仍保留 `remote_ci=NOT_VERIFIED_BY_JOB`，这是导出器自己的边界，外部核验另行记账。

## 实际工件与来源

| 作者仓 | Artifact ID | 下载 ZIP SHA-256 | 外层字节 | 到期时间（UTC） |
|---|---|---|---|---|
| workbench | `11697481756` | `74e7af647128fea315f3953e609c00bb986b4656e1a03eeb3112cfcfc2c3dfaf` | 65662 字节 | `2026-10-25T08:49:52Z` |
| crm | `11696962431` | `e839c07440ebca9910364ea8951734d49e88a451c9d7a177374c38f0a80ed21c` | 2816 字节 | `2026-10-25T08:48:50Z` |
| brand | `11697365923` | `7fe83711a958f5801598f8f798a1d0727c0ba5bde96750cd62deaa161972c93b` | 1766 字节 | `2026-10-25T08:41:08Z` |

API digest 与下载 ZIP 全字节一致；所有成员名、数量、大小、清单摘要、配方、生产器、包 manifest 与当前 Git blob 一致，拒绝额外成员、重复路径、符号链接和越界路径。`source_sha` 是精确作者提交；保留未改写的 CI `ci_job_sha`，由 Git API 核对它与源码提交的关系。31 份材料共 445302 字节，也与原生成器隔离实测所用的材料逐字节一致，没有私有解码器/渲染器的运行实现，没有新增运行包公开导出。

这份合同工件不是普通 content pack，也不是 `dsh-plugin-pack/v1`、candidate、GitHub Release 或可直接安装的运行包。14 天 CI 留存不等于长期正式分发。原包版本、peer、正式回执、两份 profile、candidate 与 journal 均未改变；CRM/Knowledge 声明 Cordis 4.0.2、固定环境实际 4.0.4 的严格安装冲突仍开放。

## 原生成流程的源码拒读实测

从准备阶段三个干净作者提交取得合同材料，在自有目录执行 15 个未改字节的主仓原生成器：15/15 exit 0。原槽位检查 4 PASS，主题非法输入/漂移检查 2 PASS，分别 0 FAIL / 0 SKIP；私有主题行为与槽位消费另由各自作者检查。旧主仓插件资料及三个原作者仓拒读，31 条旧材料路径和三条作者入口读取均得到 EPERM。固定 main-owned Python/schema、TypeScript 6.0.3 与 OpenAPI TypeScript 7.13.0 可读；这是指定产品树的数据拒读，不是整机不可读。

最初 29 份材料遗漏了首购保存编译声明和 BoardSpec 组件目录，两个原入口失败；补齐到 31 份后通过。未复制保存解码器实现。C0 生成器字节及合同摘要 `317110700f6043bf0cab5f3a505775c11f437f34742d02be40e52f446a11b25d` 保持。原生成器、公共 schema、严格正/负类型检查未删减。准备轮的 LOCAL_PREVIEW_NOT_CI_BOUND 与上述实际 CI 分开，不将本地预览改写成 CI。

隔离失败和修复日志全部保留：r1 沙箱中文路径误转义，负对照未拒读，不计通过；r2 缺声明/目录，两入口失败；本地缓存复现中另一次准备守卫因 SDK tarball 未提供，5 通过 / 1 缺输入 ERROR，不计通过。实际 CI 用自己的固定平台输入完成全链。工件核对 r4 曾因 GitHub API TLS 握手超时中断，保留原错误；r5 使用相同校验完成读取，TLS 未放宽。

## 增量审查与原始证据

OCR delegate 由宿主审查，无外部模型调用。初始增量可审文件 Workbench 6/6、CRM 6/6、shine-brand 4/4；每仓另人工审查 2 份 Markdown。审查发现的保留 GITHUB_SHA 身份问题已改为专用 CONTRACT_SOURCE_SHA；后续单路径 CI 修复各 1/1 已审，无未解决发现。

任务原始材料在 `/Users/hutou/.codex/tasks/shinemage-generated-contracts-proposal-20261011-ec1mo2ki`：`public-stage-summary-r3.json`、`public-stage-execution-r3.json`、`stage-logs-r3/`、`author-tests-execution-r2.json`、`review-r2/host-review.json`、`authorized-git-execution-r1.json`、`authorized-author-delivery-final-r3.json`、`ci-cache-fix-r1/`、`ci-evidence-r3/`、`ci-evidence-r4/` 与 `ci-evidence-r5/`。准确八/八/六路径及初始补丁见 `author-local-commit-plan-{workbench,crm,brand}-r2.json`；后续两个单路径修复单独记账。机器绑定见[validation JSON](shinemage-generated-contracts-owner-delivery-20261011-validation.json)。

## 尚未关闭

主仓 15 个默认合同生成入口仍读旧副本；本轮只完成材料归属交付与隔离可行性验证。下一步是在实际新 CI 工件上准备主仓消费者/输入锁补丁，再单独取得入口切换授权。保留合同、缺输入守卫、静态边界扫描及旧源码清理 stop/go 继续开放。

本轮未重跑未变化的完整 B0；已完成的领域 r2 完整本地 B0 r4 仍只覆盖其实际字节。新主仓 CI、新当前组合的目标/宿主/服务/回退、真实模型、CRM/WeKnora/UAT、正式分发及 DSH 升级适用门禁不由本工件抵扣。没有读取真实 DuckDB，没有操作杭州、6677、旧 CRM、真实 WeKnora 或修改 DSH 上游。
