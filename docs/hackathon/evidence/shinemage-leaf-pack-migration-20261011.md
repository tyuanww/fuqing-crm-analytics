# 默认 B0 叶子插件包消费迁移（2026-10-11）

基线为主仓 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`。本批只有本地实现和验证，没有 commit、push、PR、合并、发布、部署或旧副本删除。机器记录见[validation JSON](shinemage-leaf-pack-migration-20261011-validation.json)。

## 本轮关闭的子项

默认 pipeline 撤去品牌、瀑布、人群行动、问数、看板标记、漏斗六个常规主仓构建调用及相应源码消费测试，改为读取独立正式包的公开 host/client 和几何导出。原品牌默认边界、槽位注册/释放、五个能力标记、漏斗坏输入/原始比例/零分母、瀑布完整列表/比例/上限与 ESM、Node require、公开声明消费检查均保留；公开 host 在实际 Cordis 上挂载并回收的检查另行补齐。没有修改任何插件包或上游实现。

沿用已有七包 page profile 及 CI 输入锁。读取器先核对正式 manifest、tarball、来源、profile、公开导出、精确 peer 与客户端平台，再解包到本次新目录；没有源码回退、peer 安装、Kit 构建或完整宿主启动。原 Workbench 包一起保留在 profile 中，但本项不导入它的运行模块，不能抵扣该包已知的运行 peer 缺口。

`legacy-geometry-exports.test.mjs` 从该次解包读取公开 `.mjs`、`.d.mts` 和 manifest，再作独立 ESM/require/TypeScript 消费验证。TypeScript 来自显式 `B0_BUILD_TOOLS`，版本仍为 `6.0.3`；这不是五个作者仓独立 tsc，也不改变 `NOT_IN_CURRENT_BUILD`。

pipeline 在任何源码构建/服务前新增叶子输入校验和 `leaf`、`geometry` 结果目录防复用；新输入守卫与消费入口均已登记。历史显式作者输入守卫与源码隔离夹具仍保留 Kit 绑定，Workbench/CRM/知识及其他私有源码阶段尚待迁移，不能称默认 B0 全链已脱离主仓源码。

## 本次实跑

| 记录 | 命令/范围 | 结果 |
|---|---|---|
| preparation-r1 | 真实目录输入，经现有 CI 准备器复制九份固定包 | exit 0；18 份 manifest/tarball 与前轮密封输入同字节 |
| contracts-r2 | 叶子输入、profile/组合/包及显式构建输入七文件回归 | 88 PASS / 0 FAIL / 0 SKIP，exit 0 |
| consumer-r2 | `node --test --test-concurrency=1 scripts/dsh-b0/leaf-pack-composition.integration.mjs scripts/dsh-b0/legacy-geometry-exports.test.mjs` | 20 PASS / 0 FAIL / 0 SKIP，exit 0 |
| boundary-probe-r1 | 列明源码拒读；固定输入可读 | 21 个 EPERM、3 个 READ，exit 0 |
| consumer-r3-existing | 对已使用结果根再运行同一入口 | exit 1，预期 EEXIST；两个首轮回执摘要未变 |
| shared plan/tooling-r2 | 实际六个变化路径的共享选择器 | exit 0，tooling=false；没有执行 tooling 测试，不能报新的 tooling PASS |

88 与 20 分别记账，不相加为总体通过。本机 macOS arm64，Node `24.19.0`、Python `3.14.4`，固定 DSH `0.1.7-rc.2` / `477b4f42`；Ubuntu/hosted CI 本轮未运行。consumer 在源码拒读/localhost 规则下运行，未启动 HTTP 服务、DSH 完整宿主或浏览器，测试进程 exit 0。策略拒绝主仓十个业务目录、九个作者仓和两处来源副本，共 21 个根；历史证据、Kit/build-tools、固定上游和未列明路径仍可读，不是整机 deny-default。

初次 guards-r1 为 7 PASS / 2 FAIL：两个负测夹具新增了未声明文件，真实包读取器先以 `PLUGIN_PACK_TARBALL_UNDECLARED` 拒绝。修复夹具的 files 声明后，仍由叶子公开导出门禁拒绝，不放宽生产读取器。consumer-r1 为 14 PASS / 6 FAIL：测试错误地读取 Cordis 不存在的 status 字段；按固定上游公开 Fiber 合同，改为核对挂载后的 uid 与回收后的 null。两份失败日志保留，没有覆盖。tooling-r1 的记录脚本缺清单也保留；后续只是核对真实选择计划。

## 留存与开放项

原始目录：`/Users/hutou/.codex/tasks/shinemage-leaf-pack-migration-20261011-mzjlgkh0/`，含日志、固定输入、策略/负对照、首轮失败、成功运行和回读。47 份继承文件中 40 份原字节保留；续改的 7 份为 pipeline、共享合成包夹具和五份当前说明。此前五对证据保持原字节。

完整 B0、新 hosted CI、依赖/Docker smoke、剩余默认源码装配、live CLI reload、修复后 Workbench 的干净新提交/正式包、当前候选的完整宿主/服务/目标/浏览器/恢复、真实模型/CRM/WeKnora/UAT、独立发布和 DSH 升级仍开放。本轮没有新 candidate 或 journal 事件；`591134e8…` 的 candidate/state 摘要保持原值，journal 仍 seq 3。SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION 保持 `0.20.0.0`。
