# 首购杭州浏览器回执接入候选 journal（2026-10-07）

结论：已将上轮实际 WSL2 headless 五场景证据接入同一候选 `861d6ef1…` 的原 journal **seq 6**。本轮执行的是本地证据核验与记账，没有重跑杭州浏览器、服务或生产。产品仍 PARTIAL，`release_ready=false`。

## 实现与边界

沿用 `pnpm dsh plugin verify-host`，新增显式 `dsh-browser-host-evidence/v1` 封套。HTTP v1 和旧 CRM/知识 v2 的语义保留；浏览器通过不意味着 HTTP 二十项、headed/移动端/无障碍或生产身份通过。

- 父事件必须是同候选、同 profile/包/服务绑定的 `CANDIDATE_RUNTIME_HOST_OBSERVED`，并追溯原 source-HTTP 服务事件。写入锁内再次核对父事件，禁止错候选或被替换的历史。
- 与 HTTP 门禁共用有界文件读取、固定控制器核对、runtime 流式摘要、两插件安全解包、查询/保存包及 Linux wheel/存储/进程校验，不再复制一套业务包判定。
- 浏览器独立校验五场景、登录/Cookie/Origin/CSRF 前置、实际版本/平台/locale、零 pageerror、一条分析/一个 worker、同版本服务重启、截图附件头部/尺寸/摘要、字体配置及临时目录回收观察。
- `BROWSER_PROBE_SHA` 固定本次已执行驱动字节 `25da43a68af26c7f9712b802334dd83c3009173dda1bb36a435d061f01b9c678`；其余控制器来源仍为 `4d792eeb`。这是历史验收输入钉，不是自动跟随工作树或 DSH latest。
- 回执返回 `WSL_SYNTHETIC_BROWSER_HOST_OBSERVED`，journal 事件为 `CANDIDATE_BROWSER_HOST_OBSERVED`。仍标记 `UNATTESTED_OPERATOR_OBSERVATION`；本地 hash 不证明远端签名。浏览器/库/字体二进制不在本轮重新执行或认证，截图校验不自动代表视觉 QA。

实际浏览器运行、r1 语言失败、r2 缺字形、r3 最终成功及清理都归[上轮 WSL 记录](./dsh-g0-first-purchase-target-browser-wsl-20261007.md)。本轮不把历史 5 场景称为重新通过。

## 本次实际验证

证据目录：`.context/checks/first-purchase-browser-gate-20261007/`。

| 本次命令 / 检查 | 结果 | 证据 |
|---|---|---|
| Node 24 `node --test scripts/release/*.test.mjs` | **345 PASS / 0 SKIP / 0 FAIL**，其中浏览器门禁 **34 项** | `release-tests-r1.log` |
| 按 B0 精简 PATH/HOME/cache 约束运行新门禁，Corepack 联网关闭 | **34 PASS / 0 SKIP**；为完整套件子集重跑，不重复计数 | `pipeline-environment-browser-tests.log` |
| 共用校验抽取后原 HTTP 门禁 | **33 PASS**；也包含在上行完整套件，不重复计数 | `shared-refactor-tests.log` |
| 杭州原始回执 CLI 预演 | PASS，先用 seq 5 的副本，不改原 journal | `actual-smoke.stdout`、`actual-smoke-r2.stdout` |
| 原 journal CLI 接线、相同命令重试 | seq 6；重试返回相同结果，字节/mtime 不变 | `actual-cli.stdout`、`actual-retry.stdout` |
| 错误父事件 CLI | 稳定退出 2，错误脱敏，不写 journal | `actual-negative.stderr` |
| 15 固定候选输入、前五条事件 | 保留原摘要/大小/mtime 和完整历史 | `actual-verification.json`、`state-before.json` |
| 差异、Node 语法、修改文件 secret scan、新增文档链接 | 见最终检查 | `checks.json` |

已核对本轮 `browser-host-evidence.test.mjs` 与 `release-tests-r1.log`：测试使用隔离的 parser-only 小包和观测夹具，不启动真实 Host、浏览器或业务服务。负测覆盖失配候选/父事件、runtime/控制器篡改、版本/语言漂移、认证跳过、重复 worker/分析、跨库存储、未退出进程、字体/截图缺失与篡改、路径逃逸/symlink、错误清理目录、未经执行的 HTTP 重放声明以及日志脱敏。

补充环境检查保留一次失败：首次检查错误地给 Corepack 使用全新空 HOME，固定 pnpm 缓存不可见，初始化阶段尝试下载并遇到本机 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`，见 `ci-environment-browser-tests.log`。实际 B0 入口保留 HOME；按该边界复用已有 pnpm 11.7.0 缓存、额外关闭 Corepack 联网后 34 项通过。未关闭 TLS 校验、修改全局配置或升级工具链。这不是完整 B0 pipeline 或远端 CI 通过声明。

真实接线命令：

```sh
node scripts/dsh.mjs plugin verify-host \
  --candidate "$PWD/.context/checks/first-purchase-source-packages-20261007/plugin-candidate/candidate.json" \
  --evidence "$PWD/.context/checks/first-purchase-browser-gate-20261007/evidence/envelope.json" \
  --state-path "$PWD/.context/checks/first-purchase-source-packages-20261007/plugin-state.json"
```

| 绑定 | 值 |
|---|---|
| candidate | `861d6ef1c42b23b5f2ad4427ba9a19ecb032651c61efa6414303e0729feea4d4` |
| 既有 runtime Host 父事件 | seq 5 / `01ab64f56ef88c2795cbbfefe4877e2ff5f0774ac280636261951adc21bfa73f` |
| 新 browser 封套 | `035fe92c7cebebfa3fafb57e5e1f8612381dcd48de2d139513e7512154334485` |
| 原始 r3 browser receipt | `ae38c5d036f58aa11094719182d82a4cc137be5a353d1badf51c971ca84da3ad` |
| 新 browser 事件 | **seq 6** / `653c81017936dd450ef38acf5f48f6f681dafda7d01ed57430d317ddde17ee0f` |
| 当前 journal SHA256 | `792a180cb1c054c3e568c2b3d2e0aa9d4f38cc8f5d9095f598d73541bcd5407a` |

原现场 transfer/回执/截图没有重写。用于核验的控制器目录从原输入材料化，修复后的 probe 必须逐字节匹配原 r2 seal；不把重新材料化称为重新运行。原 Linux runtime 只读复用、业务四包未重新生成。

## 后续任务

当前只关闭 T2/T13/T21 浏览器观测记账子项。下一步为当前候选在目标 WSL 的在途崩溃/torn-frame 与跨版本恢复证据；headed/移动端/无障碍、真实身份/模型/业务 UAT、供应链签名/SBOM/CVE、生产 activation/canary/rollback 及物理分仓仍开放。结果年龄策略继续按用户决定暂缓。

本轮自查与当前验证完成，不冒称外部 OCR 已执行。新增源码与文档尚未 commit；没有 push、发布、远端操作、真实数据读取或生产切换。
