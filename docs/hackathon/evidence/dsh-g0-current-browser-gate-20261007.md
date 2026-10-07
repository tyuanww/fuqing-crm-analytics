# 新候选浏览器回执 v2 接线（2026-10-07）

**同一 `a490457c…` 候选的杭州封存浏览器观察已接入 journal seq 6，引用终态 Host seq 5；整体仍 PARTIAL / release_ready=false。** 本轮从 `db16041a` 和前轮 5 个未提交文档继续，仅实现、验证本地门禁，没有重跑远端、重建业务包或切换生产。

## 为什么需要显式 v2

原 `dsh-browser-host-evidence/v1` 要求 `runtime_host_event`，并保留插件/服务同源码 SHA 的历史合同。新候选只更新插件，服务来自独立 binding，其父事件是 `CANDIDATE_TERMINAL_HOST_OBSERVED`。本次增加 `dsh-browser-host-evidence/v2`，继续调用 `pnpm dsh plugin verify-host`，不用改写原始 observation、旧 schema 或旧 journal 事件。

v1 与 v2 共用 runtime/四包校验、五场景、登录安全前置、截图形状、来源隔离和进程合同。v2 输入/收尾适配在 `scripts/release/browser-host-v2.mjs`；控制器来源和离线 wheel 检查与终态门禁共享。`checkProcesses` 的独立来源参数只由明确版本分支启用，v1 默认不变。

## v2 合同

封套严格接受 `schema_version/inputs/controller/inventory/runtime_archive/terminal_host_event/collection/completion/result_archive/completion_script`；文件引用为相对路径和摘要，所有引用、清单和包检查在 journal 写入前完成。

- 父事件必须是同候选、同 release tag 的终态 Host，状态为 FAILED、名额已释放、派发一次；再沿其服务目标事件核对服务输入。候选、插件和服务 SHA 分别检查。
- 510 个密封输入、184 个取回结果、固定控制器、runtime 和四包交叉核对；派生 v5 输入只能来自本次取回记录。新增或修改控制器，即使重算清单也不能绕过固定来源。
- 固定执行 runner 只对首行自有目录进行规范化，然后校验其余原字节摘要。runner 和 cleanup script 以 `.py.txt` 历史夹具保存，验证时不执行，不被当成新 Python 源码。
- 五个浏览器场景、零 pageerror、zh-CN/headless、同一包快照、一个 worker/一条分析、独立保存库及进程退出必须一致；不能把 HTTP-only、UNKNOWN、生产身份或未接通能力当作通过。
- 原始结果 archive 重新计算摘要，并在有容量/条目限制的自有临时目录安全解包，与 inventory 和逐文件字节逐一比对。collection 的 archive 摘要/大小/文件数、cleanup 和最终删除回执相互核对；清理脚本固定摘要且必须绑定同一自有目录与结果 archive。
- 浏览器、库和字体仍是固定版本操作者观察。字体配置/launcher 原字节未被前轮取回，v2 将其记录的摘要与固定配置模板核对；不伪造取回文件，不宣称签名或渲染认证。实际截图属于[前轮实机验收](dsh-g0-first-purchase-current-browser-20261007.md)，本轮不重新做视觉 QA。

## 本轮实际验证

证据目录 `.context/checks/current-browser-gate-20261007/`，以下路径均相对该目录。

| 命令 / 操作 | 结果 | 证据 |
|---|---|---|
| `node --test scripts/release/browser-host-v2.test.mjs` 初轮 | 38 PASS / 0 SKIP / 0 FAIL | `v2-tests-r1.log` |
| `node --test scripts/release/browser-host-evidence.test.mjs scripts/release/terminal-host-evidence.test.mjs` | 71 PASS / 0 SKIP / 0 FAIL | `legacy-tests.log` |
| `node --test scripts/release/*.test.mjs` 最终 | **429 PASS / 0 SKIP / 0 FAIL，76.45 秒**；含新 v2 38 项，不与前两行重复相加 | `release-tests.log` |
| 原始杭州封套在 journal 副本预验 | PASS / seq 6 | `actual-dry-run.stdout` |
| 原始杭州封套接入原候选 | **WSL_SYNTHETIC_BROWSER_HOST_OBSERVED / seq 6**，前五事件保持 | `verify-host.stdout`、`actual-verification.json` |
| 同一 CLI 重试 | 输出一致，journal 字节/大小/mtime 保持 | `verify-host-retry.stdout` |
| 真实封套使用错误父事件摘要 | 退出 2 / PLUGIN_HOST_BROWSER_PARENT，原 journal 不写入 | `wrong-parent.stderr` |
| 文件保护 | 1318 个文件大小/摘要/mtime 保持；新候选 journal 仅追加一次事件 | `protected-before.json`、`journal-seq5.json`、`actual-verification.json` |

最终完整 suite 包含补强后的“重算摘要也不能将清理脚本指向另一目录”负测；初轮 38 项日志不是该修改后的最终证据。其他负测覆盖旧 schema/父事件混用、未知字段、插件/服务错 SHA、替换 controller/runner、归档与清单不一致、路径穿越/symlink、来源与保存隔离、缺场景/pageerror、假清理、矛盾 pytest、缺 state 和 CLI 脱敏。

本次实际接线：

```sh
BASE="$PWD/.context/checks/first-purchase-terminal-candidate-20261007"
OUT="$PWD/.context/checks/current-browser-gate-20261007"
node scripts/dsh.mjs plugin verify-host \
  --candidate "$BASE/plugin-candidate/candidate.json" \
  --evidence "$OUT/evidence/envelope.json" \
  --state-path "$BASE/plugin-state.json"
```

事件 digest `062f271051788a815b40aae8fb1410ab9897a6018749c86198b2b1fa92e014b1`，引用终态 seq 5 / `cc5a0439…`。候选仍 `a490457c3e867b3fb0d03fa8daeb04886f7b8657da0b1cf2fbadb30917e7887c`，浏览器五场景，`release_ready=false`。旧候选 journal 不变。

原始输入和结果复制到新的证据目录并核对摘要；runtime 复用已有固定本机 archive。没有修改前轮 raw receipt、源包、runner 或真实业务数据。本轮 Node24.19.0；只跑回执相关 release suite 和语法/差异/引用检查，完整后端、B0 编译与远端 CI 未执行。

## 剩余事项

本次仅关闭当前候选浏览器的 journal 接线。完整跨版本 corpus、真实身份/模型/UAT、签名/SBOM、生产 activation/canary/rollback、G0 stop/go 与物理分仓仍开放。未新增线上服务或 GitHub 操作；该实现及前轮文档经下述审查，随本次本地提交交付。

## 提交前 OCR delegate 审查

2026-10-07 使用 `open-code-review-delegate`：OCR 仅选择文件和解析规则，由当前 Agent 审查。初始 21 文件全部核对：11 个 OCR 支持文件、10 个手工补审文档/原始文本夹具；覆盖 21/21，跳过 0。没有发现未关闭的高危或严重问题；修正一项中等文档问题——浏览器 reload/保存重启证明与 API 同 intent、查询离线重放分开，后两项仍明确 NOT_RUN。没有更改原始执行回执或放宽门禁。

本次重新执行 `node --test scripts/release/*.test.mjs`：**429 PASS / 0 FAIL / 0 SKIP，92.13 秒**，日志 `.context/checks/current-browser-review-20261007/release-tests.log`。这是提交前新运行结果，未复用上一节 76.45 秒的日志。实际 archived CLI 重试及错父拒绝再次通过，candidate/journal 字节、大小、mtime 不变，见同目录 `actual-checks.json`。审查清单/修复见 `review.json`；语法、差异与新增相对链接检查见 `final-checks.json`。

此轮没有再做远端浏览器、生产身份/模型、完整后端、B0 编译或远端 CI；这些结果不从本机 release suite 推定。后续继续 T2/T7 会话兼容 corpus，仍不得把有限合成持久化证明写成完整宿主/跨版本上线验收。
