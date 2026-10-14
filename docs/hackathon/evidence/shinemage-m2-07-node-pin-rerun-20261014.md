# M2-07 alpha2 checker 固定 Node 复核（2026-10-14）

本轮重新执行 alpha2 compact closure 的只读输入检查，确认此前的 `KIT_INPUTS_UNAVAILABLE` 是执行环境 Node 版本漂移，不是 SDK closure 内容损坏。

## 复核输入

- checker：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/alpha2-sdk-closure-workspace-20261014/dsh-plugins/plugin-kit/check.mjs`
- closure root：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-20261014`
- closure SHA：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- pinned SDK upstream：`d743267388641bc76f17c45ce8b4c231aed1d32c`

## 结果

默认 `node` 为 `v25.8.2`，checker 按 `toolchain.json` 的 `node_major=24` 约束返回：

```text
status=BLOCKED
code=KIT_INPUTS_UNAVAILABLE
reason=Use the pinned Node major (25 !== 24)
```

机器上已有固定 Node `v24.19.0`：

```text
/Users/hutou/homebrew/opt/node@24/bin/node
```

使用该解释器和同一 closure SHA 重新执行后返回：

```json
{
  "schema_version": "shinemage-kit-inputs/v1",
  "status": "READY",
  "scope": "local-build-inputs-only",
  "dsh_pin": "0.2.1-alpha.2",
  "upstream_sha": "d743267388641bc76f17c45ce8b4c231aed1d32c",
  "sdk_packages": 26,
  "bindings": 32,
  "compilation": "NOT_RUN",
  "supply_chain": "NOT_VERIFIED",
  "release_ready": false
}
```

## 结论

Node 25 的拒绝是固定工具链的防漂移行为；使用 Node 24 后本地 checker 恢复 `READY`。这只修复本地复核环境，不关闭最终 artifact、发布者身份、签名、撤销、干净机器或正式 attestation 门禁，M2-07 仍保持 `BLOCKED`。
