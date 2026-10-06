# CRM 与知识插件干净候选验收（2026-10-06）

结论：本机候选与固定宿主组合通过。来源为审核提交 `9902bdd93bee4b0ba7f30efb3d35e8928db62380`，生成时工作树干净；VERSION `0.20.0.0`，DSH `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`。此文档在验收后落档，不替换候选的 source SHA。

`release_ready=false`、生产 activation `NOT_RUN`。本轮没有 push、GitHub Release 发布、杭州切换或真实数据操作。

## 同一来源的产物

profile 为 `config/dsh-profile.crm-knowledge.rc2.json`，摘要 `7ca3511663ab2ea5d1bb8f839c83b29f5bbd6655238450ad08a04510642191ba`，只选择 CRM 与知识两个插件。没有声明首购保存 service binding；`service-compatibility=NOT_REQUIRED` 不代表 D15 保存门禁通过。

| 产物 | 字节 | SHA-256 |
|---|---:|---|
| CRM 独立 tgz | 233968 | `4be76b81f374b4cf354d783bb11c49bbe09df468b8c398186184f7066a11c968` |
| 知识独立 tgz | 14461 | `fb1b4d9e1e626d8ba858bb0ea849d022eed29a3e5385da5a884a0397be96d7a0` |
| `dsh-preflight-crm-9902bdd9.tar.zst` | 5272534 | `44dd8f731507a3c6513aef0c754be32e7644ff03d6897e01acbe3e48a3b88930` |
| 固定 DSH runtime tar.zst | 181220170 | `40af3c5ed85be7a357a061f439554453961a133d0cdd65f000a9d3fff46ff94f` |

完整 bundle 在 `.context/release-preflight/dsh-preflight-crm-9902bdd9/`，包括上表两个 zstd 包、pre/release manifest、SHA256SUMS、evidence index 和 preflight summary，共 7 文件。`verifyPreflight()` 已重新读取并核验摘要、文件集合、来源与阶段；不是仅查看日志中的 PASS。

独立插件候选在 `.context/checks/candidate-9902bdd9-20261006/plugins/{crm-knowledge,knowledge}/`。两份包分别由自己的 candidate/profile/pack 回执和 journal 管理；不能把单插件 tgz 交给完整 release 的 receive 命令。该独立 receive 入口仍为 NOT_AVAILABLE。

## 本次实际命令与结果

使用固定 Node 24.19.0 / pnpm 11.7.0 / Python 3.14.4；仅在线依赖命令显式使用已配置的本机代理。正式调用为：

```bash
DSH_PROFILE_MANIFEST=config/dsh-profile.crm-knowledge.rc2.json \
pnpm dsh preflight \
  --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python \
  --source-sha 9902bdd93bee4b0ba7f30efb3d35e8928db62380 \
  --tag dsh-preflight-crm-9902bdd9 \
  --output-dir "$PWD/.context/release-preflight/dsh-preflight-crm-9902bdd9"
```

| 阶段 | 结果 | 毫秒 |
|---|---|---:|
| prepare / audit | PASS / PASS | 31171 / 1113 |
| build / runtime | PASS / PASS | 4960 / 69079 |
| release / test | PASS / **244 PASS、0 FAIL、0 SKIP** | 1129 / 10024 |
| receive / evidence | PASS / PASS | 674 / 49 |

成功轮次总用时 **118590 ms**，使用已缓存依赖；不包含前面排错、失败轮次及后续宿主演练，不能据此宣称冷环境或生产发布只需两分钟。实际接收已校验 archive 摘要、解包内容与 manifest，临时接收目录由工具回收。

本轮另有环境专项 **3 PASS**（含连续两轮实际离线 fetch/install）与 CRM/知识合同 **55 PASS**，日志分别在 `candidate-8a70667f-20261006/repeat-install-test-retry.log` 和 `candidate-0e978f9e-20261006/plugin-contracts.log`。这些结果保留各自执行时点；两份业务插件 tgz 字节与当时一致，最新宿主测试使用本节 `9902bdd9` 候选。

## 固定宿主与 journal

`node scripts/dsh-b0/pinned-host-acceptance.mjs --upstream "$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" --output "$PWD/.context/checks/candidate-9902bdd9-20261006/host"`：实际官方 Web CLI **10/10 PASS**，Darwin arm64 / Node 24.19.0。仅使用新 HOME/profile、动态 loopback 端口、合成模型和会话。

场景包括 profile 加载/组合核对、领域工具、原生对话与落盘、正常重启恢复、移除 preset 后现有会话行为、在途 SIGKILL 后恢复、挂死需要外部重启、disable 后原生回退、恢复原组合。5 个自有宿主 PID 已退出；同进程任意插件故障隔离仍不承诺，继续使用 `HOST_RESTART_REQUIRED`。

host evidence 摘要为 `b7be26933892340a0a29ba7a0c09016d82a2cafc89c34fc394eb50edd7f53da4`。对两个候选分别运行真实 `pnpm dsh plugin verify-host`，逐文件绑定实际安装内容与同一 tgz，并在各自原 journal 追加第 3 条 `CANDIDATE_HOST_VERIFIED`：

| 插件 | candidate digest | journal digest |
|---|---|---|
| CRM | `690d8025a39aa0da329411ddf6e4478b20dd53396ee1795afe16b3915461169b` | `27e17b2cc37dc75031043207a71b0066e4f69e5aba7ad3e754a5517e6930760c` |
| 知识 | `f84254344a99c2be27ccf5454fdee49138eeef1374285140e958a4f74b7c6e85` | `cef5b2cf688ec2087b43e90d01167b0519708d542576911a460e9255ed550b26` |

重复核验仍为 seq 3；每个候选的 candidate、profile、tgz、host evidence 和 journal 这 5 项内容/大小/mtime 不变。两个结果均为 `LOCAL_HOST_VERIFIED`，`release_ready=false`。原始结果在 `.context/checks/candidate-9902bdd9-20261006/` 的 `preflight.log`、`bundle-reverified.json`、`host.log`、`host/evidence.json`、两个 `*-host-verified.json` 和 `candidate-verification.json`。

## 修复与开放项

本轮在发布前定位并修复四处问题：在线依赖代理被清除、重复 fetch 后入口链接未恢复、宿主合成长 key 命中扫描、默认 profile 测试受环境选择影响。固定 DSH 源码、SDK/锁文件和扫描/签名门禁保持原合同；失败记录、实际复现、OCR delegate 范围与修复提交见[准备故障记录](./dsh-g0-preflight-network-20261006.md)。WSL 回执接线也已审核提交为 `356862bf`，见[接线审核](./dsh-g0-service-target-gate-review-20261006.md)。

- T2/T17 的这两份 clean 插件本机宿主子项通过；DSH 的目标 WSL runtime、rc1→rc2/torn-frame、浏览器/真实模型仍 NOT_RUN。本机 Darwin runtime 包不是杭州 Linux 上线包。
- T13/T21 的本机候选、接收校验和两份 journal 幂等子项通过；远端插件 receive/reconcile、生产 canary/activation/rollback 仍 NOT_RUN。
- T3/T7 最终 reviewed 首购服务包、生产身份/策略、时钟/UNKNOWN 窗口及保存 UI 仍 PARTIAL；此前 WSL 首购 synthetic 结果不移植到本候选。
- 完整来源签名、SBOM/CVE 与 GitHub publication 信任链、G0/stop-go 和 T15 物理分仓仍待后续完成。build-tools 的在线 audit 仅覆盖该依赖闭包。

下一步继续补齐最终服务/身份合同及目标平台、供应链证据，再按 G0/stop-go 推进物理分仓；不再重做本轮已完成的源码解耦。

## 本轮修改文件

范围从本轮起点 `2a89790b` 至候选 `9902bdd9`，再加本次验收落档，共 22 个路径。各批代码已分别经过 OCR delegate 审查和正常 hooks 提交；最后 4 份验收文档补审覆盖 4/4，0 skipped，摘要/阶段/计数与实际 JSON/日志逐项核对，本地链接和 diff 检查通过。

```text
CHANGELOG.md
STATUS.md
docs/hackathon/TODOS.md
docs/hackathon/evidence/dsh-g0-clean-candidate-20261006.md
docs/hackathon/evidence/dsh-g0-preflight-network-20261006.md
docs/hackathon/evidence/dsh-g0-service-target-gate-20261006.md
docs/hackathon/evidence/dsh-g0-service-target-gate-review-20261006.md
docs/operating/crm-service-packages.md
docs/operating/verification.md
docs/plans/shinemage-plugin-platform-split.md
docs/reference/dsh-rc2-release-artifact.md
scripts/dsh-b0/package-manager-env.mjs
scripts/dsh-b0/package-manager-env.test.mjs
scripts/dsh-b0/pinned-host-acceptance.mjs
scripts/dsh-b0/pipeline.mjs
scripts/dsh.mjs
scripts/release/plugin-service-evidence.mjs
scripts/release/profile.test.mjs
scripts/release/service-target-evidence.mjs
scripts/release/service-target-evidence.test.mjs
scripts/release/test-fixtures/service-target.mjs
scripts/release/test-fixtures/target-acceptance-20261006.py
```
