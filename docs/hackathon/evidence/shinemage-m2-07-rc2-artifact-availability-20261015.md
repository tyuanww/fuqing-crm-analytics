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
release_ready=false
status=BLOCKED
```

当前 source checkout 可以用于重新生成开发材料，但不能替代已冻结的最终 artifact。没有最终 artifact 字节，就无法真实完成最终 artifact SHA 绑定、完整正式 SBOM、干净机器安装/回退、签名/验签、撤销验证或 current-SHA attestation；这些门禁继续保持 `BLOCKED/NOT_RUN`。

正式 artifact 到位后，第一步应在隔离目录重新接收并核对 archive SHA、manifest、closure、SBOM 和 source/lock SHA，随后再执行内容审计、签名、验签、撤销和 clean machine install/rollback。不能从 metadata 反向生成或推断正式发布材料。
