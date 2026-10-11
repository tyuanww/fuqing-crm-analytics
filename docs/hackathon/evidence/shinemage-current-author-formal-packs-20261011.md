# 最新作者来源正式插件包（2026-10-11）

Workbench 与 CRM 已从各自干净固定提交和同来源真实 Ubuntu PR CI 的运行文件生成 dsh-plugin-pack/v1。当前主仓 reader 已严格读取，运行包成员与 CI 字节逐一核对，既有结果目录再次写入均被拒绝。主仓两份包／作者证据锁未前移；没有新 candidate、journal、宿主准入、Git 或发布动作。

| owner | 固定来源 / 实际 CI | 正式回执 SHA-256 | tarball SHA-256 / 字节 |
|---|---|---|---|
| Workbench | 6c5adc9faa04f692d5d4b3028af4f945ab49dfe4 / [38126014921](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38126014921) | 0af61dabbab9a2205fb1d9ff3a2eec7e8194800d9af3f9043b0a5587a81edc12 | e41df9f5a8f7031c092319222543c8d723ca644c0c9d69b2ae53f13257e9b79e / 438499 |
| CRM | c4b1c91eaa4fa645deb7951614c1937eb76db143 / [38126019403](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/38126019403) | 4663cce02776fa68913a41829d8ca0712fa44bf1c7642844326d80de40af2158 | 0da9f8edd40b17a92377aa4b35d219229c8461b942060a7dd0e12265343500fd / 234901 |

Workbench 正式包为 8 成员，CRM 为 5 成员。运行文件和声明资产与该 CI content pack 同字节；manifest 仅按原 producer 去除 scripts，其他 JSON 字段保持。Workbench tarball 与旧包同字节，新的 source_sha / 正式回执仍是新身份，不能直接继承旧 candidate 或现场准入。

## 来源与实际边界

真实 run/jobs/artifact API 核对固定 PR 提交和成功步骤；ZIP 外层摘要、成员边界和内容包均验证。新本地 clone 使用 --no-local，精确 SHA，无 alternates，工作区及原作者仓干净；未在本轮重新编译或安装 SDK。

producer 是主仓 HEAD 5390667c 的 8 个实际 Git blob，reader 是当前主仓的 8 文件封存副本；两组摘要均再次核对。拒主仓内容、九个原作者目录和网络的策略下实际 pack / readback exit 0；13 个来源负对照为 EPERM。不是整机不可读。输出复用均 exit 2 / PLUGIN_PACK_OUTPUT_EXISTS，首包和回执未变。见[最终字节审计](/Users/hutou/.codex/tasks/shinemage-current-author-formal-pack-20261011-_zy2t9yo/final-pack-validation-r2.json)与[实际负对照](/Users/hutou/.codex/tasks/shinemage-current-author-formal-pack-20261011-_zy2t9yo/source-negative-r1.stdout)。

Workbench 的 155 文件 / 1086 PASS 来自上述已有真实远端 core 结果读回，0 FAIL / 0 SKIP；本轮没有在本机重跑，也不能与 B0 数字相加。CRM 实际 Package behavior CI 步骤成功，本记录不从无计数的准备 JSON 推测测试总数。

CRM 第一次 producer 本身已经 exit 0；包装误把 pnpm 自动带入的 README 当成正式必需成员，之后只改验证包装。原 manifest 的 files 不声明 README，因此原正式 producer 输出 5 成员是预期，没有重打包或放宽规则。审计包装另有一次读取错误 CI 字段的 KeyError，修正包装后完成核对；原失败说明保留。

## 下一步的两锁提案

已经准备仅修改 config/shinemage-composition-packs.lock.json 和 config/workbench-author-evidence.lock.json 的[两路径清单](/Users/hutou/.codex/tasks/shinemage-current-author-formal-pack-20261011-_zy2t9yo/next-main-binding-proposal-r2/main-local-binding-plan-r2.json)及[增量补丁](/Users/hutou/.codex/tasks/shinemage-current-author-formal-pack-20261011-_zy2t9yo/next-main-binding-proposal-r2/product-delta-r2.patch)。对当前主仓 apply --check exit 0；未应用。

提案在独立输出目录用原准备器核对 9 个正式包、2 份原 profile，并将 Workbench 正式包与相同来源的真实 CI core 精确关联，exit 0。其他七包、profile、私有 core 检查计划与主仓保留业务断言不变；[实际回执](/Users/hutou/.codex/tasks/shinemage-current-author-formal-pack-20261011-_zy2t9yo/next-main-binding-proposal-r2/binding-validation-r3.json)。早期包装的不同 schema 比较和占位符替换失败留存，产品锁未受影响。此项只证明准备与身份绑定，不执行插件、宿主或业务。

该提案不包含 peer 校准、candidate/journal、Git、发布、部署或删除。CRM / Knowledge 的 Cordis 声明仍精确 4.0.2，固定官方环境为 4.0.4，严格兼容 OPEN。Brand 当前合同 CI 没有 runtime content artifact，本轮没有伪造其最新正式包。SDK 分发仍 BLOCKED；产品 PARTIAL，release_ready=false。

机器摘要：[validation JSON](shinemage-current-author-formal-packs-20261011-validation.json)。
