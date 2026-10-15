# M2-07 rc2 本地 SDK 材料与供应链复核（2026-10-15）

本轮在隔离临时目录准备当前主仓固定 rc2 SDK 输入，并完成开发归档、接收、closure、内容审计、OSV 查询和 clean HOME 输入检查。所有结果均标明开发范围；没有签名、验签、撤销验证、正式发布或部署。

## 输入与准备

固定工具链：

```text
DSH version=0.1.7-rc.2
upstream_sha=477b4f420553e8a52c2fbccc464d7561b239c443
pin_sha256=8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe
node=v24.19.0
upstream_pnpm=11.7.0
plugin_pnpm=11.28.2
```

首次准备在 Corepack 下载固定 pnpm 时因本机未自动使用公共 CA 失败：`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`。随后仅向准备入口传入 `/etc/ssl/cert.pem`；该文件已核验为公开 CA bundle，不含私钥。重试结果：

```text
status=READY
scope=development-sdk-only
sdk_packages=26
bindings=32
source-clean=PASS
compilation=NOT_RUN
supply_chain=NOT_VERIFIED
production_runtime=NOT_BUILT
release_ready=false
preparation_sha256=786c834869ba62b60d336c52d02ed2000daba155ab353b3bb7b9710861757123
```

准备回执和后续 JSON 报告保存在被 Git 忽略的 `.context/checks/m2-07-rc2-local-materials-20261015/`，不作为 tracked 发布材料。

## 开发归档与 closure

开发归档使用固定的 `sdk-archive.py pack/receive` 往返：

```text
archive status=LOCAL_READY
archive scope=development-sdk-only
archive_bytes=816395773
archive_entries=141652
archive_sha256=04d0d8102232634b50869f9d168de0aecd1582e0d2beab15e72ab565c6ac9ead
archive_manifest_sha256=a49e34ab0c7934a5f80eeab3c8c31c75a028cea00b7c1a329d706b210eacfa51
receive status=LOCAL_READY
```

随后由当前主仓 `scripts/release/sdk-closure.mjs` 生成 rc2 缩减 closure：

```text
closure_sha256=6bce087aec3255b922545ae4b94432470f1646d2ab2291f734cd953b772bfc54
closure_entries=30546
closure_bytes=231212210
packages=331
```

归档和 closure 都明确为开发输入，不是最终 SDK 分发 artifact。

## 供应链结果

closure-bound 内容审计：

```text
status=PARTIAL
files_hashed=26195
secret_findings=0
coverage_gaps=17
gap_reasons=binary-or-nontext:10,native-or-wasm:7
release_ready=false
content_audit_sha256=ac635c98e7e2897dbf1dcf6d08fade2931b4d8979fadb8624a96402fcd405000
```

本地 CycloneDX 投影：

```text
components=360
compositions=1
sbom_sha256=bde303dbadb6564015f10a95c36e2cc3edd0e8fa4c6f92aef25aa1bbbdbe3b8e
```

OSV 查询使用固定公共 endpoint 和 `/etc/ssl/cert.pem`，没有安装或执行依赖：

```text
status=BLOCKED
requested=222
queried=222
completed=222
requests_sent=5
advisory_rows=7
unique_advisories=29
unidentified_manifests=1
supply_osv_sha256=7ed5e739b918bd5c050f4495573576701a416d49693be48f724e95fa3800efb2
release_ready=false
```

OSV 结果发现公告，故不能把该 closure 提升为供应链通过。即使没有公告，17 个 binary/native 覆盖缺口、完整正式 SBOM、发布者身份、签名、撤销和干净机器回退仍需单独关闭。

本轮公告对应的实际 closure 包实例如下；它们均为 `installed-package` 且进入可查询清单：

| 包实例 | 公告数量（该版本返回） |
| --- | ---: |
| `fast-uri@3.1.3` | 8 |
| `js-yaml@4.2.0` | 3 |
| `js-yaml@4.3.1` | 1 |
| `katex@0.16.47` | 1 |
| `source-map-js@1.2.1` | 1 |
| `undici@7.28.0` | 15 |
| `undici@8.10.0` | 11 |

表中版本计数包含跨版本重复的 GHSA；去重后为 29 个唯一公告。修复路径只能是新的、经过审查的 upstream/lock 与重新生成的 artifact，或由正式发布责任方出具可验证的安全例外及残余风险接受；不能在主仓或开发 closure 中手工改版本来掩盖固定 source 身份。

对固定 rc2 checkout 的 `pnpm why --recursive --offline` 复核显示，公告并非全部可以从发布闭包中安全裁掉：

- `js-yaml@4.2.0` 被 `@deepseek-ai/cordis-plugin-include`、`@deepseek-ai/dsh`、`@deepseek-ai/dsh-app-boot` 和 `@deepseek-ai/dsh-session-snapshot` 的 runtime dependencies 引用；
- `js-yaml@4.3.1` 被 `@deepseek-ai/dsh-agent-preset-registry`、`@deepseek-ai/dsh-client-test-runtime`、`@deepseek-ai/dsh-config-editor` 与 `@deepseek-ai/dsh-experimental-webworker-packer` 等路径引用；
- `undici@8.10.0` 被 `@deepseek-ai/dsh-http-proxy` 与 `@deepseek-ai/dsh-web-fetch-http` 的 runtime dependencies 引用；
- `fast-uri@3.1.3` 经 `ajv` 进入 `dsh-app-boot` 等路径。

因此当前公告至少有运行时路径，不能通过只移除 desktop/test/website 等开发目录来宣称修复；需要固定上游提供修复版本、重新锁定并完整重建，或走正式安全例外流程。

## clean HOME 输入检查

在新的临时 HOME 下对 rc2 closure 的 `check.mjs` 返回：

```text
status=READY
upstream_sha=477b4f420553e8a52c2fbccc464d7561b239c443
sdk_packages=26
bindings=32
compilation=NOT_RUN
supply_chain=NOT_VERIFIED
release_ready=false
```

这只证明 clean HOME 能读取并验证固定开发输入，不等价于整台干净机器安装、import、卸载和旧版本回退。

## 门禁结论

本轮关闭或补强了当前 rc2 的本地开发材料：固定 source/lock、开发归档往返、closure digest、内容审计、CycloneDX 本地投影、OSV 查询和 clean HOME 输入检查。由于已发现 29 个公告且仍有 17 个 binary/native 覆盖缺口，最终 SDK artifact、正式 SBOM、publisher identity、最终签名/验签、撤销验证、干净机器安装/回退与 current-SHA attestation 仍未关闭。M2-07 继续为 `BLOCKED`，`release_ready=false`。
