# 服务包接线 OCR 审核与维修（2026-10-05）

工作树为 `codex/plugin-boundary-review`，审核基线 `82c1f5cdeb0cac3f5f0ac89ec7eafdb799383e95`。本轮按用户指定的 open-code-review-delegate 工作流执行：OCR 1.12.11 负责范围和规则解析，当前 Agent 审核与修复，没有调用外部审查模型。

## 覆盖与结论

原始工作区共 **15** 条路径：OCR 选择 5 个 JavaScript 代码/测试文件；10 个 Markdown 文件由主 Agent 补审。**reviewed_files=15，skipped_files=0，coverage_rate=100%**。修复另涉及 `state.mjs` 与 `state-reconcile.test.mjs`，二者也已解析规则、审查差异并验证。本文为新增审核记录。

逐文件 checklist、规则和发现保存在 `.context/checks/service-artifact-gate-review-20261005/`。5 个代码文件是 CLI、plugin-service-evidence、service-artifact-evidence、接线测试与 service-artifacts 夹具；文档范围是 CHANGELOG、STATUS、服务兼容架构、TODOS、服务包 runbook、插件 Quickstart、验证入口、拆分计划、release reference 与上一份接线证据。

| 级别 / 类型 | 定位 | 已确认的问题 | 修复 |
|---|---|---|---|
| High / bug | `scripts/release/plugin-service-evidence.mjs`、`state.mjs` | PREPARED 幂等缓存可与实际 journal 脱离；包验证期间历史被替换仍可能追加成功回执 | 比较真实 journal 条目；写锁内校验前置 seq/digest；重复回执必须对应 journal，允许无关事件正常追加 |
| Medium / bug | `scripts/release/state.mjs` | CLI 接受 FIFO 状态路径后读取阻塞，普通文件也没有大小界限 | 同一 fd 非阻塞打开、不跟随符号链接、核验普通文件并有界读取；状态最大 64 MiB，锁文件 4 KiB；写入同样限长 |
| Medium / security | `scripts/dsh.mjs` | 校验失败的 assert 差异可能把包内不可信字段回显到日志 | verify-service 仅输出稳定错误码，未知错误使用固定兜底码；不输出输入值与子进程细节 |

以上三类已维修。本次范围没有剩余已确认的 High/Medium；这不等于整个 G0 或生产发布完成。

## 本次实际验证

Node **24.19.0**。原始记录位于上述 review 目录。

| 验证 | 命令/方法 | 实际结果 |
|---|---|---|
| 4 项问题复现 | 接线测试：孤立缓存、解包期间替换 journal、FIFO、错误回显 | 修复前 **0 PASS / 4 FAIL**（`regression-red.log`）；修复后 **4 PASS**（`regression-green.log`） |
| 完整 release suite | `node scripts/dsh.mjs test` | **206 PASS / 0 FAIL / 0 SKIP**（`release-suite.log`），包含新增接线与共享 state 回归 |
| 实际 archive 核验 | `node scripts/dsh.mjs plugin verify-service --candidate …/candidate.json --evidence …/pair/receipt.json --state-path …/actual-state.json` | `LOCAL_SERVICE_ARTIFACTS_VERIFIED`（`actual-first.json`） |
| 新进程重试 | 相同参数重新执行 CLI | 相同 seq/digest，candidate 与 journal 字节不变（`actual-retry.json`） |

实际包仍使用上一轮已执行的 9 项 HTTP 兼容观测，本轮重新运行的是接线核验，没有重新运行服务或把旧观测计为新服务测试。candidate digest 为 `0df675b839885286da2880ee8656b3757c82aac3e36ffdcac53a9881e7c8031d`，服务证据 digest 为 `d27b6f63edf6358c06156fd645ed7285fd11e6ea96c64040a4d06fd7b69070d0`；本轮隔离 journal seq **3**，digest `668e6fd2b8bec51a28f06df7ea00e2f143647d4ce1282a3ece464d8d5bb211da`。

FIFO、历史替换、假依赖值和大文件测试均仅操作临时夹具。没有读取真实数据、执行真实模型、启动 DSH/6677、操作杭州、push 或发布。原始失败保留，不以最终通过覆盖。

## 提交及下一步边界

用户已授权审核修复后的本地 commit，使用正常 hooks；准确提交号以 Git 为准。该提交不把原来带 dirty 来源标记的包追认为 reviewed release。目标主机、供应链、生产形状时限/UNKNOWN、受控身份/状态注入和浏览器保存链仍未关闭；`release_ready=false`，激活仍 BLOCKED。

提交后开始只读目标主机服务验收准备，先定义可核对的环境/包身份输入与失败原因，再做隔离验证。真实 WSL 冷安装和生产切换不能由本机结果替代。
