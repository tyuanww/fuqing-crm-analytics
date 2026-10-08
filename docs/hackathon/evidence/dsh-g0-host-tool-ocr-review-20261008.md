# HTML 宿主、工具与并行成果提交前 OCR 审修（2026-10-08）

本轮已核对工作树 `codex/plugin-boundary-review` 相对 commit `5bf2bc77` 的全部 37 项改动；修复 4 类验收可靠性问题。本次新增本报告，最终范围为 **38 文件：23 份 OCR 可审查文件 + 15 份补充核对文件，0 跳过**。限定范围内无仍未关闭的确认缺陷，可进行用户授权的本地提交；产品仍 PARTIAL，SDK 分发仍 BLOCKED，`release_ready=false`。

使用 `ocr 1.12.11 delegate preview/rule --format json` 选择文件和解析规则，由主 Agent 审阅实际 diff、新文件完整源码及调用方；OCR 没有调用外部模型。同宿主原生 adversarial 审阅用于补充寻找反例，不把它称为独立外部模型审查；外部模型为 NOT_RUN。本次不是整个长期分支、历史规划或生产 release 的完整放行审查。

## 确认问题与修复

| 问题 | 影响与实际证据 | 修复与验证 |
|---|---|---|
| P2：shell 只读 Git 检查仍执行仓库本地 fsmonitor | 空的自有临时 Git 仓库配置 marker hook，原参数 `status` 返回 clean/0，但实际执行了 hook。固定 HEAD 和净工作树不能消除本地配置的副作用 | 统一使用 `readOnlyShellGit`，显式禁用 fsmonitor/hooks、optional locks、replace 和系统/global 配置；实际调用回归确认 marker 未创建，固定官方模块 12 tests / 25 场景通过 |
| P2：HTML 验收父进程收到信号后跳过 finally | 原文件字节一致的 VM 反例中 SIGTERM 导致父进程退出、owned child 残留；不是完整宿主验证。修复过程中真实 SIGINT 又暴露 Playwright 默认 `process.exit(130)` 抢先退出 | runner 统一拥有 SIGINT/SIGTERM，关闭 Playwright 默认信号处理，取消 owned I/O 后进入 finally，失败回执保留 interruption reason；最终相同 runner 的真实 Host/Chrome 两种信号均写出失败回执、4 资源清理 PASS、端口释放 |
| P2：部分准备/HTTP/失败取证等待无截止时间 | 原解释器探测、exchange/seed HTTP 与失败截图可能使清理长期不可达；源码逐路径核对，不声称原完整宿主已复现无限挂起 | Python 5 秒；每次 HTTP 10 秒且预算覆盖响应体；运行期 180 秒后取消，后接独立有界清理；截图/文本独立有界。真实 loopback headers/body stall、父取消及预算回归通过 |
| P2：首次编辑点击未等待 iframe 新文档 | 正式执行 capture 009 在首个嵌套选区超时；源码的 workspace `aria-busy` 等待不覆盖异步 srcdoc 切换，旧预览的同名元素仍可被点击 | 三处进入编辑后的首个选区点击等待桥接生成的 `data-cockpit-target`；保留按钮/链接/表单的普通点击以检验事件阻断，不加盲目 sleep 或失败重试。最终 capture 011 完整 17/17 |

原始反例及源码绑定在 `.context/checks/ocr-workspace-20261008-r1/adversarial/`；全批起始源码字节为 `before/`，摘要为 `snapshot.json`。最终逐文件审核与摘要见 `coverage.json`；采用 `(path,status)` 身份，没有静默忽略 OCR 排除的测试、声明和文档。

## 当前实际验证

证据根目录：`.context/checks/ocr-workspace-20261008-r1/`。每个 capture 的 argv、cwd、退出码、时间与 stdout/stderr 摘要见 `.qa-evidence/NNN/receipt.json`。下表有重叠，不相加为唯一测试总数。

| 执行 | 结果与范围 | 证据 |
|---|---|---|
| Node24 mounted/renderer、输入/清理、backpressure/operator/local-verify/CLI | capture 001：53 PASS，0 SKIP；其中旧清理4项在下行修后复验，其余产品/调度源码本轮审修未再改变 | `.qa-evidence/001/` |
| 修后 cleanup / inputs / shell guards | capture 003：27 PASS，3 个官方 runtime opt-in 测试 SKIP；cleanup 8、inputs 10、shell 本地 9 | `.qa-evidence/003/` |
| 显式固定官方 shell/tool | capture 004：12 PASS，0 SKIP，内部 25/25；45 输入保持、15 自有进程组回收。注入超时/中断的内部 FAIL 是预期负测 | `shell-runtime/result.json`、`.qa-evidence/004/` |
| Python3.14 PageDocumentStore/CockpitAI | capture 002：56 PASS；`--noconftest -W error::ResourceWarning`；3 条既有非 ResourceWarning 告警 | `.qa-evidence/002/` |
| 固定官方 rc2 + headless Chrome，当前 HTML 包 | capture 011：17/17 PASS；真实源码后端与合成小库，实际 candidate 文件收取/预览/确认；HTTP 89805、Host 89813 已退出，4 项清理 PASS、4328 释放 | `html-final-r3/results.json` |
| 最终同字节 runner 的真实中断 | capture 012：SIGTERM / SIGINT 均通过；runner 正确 exit 1，回执明确 interrupted，browser/model/host/HTTP 全部回收，端口释放 | `real-interruption-results-r3.json` |

HTML 输入沿用原独立作者正式 build/typecheck 产生的同一包 `285f882ab9544da9043fb76cf15c55346fc4f84477575acc6724a0ea2af50d7b`，8 成员/574 源码输入每次运行重新核对。本次审修没有改插件或产品后端，不重复构建或 prepare SDK。原 35/129/2、25 合同与10原生接线属于[此前作者证据](dsh-g0-html-host-acceptance-20261008.md)，没有冒称本轮再次执行。

可复跑的最终正常命令如下；`--output` 必须选新的绝对路径：

```bash
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh-b0/html-host-browser.probe.mjs \
  --input "$PWD/.context/checks/html-host-acceptance-20261008-r1/inputs-preview-final.json" \
  --output "$PWD/.context/checks/ocr-workspace-20261008-r1/html-next-run" \
  --python /tmp/fuqing-fastapi141-v2-venv/bin/python \
  --playwright /Users/hutou/.gstack/repos/gstack/node_modules/playwright/index.mjs \
  --run-isolated-host
```

## 失败账本与未运行范围

- capture 005：修复时 wrapper 与 RPC 参数同名，`request is not a function`，改为 `probeRequest` 后 capture 006 为17/17。
- capture 007：SIGTERM 正确清理；SIGINT 被 Playwright 接管，缺结果回执。驱动只回收自有进程组；保留日志，关闭依赖的信号接管后 capture 008 两种信号通过。
- capture 009：首次选区超时；capture 010 把就绪标记错误地要求到不可选按钮，事件阻断阶段超时。随后把标记等待限定在编辑入口的首个选区，capture 011正常全链和012中断均通过。所有失败目录保留，不计为通过。
- QA 初始探索预算结束后执行的是缺陷修复的必要定向复验，每条命令有独立上限，没有重置初始 smoke 预算宣称新一轮全通过。
- 真实 DeepSeek producer、headed Chrome、移动端、读屏、当前 HTML 包 WSL、完整 B0、远端 CI、本轮杭州操作/生产切换为 **NOT_RUN**。旧指标/知识 WSL 回执仅属其冻结输入；本轮没有重新执行。
- 固定 SDK 的29条上游公告、完整 BOM/发布者与撤销/二进制安全/最终签名等原有门禁保持，见[SDK 剩余范围](dsh-g0-sdk-trust-remaining-20261008.md)。本地审修通过不放行 SDK 分发、物理分仓 stop/go 或生产。

官方 DSH + 独立业务插件/服务的方向保持：无上游源码修改、无 pin/领域包/candidate/journal 修改、无真实 DuckDB 或凭据读取；宿主/SDK 审计不加入每次业务插件的日常更新。本批仅本地 commit，不 push、发布或部署。
