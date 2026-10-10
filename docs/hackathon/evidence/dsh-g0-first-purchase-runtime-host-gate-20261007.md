# 首购 runtime Host 的目标回执接线（2026-10-07）

本轮关闭 **T2/T13/T21 的已有 WSL 首购 Host 回执核对与 journal 接线子项**。上一批 29 文件已按正常 hooks 本地提交 `4d792eeb`；本轮接线代码基于该 clean HEAD 继续，尚未提交。整体仍 **PARTIAL / release_ready=false**，未 push、发布、连接或启动杭州服务。

## 已实现

沿用 `pnpm dsh plugin verify-host`，增加明确的 `dsh-runtime-host-evidence/v1` 封套分支。旧 CRM＋知识 `dsh-pinned-host-acceptance/v2` 分支保留，两个范围不互相冒用。

封套包含 `inputs`、`controller`、`inventory`、`runtime_archive` 四个相对文件引用 `{name, sha256}`，以及原 journal 的 `service_target_event: {seq, digest}`。引用限定在封套目录内；有界读取、特殊文件拒绝、大小/摘要、路径与源码错误均在写 journal 之前拒绝。

- 复用服务候选的只读校验，核对 candidate/profile/pack 和 durable prepared 事件；Host 与 service 两个调用方共用一份逻辑。
- 原 source-HTTP 目标事件绑定原候选、服务包及 Linux 依赖回执。此前 seq 4 记录保持原样；新增 Host 观察通过同一 journal 锁与 `requiredEvent` 追加。
- 校验原 185 文件输入、143 文件控制器和结果清单。实际执行控制器的源码钉为 Git `4d792eeb`；七个 namespace 入口核对原文件摘要及已有 bootstrap 来源。现场后追加过测试的一个未执行负测文件按原摘要保留，不能冒充执行代码与 Git 完全一致。
- 流式核对真实 runtime archive；插件包安全解包后逐文件对照记录的安装摘要，同时核对 package 名称/版本。只检查数据，不 import 或执行包内代码。
- 核对 20 条 HTTP 记录、查询/保存包与 wheel、来源合同、1 个 worker / 1 条分析、独立存储、服务重启重放、原生回退和进程回收记录。前后监听快照必须一致。
- CLI 对 Host/service 断言和子进程错误统一只输出稳定错误码，防止把回执中的恶意字符串或凭据写进日志。
- 新门禁加入现有 B0 pipeline；两处 B0 CI checkout 保留完整历史，使固定 controller commit 可被读取。验证器不会联网补历史；固定源码对象必须随交付保留，缺失时拒绝验证。远端 CI 本轮未执行。
- B0 `--check` 在耗时步骤前定位、验证已有 zstd，解析 symlink 后仅把该工具目录附加到精简 PATH；Node/Python/系统目录优先级保留，不转发调用环境的其他变量，不安装工具。

新的 journal 状态为 `CANDIDATE_RUNTIME_HOST_OBSERVED`，返回 `WSL_SYNTHETIC_RUNTIME_HOST_OBSERVED`；保留 `UNATTESTED_OPERATOR_OBSERVATION`。本地一致性核对不是远端签名，也不会把生产发布状态改为通过。

## 实际 CLI 与不可变输入

证据目录：`.context/checks/first-purchase-runtime-host-gate-20261007/`。已有现场资料仍在 `.context/checks/first-purchase-runtime-host-20261007/`，没有重写原回执或重新跑 WSL。

```bash
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh.mjs plugin verify-host \
  --candidate "$PWD/.context/checks/first-purchase-source-packages-20261007/plugin-candidate/candidate.json" \
  --evidence "$PWD/.context/checks/first-purchase-runtime-host-20261007/host-journal-evidence.v1.json" \
  --state-path "$PWD/.context/checks/first-purchase-source-packages-20261007/plugin-state.json"
```

| 绑定 | 当前结果 |
|---|---|
| candidate digest | `861d6ef1c42b23b5f2ad4427ba9a19ecb032651c61efa6414303e0729feea4d4` |
| 新封套 SHA-256 | `88e9435d7cff0ecd09df9a34d435431fee0aa865a6eec5626027c9f03621a92a` |
| 原目标 Host 回执 SHA-256 | `8f55011fb3ae5e9f15fa5fec967e40b629debf2f81f20236017c04e75099c5ec` |
| 原 runtime SHA-256 | `a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4` |
| 原服务目标父事件 | seq 4 / `1164f8a90711d6b7cb8ddf2814b6ac44403b34b780dd305d03cadbb75b44be18` |
| 新 Host 事件 | **seq 5** / `01ab64f56ef88c2795cbbfefe4877e2ff5f0774ac280636261951adc21bfa73f` |

当前 CLI 首次接线、独立进程重试、最终代码重试均通过；重试返回同一结果，journal 字节及 mtime 不变。用另存的错误父事件封套执行真实 CLI，稳定退出 2，未写 journal。前四条历史事件完整保留，15 个固定候选输入的摘要/大小/mtime 不变。实际结果及完整命令见 `actual-verification.json`、`actual-cli.stdout`、`actual-final-retry.stdout`、`actual-negative.stderr`；seq 4 原字节另存 `state-before.json`。

## 当前验证

| 命令 / 范围 | 结果 | 证据 |
|---|---|---|
| Node 24 `node --test scripts/release/*.test.mjs` | **311 PASS / 0 SKIP**，其中新 Host 门禁 **33 PASS** | `release-tests-final.log` |
| 精简 B0 环境调用当前 `archiveToolEnv` 后执行新门禁 | **33 PASS / 0 SKIP**，属于上述 311 项的重跑 | `ci-environment-gate-tests-final.log` |
| `node --test --test-name-pattern='archive tool' scripts/dsh-b0/package-manager-env.test.mjs` | **2 PASS**，工具路径、缺失/坏执行文件、原环境保留 | `archive-tool-tests.log` |
| 实际已有回执 CLI + 同命令重试 + 错父事件拒绝 | **PASS**，原 journal seq 5 幂等 | `actual-verification.json` |
| 当前差异、Node 语法、凭据扫描及新增/修改文档文件链接 | 见本轮检查结果 | `checks.json` |

33 项新增测试使用隔离校验器夹具，不启动 Host、模型或真实服务；runtime/wheel 及 PASS 日志是显式不可安装的测试字节。覆盖错候选/包/runtime、controller 源码篡改后重算摘要、平台/身份、缺场景/认证跳过、重复分析、跨库存储、旧来源合同、未退出进程、端口/监听漂移、特殊文件/路径、错误父事件、不完整证据、已知安装摘要与 archive 不一致、CLI 脱敏及幂等。它们不等于新的杭州运行证据。

保留一次实际失败：增强 archive 对照后，测试夹具的 macOS tar 混入 `._package` 被正确拒绝；修复为夹具打包显式关闭 AppleDouble 元数据，未放宽 package 根目录检查。见 `gate-tests-r2.log`。后续最终全套结果见上表。

精简 B0 环境首次重跑因 PATH 移除了 Homebrew zstd 而失败；补齐精确工具定位后，首次版本探针又因只识别 `zstd`、未识别官方 `Zstandard CLI` 输出而失败，已修正并保留 `ci-environment-gate-tests.log`、`ci-environment-gate-tests-r2.log`。最终成功记录见上表，不把两次环境失败计作通过。

## 仍开放

- 同一候选的目标浏览器、headed/移动端/无障碍验收。
- DSH 在途崩溃/torn-frame、rc1→rc2/当前包跨旧版本矩阵、profile 原子激活/回退。
- 真实 CRM 身份、真实模型/业务 UAT、生产保存准入和供应链签名/SBOM/CVE。
- 远端部署 receive/reconcile/canary、生产 activation 和物理分仓。

已核对上述本地接线范围；只把当前子项勾选完成，不关闭这些后续门禁。结果年龄策略按用户决定继续暂缓。
