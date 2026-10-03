# G0 审查修复与拆分计划全文复核（2026-10-03）

本轮完成上次 OCR 的 7 项修复，并通读原 2172 行插件平台拆分计划、核对当前实现与历史决定。**修复验证通过，G0/产品仍 PARTIAL，不代表可以创建 Release 或切换杭州。**

工作位置为公共仓库 `fuqing-crm-analytics-public`，起点 `main@d4261aa338ff4ed5543866b8c63cdba627e49518`，领先 `origin/main` 13 个本地提交；当前修复未提交。未 reset/stash/切换分支，未 commit/push/merge/publish，未操作杭州，未访问真实 DuckDB、业务数据或用户凭据。归档仓库未改动。VERSION 仍为 `0.20.0.0`，DSH 仍为 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`。

## 七项修复

| 发现 | 原问题 | 本轮修复和证据 |
|---|---|---|
| OCR-01 / P1 | runtime 改写原始 pinned checkout，中断后污染源码 | 所有临时元数据和依赖绑定在独立副本完成，无可写硬链接回原树；SIGTERM 回归、原始文件字节不变、真实上游 tracked status clean |
| OCR-02 / P1 | 按包名重打包，可能把 xlsx 0.18.5 当成 0.20.3 | 缓存原始 HTTPS tarball，URL + 锁定 SHA-512 定位并验证；缺失/篡改拒绝，禁止重打包安装副本；真实 runtime 解包仅发现 xlsx 0.20.3 |
| OCR-03 / P1 | 插件最终包没有敏感文件、source map、secret 门禁 | 最终 tarball 在私有目录安全解包、限量、allowlist 与 secret scan；取消生产包的 synthetic 命名豁免；通过才公开 tarball |
| OCR-04 / P2 | receive intent 被标为 COMMITTED，失败后 resume 假完成 | 完整 receive 使用 durable idempotent operation；失败保持 UNKNOWN；核对目标身份、archive/manifest/payload 和已安装字节后恢复丢失回执，不覆盖旧目录 |
| OCR-05 / P2 | host tag 切换继承旧 artifact/manifest 身份 | tag 变化时清理当前 identity，历史身份留在 journal；新 tag 的缺失摘要保持 unknown |
| OCR-06 / P2 | exports/main/bundle.patch 指向不存在文件也打包成功 | 核对最终文件集合中的条件 exports、main/module 与 bundle patch；缺失或不支持的通配入口拒绝 |
| OCR-07 / P2 | 兼容矩阵核对 SHA 后却扫描 dirty 工作树 | `git grep` 明确扫描 expected SHA 的 tree；dirty 工作树不能改变该 pin 的静态证据 |

receive 的 UNKNOWN 不表示可盲目重试：如果目标目录缺失或内容不一致，自动恢复仍拒绝。若进程被强制结束留下锁，还必须证明原 owner 已结束并走既有 stale-lock 处理。插件内容校验失败不发布包；通过后若单独的回执写入失败，已验证包保留，需核对后使用新的候选目录。

## 真实 runtime 调查

修复并非只由单元测试判定。实际构建依次发现并处理：

1. 敏感名称过滤误伤 `credentials-local` 目录和 `credentials.js` 等上游代码。现在保留固定代码模块，继续排除 `.env`、凭据数据和数据库；最终 runtime 内容仍扫描。
2. macOS `/var` 与 `/private/var` 路径别名使 pnpm 计算错误相对目录。临时根与上游统一 canonical path。
3. pnpm 11.7 的 `--offline` 仍可能触发策略元数据联网。prepare 完成固定锁文件安装/构建和原源码复核后，记录与 lock/policy/pin/toolchain 绑定的本地凭证；离线部署只对匹配凭证复用策略结果，并预加载网络拒绝守卫。该凭证不是供应链签名，也不代替独立 audit。
4. `pnpm deploy --legacy` 会重新解析范围依赖，冻住的安装也不能保证离线 metadata 齐全。改用 pnpm 的 shared-lockfile frozen deploy，临时设置 injection 选项；原 upstream 配置不变。新增真实 pnpm 测试：空 metadata cache/store、禁止网络、范围依赖仍安装锁定版本。

失败原始日志保留在 `.context/checks/ocr-fixes-20261003/runtime-build*.log`，不将失败轮次计为通过。pnpm 行为依据本机固定 `11.7.0` 实现的 `deployFromSharedLockfile` / legacy deploy handler 核对。

## 本次实际验证

工具链：Node `24.19.0`、pnpm `11.7.0`、Python `3.14.4`。下列命令在公共仓库执行，Node/Python PATH 指向上述固定本机工具。

| 命令或入口 | 结果 | 范围 |
|---|---|---|
| `node --test scripts/release/*.test.mjs scripts/dsh-b0/compatibility-matrix.test.mjs scripts/dsh-b0/host-feasibility.test.mjs` | **123 passed / 0 failed / 0 skipped** | release、pack/candidate、鉴权、状态恢复、兼容扫描与 synthetic host |
| `node scripts/dsh-b0/pipeline.mjs --prepare --python /Users/hutou/homebrew/bin/python3.14` | PASS | 固定上游 fetch/install/native rebuild/official build/build-tools，保留原 tracked 源码 |
| `node scripts/dsh-b0/pipeline.mjs --audit --python /Users/hutou/homebrew/bin/python3.14` | PASS，无已知漏洞 | 现有 audit 实际只检查 build-tools production 依赖，不能替代整个 runtime 的 SBOM/CVE 门禁 |
| `node scripts/release/runtime-bundle.mjs --upstream .context/dsh-b0/upstream-0.1.7-rc.2 --output .context/checks/ocr-fixes-20261003/runtime-final.tar.zst` | BUILT / offline | 180,998,894 bytes；25,041 个运行文件，扫描 301,962,865 bytes |
| `.context/checks/ocr-fixes-20261003/runtime-smoke.mjs` | PASS | 真实 secure-runtime-unpack：80,906 entries、612,154,733 bytes；5,927 个链接全部可在包内解析；隔离 home、禁止联网下 CLI `--version` 为 0.1.7-rc.2 |
| 真实 `packPlugin` / `pnpm pack`：shine-brand + analytics-workbench | 两包 PASS | 最终包扫描、入口与摘要；只校验包，没有激活 DSH |
| `.context/checks/ocr-fixes-20261003/receive-cli.mjs` | PASS | 实际 CLI 错包退出 2 → resume action_required=true → 已安装字节恢复 → replay 退出 0 |
| `git diff --check`、修改文件语法/文档引用检查 | PASS | 当前修复差异，计划内未来产物单独标记为未实现 |

最终本机 runtime SHA-256：`2c2fa6bcd2137d72c7a99f2b0625d60f106840e8a7a2fa18130c2058c035501e`。这是 **Darwin arm64 验证包**，不用于杭州 WSL2 上线。

真实包 receipt：

- shine-brand：`7f73bc9128199297a062d816296ec7beb977e4d93ae65a4d41e719b4dcd0af7c`，1,859 bytes。
- analytics-workbench：`891bdceb710b4ac9dbd2a5008028a55dd08e3e17825ec8be58acf92fb160b65d`，416,593 bytes。

两个插件源码路径仍 clean、绑定 `d4261aa3`；用于打包的 release-control 包含本轮未提交修复，因此这里不称其为最终 reviewed release candidate。产物、完整日志、OCR preview/rules 与逐文件审核清单保留在 ignored `.context/checks/ocr-fixes-20261003/`。

## 大型历史计划的审核结论

总体方向符合用户目标：官方 DSH 底座独立升级，CRM、知识库和其他插件按领域维护；先用 workspace 验证真实边界，再物理分仓。问题在于多轮评审叠加后，历史建议、最终决定和已执行结果混在同一页。保留原历史决定，在首页增加当前执行依据，并修复以下矛盾：

| 问题 | 已处理 |
|---|---|
| 旧 main/clean 基线、旧测试和 preflight 被当作当前结果 | 显式记录 d4261aa3 起点及当前 dirty 修复，旧 SHA 的 PASS 不复用 |
| workbench 最先搬仓与 brand 优先冲突；T15 在 stop/go 后又被 stop/go 依赖 | 区分首期 workspace 试点与后续物理迁移；T15 G0 前置，物理拆分后置 |
| T14 在 T17 之前，但实现又依赖宿主隔离 | 先 T17 确认宿主合同，再做对应 UI/激活实现；不阻塞可独立执行的 G0 前置测试 |
| 首期保存无条件开启，与已选 D4-C 冲突 | 由服务状态/幂等/UNKNOWN 重放证据决定，失败时禁用保存并说明原因 |
| 签名/SBOM/灰度一度后置，与最终 D7-A 冲突 | 保留完整 candidate 门禁；本地 PARTIAL pack 可先做，不能当作发布放行 |
| candidate 被描述成已管理 host PID/端口/WAL；指针未切换被等同旧进程可用 | 当前 pack-only 与未来 T17 harness 分开；真实宿主、恢复与服务状态各自验收 |
| DESIGN 全壳品牌化与 native-first 冲突 | 原生 chrome 归 DSH；品牌限插件自有内容，旧 Vue/比赛视觉作为历史背景 |
| 无效 plugin/state 参数、省略 preflight 参数、危险复用 `/tmp`、生产拉代码 | 对齐实际 CLI，唯一临时目录保留证据，杭州使用 immutable artifact |
| 0.2.0 API 变化与运行时能力仅凭静态关键词推断 | 静态支持只代表源码家族存在；具体 API 和生命周期保持待验证 |
| READY_TO_SAVE / SUCCESS_UNSAVED 与 HOST_RESTART_REQUIRED 语义不一致 | 展示状态不替代服务授权；保留草稿/回执不等于进程仍健康 |
| 当前 crm-knowledge 与最终两个领域仓混淆 | 区分当前迁移来源和最终独立 CRM/知识库插件 |
| 已答题又列为待答、Failure Modes `Y` 看似测试通过 | 标注历史选择、计划要求与实际证据，避免重新审批或夸大验收 |

发现 T1 指定的 `shinemage-plugin-platform.md`、`shinemage-plugin-boundaries.md` 和机器边界清单尚未落地。计划已标为 NOT_IMPLEMENTED，不能以“决策已落档”等同这些产物已生成。本轮不凭空填造 owner/consumer/API 清单。

## 审核覆盖与修改文件

沿用用户指定的 open-code-review-delegate：OCR 负责 preview/rules，当前 Agent 逐文件审核，不调用外部 LLM。上次 60 文件中唯一未全文复核的 2172 行计划，本次已补齐；本轮修复工作区 **25/25 文件 reviewed，0 skipped，覆盖率 100%**（16 个代码/测试、9 个文档）。OCR 默认排除 Markdown，本轮全部人工补审。此覆盖率不是项目功能完成率。

| 文件 | 处理 |
|---|---|
| `CHANGELOG.md` | 未发布修复说明 |
| `DESIGN.md` | native-first 与历史品牌边界 |
| `STATUS.md` | 当前工作树、验证与剩余门禁 |
| `docs/hackathon/TODOS.md` | 维修完成项与接续项 |
| `docs/hackathon/evidence/dsh-g0-review-fixes-20261003.md` | 本轮证据、覆盖与开放项 |
| `docs/operating/dsh-plugin-author-quickstart.md` | 真实打包合同、临时目录与失败语义 |
| `docs/operating/dsh-rc2-quickstart.md` | 离线输入、准备凭证与 receive 恢复 |
| `docs/operating/verification.md` | 生产 artifact 接收规则 |
| `docs/plans/shinemage-plugin-platform-split.md` | 全文审核和当前执行依据 |
| `scripts/dsh-b0/compatibility-matrix.mjs` | 扫描固定 Git tree |
| `scripts/dsh-b0/compatibility-matrix.test.mjs` | dirty worktree 不影响 pin 证据 |
| `scripts/dsh-b0/pipeline.mjs` | 准备原始 tarball 与锁文件凭证 |
| `scripts/dsh.mjs` | CLI 接入可恢复 receive |
| `scripts/release/artifact.mjs` | 共用已安装字节验证 |
| `scripts/release/plugin-pack.mjs` | 最终包解包、安全和入口门禁 |
| `scripts/release/plugin-pack.test.mjs` | 敏感字节与入口拒绝测试 |
| `scripts/release/receive.mjs` | durable receive operation |
| `scripts/release/release.test.mjs` | 接收失败、恢复、重放与边界测试 |
| `scripts/release/runtime-bundle.mjs` | 私有副本与 frozen 部署路径 |
| `scripts/release/runtime-inputs.mjs` | 原始依赖缓存、凭证、私有工作树和部署参数 |
| `scripts/release/runtime-inputs.test.mjs` | 精确包、中断、网络拒绝、空缓存真实 pnpm 测试 |
| `scripts/release/runtime-offline.cjs` | 仅对离线打包子进程拒绝网络 |
| `scripts/release/secret-scan.mjs` | 包内相对路径及可关闭的 fixture 豁免 |
| `scripts/release/state-reconcile.test.mjs` | 跨 tag 身份回归 |
| `scripts/release/state.mjs` | 身份清理与受控幂等 reconcile |

## 接下来仍需关闭

1. T1 真实边界/DAG 与 T15 跨包源码解耦；工具包仍依赖 workbench 的 pin/build-tools，不能宣称任意插件已可独立迁仓。
2. T2/T17 精确 DSH 宿主生命周期、故障隔离、session/WAL、重启/恢复证据；同进程 unload 仍 BLOCKED，不承诺任意热插拔。
3. T3/T7/D4-C 服务保存、UNKNOWN 重放与 forward-fix 矩阵；UI、a11y、真人/模型/业务 UAT 仍未执行。
4. 授权提交后的 clean SHA 正式 preflight、签名/来源/SBOM/CVE、canary/rollback、远端 receive/reconcile。旧 102/102 和本机 runtime 不为这些条件放行。

结论：本次修复可交付审核，当前不具备据此发布或杭州上线的完整证据；下个实施入口是 G0 的边界清单、独立包与精确宿主证据，不重复开启整轮规划问答。
