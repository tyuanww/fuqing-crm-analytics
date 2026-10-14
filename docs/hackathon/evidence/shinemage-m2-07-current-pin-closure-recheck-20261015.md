# M2-07 当前 pin 与 SDK closure 一致性复核（2026-10-15）

本轮使用当前主仓固定 Node 24.19.0，对已保存的 alpha2 development closure 做只读交叉复核。没有生成 artifact、访问 registry、触发 workflow、创建 tag、签名、发布、部署或修改凭据。

## 实际输入与结果

当前主仓工具链：

```text
sdk_version=0.1.7-rc.2
upstream_sha=477b4f420553e8a52c2fbccc464d7561b239c443
current_pin_sha256=8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe
```

复核输入是历史隔离的 alpha2 closure：

```text
closure_sha256=6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b
closure_upstream_sha=d743267388641bc76f17c45ce8b4c231aed1d32c
closure_pin_sha256=6772ba7529fd35ee5a40fd513ce687e20e52c46703dd968f5433b6e0a70f5a4a
```

执行：

```text
node scripts/release/sdk-supply-chain.mjs \
  --root .context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-20261014 \
  --closure-sha256 6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b \
  --output <temporary>/supply.json
exit=2
{"status":"BLOCKED","code":"KIT_CLOSURE_IDENTITY","release_ready":false}

node scripts/release/sdk-content-audit.mjs \
  --root .context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-20261014 \
  --closure-sha256 6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b \
  --output <temporary>/content.json
exit=2
{"status":"BLOCKED","code":"SDK_AUDIT_FAILED","release_ready":false}
```

两项检查拒绝 alpha2 closure，原因是其 source/pin identity 与当前主仓 rc2 工具链不一致。这是预期的 fail-closed 行为，不是把 alpha2 当作 rc2 的兼容证明；历史 alpha2 供应链结果仍只属于独立 DSH 升级候选。

作为当前 pin 的输入边界复核，直接检查已存在的 rc2 upstream checkout 与本仓 build-tools：

```text
node dsh-plugins/plugin-kit/check.mjs \
  --upstream .context/dsh-b0/upstream-0.1.7-rc.2 \
  --build-tools dsh-plugins/plugin-kit/build-tools
exit=0
status=READY
upstream_sha=477b4f420553e8a52c2fbccc464d7561b239c443
sdk_packages=26
bindings=32
compilation=NOT_RUN
supply_chain=NOT_VERIFIED
release_ready=false
```

这只关闭当前 rc2 SDK 输入的来源、锁和入口可读性检查；它没有生成最终 SDK artifact，也没有完成 SBOM、签名、撤销或干净机器验收。

## 结论

当前主仓没有可供 M2-07 正式发布门禁使用的、与 rc2 pin 对齐的最终 SDK artifact。必须从最终 reviewed source/ref 重新生成与其绑定的 SDK、正式 SBOM 和 provenance，再进入签名、验签、撤销与干净机器安装回退。现有 alpha2 development closure 不能抵扣这些门禁；M2-07 继续为 `BLOCKED`，`release_ready=false`。
