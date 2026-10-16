# M2-07 发布者权限前置核验（2026-10-14）

本轮只读取 GitHub CLI 登录状态、仓库权限和 workflow 状态，没有触发 workflow、创建 tag/release、上传 artifact 或输出 token。

## 结果

- GitHub CLI 当前登录账号：`tyuanww`（keyring，token 值未输出）。
- 仓库：`tyuanww/fuqing-crm-analytics`。
- 仓库可见性：`public`。
- 当前账号仓库权限：`admin / maintain / push / pull / triage`。
- DSH release workflow 均为 active：
  - `DSH rc2 release evidence`
  - `DSH rc2 release preflight`
  - `Publish DSH rc2 release assets`

## 门禁边界

这次核验说明当前账号具备执行仓库发布流程的权限，但不等于已经具备某个最终 artifact 的签名身份，也不等于已经取得 release/activation 授权。M2-07 仍需绑定最终 reviewed SHA 的完整 SBOM、正式签名/验签、撤销验证、干净机器安装回退和最终 attestation；在这些材料齐全前不触发 workflow、tag 或 release。

当前状态：

```text
PUBLISHER_REPOSITORY_PERMISSION_PASS /
FINAL_ARTIFACT_NOT_FROZEN /
FINAL_SIGNATURE_NOT_VERIFIED /
ATTESTATION_NOT_RUN /
release_ready=false
```
