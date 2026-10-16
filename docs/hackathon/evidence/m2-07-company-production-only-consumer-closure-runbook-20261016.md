# M2-07 alpha4 公司 production-only consumer closure 执行手册（2026-10-16）

## 目的和边界

本手册供公司发布责任方在受控 staging 或 CI runner 上执行修复后 CRM plugin tarball 的正式 production-only consumer closure。它覆盖安装、锁文件、依赖图、runtime import、SBOM、provenance、独立核验和回执收集。

本手册不执行 publisher signing、revocation、production activation 或 canary。任何步骤失败、未知、缺失或只能在本地复现时，`M2-07` 必须保持 `BLOCKED`，`release_ready` 必须保持 `false`。

本地结果只用作输入和形状参考，不能直接提升为公司证据。公司执行必须重新接收 artifact、重新计算 SHA、重新安装、重新生成 dependency graph、SBOM 和 provenance。

## 固定正式输入

```text
package=@shine-mage/dsh-crm-knowledge@0.0.0-crm.1
artifact=shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz
artifact_sha256=a994167cafae37383800789127a305bc5cae0a9fa85b46ba4157cf1fe0ae634d
pack_manifest_sha256=106c38eaf30cde9b6a3e3fc5fea98d8e42aa777f51f99faff37c00c13f55e42d
candidate_source_sha=3b5d4c0680585f8f27c84d70dffabf7c2ec930d2
sdk=@deepseek-ai/dsh@0.2.1-alpha.4
sdk_artifact_sha256=9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
upstream_lock_sha256=ee1c37b5429c535974bafa09475cb03fc473e87dded8f56d54d909ed621e1317
Node=v24.19.0
upstream_pnpm=11.28.5
plugin_pnpm=11.28.2
```

正式 tarball manifest 必须包含：

```text
peerDependencies.@deepseek-ai/dsh-tools=0.2.1-alpha.4
peerDependencies.@deepseek-ai/cordis=4.0.5-alpha.2
dependencies.katex=^0.18.7
devDependencies.@shine-mage/dsh-plugin-kit=0.1.0
```

`devDependencies` 必须被生产安装排除；它只能用于确认没有误入 closure，不能作为 runtime 依赖来源。

## 本地参考结果（不能复用为正式证据）

以下文件来自本地修复候选，仅用于检查公司输出的字段和数量是否合理：

```text
package-lock.json sha256=7a5285740f78ee03f1431eb9f34aeb7fcb25cbc751fd3ea4f674862f5b53a21b
local dependency graph sha256=a41f4e3b9c0e04753740bc2dd6f8989ee81bb2241a42ad9b563357763f6f7a7b
local CycloneDX SBOM sha256=b233945e8a4b4325f10f21c4a50fb4b5b22be0ebbf8e47c35580afd3f29a0213
local provenance sha256=0bf6165fc9e48f9e8c60096d5a75195b6d7f4376200158bfd3f78792444701a6
```

本地观察为 26 个 production 组件、graph/SBOM `26/26` 对齐、KaTeX CSS 可解析。这些值不能替代公司重新生成的文件或 SHA。

## 公司执行前提

1. 在公司批准的发布机或受控 CI runner 使用空 staging 目录；不要在开发 workspace 安装。
2. 接收 tarball、pack manifest、SDK artifact、SDK SBOM、SDK provenance 和发布责任方输入；所有输入先做 SHA-256。
3. 使用 Node `v24.19.0`。npm 方案要求 npm 版本和 registry 记录在回执；如果公司批准使用 pnpm，记录精确 pnpm 版本和 frozen lock 行为。
4. 使用公司批准的 registry、网络出口和缓存策略；不要把 registry token、KMS token 或私钥写入回执。
5. 生产安装必须排除 devDependencies、脚本和本地 workspace/link 依赖。
6. 若 registry 出现证书链错误，只能配置公司批准的 CA bundle 并记录路径/摘要；不得使用 `strict-ssl=false`、跳过 TLS 校验或把网络错误记录成依赖 closure 失败。

### 单人 owner-operated 执行模式

如果公司只有一名全栈开发者，`company runner` 不要求另一位员工在场。项目 owner 可以指定一台受控发布机或受控 CI job 作为 `owner-operated` runner，并在回执中填写自己的操作者和批准身份。该模式仍必须使用空 staging、固定 Node、批准的 registry/CA 和完整日志。

独立核验可以由同一 owner 在同一机器上启动全新的 staging、全新的进程和无构建写权限的复验目录完成；复验必须重新执行 cold/frozen install、dependency graph、runtime import、SBOM subject/package-set 对齐和 provenance binding。它证明技术结果可重现，但不等同于第二位人员的独立批准。

单人模式的回执必须额外记录：

```text
execution_mode=OWNER_OPERATED
runner_identity=<owner-controlled machine or CI job>
operator=<project owner>
independent_replay=same-owner-separate-staging-and-process
governance_status=FORMAL_EXCEPTION_REQUIRED
```

除非公司的发布政策明确接受这项 owner exception，否则不能把 `FORMAL_EXCEPTION_REQUIRED` 改成正式 closure `PASS`，也不能把 `release_ready` 改为 `true`。这一模式用于解除“没有第二位员工所以技术验证无法进行”的阻塞，不绕过治理事实。

公司 runner 先定义统一的 SHA-256 命令。优先使用 `sha256sum`，没有时才使用 `shasum -a 256`；两者都没有必须停止，不能跳过摘要核对：

```sh
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1"
  else
    echo "SHA256_TOOL_NOT_FOUND: install/use the company-approved checksum tool" >&2
    return 127
  fi
}
```

## 执行步骤

### 0. 接收和校验输入

```sh
set -eu
ARTIFACT=/secure/input/shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz
PACK_MANIFEST=/secure/input/crm-knowledge.plugin-pack.json
SDK_ARTIFACT=/secure/input/deepseek-ai-dsh-0.2.1-alpha.4.tgz
SDK_SBOM=/secure/input/sbom-alpha4-r1.json
SDK_PROVENANCE=/secure/input/provenance-alpha4-r1.json

sha256 "$ARTIFACT"
sha256 "$PACK_MANIFEST"
sha256 "$SDK_ARTIFACT"
sha256 "$SDK_SBOM"
sha256 "$SDK_PROVENANCE"
```

只有 CRM tarball SHA 等于固定 `a994...634d`、SDK artifact SHA 等于固定 `9f4f...8d6` 的输入才可继续。将完整命令、输出和退出码写入 `commands.log`。

解包只读查看 manifest：

```sh
tar -xOf "$ARTIFACT" package/package.json | python3 -m json.tool
```

检查包名、版本、exports、files、peerDependencies、`dependencies.katex` 和 dev-only kit。manifest 不匹配时停止并将 `closure_result.status` 记为 `REBUILD_REQUIRED`。

### 1. 创建独立 staging

```sh
STAGING=/secure/work/m2-07-consumer-closure-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$STAGING"
cd "$STAGING"
cat > package.json <<'JSON'
{
  "name": "company-m2-07-consumer-closure",
  "version": "1.0.0",
  "private": true
}
JSON
```

staging 不能是仓库目录、旧 closure 目录或含有历史 `node_modules` 的目录。

### 2. 生产依赖安装

npm 参考路径：

```sh
set +e
npm install --omit=dev --ignore-scripts --no-audit --no-fund "$ARTIFACT" > install.log 2>&1
INSTALL_EXIT=$?
set -e
cat install.log
printf 'install_exit=%s\n' "$INSTALL_EXIT"
test "$INSTALL_EXIT" -eq 0
```

安装成功后保存：

```sh
cp package-lock.json receipt/package-lock.json
sha256 package-lock.json | tee receipt/package-lock.sha256
```

随后在新空目录用同一 `package.json` 和 lockfile 执行冷复验：

```sh
rm -rf /secure/work/m2-07-consumer-closure-cold
mkdir -m 700 /secure/work/m2-07-consumer-closure-cold
cp package.json package-lock.json /secure/work/m2-07-consumer-closure-cold/
cd /secure/work/m2-07-consumer-closure-cold
npm ci --omit=dev --ignore-scripts --no-audit --no-fund 2>&1 | tee ci-install.log
```

公司若批准使用 pnpm，必须使用对应 frozen lock 命令并在回执中说明 lock 来源；不能用 `--legacy-peer-deps`、`--force`、忽略 peer 或手工注入 `node_modules` 绕过解析。

### 3. 生成 production dependency graph

在与安装相同的 staging 执行：

```sh
npm ls --omit=dev --all --json > dependency-graph.json
printf 'dependency_graph_sha256='; sha256 dependency-graph.json
```

递归检查必须确认：

```text
@shine-mage/dsh-crm-knowledge=0.0.0-crm.1
@deepseek-ai/dsh-tools=0.2.1-alpha.4
@deepseek-ai/cordis=4.0.5-alpha.2
katex=<resolved production version>
@shine-mage/dsh-plugin-kit=ABSENT
```

记录 direct、transitive、optional、peer 和 native 条目。`npm ls` 非零、包含 `invalid`、`missing`、`extraneous` 或 dev-only kit 时停止。

### 4. 检查每个 runtime import

使用安装树本身执行，不从 workspace 解析：

```sh
node --input-type=module > runtime-check.log <<'NODE'
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
let failed = false;
for (const id of [
  '@shine-mage/dsh-crm-knowledge/package.json',
  '@deepseek-ai/dsh-tools/package.json',
  '@deepseek-ai/cordis/package.json',
  'katex/package.json',
  'katex',
  'katex/dist/katex.min.css',
]) {
  try { console.log(`${id}=PASS ${req.resolve(id)}`); }
  catch (e) { failed = true; console.log(`${id}=FAIL ${e.code}: ${e.message}`); }
}
for (const id of ['@shine-mage/dsh-crm-knowledge', '@shine-mage/dsh-crm-knowledge/host']) {
  try { await import(id); console.log(`${id}:import=PASS`); }
  catch (e) { failed = true; console.log(`${id}:import=FAIL ${e.code ?? e.name}: ${e.message}`); }
}
if (failed) process.exitCode = 1;
NODE
printf 'runtime_check_sha256='; sha256 runtime-check.log
```

所有 runtime import 必须为 `PASS`。任何 KaTeX、CSS、CRM 或 host import 失败都不能标记 closure PASS。

### 5. 生成 production SBOM

在同一 production 安装树执行：

```sh
npm sbom --omit=dev --sbom-format=cyclonedx > sbom-production.json
printf 'sbom_sha256='; sha256 sbom-production.json
python3 -m json.tool sbom-production.json >/dev/null
```

如果公司批准的 SBOM 工具不是 npm，必须记录工具版本、输入目录、生产过滤规则、输出格式和退出码。SBOM 必须来自本次安装树，不能复用本地 SBOM 或旧 alpha4 SBOM。

### 6. 对齐依赖图、SBOM 和 artifact subject

使用公司批准的比较器；至少核对：

1. SBOM subject 绑定 CRM tarball SHA `a994...634d`，或在公司格式中有等价的不可歧义绑定。
2. SBOM package/version 集合与 dependency graph 完全一致。
3. `@shine-mage/dsh-plugin-kit` 不在 production SBOM。
4. `@deepseek-ai/dsh-tools`、Cordis 和 KaTeX 版本满足 manifest/peer/runtime 约束。
5. SBOM 与 graph 文件 SHA 写入 closure manifest。

比较器若无法证明 subject 或 package list 一致，状态只能为 `FORMAL_EXCEPTION_REQUIRED` 或 `REBUILD_REQUIRED`。

### 7. 生成正式 provenance

公司 provenance 工具必须绑定以下事实：

```text
subject.artifact_sha256=a994167cafae37383800789127a305bc5cae0a9fa85b46ba4157cf1fe0ae634d
subject.pack_manifest_sha256=106c38eaf30cde9b6a3e3fc5fea98d8e42aa777f51f99faff37c00c13f55e42d
candidate_source_sha=3b5d4c0680585f8f27c84d70dffabf7c2ec930d2
sdk_artifact_sha256=9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
upstream_lock_sha256=ee1c37b5429c535974bafa09475cb03fc473e87dded8f56d54d909ed621e1317
node=v24.19.0
plugin_pnpm=11.28.2
```

provenance 必须同时记录 install mode、lock SHA、dependency graph SHA、SBOM SHA、runtime log SHA、builder identity、CI job/run、生成时间和批准的 registry。公司身份、签名和 provenance verifier 必须由公司系统填写，不能使用本地 `LOCAL_REPRODUCTION_ONLY` provenance。

### 8. 独立验证和 closure manifest

在不同 workspace、不同 job 或无构建写权限的独立验证身份中重复：

- artifact、manifest、lock、graph、SBOM、provenance SHA
- production-only 安装或 frozen lock 解析
- CRM、Cordis、dsh-tools、KaTeX 和 CSS runtime import
- graph/SBOM package list 与 subject 对齐
- provenance source、lock、Node、pnpm 和 artifact 绑定

将所有输出写入回执模板，并计算 closure manifest SHA。任何 `PENDING`、`UNKNOWN`、`NOT_RUN`、`MISMATCH`、`LOCAL_ONLY` 或 `FORMAL_EXCEPTION_REQUIRED` 都禁止 `closure_result.status=PASS`。

## 通过条件

只有同时满足以下条件，正式 closure 才能写 `PASS`：

1. 接收 artifact SHA 与固定输入一致。
2. 生产安装和 cold/frozen 复验退出码为 `0`，无 dev-only 依赖进入 closure。
3. dependency graph 完整且无 invalid/missing/extraneous。
4. 每个 runtime import 通过，包含 KaTeX JS 与 CSS。
5. SBOM 来自同一安装树，subject 和 package list 与 artifact/graph 一致。
6. provenance 绑定修复后 source SHA、SDK artifact、lock、Node 和 pnpm。
7. 独立验证通过并有 CI/job/log reference。
8. publisher identity、signature、revocation 和 final attestation 仍需其各自门禁完成；本手册单独通过不能把 `release_ready` 改为 true。

## 必须返回的回执文件

- `package-lock.json` 或公司批准的 frozen lock
- `dependency-graph.json`
- `sbom-production.json`
- `runtime-check.log`
- 正式 provenance
- closure manifest 及 SHA-256
- 命令/退出码/时间日志
- 独立验证日志和 job reference
- 填好的 [consumer closure receipt template](m2-07-company-production-only-consumer-closure-receipt-template-20261016.json)

不要把 registry token、KMS token、OIDC token、私钥或原始凭据写入任何回执。
