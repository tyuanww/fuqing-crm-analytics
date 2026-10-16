# M2-07 rc2 artifact 可用性盘查（2026-10-15）

本记录只验证当前 rc2 source checkout、供应链检查目录和本机可见临时目录中是否存在可供后续正式安装、签名和验签的 immutable SDK artifact。盘查为只读，不创建归档、不触发发布、不生成签名，也不修改 DSH 上游或受保护目录。

## 实际盘查

当前主仓固定 rc2 source checkout：

```text
path=.context/dsh-b0/upstream-0.1.7-rc.2
HEAD=477b4f420553e8a52c2fbccc464d7561b239c443
git_status=clean
```

当前 rc2 检查目录：

```text
.context/checks/m2-07-rc2-local-materials-20261015/archive-receipt.json
.context/checks/m2-07-rc2-local-materials-20261015/receive-receipt.json
.context/checks/m2-07-rc2-local-materials-20261015/sdk-closure.json
.context/checks/m2-07-rc2-local-materials-20261015/m2-07-rc2-content-audit-20261015.json
.context/checks/m2-07-rc2-local-materials-20261015/m2-07-rc2-sbom-local-20261015.json
.context/checks/m2-07-rc2-local-materials-20261015/m2-07-rc2-supply-osv-20261015.json
.context/checks/m2-07-rc2-local-materials-20261015/preparation.json
```

这些文件包含 archive、closure、SBOM、OSV 和准备阶段的摘要与 SHA，但该目录没有 `sdk.zip`、`.tar.zst`、`.tgz` 或接收后的 closure 文件树。`archive-receipt.json` 中的 archive SHA 是历史/临时开发归档的身份记录，不代表归档字节当前仍可读取。

本轮还对 `/tmp`、`/private/tmp` 和 `/var/folders` 做了限定文件名/大小盘查，没有找到可与当前 rc2 archive receipt 复用的临时归档。该盘查不把 alpha2 历史 archive 当作 rc2 输入；alpha2 archive 与当前 rc2 pin 的 source SHA 不同，继续拒绝复用。

## GitHub release 只读核验

只读取了仓库已有 release `dsh-0.20.0.0-r3` 的 `release-manifest.v1.json`、`ci-evidence-index.v1.json` 和 `SHA256SUMS`，没有下载或接收 release payload。该 release 的事实为：

```text
release_tag=dsh-0.20.0.0-r3
release_source_sha=fcbd1324ac5a4b7367d9d7d2bb9bbebdbf32ba25
dsh_upstream_sha=477b4f420553e8a52c2fbccc464d7561b239c443
runtime_release_artifact_sha256=e73852babf758ec4e74c43d7a6d2aeeb2f2476196765c1b8ccf1700012af9128
upstream_runtime_bundle_sha256=6d10be9c64ade039ebe6c90f8072b16e367bf78b120327484f05ddd18a93938c
local_doctor=PARTIAL
wsl2_cold=NOT_RUN
```

其 manifest 角色是 DSH runtime release，payload 是少量 runtime-source 文件并单独绑定 upstream runtime bundle；它不是当前 M2-07 所需的 development SDK/final SDK artifact，也没有提供完整 SDK closure、正式 SDK SBOM、publisher signature、revocation 或 current-SHA SDK attestation。即使 upstream SHA 与当前 rc2 pin 相同，release source SHA、artifact 类型和证据范围也不相同，不能跨门禁复用。

随后只读列举仓库现有 releases 的资产名（最多 100 条），结果只有 DSH runtime/source archive、release/pre-manifest、SHA256SUMS 和 CI evidence index，没有名称或角色表示 SDK、SBOM、attestation、provenance 或 closure 的正式发布资产。该结果进一步确认：远端已有 DSH runtime release，但没有可直接接收的 M2-07 SDK release artifact。

又只读列举了仓库 Actions artifacts（API 返回的前 100 条）。资产命名只有 `dsh-rc2-preflight-*`、`dsh-rc2-evidence-*` 和 `dsh-rc2-publication-*`；其中 preflight/evidence 是 DSH rc2 runtime 验收包，publication 项是小型发布元数据包，没有 SDK archive、正式 SDK SBOM、签名包或 closure artifact。没有下载这些约 169 MB 的 runtime artifact，避免把 CI runtime bundle 当作 M2-07 SDK 输入。

## 当前结论

```text
RC2_SOURCE_CHECKOUT_AVAILABLE
RC2_SOURCE_HEAD_MATCH_PASS
RC2_CHECK_METADATA_AVAILABLE
RC2_IMMUTABLE_ARTIFACT_NOT_AVAILABLE
RC2_RECEIVED_CLOSURE_TREE_NOT_AVAILABLE
FORMAL_INSTALL_NOT_RUN
FORMAL_SIGNATURE_NOT_RUN
FORMAL_ATTESTATION_NOT_RUN
EXISTING_GITHUB_RUNTIME_RELEASE_NOT_M2_07_SDK_ARTIFACT
release_ready=false
status=BLOCKED
```

当前 source checkout 可以用于重新生成开发材料，但不能替代已冻结的最终 artifact。没有最终 artifact 字节，就无法真实完成最终 artifact SHA 绑定、完整正式 SBOM、干净机器安装/回退、签名/验签、撤销验证或 current-SHA attestation；这些门禁继续保持 `BLOCKED/NOT_RUN`。

正式 artifact 到位后，第一步应在隔离目录重新接收并核对 archive SHA、manifest、closure、SBOM 和 source/lock SHA，随后再执行内容审计、签名、验签、撤销和 clean machine install/rollback。不能从 metadata 反向生成或推断正式发布材料。
