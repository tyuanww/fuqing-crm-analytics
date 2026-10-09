# ShineMage A/B/C 独立化交付：本地集成（2026-10-08）

本轮以主集成树 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d` 加原 71 项未提交内容为基线。普通 porcelain 摘要为 `7b3db47b385ac71ef13f8f6bf08b9a1c3d95cdb064e0d34666023600ebc42dba`；NUL 序列化摘要为 `b91c2f8e25659b091af4b70bc90a2b198c5df229631a543b37c60665f414317f`。两者格式不同，不是工作树漂移。各任务继承内容按 Git blob/文件摘要核对，不整树合并，不累计不同范围的 PASS 数。

机器汇总见 [validation](./shinemage-plugin-independence-integration-20261008-validation.json)。本轮所有新原始记录位于主树 `.context/checks/plugin-independence-integration-20261008/`；归档只按安全白名单复制，凭据、cookies、启动令牌和 Set-Cookie 日志不进入归档。SDK 分发 **BLOCKED**、产品 **PARTIAL**、`release_ready=false`。

## 四个问题的分层结论

| 问题 | 当前可确认范围 | 尚未完成 |
|---|---|---|
| 官方 npm 宿主安装和插件加载 | A 实际准备了官方 `@deepseek-ai/dsh@0.1.7-rc.2` 安装树，并报告通过官方 plugin add/web 加载 shine-brand；本轮复算官方 tar/SRI、20 个 CLI 成员、安装锁和版本、品牌四成员、profile/模块配置及保存的 HTTP client 字节 | 安装/运行命令退出、HTTP 状态和回收终态缺独立安全机器回执，保留为 OPERATOR_REPORTED。无浏览器 DOM 品牌覆盖、CRM/知识在此 npm 宿主的组合、DSH 新版升级/回退验收 |
| 单插件脱离主仓/兄弟源码构建 | B 的 shine-brand 在禁网、主仓与兄弟业务源码不可读的 sandbox 下完成本包构建/行为测试/内容打包；本轮仅修输入 guard，再跑上述受影响路径 | 固定 upstream checkout 和 build-tools 仍可读；尚未达到上游 checkout 也不可见的最终开发依赖方案，不是 npm-only 构建证明 |
| 独立仓/clone/远程/CI | shine-brand 为真实本地独立 Git 根，自己的锁和开发入口已存在 | Git 无 commit、无 remote；clone 未做，workflow 是骨架，远程 runner 的固定 Node/pnpm/SDK 输入未提供，GitHub Actions NOT_RUN；其余插件未因此创建独立仓 |
| CRM/看板/WeKnora | CRM 现有 HTTP/身份/保存接入代码和知识 ACL/读取代码是真实实现，本轮改动及验证只使用合成夹具；完整页面/组板/编辑代码在 analytics-workbench | shine-board 只是能力标记；公开 synthetic knowledge 不是 WeKnora；私有知识仍依赖 CRM Host 身份 lease；真实 WeKnora 版本/API/身份/数据、真实模型和业务验收未提供，本轮未操作生产 |

## A：官方 npm 路径与开发依赖

来源目录：`/Users/hutou/.codex/worktrees/shinemage-npm-host-path-20261008`。主 Agent 的逐项复算在 `review-a/{review.md,summary.json,safe-manifest.json}`。

- 官方 CLI tar SHA-256 `5f2da7272d9485abc223e681075809a8d929697c5232ee445718e1b7e066bff8`，与保存 registry SRI 一致；20 个普通文件成员与安装目录相等。registry 没有 gitHead，不能补写源码关联。
- 安装锁 SHA-256 `e26e821d5361b9c011fa9dd2f481fc705ed732dd3882e6d37937fa99cac8af38`。521 个实际安装 manifest 版本与锁匹配；89 个未物化条目为 optional。它是本次解析锁，不是官方不可变闭包，也不是全部传递包字节审计。
- 品牌插件 tar SHA-256 `b8c95f76da039d59cfb9d5aae31e24ed0dc73999eb8b5d79ae1ea41a6552d09a`，四个运行文件与主树固定 Git blob 相同。profile/config/首页只解析包名和模块存在性，不保存可能含启动信息的原文。HTTP client 前 2428 字节与该包相同，余尾是官方 source map 注释改写；未宣称全文件相同。
- A **没有 kit 增量**。26 个 binding 的精确 metadata 不等于导出/类型编译通过；`dsh-client-core@0.1.7-rc.2` 保存结果为 404，五处引用是 type-only。npm 宿主的 cordis 4.0.4 与 CRM/knowledge 精确 peer 4.0.2 不同；品牌 profile 也有缺 dsh-tools peer 警告，不把 peers 命令退出 0 当成依赖全部满足。
- 原记录的六项未批准 lifecycle 没有补执行；没有扩大成 shell/native、模型或生产验收。运行终态证据不足是审查发现 A-R1，不能仅凭 PID 和停止时间推断 exit 0/端口已关闭。本轮没有重启 A 宿主补跑。

A 白名单归档 21 文件/494870 字节；B 原 r3 日志及三份交接 13 文件/15231 字节，见 `archive-ab-manifest.json`，总清单 SHA-256 `e06c68680f9d3366d2eead04d7e208236e7a98166b895e2f4369c3ecb6dc8bc9`。计数不含新生成 manifest。

## B：独立本地 shine-brand 样本及输入修复

独立仓：`/Users/hutou/.codex/tasks/shinemage-shine-brand-independent-20261008/dsh-shine-brand`。本轮只改该仓 `plugin/build.mjs` 与 `scripts/build-input.test.mjs`，不将独立仓适配脚本覆盖主仓的不同调用合同。修前文件、精确 patch、命令/环境/退出及日志见 `review-b/before`、`fix.patch`、`fix-summary.json`、`fix-validation/`。

固定 kit tar SHA-256 `251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901`；17 个成员中 16 个与固定源码字节相等，manifest 仅打包时移除了 packageManager，不能写成全部 17 个原字节。运行 plugin manifest 保留 kit 0.1.0 和 dsh-tools 0.1.7-rc.2 精确声明；开发父工程的 file tar 依赖不进入运行包。

修复 B-R1：upstream、build-tools、DSH_PACKAGE_INPUTS 都必须显式提供绝对路径。此前 build-tools 缺失/空值仍进入 kit 默认路径，与样本文档不符。新增用例在旧脚本 **7 PASS / 4 FAIL**，修后 **11 PASS / 0 FAIL**；失败原件保留。禁网 sandbox 下正常 build exit 0，既有行为测试 **7 PASS / 0 FAIL**，content pack exit 0，仍为 5 成员/2559 字节/SHA-256 `e9e053442beca4a33d406b8fb428f778eebe19d99f3d5c85843c647a0a016757`。此为运行时内容检查，不是正式 packPlugin 或 candidate；脚本结束清理临时 tar，持久交付物为来源、命令和摘要日志。

两份 JS 与修前/主树字节一致。32 个 symlink 仍被限定在本仓、固定上游和固定 build-tools；不是完全没有开发源码输入。首次离线安装 peer 失败与 r3 均保留，本轮未联网/重装。

B-R2 仍开放：workflow 使用 corepack pnpm，而内容打包默认调用裸 pnpm，未来 CI 需统一固定命令来源；hosted runner 也尚未准备 Node24.19.0/pnpm11.28.2 和两个固定目录。当前只收录骨架，**不作为可立即执行或通过的远程 CI**。本轮不扩为远程配置部署。

## C：源码增量、合同和集成修复

来源树：`/Users/hutou/.codex/worktrees/shinemage-plugin-decouple/fuqing-crm-analytics`。仅白名单 10 个 tracked 文件加 `crm-knowledge/test/knowledge-http.mjs`，逐一确认主树目标与 HEAD 一致后集成。旧 `/tmp/shinemage-plugin-decouple/tracked-src.diff` 不是最终内容：只有早期四路径，遗漏后续测试和动态 import 改动；保留旧文件，仅以核对过的当前文件为输入。

业务变化只有 CRM 健康结果：不再凭 COMPETITION_HTTP_BASE/TOKEN 判断看板，而是使用 `ctx.tools.get('competition_board_catalog', exec.agent)`。`board_tools` 从字符串变为 `{status, execution, reason}`；AVAILABLE/NOT_RUN 仅表示 catalog 可见，不承诺生成/编辑执行成功。仓内未发现依赖旧字符串的其他调用者，外部消费者兼容未验。三包 build 明确要求上游输入；CRM/知识测试移除兄弟服务客户端或主仓 writer 的直接导入。C 的原始行为日志与本轮集成结果分别记账。

审查发现并处理的范围：C1，构建负测错误读取实际解包根的 build.mjs，应分离作者 sourceRoot 和已安装 plugin 根；C2，writer 断言迁出插件后需在主仓 owner 保留真实写出覆盖；C3，HTTP 测试 helper 需保留完整请求截止和响应大小上限。最终文件和结果以机器记录为准；不更改生产知识客户端或服务权限。

### 隔离验证入口的漏测修复

本次发现既有 `plugin-isolation.test.mjs` 的子进程继承 `NODE_TEST_CONTEXT=child-v8`，使内部 `node --test` 报 recursive skipping 并退出 0。最小失败断言在继承环境下 exit 0，清除此变量后 exit 1，证明外层 2/4 PASS 不能证明包内测试运行；最初怀疑名称过滤，后由此负例确定实际根因。集成修复只净化子测试环境并核验有效测试计数/零失败，保留漏测记录，不据此否定其他独立直接运行的测试，也不把旧隔离外层 PASS 当作内部通过。

首次独占 HOME 下 Corepack 缓存缺失，禁网检查拒绝下载；随后使用本轮已核验的固定 pnpm 11.28.2 绝对入口，无联网或版本替换。环境失败、漏测轮和后续真正触发的源根失败分开留存，不覆盖为成功。

## 集成验证与保留边界

本轮精确命令/白名单环境、退出码及 stdout/stderr 摘要在 `review-c/integration/logs/*.json`；最终源码清单在 `review-c/integration/final-source-manifest.json`，tracked diff 与三个新增文件单独保留。主 Agent 再读修后差异和输出，没有新增待修复的集成阻断；A-R1 运行回执、B-R2 未来 CI 命令绑定仍按范围开放。

| 本轮 C 入口 | 实际结果 | 证据 |
|---|---|---|
| CRM / knowledge / shine-board 各自 build | 三次 exit 0，含各自已有类型检查 | `build-crm` / `build-knowledge` / `build-board` |
| CRM/知识 package tests | 13 PASS / 0 FAIL / 0 SKIP | `package-after` |
| 图谱、客户端、board、服务 HTTP、知识/页面组合及 profile | 57 PASS / 0 FAIL / 0 SKIP | `targeted-behavior` |
| 有界 HTTP helper / 主仓 graph ledger writer | 9 PASS / 0 FAIL / 0 SKIP | `helper-owner` |
| 原四包隔离构建/测试/正式 pack/实际解包 | 外层 4 PASS / 0 FAIL / 0 SKIP；内部 source：brand 7、query 1、CRM 8、knowledge 5；installed：CRM 8、knowledge 5，均零失败/零跳过 | `isolated-after` |
| pipeline / isolation 脚本语法与差异空白检查 | `node --check`、`git diff --check` exit 0 | 主 Agent 最终检查 |

隔离测试会在自有临时目录建立测试用 Git 提交以核验 pack 的来源合同；这不是独立 B 仓的产品提交，也没有写入正式 journal。内部 source/installed 测试重复验证同一行为，不相加为独立用例数，更不跨 A/B/C 相加成总体通过。完整 B0、headed、WSL、真实模型和生产均未在本轮重跑。

既有正式 candidate `fd1fba4cf141c9b41fdcca5a881601b39cdfbebef5d5120ccb7d8a2cc29ca703`、workbench 包 `a0d5dd08c5e97237fc38033f929eec33627ac42efa594a5ca5c87a0ee311d6b2` 和 seq 6 journal 保持。C 改变了 CRM 源码/构建字节，不能继承原组合的 headed/WSL 结论；本轮不生成新候选，不提交、不建远程仓、不 push/PR/合并/发布部署、不改 VERSION。

下一步按原任务收尾：审查本地独立仓并在实际授权后提交/clone；明确可交付的精确开发依赖方案与 CI runner 输入；各插件逐个迁移；CRM/完整看板/WeKnora 分别取得真实合同/身份及隔离验收输入；DSH 选定新版后单独适配与回退验收。没有新材料时不反复查询 SDK 开放项，不把 SDK BLOCKED 扩成所有工作的统一阻塞。
