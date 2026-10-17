# 工程收尾红队攻击记录

日期：2026-10-17

## 红队目标

假设一个不信任当前回执的发布审核者，目标不是证明页面能打开，而是证明当前字节、依赖、运行时、数据边界、回退和证据都没有被拼接或伪造。

当前结论是 `rc1 candidate=NOT_RUN`。文档中的 rc1 版本锁定不等于 rc1 构建通过。

## 已复核的阻断点

### 1. rc1 不是字符串替换

当前仓库的 `dsh-plugins/plugin-kit/toolchain.json` 仍为 SDK `0.1.7-rc.2`，插件仍声明 `@deepseek-ai/dsh-tools@0.1.7-rc.2`，CRM/Knowledge 仍声明 Cordis `4.0.2`。rc1 的包依赖闭包和 Cordis 版本不同，因此不能只修改版本字段。

证据：

- `dsh-plugins/plugin-kit/toolchain.json:14`
- `dsh-plugins/analytics-workbench/package.json:10`
- `dsh-plugins/crm-knowledge/package.json:16-17`
- `dsh-plugins/knowledge/package.json:16-17`

### 2. 组合读取器默认允许缺少 generated provenance

`loadProfilePacks()` 的 `requireGeneratedProvenance` 默认值为 `false`，并把该默认值传给 `readPluginPack()`。`readPluginPack()` 同样默认不要求 `generated_bytes_provenance`。因此某些组合路径可以读取 source-clean 但没有 builder receipt 的 pack。

证据：

- `scripts/release/profile-packs.mjs:23,46-47`
- `scripts/release/plugin-pack.mjs:183-210`

rc1 candidate 必须把 provenance 变成 candidate/load/verify 的强制条件，不能依赖调用方记得传布尔参数。

### 3. 当前 clean builder 证明不足以证明 builder 身份

现有 provenance 能检查 `clean`、`isolated`、Node、pnpm 和 source/generated tree digest，但 `SHINEMAGE_CLEAN_BUILDER=1` 一类环境自报不能单独证明 builder 是受保护的 clean builder。需要 builder identity、执行环境摘要和独立重建或受保护流水线回执。

### 4. Stage 0 入口尚未实现，旧 runtime 会复制凭据

当前不存在 `scripts/dsh-dev/stage0.mjs`。`scripts/dsh-dev/persist-runtime.mjs:44-64` 会复制 `.credentials.yaml` 和 settings。文档不能把 Stage 0 写成已经可执行的 credential-deny 入口。

### 5. 旧 alpha2 browser/recovery 证据不能抵扣 rc1

历史 alpha2 启动日志保留了插件激活失败和导入失败记录。即使后续 synthetic browser 回执显示 PASS，也不能把那次结果升级为 rc1 或正式目标 browser/recovery PASS。

证据范围：

`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/`

### 6. 跨候选拼接是最容易被抓到的错误

当前资料同时存在 rc2 主仓、alpha4 M2-07、alpha2 M2-09 和 rc1 目标。审核者会检查每一份 receipt 的 `candidate_id`、SDK version、upstream SHA、source/tree SHA、pack SHA 和 profile SHA，并拒绝跨候选组合。

因此 rc1 必须生成唯一 subject set，包含 runtime tarball、9 个 pack、profile、dependency graph、SBOM、provenance 和 rollback artifact。旧 alpha2/alpha4 回执只能作为历史背景。

## 红队工具和最小反证

| 攻击 | 工具 | 必须提供的反证 | 失败结果 |
| --- | --- | --- | --- |
| 版本漂移 | `git ls-remote`、`npm view`、manifest parser | rc1 tag、upstream SHA、tarball SHA、lock SHA 全部一致 | `STOP_VERSION_MISMATCH` |
| ignored bytes 替换 | clean checkout、`git status --ignored`、canonical tree digest | source/tree/tarball/generated tree 可独立重算 | `REBUILD_REQUIRED` |
| provenance 缺失 | 强制 `requireGeneratedProvenance=true`、独立 verifier | 每个 pack 都有 PASS builder receipt | `BLOCKED_PROVENANCE_REQUIRED` |
| peer 绕过 | fresh production-only install、`npm ls --omit=dev --all --json` | 无 invalid/missing/extraneous，无 `--force`/`legacy-peer-deps` | `STOP_RUNTIME_CLOSURE` |
| dev/link 污染 | 空目录、无 workspace link、检查 `node_modules` realpath | 所有 runtime 依赖来自锁定 artifact | `STOP_WORKSPACE_LEAK` |
| SBOM/签名串包 | subject-set verifier | SBOM、provenance、签名都指向同一 rc1 字节 | `BLOCKED_SUBJECT_MISMATCH` |
| 凭据泄露 | empty HOME、secret scan、拒绝 `.credentials.yaml` | 无个人 key、无凭据复制、日志无 token | `STOP_CREDENTIAL_BOUNDARY` |
| 数据越界 | synthetic fixture manifest、权限负测、删除回执 | Stage 0 数据类别和清理证据完整 | `STOP_DATA_SCOPE` |
| browser 假通过 | 真实 headed browser、原始操作日志、截图、重启回读 | 同一 record/session/board ID 和 content SHA | `NOT_RUN_BROWSER_RECOVERY` |
| 进程误杀 | PID/PGID、`lsof`/`ss`、owned cleanup | live 端口和无关进程前后不变 | `STOP_OWNERSHIP` |
| 回退数据损坏 | rc1 安装、卸载、rc2 安装、workspace/session/board 回读 | 代码和数据 schema 都可回退 | `NOT_RUN_ROLLBACK` |
| owner 自证 | receipt actor census、独立 verifier | owner exception 与 company approval 分开 | `FORMAL_GATE_BLOCKED` |

## 必须追加的工程任务

1. 在 C1 前把 generated provenance 设为 rc1 candidate 的强制输入，而不是可选参数。
2. 为 builder receipt 增加可验证的 builder identity 或受保护重建来源，不接受单一环境变量自报。
3. 生成 rc1 的统一 subject set，拒绝 rc2/alpha2/alpha4 receipt 混入。
4. 重建 9 个 plugin pack 和 lock，不能复用旧 pack SHA。
5. rc1 runtime closure 必须用 fresh production-only install 验证。
6. Stage 0 只有在启动真实内部用户前实现；实现前不要声称 `HARNESS_ONLY_READY`。
7. browser/recovery 必须绑定 rc1 candidate；alpha2 synthetic 历史结果不抵扣。

## 红队停止规则

- 任何版本或 subject mismatch 直接停止，不通过改文档消除。
- 任一 pack 缺 builder receipt，整组 candidate 重新生成。
- 任何真实凭据、真实业务数据或 live 进程进入 smoke，立即停止并记录越界。
- 只有 HTTP 200、服务存活或 synthetic DOM，不足以证明 browser/recovery。
- owner-operated 回放不能改写为独立验证或公司发布 PASS。
