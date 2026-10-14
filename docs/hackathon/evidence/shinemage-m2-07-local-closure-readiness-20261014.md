# M2-07 本地可关闭项复核（2026-10-14）

本记录只盘查当前 alpha2 compact SDK 候选在本地能否继续补齐供应链门禁，不触发 GitHub workflow、tag、release、发布或目标切换，也不读取或输出任何凭据。

## 已能在本地完成的项目

- 两锁文件和候选实际 manifest/symlink 图已完成离线解析；运行时依赖无未解析边。
- 本地 CycloneDX projection 已生成，组件与依赖引用闭合；OSV 查询回执为 `NO_KNOWN_ADVISORIES`。
- compact archive 已 pack/receive，并在接收目录完成 archive-bound content audit；没有 secret finding。
- 18 个 opaque/native 对象已绑定 owner、manifest/file SHA、closure manifest 和 source archive；registry applicability 已分类，9 项适用完整、9 项 bundled/workspace 不适用。
- 当前平台 native ABI 头部静态检查已完成；跨平台架构执行仍未声称通过。
- alpha2 candidate 在全新临时 HOME 下返回 `READY`；rc2 checker 对 alpha2 上游 SHA drift 的拒绝行为也已保留。
- GitHub attestation 工作流的输入合同和历史成功回执已核对，当前候选与历史 rc2 attestation 的 SHA 不一致，不能复用。

## 必须依赖外部发布身份或正式授权的项目

以下材料不能由本地 projection、历史回执或 dry-run 代替：

1. 最终 immutable SDK artifact 及其 reviewed commit/tag；
2. 完整发布 SBOM（含最终 artifact 的来源、构建闭包和发布元数据）；
3. 发布者身份及其可验证信任链；
4. 对最终 artifact 的正式签名、验签和 verifier/trust-root 记录；
5. 撤销/轮换或允许名单验证；
6. 干净机器上的真实安装、导入、启动、升级和回退；
7. 与最终 SHA 绑定的 GitHub attestation，以及 release publication 授权。

当前工作流仍校验 rc2 上游 `477b4f42…`，而 alpha2 candidate 使用 `d7432673…`。在最终候选冻结并获得发布身份前，不能 dispatch 当前工作流，也不能把历史 `fcbd1324…` attestation 绑定到 alpha2。

## 结论

本地可重复的 M2-07 检查已推进到当前证据边界；没有新的安全本地动作可以把门禁提升为 `PASS`。M2-07 继续保持：

```text
BLOCKED / OFFLINE_INVENTORY_PARTIAL / release_ready=false
```

下一步应由发布责任方提供最终 artifact、发布者身份和签名/撤销材料；材料到位后再按同一 SHA 重新生成正式 SBOM、attestation、干净机器验收和回退证据。
