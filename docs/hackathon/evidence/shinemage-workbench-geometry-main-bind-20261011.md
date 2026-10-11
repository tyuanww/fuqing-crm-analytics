# Workbench 私有几何的正式来源与主仓对接（2026-10-11）

本轮完成已授权的本地正式包绑定和三路径对接。主仓 HEAD 仍为 `5390667cc990fa558b0445aa455b086d325a6c77`，没有提交、推送、PR、合并、发布或部署；VERSION 仍为 `0.20.0.0`。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

## 实际输入与身份

- 作者来源为干净提交 `e922328906a7bf7a7251c26198683f67fa3afd39`；从该提交执行 `git clone --no-local`，没有 alternates，只导入本次真实 CI 的编译 lib，并核对包内八成员与来源资产/manifest。
- [PR 完整 Ubuntu CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38116124494) 已有 155 文件、1086 PASS / 0 FAIL / 0 SKIP；几何测试文件 `src/board-spec/geometry-composition.test.mjs` 在实际 plan 中恰好一次。这是既有远端执行结果，本轮没有重跑或与本机次数相加。
- CI artifact `11693279047`：ZIP 546706 字节、SHA-256 `20639168b2c5f5300424800f6b55faa3a3765162f98847632aa9e0c926d0439f`；其普通 content pack 441127 字节、`f5e9dfe41859b0ae3254cbaddf12a128e89cd3c53bde82b84f366beef03ae5d7`。普通包与此前 CI 的普通包同字节；两次 ZIP 不同，不混写身份。
- 新 `dsh-plugin-pack/v1` 回执 SHA-256 `871fd3bb3c5c982816c7cbf9b17f842ee3bccee597662247a56e15c68db05e24`，`source_dirty=false`。正式 tarball 438499 字节、SHA-256 `e41df9f5a8f7031c092319222543c8d723ca644c0c9d69b2ae53f13257e9b79e`，仍为八成员，与旧正式 tar 同字节。封存 producer 的八文件来源核对后生成，实际接收用当前主仓 reader；未重新编译插件、DSH 或 SDK。
- 组合锁 `8bd6adfb5dacc52f402946b58e6e9517292215a524fc730dacad4ff35716d1ad` 只前移 Workbench 行，另八包和两份 profile 不变。作者证据锁 `3ae61a28057a3bdd376958cebcb9d6a86cedef7f5ddab27383b4c717874133ed` 同时固定 e922 来源、新正式回执/tar、实际 CI run/artifact、archive/member 摘要和 155/1086 计数。

## 主仓变化与实测

只应用已审三路径：作者证据 reader 返回真实 `core_files`，其单测核对返回值，主仓几何入口核对作者 CI 含精确几何文件。原几何计算断言由作者仓维护；主仓不复制其实现。现有 pipeline 在执行几何阶段前先绑定来源、正式回执和 tarball；本轮核对这段调用顺序，没有执行完整 pipeline。

| 实际入口 | 结果 | 范围 |
|---|---|---|
| 隔离副本 reader 单测 / 几何入口 | 13 PASS / 1 PASS，各自 0 FAIL / 0 SKIP | 原始输出分别保存，不累计 |
| 应用后主仓 reader 单测 / 几何入口 | 13 PASS / 1 PASS，各自 0 FAIL / 0 SKIP | 运行当前实际文件与实际固定 CI |
| 主仓九包准备 CLI | exit 0，九包和两份 profile | 当前默认组合锁、摘要和 public export/peer 守卫 |
| 当前 reader + 正式包身份绑定 | exit 0 | 实际 CI、来源、新回执和 tar 的关联 |
| 旧来源、旧回执、错误 tar、旧 CI / 错误正式回执摘要 | 全部拒绝 | 无源码回退 |
| 重新封存但删除几何文件的负测 ZIP | exit 1，`WORKBENCH_GEOMETRY_AUTHOR_COVERAGE_REQUIRED` | 明确为合成坏输入，不是官方 CI |

九份主仓插件、九个原作者仓和实际固定上游/build-tools 的二十项内容读取负对照均为 EPERM。Seatbelt 使用 allow-default，只拒绝列明内容和写入；不是整机不可读。组合策略保留 localhost 例外，但本轮未启动服务、宿主或浏览器。

## 留存与限制

原始目录 `/Users/hutou/.codex/tasks/shinemage-workbench-geometry-main-bind-20261011-cxseey_1` 内保留 clone 输入核对、新 formal-pack、旧锁快照、正负测命令和日志、隔离策略及 `application-r2.json`。临时验证脚本的首次摘要拼接、row 形状和沙箱 Unicode 路径错误保留失败记录；修订后验证通过才应用主仓。首次 application 元数据的 geometry pre-image 已在 r2 按原已审清单纠正，原 r1 不覆盖。原快照中作者历史 head 锚点与本轮 e922 当前 head 分开核对，最终保全见 `final-preservation-r1.json`。

本轮没有新完整 B0、主仓 hosted CI、candidate/journal、宿主/服务/目标/browser/WSL2、真实模型或业务验收。相同运行字节不赋予新来源旧候选准入。领域生产者与剩余源码合同、Cordis 原声明冲突、正式交付和 SDK 适用门禁仍开放；旧副本不删，父任务不勾完。

机器记录见 [validation JSON](./shinemage-workbench-geometry-main-bind-20261011-validation.json)；[此前 CI 交付](./shinemage-workbench-geometry-ci-delivery-20261011.md)和 [d038 时点](./shinemage-workbench-core-formal-main-ownership-20261011.md)保留各自原文。
