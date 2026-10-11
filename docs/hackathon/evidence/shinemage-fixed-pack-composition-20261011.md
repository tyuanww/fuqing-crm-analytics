# CRM／知识与 page tools 固定包组合（2026-10-11）

当前主仓 HEAD `5390667c`；本轮实现和证据均未提交。沿用既有独立仓正式包，不改 manifest、peer、源码提交、DSH pin、candidate 或 journal。机器记录见[validation JSON](shinemage-fixed-pack-composition-20261011-validation.json)。

## 改动与实际输入

组合测试的维护正文和合成 HTTP 夹具移到主仓 `scripts/crm-calibration/`，旧测试路径保留兼容入口。两份测试的九项行为正文与移前逐字节一致；dashboard、graph 夹具正文同字节。登录夹具改为注入实际编译包模块，不读取 CRM 源码中的路由常量；通过真实注册的公开 HTTP 路由验证合同。

`composition-inputs.mjs` 先调用正式包读取器核对 profile、manifest 和 tarball，再解到本次独占的 profile 目录，使用官方 `createRuntimeResolution` / `PluginPackages`。未手工建立 SDK 链接，未执行 `plugin add`、peer 安装或 `allow-version`。这一入口是公共合同组合验收，不能抵扣完整宿主安装和激活。

- CRM：独立提交 `5a839fa8…`，正式 tar `0da9f8ed…`。
- 知识：独立提交 `94ef29fa…`，正式 tar `ed788820…`。
- CRM／知识 profile：原 `crm-knowledge-rc2`，SHA-256 `7ca35116…`，未改原文。
- page tools：另读原七包 profile 的 Workbench 正式包，来源 `92dfa171…`，tar `a0d5dd08…`，只消费公开 `./page-tools`；其他六包仅解包，没有激活，不冒称原 Workbench 完整宿主通过。

所有实际摘要、公开模块与解析目录见机器记录和 `runs-r3/*/runtime-inputs.json`。Cordis 声明保持 `4.0.2`，实际官方解析为 `4.0.4`；DSH tools 为 `0.1.7-rc.2`。

## 验证范围

| 记录 | 实际结果 | 范围 |
|---|---|---|
| composition-r3 | 9 PASS / 0 FAIL / 0 SKIP，exit 0 | 两种顺序、独立卸载、原生工具保留、公开页面工具、登录知识 lease、断开/卸载后的迟到引用撤销 |
| contracts-r3 | 47 PASS / 0 FAIL / 0 SKIP，exit 0 | 本次组合输入守卫及既有 profile/包守卫；不是全量 B0 |
| fixture-compat-r1 | 78 PASS / 0 FAIL / 0 SKIP，exit 0 | 旧主仓源码测试继续使用迁移后的夹具；不是独立包或浏览器验收 |
| negative-proof-r2 | 9 条观察，exit 0 | 五条源码 EPERM；缺输入、相对路径、坏摘要在输出前拒绝；已有输出 EEXIST 且回执未变 |
| cleanup-r3 | 12 个自有 loopback 服务均关闭；结束后端口可 bind | 被动记录真实监听/关闭，进程退出后逐端口验证 |

上述结果分别记账，不相加为总体通过。contracts-r1 的 44 PASS / 1 FAIL 保留：缺 SDK peer 被正式包读取器更早拒绝，负测原期望码不符；只修正测试期望，没有放宽产品检查。r1/r2 运行也保留，不覆盖历史。

补查发现并修复页面输入对 CRM／知识同名包的覆盖风险：拒绝两个 profile 的包 ID 重叠，且运行映射只加入已选定 page tools。另有有效包覆盖的负对照。声明、领域合同和公开导出复用 profile 准备的检查，不复制业务 decoder。

## 隔离、证据与未执行

原始材料：`/Users/hutou/.codex/tasks/shinemage-composition-pack-20261011-j1s05ib2/`。策略只拒绝列明的主仓业务插件、九个作者仓及旧 CI 来源树的数据读取，并只允许 localhost 网络；不是整机 deny-default。使用 Node 24.19.0、Python 3.14.4 与固定官方 DSH 上游；业务源码负对照实际为 EPERM。所有 22 个原包输入文件、原 candidate 和 state 摘要未变，journal 仍 seq 3。

这里只把 Cordis 4.0.4 的九项公共合同组合行为记为通过；整体兼容仍 PARTIAL。完整官方宿主、CLI reload、当前 candidate 的正式服务/目标/浏览器/回退、真实模型/CRM/WeKnora/UAT、本批完整 B0 和新远端 CI 都未执行。默认 pipeline 的其他源码装配仍未迁移；其组合阶段现在要求固定包输入，不能无输入回退源码或静默跳过。旧副本清理仍受 stop/go 约束。

SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION 未改。本轮没有 commit、push、PR、merge、发布或部署。

委派审查覆盖 28/28 可审文件（17 份新审、11 份按精确字节复核），另补查 9 份 Markdown 和 288 个本地链接目标。还有一项 Medium：主仓两个 B0 workflow 尚未供应新组合的三项固定输入，须接通后才可按完整 B0/CI 推进本批产品代码的交付。审查不把这一开放项改成通过；外部 LLM NOT_RUN。原始审查为 `ocr-review-r2.json`。
