# CRM 与知识插件独立包：2026-10-04

结论：T15 的本地插件拆包子项完成，CRM 与知识可分别构建、打包并由新 profile 独立选择。整体仍 **PARTIAL**；尚未物理分仓、发布或加载到杭州。固定 SDK 组合测试不替代完整 DSH profile/session/WAL 与进程故障隔离证据。

工作树：`/Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics`，分支 `codex/plugin-boundary-review`。本轮从干净的 `ff7fc5fc0fa0295969fe789bc0bd7983a670c73a` 继续；该 SHA 是上一轮 OCR 修复提交。本轮成果已完成独立 OCR 审查和修复，准确本地提交以 Git 为准；不借用上一轮审查结论。VERSION 仍为 0.20.0.0，DSH 仍为 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`。

## 交付边界

| 包/模块 | 本轮结果 |
|---|---|
| `@shine-mage/dsh-crm-knowledge@0.0.0-crm.1` | 保留现有包身份，拥有 CRM 登录、指标/分析和 UI；移出知识工具及图谱实现。只消费指标服务 HTTP 客户端 |
| `@shine-mage/dsh-knowledge@0.0.0-candidate.1` | 新独立包，拥有公开解释与教材检索/引用展开/图谱工具；无 CRM 业务实现、UI、Python 或数据依赖 |
| `shinemage-knowledge-access/v1` | CRM 身份 owner 维护的可选能力；只交付当前会话的用户名、取消信号、有效性检查及受约束的引用记录回调，不交付密码或令牌 |
| 领域生成合同 | 各包携带自己的 HTTP schema/类型/传输层和公开定义；生成器检查源摘要与输出，包运行和构建不读取兄弟业务实现 |
| profile v3 | CRM、知识解释、私有教材、页面工具分别生成 Cordis 条目；每个模块绑定本包指纹，无聚合 `tools.mjs`。保留旧 profile 与旧包，拒绝旧合包混装 |

公开解释可以在没有 CRM 插件时运行。私有教材目前仍由 CRM Host 提供会话身份；未装、版本不符、未登录时分别返回 `IDENTITY_PROVIDER_NOT_AVAILABLE`、`IDENTITY_CONTRACT_MISMATCH`、`NOT_CONNECTED`。断开、Host 卸载或知识模块卸载后，在途结果被丢弃，不写入失效或替换后的授权账本。模块顺序互换、卸载/重新加载知识以及卸载 CRM 的固定 SDK 测试保留其他领域和原生探针工具。

这不证明任意不可信插件能在同进程内隔离崩溃/挂死，也不提供独立知识登录 UI。域服务、真实 CRM 兼容窗口和数据持久化仍由服务 owner 管理。

## 本次实际验证

环境：Node 24.19.0、pnpm 11.7.0；完整后端 Python 3.14.4 / FastAPI 0.141.1 / DuckDB 1.5.6 / Ruff 0.16.9。B0 另用其最小锁定 Python。未安装或升级依赖，使用已有固定上游 checkout。以下各 suite 有重叠，不能相加为唯一用例数。

原始日志目录：`.context/checks/crm-plugin-split-20261004-161314/`。统一验证入口另保存在 `.context/checks/crm-candidate-20261004T083445Z/`，其中 `summary.json` 记录命令、exit code、输入摘要及验证期间源码未变化。

| 命令/范围 | 结果 | 日志 |
|---|---|---|
| 两插件各自 `build.mjs <固定上游> <kit/build-tools>` | TS 类型检查与构建 PASS | `build-knowledge-first.log`、`build-crm-final.log` |
| 两域全部 `.test.mjs`（不含 browser journey）及 CRM Host、页面、服务 HTTP、知识组合 integration | 162 PASS / 0 SKIP | `crm-knowledge-full.log` |
| `python -m pytest backend/tests/test_crm_service_contracts.py backend/tests/test_crm_service_packages.py -q` | 17 PASS；实际独立服务打包/隔离运行、离线生成物检查 | `backend.log` |
| `python scripts/crm-calibration/verify.py --node <Node24> --upstream <固定上游> --build-tools <kit/build-tools>` | 12 阶段 exit 0；后端 206 PASS，Node 160 PASS / 0 SKIP；Ruff、合同/类型检查、双包构建 PASS | `verify-entry.log` 与上述 `crm-candidate-…` 日志 |
| `node --test scripts/dsh-b0/plugin-isolation.test.mjs` | 4 PASS；brand/query/CRM/knowledge 仅各自源码+kit 构建/测试/pack。CRM/knowledge 对最终 tarball 安全解包后加载固定 SDK | `isolation.log`，最终 B0 也重验 |
| 真实 `prepare-profile.mjs` CLI，分别选择 CRM、knowledge、两者+页面提供方 | 三种配置均 exit 0；schema v3，独立包指纹，CONFIGURED_NOT_RUN；未运行或激活服务 | `profile-cli.json`、`profile-final-*.log` |
| profile 修复后的 `node --test dsh-plugins/crm-knowledge/test/profile.test.mjs scripts/release/plugin-boundary.test.mjs` | 8 PASS / 0 SKIP | `profile-boundary-final.log` |
| `B0_BUILD_UPSTREAM=<固定上游> node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python314-0200/bin/python`，最终重跑 | exit 0；Python 618 PASS；Node 19 个阶段合计 1473 PASS / 1 SKIP（含 clean 重跑）；9 插件构建与 workbench 7 份产物干净重建 PASS | `b0-final.log` |
| `plugin-boundaries.mjs --check` | 11 包、607 源文件、29 跨包引用、15 合同；生产源码例外 0 | B0 日志和机器清单 |

统一入口的 160 项与额外页面组合 2 项组成前述 162 项范围。随后发现 profile 校验问题，只修改配置校验器和其负测；该部分经 8 项定向回归、真实三种 CLI 配置和最终 B0 再验证。未把早期 PASS 当成修复后的唯一证据。

B0 的 1 个 SKIP 是缺外部样例的 `real standalone example keeps filters, chart and edited KPI label`；不是浏览器通过。Python 警告原样保留。旧后端全量 2939 通过属于上一轮，此轮仅列实际执行的 206 定向与 B0 范围。

本次命令的绝对解释器、参数、逐文件摘要、最终差异检查与文档链接结果由原始目录的 `summary.json` 记录；文件清单为 `changed-files.txt`。只启动测试拥有的临时 loopback HTTP 子进程，并由夹具关闭；没有启动 6677、真实 DeepSeek、真实 CRM 或读取真实业务数据。

## 失败与修复

1. CRM 首次构建发现 health 的 AVAILABLE 分支缺少 `reason`，推导出不符合 JSON 合同的 `undefined`。补齐 `reason:null`，类型检查和后续回归通过。保留 `build-crm-knowledge-first.log`。
2. 实际三方 profile 生成暴露 `PAGE_PROVIDER_CORDIS_PIN`：页面提供方只声明固定 DSH tools peer，新共享校验器误要求它也必须声明 Cordis。现在 CRM/知识仍强制 Cordis 4.0.2；页面提供方若声明该 peer 也必须匹配，未声明时沿用其原 DSH tools 合同。测试夹具同步真实 manifest 形状，CLI 保留 `PAGE_PROVIDER_*` 原因码。保留失败 `profile-combined.log`，修复后组合配置 PASS。
3. 新包产物的 `.gitignore` 已补齐 `lib/` 与 `node_modules/`，防止把本地编译副本当作源码提交；正式发布仍从干净已审查 SHA 构建包。

## 本地 fixture tarball

下列摘要来自最终 B0 的隔离构建/pack/解包实测，与首次隔离验证一致。临时 Git 提交仅用于测试真实 pack 的来源校验，不是已审查产品提交；临时安装目录由测试清理，不把这些 fixture 作为正式 Release。

| tarball | 字节数 | SHA-256 |
|---|---:|---|
| `shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz` | 233852 | `3c14e5ae3c7f7cfb719f0bbb84ecc02211462ac3ae4f58b9f8da8644b422d9c7` |
| `shine-mage-dsh-knowledge-0.0.0-candidate.1.tgz` | 14429 | `d611f832ba332dd84dc2e00e401e2d4648c102f759f18967f1d0d7b94403373f` |

## 剩余门禁

- T15：物理插件/服务分仓、平台依赖冷安装、完整 invariant、签名/SBOM/CVE 与来源信任；本地拆包子项已关闭，整体仍 PARTIAL。
- T2/T17：精确宿主/profile 加载与受控重启、session/WAL、进程故障隔离、canary/回退；SDK 测试不等于完整官方宿主验收。
- T3/T7：真实 CRM API 版本窗口、D15 保存/UNKNOWN/幂等回放与状态 forward-fix。profile 回退不等于数据库回滚。
- 新工作树增量已完成提交前审核，未 push；本轮没有远端 CI、GitHub Release、杭州部署、浏览器、真实模型或业务 UAT。后续从 clean reviewed commit 重建候选，生产只接收对应不可变 artifact。

实现和迁移入口：[CRM 插件](../../../dsh-plugins/crm-knowledge/README.md)、[知识插件](../../../dsh-plugins/knowledge/README.md)、[插件与服务边界](../../operating/crm-plugin-service-boundary.md)。进度记入 [STATUS](../../../STATUS.md)、[TODOS](../TODOS.md) 与[拆分计划](../../plans/shinemage-plugin-platform-split.md)。

## 提交前审核增量

本轮随后执行 OCR delegate，确认并修复 owner 卸载后公开知识/CRM HTTP 仍可能迟到成功的生命周期缺口；修复后工具回执会被拒绝，但不宣称回滚已完成的服务写入。当前包摘要及 166 项插件、16 项隔离/边界回归见[审核记录](./dsh-g0-crm-split-review-20261004.md)。上方原始包摘要只代表修复前阶段，不再作为当前候选摘要。
