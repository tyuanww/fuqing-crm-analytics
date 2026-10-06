# 原生命令审修后的 clean 插件与服务候选

2026-10-06，`codex/plugin-boundary-review`。承接[原生命令与 Chrome 审修](./dsh-g0-native-command-browser-20261006.md)：27/27 文件审核、浏览器异常清理修复后，按正常 hooks 提交为 `9611589ca39428d8c0e70d63c5ff202d6bd5293f`。本次从该干净 SHA 重新构建 workbench，并绑定独立首购服务包。产品仍 PARTIAL，`release_ready=false`。

## 固定身份

| 对象 | 实际值 |
|---|---|
| 插件与新服务来源 | `9611589ca39428d8c0e70d63c5ff202d6bd5293f`；打包时工作树干净 |
| DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，未修改 |
| 旧服务代码 | `56198c32a52d9822c7a3338d92b0fa077d1c61bc`；由当前打包器重建，不冒充历史发布包 |
| 新服务 archive | 80399 B；`d7025f754a6c1fe57ff0aa84e3de5c5bf353a099d4612101a8dccbb6fb871ff9` |
| 新服务 manifest | `6b6ebe41d64db6b962bf11bfffa21476daae02f63e3cf787145834726a6cd323` |
| 双包回执 | `a2b0a8b172b07c0260813cb320b0b4a2fc876212cc8b56fe9d935aea9a553ccc` |
| workbench tarball | 435294 B；`b3571f04618f44cdc7e0772d99980a4087a2f5a6a3a71e6cbbde778c85a86001` |
| candidate digest | `ca79774b3bed3f733e3ab0ddfebc5f4f89586577dc8c2b06a886b9dab2a0e72c` |
| profile | `first-purchase-native-command-local`；`05edde204b4bcf73e5ee4864c0d74be2ff85df4a93f422ab070b76f02a28a5c1` |
| journal | seq **3**；`586c89fb9740d77a11493368d8da7edb81fa22a8a186c5ef41c78316e1ff935e` |

这是一个 workbench 插件包与外部服务的本地候选绑定，**不是完整 CRM/知识插件组合或 DSH runtime 发布包**。profile 不包含 CRM 插件，也不替部署主机设置 CRM 登录、保存策略或凭据。包仍使用开发候选版本；没有上传 npm/GitHub。candidate 的 save/export/send 为 NOT_AVAILABLE，生产保存未启用；隔离测试中的显式准入不改变这些默认值。

## 本轮实际验证

原始证据根 `OUT=.context/checks/native-command-clean-9611589c-20261006`，相对于当前工作树。Node 24，Python 3.14.4；两个服务包各自在新 venv 从现有 hash wheelhouse 离线安装 13 个固定依赖。只使用隔离 SQLite、合成身份和 loopback HTTP。

| 命令/验证范围 | 本次结果 | 相对 OUT 的证据 |
|---|---|---|
| `service-save-compatibility.py --baseline 56198c32… --candidate 9611589c… --output …` | 源码兼容 **9/9 PASS** | `source.log`、`source/receipt.json` |
| `node scripts/crm-calibration/service-package-compatibility.mjs`，同一 SHA 对与固定 wheelhouse | 实际双包/HTTP **9/9 PASS** | `pair.log`、`pair/receipt.json` |
| `node dsh-plugins/analytics-workbench/build.mjs /absolute/pinned-upstream` | Host/client typecheck 与构建 PASS | `plugin-build.log` |
| 下述七文件 `node --test --test-concurrency=1` | **106 PASS / 0 FAIL / 0 SKIP** | `candidate-tests.log` |
| `pnpm dsh plugin candidate --plugin … --output-dir … --state-path … --profile … --previous-profile … --service-evidence …` | 固定包与 profile 快照生成；两条准备事件 | `candidate.log`、`plugin-candidate/` |
| `node "$OUT/verify-packed-crm-save.mjs"` | 同一服务 archive **6/6 PASS**，响应通过当前插件 decoder | `packed-crm-save-verification.json`、`probe-http.stdout` |
| `pnpm dsh plugin verify-service --candidate … --evidence … --state-path …` | 本机双包观测进入 seq 3 | `verify-service.log`、`plugin-state.json` |
| `node "$OUT/verify-binding.mjs"` | 幂等、旧目标回执拒绝、生产阻断与文件保留 PASS | `binding.log`、`binding-verification.json` |

七个测试文件：`dsh-plugins/analytics-workbench/test/{built,first-purchase-commands,first-purchase-save-dom,first-purchase-saved-analysis-view}.test.mjs`，以及 `scripts/release/{service-compatibility,plugin-service-evidence,service-target-evidence}.test.mjs`。这是本次受影响范围验证，不是完整 B0、完整 CI 或新的浏览器通过结论。

构建显式使用已有 SDK 链接指向的公共工作树固定 rc2 checkout；没有改链接、重装环境或重建 DSH。源码兼容使用共享测试依赖环境；实际双包验证使用各自独立离线 venv，这两层证据不混同。

同一服务 archive 的六项验证重用了已经审读的隔离 probe，并在新目录实际执行，输入摘要见 `packed-probe-inputs.json`。它使用本次真实 candidate digest、合成 CRM `/api/v1/auth/me`、服务自有身份 resolver 和明确关闭的时效检查，验证：

- inspect 返回当前权限与 NOT_CHECKED；错 candidate/客户端覆写不落盘。
- 保存与重试得到同一回执；撤权、失效会话和身份服务故障拒绝。
- 重新打开 SQLite 后精确回放，UNKNOWN/冲突不制造额外记录；当前插件严格 decoder 接受响应。

该 probe 的 HTTP 线程均停止、独立安装目录已回收。此项是本机 HTTP/重新打开状态证据，不是进程崩溃或生产 CRM 登录证据。

## 不可变回执与剩余门禁

两条准备事件后，现有 `verify-service` 追加 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`。重试不改本次 **52** 个源证据/产物/profile/journal 文件的内容、长度与 mtime；上一 `48e7ddfc` 证据目录 **195** 个文件的内容与 mtime 保持不变。

把旧 `48e7ddfc` WSL 回执交给新候选时，实际返回 `SERVICE_TARGET_PAIR_MISMATCH`；未追加事件。生产 gate 实际返回 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`。新包目标机为 **NOT_RUN**，没有用旧包的 WSL PASS 代替。

旧服务可只读访问新状态；可写降级会损失来源，仍被阻断。profile 回退必须保留新服务和 durable state，不能当作数据回滚。

下一步按现有 T3/T9/T14/T17/T21 推进精确候选的 CRM + workbench 组合与官方宿主/浏览器证据，再验证同一包的目标环境与 NOT_CHECKED 链。现有 `verify-host` 十场景仅接受 CRM + knowledge profile，不能套用到 workbench 候选；本次未放宽验证器。headed/移动端/读屏、真实模型、生产形状 UAT、供应链与生产激活仍开放；G0/stop-go 后再物理分仓。

本轮未访问真实 DuckDB、连接杭州、push、发布或切换服务。候选源码身份始终为 `9611589c`，后续纯证据文档提交不触发重打包。

后续接续：本页记录已随 `d3fe7f94` 提交。相同 workbench tarball 与另行固定的 CRM 包已完成[包级宿主/浏览器验收](./dsh-g0-first-purchase-artifact-host-20261006.md)；这不改变本页原始回执或 journal，也不把源码服务夹具的通过视为独立服务 archive 整链通过。

## 证据落档审核

沿用 OCR delegate 的确定性 preview/rule，由当前 Agent 补审默认排除的五份 Markdown：**5/5 reviewed、0 skipped、100%**。核对真实回执、SHA、测试计数和范围，修正计划中未注明包版本的 WSL 表述。无新代码缺陷；审核清单、链接和产物保留检查分别保存为 `review-summary.json`、`document-links.json`、`final-integrity.json`。纯文档修订未重复执行业务测试。
