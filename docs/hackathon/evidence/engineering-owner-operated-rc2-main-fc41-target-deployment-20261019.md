# 杭州 WSL owner-operated rc2 部署回执（2026-10-19）

本记录描述 `fc41e45d` 在杭州 WSL 的内部 owner-operated 部署。它不是正式 release，也不改变正式 M2 状态。

## 候选

- source commit：`fc41e45d3f3181ee5e4e97839271af2f2de7f2de`
- release：`dsh-0.1.7-rc.2-owner-main-fc41e45d-20261019`
- DSH upstream：`477b4f420553e8a52c2fbccc464d7561b239c443`
- runtime asset SHA-256：`6d10be9c64ade039ebe6c90f8072b16e367bf78b120327484f05ddd18a93938`
- source archive SHA-256：`568172901cc6baf3d799f47947b1e9e9f6e06414b2cce9bc19b46e594b3b82c4`
- plugin pack：9 个，provenance 为 `dsh-generated-bytes/v1`
- owner preflight：`PASS`

## 验证

- side-by-side Web `14327`：未认证返回 `401`。
- side-by-side page HTTP `18157`：根路径返回 `404`，带运行时 token 的 binding-state 返回 `200`，状态为 `UNBOUND_SAMPLE`。
- side-by-side headed browser：插件面板显示 7 个已安装插件，项目驾驶舱可打开，没有 `Failed to fetch`。
- stop/start：候选端口释放后重新启动，7 个插件和 page HTTP 重新绑定。
- current Web `4328`：未认证返回 `401`。
- current page HTTP `18091`：根路径返回 `404`，binding-state 返回 `200`。
- rollback：回退旧 rc1 current 后 systemd、Web 和 page HTTP 恢复；随后恢复 `fc41e45d` 为最终 current。

## 当前现场

- current：`/srv/shinemage/dsh/releases/dsh-0.1.7-rc.2-owner-main-fc41e45d-20261019`
- runtime：`/srv/shinemage/dsh/runtime-owner-main-fc41e45d-20261019`
- systemd：`active`
- 回退目标：`/srv/shinemage/dsh/releases/dsh-0.2.1-rc.1-owner-main-4ac076de-20261019`
- 完整机器回执：`engineering-owner-operated-rc2-main-fc41-target-receipt-20261019.json`

headed browser 使用 SSH loopback forward。没有配置真实 B0 身份，因此本记录不宣称真实业务 UAT 或正式发布通过。

正式状态保持：`M2-07=BLOCKED`、`M2-08=NOT_RUN`、`M2-09=NOT_RUN`、`release_ready=false`。
