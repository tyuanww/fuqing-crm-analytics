# SDK 内容审计与来源分类（2026-10-07）

按本次「先 commit，然后继续推进」执行：先提交上一批 15 个文件，再继续 T15 的开发 SDK 内容审计。前批已提交 **`78175422` / `feat: add bounded local SDK archive transport`**，正常 hooks 完成，提交后工作树干净。本页对应的审计代码、测试和文档是提交后的新增量，尚未提交。未 push、发布或操作杭州。

后续状态：本页保留初次审计时的结果；上述增量随后与缩减 SDK 一起完成 [OCR 审修并随本次本地提交收录](dsh-g0-kit-sdk-review-20261007.md)。原完整归档的 BLOCKED 结论不变。

## 本次结论

**审计入口和防护测试通过；真实 SDK 内容准入仍 BLOCKED，产品仍 PARTIAL / release_ready=false。**

只读审计复用 `sdk-archive.py` 的 schema/pin/平台/ZIP 资源限额校验和每个 blob 的摘要验证，再核对接收树清单内文件及链接。Python receive 和审计共用 `verified_archive`，避免另一套归档解释器；生产 receiver、DSH 上游、原 pack/receive 回执不变。文件模式扫描复用现有 `secret-scan.mjs`，未放宽生产规则，也未豁免 vendor/test。

报告只记录相对路径、文件摘要、类型和计数，不输出命中值或源码片段。原始证据目录为 `.context/checks/kit-content-audit-20261007/`，CLI 报告必须写入 SDK 以外的新文件；旧文件和通过目录别名写入 SDK 都被拒绝。只审查清单内固定输入，不接受并发修改的目录，也不证明接收目录中清单外文件安全。

## 实际归档审计

输入复用[上一步归档](dsh-g0-kit-sdk-archive-20261007.md)的 `pack-r2/sdk.zip` 与 `received-r1/`，没有重新打包或更换候选。

| 项 | 本次结果 |
|---|---|
| archive SHA-256 | `9ceeb884c014fa374a65c593b0e402396b9d06c509aceeed44f42b32b38056d5` |
| 固定上游 | DSH `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` |
| 平台 | darwin-arm64 / Node 24 / Python 3.14 |
| 最终实际运行 | `audit-r2.json`，84.996 秒，退出码 **2**，**BLOCKED** |
| 内容摘要 | 115224 个文件，2195784674 逻辑字节；8987 个链接按清单核对 |
| 模式检查 | 115212 个文件，1347703351 字节；这是有界模式扫描，不是完整安全审查 |
| 疑似命中 | **55 个文件**；记录为 `SECRET_PATTERN_REVIEW_REQUIRED`，没有据此认定 55 个真实凭据 |
| 覆盖缺口 | **553 个文件**，见下表；不记作 PASS |

| 缺口类别 | 数量 | 本次边界 |
|---|---:|---|
| binary-or-nontext | 460 | 包括二进制及非 UTF-8；即使经过原始字节的文本模式检查，仍不认定覆盖完整 |
| native-or-wasm | 79 | 原生模块/可执行文件/WASM；未做供应链和二进制分析 |
| file-size-limit | 12 | 单文件超过 16 MiB，仅核对摘要；包括大型原生程序和 Git pack |
| git-object | 1 | 当前为 Git pack index；不展开对象历史 |
| nested-archive | 1 | 扩展 ZIP 未展开；不在本轮隐式解包第三方内容 |

初次 `audit-r1.json` 为 109.343 秒、55 命中/550 缺口，保留原证据。随后补充非 UTF-8 分类和输出位置保护，最终运行新增 3 个非文本缺口，总计 553；未改秘密模式或绕过结果。

## 来源分类与体积原因

对 55 个命中路径逐个按摘要核对，使用只读 Git `show` 对比固定提交，并只记录匹配类型、位置及分类：

- **30 个**文件与固定 DSH 提交的原文摘要一致。
- **24 个**文件来自依赖包，尚未逐包对照受信 registry 来源。
- **1 个**为上游构建生成的 `apps/web/lib/types/tests/smoke-real.e2e.js`，不在该提交的 tracked 源码内；生成来源尚未独立证明。

`triage-r1.json`/`triage.mjs` 保存脱敏来源分类，`triage-r2-binding.json` 确认两次审计的 archive 和 55 项发现完全相同。这些只是来源分类，**不是安全清除或 allowlist**。私钥形状、测试字串、文档样例和词法误报仍需按实际保留内容核实，不把固定上游或文件名为 test 当成豁免理由。

`size-inventory.json` 按 manifest 统计逻辑体积：Codex 依赖约 288 MB、Claude Agent 依赖约 199 MB、LibreOffice 依赖约 153 MB，另有桌面/浏览器资源及 Git 对象。当前 transport 搬运了整套准备目录，不能据此声称它是最小插件 SDK，也不能只凭这些名字直接删除目录。

后续在新候选目录提取官方 SDK 编译产物和真实必要依赖，保留来源、pin、摘要与消费者合同；固定源码准备路径继续保留，不能修改上游或直接删 tracked 源码来“精简”。以旧 SDK 不可读、无相邻源码且 10/10 消费者构建/测试为准，再审计实际保留内容。这是 T15 的下一子项，**尚未执行**。完整 SDK 审计属于 SDK 分发维护，不加入每个业务插件的日常构建流程。

## 验证与输入保护

| 本次命令/检查 | 结果 |
|---|---|
| `python3 -m pytest --noconftest -W error::ResourceWarning -q scripts/dsh-b0/test_sdk_archive.py` | **17 PASS / 25 subtests PASS**；新增只读归档验证及腐坏 blob 拒绝 |
| `node --test scripts/release/sdk-content-audit.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs` | **18 PASS / 0 FAIL / 0 SKIP**，其中 7 项审计防护、11 项包边界 |
| Ruff / `git diff --check` | PASS |
| 原 SDK 输入 | 124231 条文件/链接记录保持 |
| 接收 SDK manifest | 141091 条记录及普通文件内容/模式保持 |
| 旧证据与候选 | 1318 个旧证据文件的摘要/大小/mtime 保持；原 candidate 摘要及 journal seq 6 摘要保持 |

新增审计防护覆盖：vendor/fixture 不豁免、命中值不输出、文件篡改、外部链接/路径逃逸、错误回执、大小/二进制/非 UTF-8 覆盖缺口、报告目录别名和旧证据覆盖。B0 JS 清单接入 synthetic 防护测试；**没有把实际 812 MB SDK 扫描自动加入 pipeline**。没有重跑上一阶段 10/10 消费者构建；它们的旧结果不计作本轮新通过。

本次准确命令、绝对解释器路径、运行时间与源码摘要在 `command-r2.json`、`result-r2.json` 和 `audit-r2.json`；保护复核见 `verify-protection.py`/`integrity.json`。提交前检查另在 `.context/checks/kit-archive-commit-20261007/`，只覆盖上一批，不冒充本次完整独立 OCR。

完整秘密审查、最小闭包、签名/SBOM/CVE/撤销、目标平台/WSL、新机器、真实身份/模型/UAT 与生产 activation/canary/rollback 仍开放。当前工作没有读取真实 DuckDB，没有修改或追加候选 journal，也不满足新 SDK 或生产 Release 放行条件。

后续已完成[同平台 SDK 缩减与消费](dsh-g0-kit-sdk-closure-20261007.md)：最终缩减输入 0 模式命中、17 覆盖缺口；本页完整归档的 BLOCKED 结论与原报告保持，不用后续结果覆盖历史。
