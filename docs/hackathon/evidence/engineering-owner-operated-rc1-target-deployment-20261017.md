# owner-operated rc1 杭州 candidate 部署回执（2026-10-17）

本回执记录个人项目的 owner-operated candidate 旁路部署。它不是正式发布，也不是杭州 `current` 切换。

## 实际结果

- 目标：`root@100.93.46.46`，Linux x86_64 / WSL2。
- candidate：Harness `0.2.1-rc.1`，upstream `1600d8a1e140dcde43a1a0941940a0480712c011`。
- candidate source：`f4026619392c2909b449eb75be1081776b7c5507`。
- SDK artifact SHA-256：`6d0c6fe8ad0c21797a27d6afc0cb69a022714ea0cd7331e4cba8b07b8ce19009`。
- page profile inputs SHA-256：`7dc6298240bca26b6a97878e2b23ab010be26f1f83cb9576d8a491933ba504fc`。
- page profile SHA-256：`e93e6f5e7975311f55bf1ee070b7aea009c938449c9a1542f3c2a503f40253fc`。
- target Node：`v24.21.0`。
- target Python：`3.14.4`。
- host pnpm：`11.19.0`，不满足插件合同；candidate 临时目录内使用固定 pnpm `11.28.2`。
- web candidate：`127.0.0.1:4329`。
- page HTTP：`127.0.0.1:18150`。
- live web：`127.0.0.1:4328`，原 PID `1933097` 未变化。
- `shinemage-dsh.service` 保持 `active`，没有重启。
- `/srv/shinemage/dsh/current` 保持 `/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3`，没有切换。
- page HTTP binding-state 返回 HTTP `200`，状态为 `UNBOUND_SAMPLE`。
- 真实 headed Chrome 在重启前打开 candidate 页面，标题为 `DeepSeek Harness`。
- candidate owned stop/start 后，新 launch URL 在 headed Chrome 再次打开。
- 重启前后 console `error/warn` 观测为 `0`。
- 没有真实凭据、真实客户数据或真实模型调用。

## 运行时适配

rc1 npm runtime tarball默认不把部分 client package 放入 plugin pack 的 Node resolution 边界。owner-operated candidate 在临时 profile 中加入了 13 个 `@deepseek-ai/*` link，包括 `dsh-client-connection`、client UI 包、session controller、workspace files、Cordis 和 dsh-tools。该 bridge 只存在于临时 candidate，不改仓库源码，不改 plugin pack 字节。

目标 page HTTP 初次启动缺少 `uvicorn`。随后在 candidate 临时目录创建 Python 3.14 venv，并按 `scripts/dsh-b0/requirements.lock` 安装 B0 依赖。系统 Python、系统 pnpm、CRM、WeKnora 和现役 DSH service 未修改。

## 边界

- 这是 `OWNER_OPERATED_CANDIDATE`。
- `formal_company_evidence=false`。
- `M2-07=BLOCKED`。
- `M2-08=NOT_RUN`。
- `M2-09=NOT_RUN`。
- `release_ready=false`。
- 该 candidate 没有切换 `current`，没有接管 `4328`、`4332` 或 `4336`。
- 该回执不能替代公司 publisher identity、signature、revocation、independent verifier、final attestation 或 clean-machine 正式回执。

机器可读回执见 [JSON](engineering-owner-operated-rc1-target-deployment-20261017.json)。目标临时目录和 owner receipt 保留在目标机 `/tmp/shinemage-owner-rc1-target-20261017-r1/`。
