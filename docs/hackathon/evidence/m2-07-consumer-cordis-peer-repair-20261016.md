# M2-07 alpha4 consumer Cordis peer 修复与 closure 重跑（2026-10-16）

## 结论

已在隔离 alpha4 候选中修复 CRM 与 Knowledge 消费者的 Cordis peer 合同，并重新生成受影响的两个 plugin tarball。新的 CRM tarball 在固定 Node 下完成 production-only 安装、依赖图、runtime import 和 CycloneDX SBOM 检查；本地 consumer closure 为 `PASS`。公司发布环境仍未执行，不能据此关闭 M2-07 或改变 `release_ready`。

```text
candidate_source_before=50d241cbd23aa2a9d188fe84c3864528a2206917
candidate_source_after=3b5d4c0680585f8f27c84d70dffabf7c2ec930d2
node=v24.19.0
pnpm=11.28.2
local_consumer_closure=PASS
company_consumer_closure=NOT_RUN
release_ready=false
```

## 修复设计与实现

alpha4 官方 `@deepseek-ai/cordis` 版本为 `4.0.5-alpha.2`，alpha4 `@deepseek-ai/dsh-tools` 的 peer 约束为 `~4.0.5-alpha.2`。隔离候选的两个消费者此前仍声明 Cordis `4.0.2`，导致 npm 默认 production-only peer resolution 以 `ERESOLVE` 失败。

本次只修改隔离候选源，不改主仓 rc2 manifest：

```text
candidate-formal-pack-git-r2/crm-knowledge/package.json
  @deepseek-ai/cordis: 4.0.5-alpha.2

candidate-formal-pack-git-r2/knowledge/package.json
  @deepseek-ai/cordis: 4.0.5-alpha.2
```

可重放的最小补丁见 [consumer Cordis peer fix](m2-07-consumer-cordis-peer-fix.patch)。候选源提交为 `3b5d4c0680585f8f27c84d70dffabf7c2ec930d2`。两包在固定 alpha4 upstream、Node `v24.19.0` 下 build 通过；Knowledge 测试 `32 pass / 0 fail`，CRM 测试在显式锁定 Python `3.14.4` 后为 `108 pass / 0 fail`。

## 新 plugin pack

受控 `scripts/release/plugin-pack.mjs` 使用 alpha4 SDK pin 和 pnpm `11.28.2` 生成并验证 tarball；两个 pack reader 均通过：

| 包 | tarball SHA-256 | manifest SHA-256 | Cordis peer |
|---|---|---|---|
| `@shine-mage/dsh-crm-knowledge@0.0.0-crm.1` | `a994167cafae37383800789127a305bc5cae0a9fa85b46ba4157cf1fe0ae634d` | `106c38eaf30cde9b6a3e3fc5fea98d8e42aa777f51f99faff37c00c13f55e42d` | `4.0.5-alpha.2` |
| `@shine-mage/dsh-knowledge@0.0.0-candidate.1` | `0a0bb1c360e67ae6d2b0a8d6a014f8e33be6f6a84b54b7b5c1751fc9cc72bab1` | `06fbce63806a1a1e33364c1713ded76a250dc7f647c8cb9a83f0f89ae392b3ca` | `4.0.5-alpha.2` |

两个 tarball 的 `@deepseek-ai/dsh-tools` peer 都是 `0.2.1-alpha.4`。输出目录为 `.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r3/`；该目录是本地候选产物，不是正式发布目录。

## production-only closure

对新的 CRM tarball，在独立临时目录执行：

```sh
npm install --omit=dev --ignore-scripts --no-audit --no-fund <crm-tarball>
npm ls --omit=dev --all --json > dependency-graph.json
npm sbom --omit=dev --sbom-format=cyclonedx > sbom-production.json
```

安装退出码为 `0`，实际安装 `26` 个 production packages。lockfile 模式下的回执文件及摘要为：

```text
package-lock.json sha256=a57cbc1690c2ff1a66c4b917e453155de7a10141cf0667a4b3f3e57db28337c0
dependency-graph.json sha256=08d72f3d5e5ef3581b8a46fc234f609c8c2d9f5709a478e012d4f075134ffd60
sbom-production.json sha256=f009230cfbd05ab48b681fece75e7eaedcf14ef81c281b4bdc29413c88953f99
```

runtime 解析结果：

```text
@shine-mage/dsh-crm-knowledge/package.json=PASS
@deepseek-ai/dsh-tools/package.json=PASS
@deepseek-ai/cordis/package.json=PASS
katex/package.json=PASS
katex=PASS
katex/dist/katex.min.css=PASS
@shine-mage/dsh-crm-knowledge=import PASS
@shine-mage/dsh-crm-knowledge/host=import PASS
```

CycloneDX SBOM 为 `1.5`，包含 `26` 个组件。逐项比较 production dependency graph 与 SBOM 得到 `26/26` package/version pairs 一致；其中 CRM、dsh-tools、Cordis 和 KaTeX 均存在，`@shine-mage/dsh-plugin-kit` 不在 production closure。

第一次预检使用 `--package-lock=false` 时，npm SBOM 因本地 tarball file spec 未形成 lockfile 而返回 `ESBOMPROBLEMS`；该失败已保留在 `consumer-closure-r1`，随后使用同一 tarball 和 lockfile 完成 `consumer-closure-r2`，没有把失败改写为通过。

## 范围边界

本证据证明隔离候选消费者的本地 production-only closure，不证明公司 registry、正式发布身份、signature、provenance、revocation 或 clean machine。正式 closure 仍需在公司环境用批准的 package manager、正式 artifact 和正式发布材料重复；在此之前 `M2-07=BLOCKED`、`release_ready=false`，M2-08 不启动。
