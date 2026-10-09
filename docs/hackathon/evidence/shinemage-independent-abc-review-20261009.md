# 三个独立作者仓交接审查（2026-10-09）

基线是主集成树 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d` 加起始 96 项未提交内容。本轮按各任务 HANDOFF、原始日志、来源摘要和增量核对，没有整树复制。三仓均尚无提交与 remote。结果是本地可审查成果，不是完整分仓/发布完成。

机器摘要：[shinemage-independent-abc-review-20261009-validation.json](./shinemage-independent-abc-review-20261009-validation.json)。原始记录根为 `.context/checks/independent-abc-review-20261009/`（gitignored）；`before-*.json` 保存开工快照，`archive-manifest.json` 保存 169 份原交接/日志/失败轮的来源与归档摘要。原 evidence 保留。

## 输入与源码

| 项 | 固定输入 |
|---|---|
| Node / pnpm | 24.19.0 / 11.28.2 |
| DSH / 上游 | 0.1.7-rc.2 / `477b4f420553e8a52c2fbccc464d7561b239c443` |
| kit | 0.1.0，SHA-256 `251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901` |
| Workbench 领域包 | board-components 0.1.0，SHA-256 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182` |
| 开发路径 | 三仓均仍消费固定 checkout 与已安装 build-tools；没有公开依赖严格编译的新验收 |

各任务根在 `/Users/hutou/.codex/tasks/`：

- `shinemage-workbench-independent-20261008/dsh-analytics-workbench`，原交接在同级 `evidence/HANDOFF.md`；分支 `codex/analytics-workbench-independent`。
- `shinemage-crm-independent-20261008/dsh-crm-knowledge`，原交接在同级 `evidence/HANDOFF.md`；unborn `main`。
- `shinemage-knowledge-independent-20261008/dsh-knowledge`，原交接在同级 `evidence/HANDOFF.md`；unborn `main`。

Workbench 当前插件来源为 554 原样、35 显式输入修改、1 新 helper。原 extract-manifest 是中途快照，35 条摘要已过时；追加 `workbench/source-comparison.json`，不重写原记录。CRM 为 43 继承、2 测试夹具入口修改、12 跨仓测试排除；排除的测试仍留主树，未删除也不算通过。Knowledge 的 16 份 HEAD 文件、3 份主树已有修改与新增身份测试已核对；本轮修复后的文件用新摘要记录，不替换历史 provenance。

## 已验证范围与证据限度

下表是对原始日志的复核，不是本轮重跑，不相加成总通过数。

| 仓库 | 原始结果 | 隔离与限制 |
|---|---|---|
| Workbench | 输入/边界 5 PASS；host/client full typecheck；23 文件 193 PASS；安装/构建/内容打包 exit 0 | 保留的 verify 副本运行全链，拒绝主仓、兄弟、原作者目录；checkout/build-tools 可读。原 commands 记录子命令，缺外层 sandbox argv；策略与 EPERM 探针另存 |
| CRM | 守卫 11 PASS；本包 103 PASS；严格类型检查/构建/打包 exit 0 | 沙箱 build/test 在作者仓执行；独立副本只做 frozen offline install 后删除。原本包与隔离重跑不能加成 206 |
| Knowledge | graph 22、service-client 5、package 5、identity 9、author-boundary 4，各组 fail/skip 0 | 旧隔离副本已删除。保存日志与固定输入/包成员可复核，但没有当次全源码清单及实际 sandbox argv，不能事后伪造完整封存 |

Workbench 9 个 JS、CRM 3 个 JS、Knowledge 2 个 JS 与主树当前构建产物同字节；不会由此继承旧 candidate。内容包原日志分别为：

| 仓库 | 字节数 / 成员 | 保存的 SHA-256 |
|---|---|---|
| Workbench | 438782 / 8 | `74321fa09edb178e6cb7c781811cf3923643cfbda944211c36d2642974b9423e` |
| CRM | 242766 / 6 | `39c3bd893f4535167d90adb57773ad96b72136b64086685603fc3b0937812914` |
| Knowledge | 16844 / 5 | `74ded7db78008b146e825b0620e14e70775630b34205050670c25718d1b6ce2c` |

三个临时 tgz 都由原 pack 脚本删除；本轮复核保存回执与当前成员，不宣称重新计算原 tgz。pnpm 移除 packageManager 的 manifest 差异已记录。formal packPlugin、Linux 包、新 candidate 均未执行。

## 本轮审查修复

1. **Workbench P2 已修复**：README/DEVELOPMENT 不再用 `@deepseek-ai/cordis@0.1.7-rc.2` ETARGET 推断公开路径不可能。cordis 的实际固定版本是 4.0.4，完整公开依赖严格编译仍 NOT_VERIFIED。旧失败日志和原 HANDOFF 不改。补丁、改前后摘要见 `workbench/documentation-fix.*`。
2. **Knowledge 证据防覆盖已修复**：isolate 入口原子创建新目录，复用已有目录先退出 2；负测确认旧哨兵与目录成员不变。
3. **Knowledge 身份测试有界等待已修复**：HTTP 就绪等待处理提前返回、提前拒绝与超时；撤销场景加 finally 回收。补丁见 `knowledge/fix.patch`。
4. **CRM CI 输入供应 P2 仍 OPEN**：全新 ubuntu runner 不会因设置路径变量而拥有 checkout/build-tools/pnpm。DEVELOPMENT 已标明草案，保留完整 typecheck/build/test/pack 门禁，未改成只跑 guard 的绿色替代。Knowledge 手动 workflow 也仍缺同类输入；其文档已明示。Workbench workflow 只含边界检查，不代表完整 CI。

本轮实际补测仅 Knowledge 作者仓：`bash -n scripts/isolate-verify.sh` exit 0；author-boundary **5 PASS / 0 FAIL / 0 SKIP**；identity **12 PASS / 0 FAIL / 0 SKIP**。命令、cwd、环境白名单、限时、日志与源码摘要在 `knowledge/fix-validation-r1/validation.json`。这是作者仓针对性补测，未重跑隔离构建。两个运行 JS 未变，原 knowledge evidence 77 文件全部不变。

## 实现与真实验收

- **看板**：完整 analytics-workbench 页面/编辑源码进入独立作者仓，有包内行为与构建测试；本次没有新宿主加载或 headed，shine-board 标记壳不能代替它。
- **CRM**：插件、HTTP/身份/看板消费者实现保留；冻结合成数据替代测试对主仓生成器的直接调用。103 项只证明固定合成消费者，不是实时 ASGI、跨仓 profile 或真实业务验收。board_tools 仍为 status/execution/reason 对象，catalog 可见不等于工具已执行。
- **知识**：已有 WeKnora/Neo4j HTTP 客户端与身份 lease 消费代码，测试用合成 HTTP；真实 WeKnora、真实 Neo4j、真实业务与授权环境输入仍待提供。没有复制 CRM Host 实现。
- **官方 npm 宿主**：本轮未新增实跑。先前 A 线有官方安装文件、品牌配置和客户端下发字节；执行方报告成功，但安全归档缺独立退出/HTTP 状态/回收终态。继续按[原记录](./shinemage-plugin-independence-integration-20261008.md)记账，不将三仓 build 升格为 npm 宿主兼容通过。

## Git 与下一步

| 阶段 | 三个仓库当前状态 |
|---|---|
| 本地作者目录 / git init | 已完成，未提交 |
| 不读主仓/兄弟源码的固定 SDK 构建 | 原日志已审查；保留各自隔离证据限度 |
| 真实 Git clone | NOT_RUN |
| 独立远程仓 / PR | NOT_RUN |
| 完整远程 CI | NOT_RUN，输入供应尚未就绪 |
| 正式 candidate / 发布 / 部署 | NOT_RUN |

下一步沿已有范围先逐仓提交，再真实 clone 验证提交对象。建议每仓第一笔 `feat(workbench|crm|knowledge): add independent plugin author repository` 同时包含运行源码、必需构建/锁/测试/说明，避免只提交脚本却缺 plugin 的中间状态；后续 CI 输入准备作为独立 `chore(ci)` 事件。Knowledge 两项修复可以作为功能提交后的独立 `fix(verification)`，或纳入经审查的首次功能提交，不人为制造已知缺陷版本。主树汇总单独作为 docs 事件。

本轮没有 stage、commit、建远程、push、PR、合并、发布或部署；不扩大 shine-brand 的远程授权。主树只增量更新五份当前文档和本证据/机器摘要，继承产品修改、VERSION、candidate/journal 保持。SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false；不重跑全量 SDK/B0/headed/WSL，也不勾完 T15/T19/T21。
