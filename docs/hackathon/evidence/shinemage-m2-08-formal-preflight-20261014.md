# M2-08 rc2 正式 preflight 内部候选（2026-10-14）

本轮在当前主仓 reviewed commit 的干净临时 worktree 中运行正式 rc2 preflight。结果只保存到本地 `.context/release-evidence`，没有上传、发布、激活、canary、rollback 或切换 live。

## 输入与结果

- reviewed source：`a148ea772bcffdc3c3f4bce02a7ef021e2114b72`
- DSH upstream：`0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`
- profile pack inputs：当前 page profile，7 个固定正式 pack
- tag：`dsh-0.20.0.0-rc2-preflight-20261014-r2`
- evidence：`.context/release-evidence/m2-08-preflight-20261014-r2/`
- runtime bundle：`181,233,274` bytes，SHA-256 `d32df7cb352210543897fb9321e4db734e05e921a20ed80ae0433f4b27efb9f1`
- source artifact：`4,902,221` bytes，SHA-256 `402327ac0bc45714c369d56096501994b89ab650bc784ad9efb7a8845ced34bc`

阶段结果：

```text
prepare   PASS
audit     PASS / no known vulnerabilities
build     PASS / 7 fixed packs
runtime   PASS / offline bundle built
release   PASS / internal-only preparation
test      PASS / 549 PASS / 0 FAIL / 0 SKIP
receive   PASS
evidence  PASS
```

原始 preflight 输出以 `DSH_RELEASE_PREFLIGHT_PASS` 收口。

## 边界

这是固定 rc2 的本地内部候选，不是正式 release。`release_ready=false` 保持不变；本次 preflight 自身不覆盖目标 WSL2 cold runtime/WAL 和 host HTTP，后续已用独立 sealed synthetic 输入在授权目标补验并记录于[M2-08 WSL2 目标补验](shinemage-m2-08-wsl2-target-20261014.md)。15 分钟 SLI、最终 SDK 供应链材料、正式 release authorization、activation、canary 和 rollback 仍未执行。preflight 的 source SHA 是 reviewed commit `a148ea77…`，后续若要正式发布，必须在最终 clean reviewed commit 上重新生成同一类证据。
