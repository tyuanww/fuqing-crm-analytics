# rc1 owner-operated r4 杭州旁路回执（2026-10-17）

这份回执记录个人 owner-operated candidate。它不是正式发布，也没有切换杭州 `current`。

## 结果

- 目标：`root@100.93.46.46`，Linux x86_64 / WSL2。
- candidate：DeepSeek Harness `0.2.1-rc.1`，upstream `1600d8a1e140dcde43a1a0941940a0480712c011`。
- source artifact：`f4026619392c2909b449eb75be1081776b7c5507`，本次 owner 启动还加载了 source overlay commit `7c191391` 的 `owner-profile-bridge`。
- source bundle SHA-256：`4c2fc183e7e60fc492c13b47cce98c7d9aa2e8885cd25259da1a293011de1789`。
- runtime bundle SHA-256：`8a7fb15404bcb8a63824df9a43c1bf75e0bc45e002d3406349607ee202bd28df`。
- owner input bundle SHA-256：`bcd6345bd4e0e5c306f2a60fedd7e8a058b902f15636234d9a186dd34977e6f5`。
- 候选 web：`127.0.0.1:14327`。
- page HTTP：`127.0.0.1:18151`。
- 目标 Node：`v24.21.0`。
- 目标 Python：`3.14.4`。
- 固定候选 pnpm：`11.28.2`。
- `dsh-dev check`：`PASS`。
- Cordis peer alias tar 检查：`@deepseek-ai/cordis-plugin-group` 存在。
- profile bridge：analytics pack 的 `dsh-client-connection` 和 `dsh-client-ui-workspace` 已真实链接。
- 未认证 GET 到候选 web 返回 `401`。
- page HTTP 根路径返回 `404`，监听正常。

## 浏览器和生命周期

- 真实 headed browser 初次回读：`PASS`。
- 真实 headed browser 重启后回读：`PASS`。
- 页面标题：`DeepSeek Harness`。
- 页面可见：`预览版`、`选择工作区`、`插件`、`驾驶舱`、`数据员工`。
- console error：`0`。
- 重启后 console warning：记录了 connection retry。原因是 smoke 运行没有 DeepSeek 账号或 API Key，页面处于 `未登录`。该 warning 不等于插件导入失败。
- owner stop/start：`PASS`。
- 4328、旧 4329、18150、systemd 和 `/srv/shinemage/dsh/current`：未触碰。

## 平台 overlay

Mac arm64 生成的 runtime 不包含杭州 Linux x64 native optional package。r4 使用旧杭州候选已存在的 Linux overlay，并单独绑定关键 binary digest。该 overlay 只属于 owner-operated 目标运行，不属于正式 release asset。

overlay 回执见 [target overlay JSON](engineering-owner-operated-rc1-r4-target-overlay-20261017.json)；外部 owner 原始回执见 `/Users/hutou/.codex/tasks/rc1-owner-operated-20261017/owner-r4-receipt.json`。

## 正式边界

- `M2-07=BLOCKED`。
- `M2-08=NOT_RUN`。
- `M2-09=NOT_RUN`。
- `release_ready=false`。
- 未创建 GitHub Release。
- 未切换杭州公网或 `current`。
- publisher identity、signature、revocation、independent verification、final attestation 和 formal clean-machine 仍未完成。

机器可读回执见 [r4 JSON](engineering-owner-operated-rc1-r4-target-deployment-20261017.json)。
