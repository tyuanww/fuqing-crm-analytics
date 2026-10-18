# rc1 consumer closure 真实回执（2026-10-17）

本页记录 Harness `0.2.1-rc.1` 临时消费者边界的真实本地回执。它用于工程候选的可追踪性，不是公司正式发布证据，也不改变正式 M2 状态。所有运行都在 `/tmp` fresh 目录完成，未启动服务、未连接真实业务数据、未读取凭据。

## 固定输入

| 输入 | 版本 / SHA-256 |
| --- | --- |
| `@deepseek-ai/dsh` | `0.2.1-rc.1` / `6d0c6fe8ad0c21797a27d6afc0cb69a022714ea0cd7331e4cba8b07b8ce19009` |
| `@deepseek-ai/dsh-tools` | `0.2.1-rc.1` / `901ef43ed4728d670fc8f27437f23d70c40114fddf833b26639342d9b5ef7ae2` |
| `@deepseek-ai/cordis` | `4.0.5` / `c492ae81ff900569e6283a88ac8aedf17c47417d091e75cfd7eb315191e5b321` |
| Node / npm / pnpm | `v24.19.0` / `11.17.0` / `11.28.2` |

SDK、tools 和 Cordis 使用预先保存的 tarball；未使用浮动 `latest`、`--force` 或 `--legacy-peer-deps`。

## 首轮：未声明 KaTeX runtime dependency

证据目录：`.context/checks/dsh-rc1-engineering-20261017/final-subject-set/consumer-first`。

执行了：

```text
npm install --omit=dev --ignore-scripts --no-audit --no-fund
npm ls --omit=dev --all --json
npm sbom --omit=dev --sbom-format cyclonedx
node runtime-import-check.mjs
npm ls --omit=dev katex
```

结果：

- production-only install exit `0`，`added 612`。
- 依赖图 exit `0`，`2385` 个节点，`problems=[]`；图 SHA-256 `7e09e51eb91a4a1416d05c0d32cd984efa18189fd6c582faf755b40ff2fca6d2`。
- CycloneDX `1.5` SBOM 生成成功，`557` 个组件，但不含 `katex`；SBOM SHA-256 `d68b39baa9257e79176e28aceefec6a1ddedf95ba4344423ade46bb987bb0b42`。
- `dsh/profile-boot`、`dsh-tools`、Cordis、CRM root/host 的 Node import 通过。CRM browser entry 在 Node 中报 `ReferenceError: window is not defined`，这是浏览器入口尚未在 headed browser 运行的事实。
- `npm ls --omit=dev katex` exit `1` 且输出 `(empty)`；`katex` 和 `katex/dist/katex.min.css` 均不存在。

首轮结论：`BLOCKED_RUNTIME_KATEX`。安装和依赖图本身通过不能替代 runtime CSS 闭包。

首轮 provenance：`.context/checks/dsh-rc1-engineering-20261017/final-subject-set/consumer-first/provenance.json`，SHA-256 `e951c88ad28efb69bab2c631f904feb4360cf9f850e2b873d1eb869369e1f69f`。首轮日志、依赖图、SBOM、runtime import 结果和负测输出均保留在该目录。

## 修复候选：CRM pack 声明 KaTeX

临时 candidate source SHA：`f4026619392c2909b449eb75be1081776b7c5507`。

修复只在隔离 candidate 中进行：

```json
{
  "dependencies": {
    "katex": "^0.18.7"
  }
}
```

在 Node `v24.19.0`、pnpm `11.28.2` 下重新构建 CRM/Knowledge，typecheck 和 pinned build 均 exit `0`。随后使用 `dsh-plugin-pack/v1` 重新打包并强制读取 `dsh-generated-bytes/v1` provenance：

- pack 目录：`.context/checks/dsh-rc1-engineering-20261017/final-subject-set/crm`
- CRM tarball：`shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz`
- tarball bytes：`234918`
- tarball SHA-256：`6904460b5b7315326b71d7fdb6004fd7068a13b5939fab4d7c0b246a11a61319`
- `plugin-pack.json` SHA-256：`bb13db8098c25c525ad60a4d7d9b12290af73d0d51d416ad87ef68a9f04b69c49`
- pack provenance 的 `source_sha`、source tree digest、generated tree digest、Node、pnpm、clean/isolated builder 和 tarball digest 均存在；其 schema 为 `dsh-generated-bytes/v1`。

## 修复后：production-only consumer closure（最终 subject set）

最终 fresh 消费者目录：`.context/checks/dsh-rc1-engineering-20261017/final-subject-set/consumer-final-r4`。该目录从空目录开始，先把 Node `v24.19.0` 放入 `PATH`，再运行 `npm`；`package.json` 只声明四个 file tarball：SDK、dsh-tools、Cordis 和 CRM pack。没有在消费者根目录直接补 `katex`，KaTeX 只通过修复后的 CRM pack `dependencies.katex=^0.18.7` 进入闭包。

执行命令仍为：

```text
PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH npm install --omit=dev --ignore-scripts --no-audit --no-fund
PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH npm ls --omit=dev --all --json
PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH npm sbom --omit=dev --sbom-format cyclonedx
PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH node runtime-import-check.mjs
```

结果：

- Node `v24.19.0`、npm `11.17.0` 下 production-only install exit `0`，`added 613`；四项直接依赖没有额外的根级 KaTeX 依赖。
- 依赖图 exit `0`，`2387` 个节点，`problems=[]`；图 SHA-256 `45613ce36ab7e8d9f66aec5e93760df09e9f5bf6464a5abeac7a15c6d3a7edaf`。
- CycloneDX `1.5` SBOM 生成成功，`558` 个组件，含 `katex@0.18.7`；SBOM SHA-256 `90f5d26f012d5ba9be2edca83886e2c613d4284328225362d702421374da47fe`。
- `katex/dist/katex.min.css` 存在，`24794` bytes，SHA-256 `b8511ee880e4981ac28bbc3d675a90cb9fa080e275f06d648147ed316cb421ba`。
- dsh/profile-boot、dsh-tools、Cordis、CRM root/host 的 Node import 通过（6 项）。CRM browser entry 在 Node 中报 `ReferenceError: window is not defined`；该项必须在真实 headed browser 回执中完成，当前不记为 PASS。

最终 consumer provenance：`.context/checks/dsh-rc1-engineering-20261017/final-subject-set/consumer-final-r4/provenance.json`，SHA-256 `7807d70ed0d5ecff929da88027b45fc7ba051fce7b17c4bd9d18729f9bc7739d`，状态 `PASS_WITH_BROWSER_ENTRY_PENDING`。安装日志无 `EBADENGINE`，Node 和 npm 均来自固定 Node24 PATH。该状态表示生产依赖图、SBOM、provenance 和通过 CRM pack 传递的 KaTeX 文件闭包已由固定四 tarball fresh 消费者验证；它不代表正式公司发布或 headed browser 已通过。

## 当前结论和下一步

- rc1 consumer runtime closure：本地临时消费者的依赖安装、无问题依赖图、SBOM、provenance、KaTeX runtime 文件闭包均 `PASS`。
- rc1 browser/recovery：`NOT_RUN`；需要固定候选、真实 headed browser、history/board 回读和重启后回读。
- 该页不改主仓 rc2 pin，也不把本地结果升级为正式公司门禁。

正式状态保持：

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```

## 最终统一 subject set（9 packs）

为避免仅引用易失的 `/tmp` 临时目录，最终 9-pack subject set 已复制到仓库本地检查目录（该目录不提交 Git）：

```text
.context/checks/dsh-rc1-engineering-20261017/final-subject-set/
```

所有 pack、manifest、profile inputs、SDK/tools/Cordis tarball 和 source archive 的 `source_sha` 均绑定到 `f4026619392c2909b449eb75be1081776b7c5507`，并由同一 Node24/pnpm11.28.2 构建回执生成。

source archive 为 `toolchain/dsh-rc1-source-f4026619.tar.gz`，`tar -tzf` 可读（3608 entries，SHA-256 `aa144cf8b8acde1988b0eab7a46d15e161ab8c0769b9af2551f7b815531f828e`）；归档时保留了 Git LFS pointer 警告，因此不把它描述成完整 LFS 内容重建。pack 字节、manifest 和消费者输入仍以 inventory 中的实际文件为准。

| pack | tarball SHA-256 |
| --- | --- |
| `@shine-mage/dsh-analytics-workbench-b0` | `4f443ed5f3ddadfc01fa239dc4db4afc257b4315a1f732b43ed9c7a0cb36812c` |
| `@shine-mage/dsh-crm-knowledge` | `6904460b5b7315326b71d7fdb6004fd7068a13b5939fab4d7c0b246a11a61319` |
| `@shine-mage/dsh-knowledge` | `cce561e1fad0dfac39d7e62463b38a240e3a21d384928977e194c4cca9184408` |
| `@shine-mage/dsh-shine-board` | `a000bb72cfbc409ac7eea9a2a5ce8f6f978dcbf4cae021943e6923919a07cf7d` |
| `@shine-mage/dsh-shine-brand` | `c254d5000a0e92b4b073945a5cd20de9a5028e9695d4e6278631346e9df635a4` |
| `@shine-mage/dsh-shine-crowd-action` | `767bb4c532e5491e7c99e0bdc47d9bbb745451cc814015a6da0cd3a16d17b4ed` |
| `@shine-mage/dsh-shine-funnel` | `838f834f97187ad3aacef678a524d2db33b077c80eb985eda8ef230cfd759b53` |
| `@shine-mage/dsh-shine-query` | `e4f9b76103d0c5978e2fce9c3fcb724c3d223db74bc2fa69831e98678f8dd308` |
| `@shine-mage/dsh-shine-waterfall` | `939a9b560fa22e391678260456c117e0340ec58cff5548aa2368bdc8400a829` |

Profile inputs 和严格 provenance reader 回读：

| profile | plugins | profile digest | inputs digest | reader |
| --- | ---: | --- | --- | --- |
| `page` | 7 | `e93e6f5e7975311f55bf1ee070b7aea009c938449c9a1542f3c2a503f40253fc` | `7dc6298240bca26b6a97878e2b23ab010be26f1f83cb9576d8a491933ba504fc` | `PASS` |
| `crm-knowledge` | 2 | `7ed8ba8589f76dbd656897edadd5d9a6098549962c6a2882b8827f81f02c2245` | `114b9db16eeb1cc7f959c7df5ef61798844bbf10594af225330e3c3582b49766` | `PASS` |

Reader 命令强制 `requireGeneratedProvenance=true`，两份结果的 `sourceShas` 都只有上述最终 SHA。完整回读 stdout/exit 位于 `final-subject-set/page/reader.*` 和 `final-subject-set/crm/reader.*`。

最终 subject inventory：

- 文件数：`49`（不收录 inventory、inventory.sha256、consumer provenance/digest 清单和所有 `node_modules`）
- 总字节：`11958681`
- inventory：`.context/checks/dsh-rc1-engineering-20261017/final-subject-set/inventory.json`
- inventory SHA-256：`7d2fe7911bee66cca61bfe52c1350a982fc34ded92ea4d80cab142aa37516425`

最终 subject set 证明 pack/manifest/profile/依赖图/SBOM/provenance 的字节绑定和本地回读，不证明 headed browser、history/board 重启回读、正式公司签名或发布门禁。
