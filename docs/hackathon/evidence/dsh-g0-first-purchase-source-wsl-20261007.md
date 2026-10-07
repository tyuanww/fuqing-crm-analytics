# T3/T7 固定来源 HTTP 双包的杭州 WSL 验收（2026-10-07）

结论：**WSL SOURCE HTTP / SAME-VERSION RECOVERY PASS，整体 PARTIAL**。上一批 15 个组合驱动与文档文件已通过正常 hooks 本地提交 `09080b776acdf0023d1436e98758e7131029c6d3`。本轮没有重打业务包，复用 `f9726f68` 的查询与保存 archive，实际在杭州 WSL2 完成 **10/10** 合成服务验收。不是生产切换，也不是目标 DSH 宿主/插件 UI 验收。

## 固定输入与现场范围

原始证据：`.context/checks/first-purchase-source-wsl-20261007/`，下文记为 `OUT`。此前包证据见[本机固定组合](./dsh-g0-first-purchase-source-packages-20261007.md)。

| 对象 | 本次身份 |
|---|---|
| 两个业务包来源 | `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6` |
| 查询 archive | 113681 B；`109251614197e515a34a4824206e93ef53c0185e5c09a24a7906f9f7a967b8b7` |
| 保存 archive | 82908 B；`ee4908c40c7c8d127cec1c25b4bfae83ec6b0997d006bc7bf9615e8ee23f0ac7` |
| 当前局部 candidate | `861d6ef1c42b23b5f2ad4427ba9a19ecb032651c61efa6414303e0729feea4d4`；只代表既有 workbench/保存绑定，不作为完整部署身份 |
| WSL 输入清单 | 43 个文件；`7f12e035ad3019b566a411b9febac5af30932d9aa09bdc4b9bddf8d40f7bd3d3`；`wsl-r4/input/input.json` |
| 实际 runner | `scripts/dsh-b0/first-purchase-source-target.probe.py`；`1532ffac76fb0e0f802dbb445669fed0da44edc5f857a23dfee4e7fa0d7fa365` |
| 原始 WSL 回执 | `607b7d942a10b337d50a58b1138cf1f31424d925561b1376011dd72d446f8f2f`；`retrieved/result/receipt.json` |
| 现场平台 | Linux x86_64，`6.18.33.2-microsoft-standard-WSL2`，glibc 2.39，Python 3.14.4；测试进程 UID 65534 |

只读平台探针取得当前 1226 个 Python 兼容标签。保存服务复用已校验的 13 个 Linux wheel，查询包再加固定 DuckDB 1.5.6/psutil 7.2.2 wheel；新增文件经 PyPI 元数据、TLS、大小和 SHA 校验，见 `linux-wheels.json`。实际目标按 wheel 元数据的 ABI、Requires-Python、Requires-Dist 检查，再在两个新 venv 中使用 `--no-index --no-deps --require-hashes` 冷安装。Mac 的 wheel 回执未改写为 Linux 回执，业务 archive 字节相同。

控制器只调用已校验包中的 query/source factory、实际物理 worker 与保存 factory。CRM `/auth/me` 是本次自有的 loopback 合成服务，凭据随机生成且仅在内存中使用；结果年龄按用户决定为 `NOT_CHECKED`。保存进程只收到自有目录和来源 URL，既有 SQLite audit hook 限制其只打开分析库。查询使用固定 Git 中的 synthetic JSON，不读取真实 DuckDB 或业务数据。

## 本次实际验证

| 范围/命令 | 当前结果 | 证据 |
|---|---|---|
| `python -m pytest --noconftest -q -W error::ResourceWarning backend/tests/test_first_purchase_source_target_probe.py` | **7 PASS**：篡改、额外文件、符号链接、越界、错误 scope/digest 和不变重验 | `guard-tests-final.log` |
| `python -I -B …/first-purchase-source-target.probe.py run-local <sealed-input> <sha>` | **10/10 PASS**；Darwin arm64，仅作为远端前预演 | `local-r4.log`、`local-r4/result/receipt.json` |
| 同一 runner，目标 `run-wsl`，低权限 UID 65534 | **10/10 PASS**；实际 WSL 服务链 | `retrieved/run.log`、`retrieved/result/receipt.json` |
| `ruff check` 两个新增 Python 文件；`git diff --check` | **PASS** | 本轮命令记录与审核摘要 |

WSL 十项观测如下，全部来自本次实际执行：

1. 查询包平台检查、15 个依赖离线冷安装。
2. 保存包平台检查、13 个依赖离线冷安装。
3. 两个独立包进程、各自状态 owner、从查询包启动真实物理 worker。
4. 来源接口验证身份、schema、权限；无凭据/伪造字段/撤权拒绝。
5. HTTP 保存、NOT_CHECKED 策略、相同请求重放与冲突拒绝。
6. 查询下线、保存进程 SIGKILL、重新启动后恢复同一持久回执。
7. 未知动作返回 SAVE_UNKNOWN；查询离线时新保存返回 SOURCE_UNAVAILABLE；撤销管理员权限后拒绝重放写操作；仍只有一条分析。
8. 只备份本次合成分析小库，在全新目录冷恢复；查询仍离线，回执与记录保持一致。
9. 查询重启后，同一请求复用原 run 与已退出 worker，不重复计算。
10. 安装后业务文件及全部输入完整性复核。

调用 `run-wsl` 必须使用实际 WSL2、Python 3.14 和 UID 65534；`run-local` 的 scope 不会声明 WSL 通过。两种模式都固定 `release_ready=false`、`activation=BLOCKED`、`dsh_host=NOT_RUN`。该 runner 仅是显式验收入口，不进入生产包或自动运行旧 CRM/DSH。

## 失败调查与回收

- 本次第一次 commit 被 ground-truth hook 对命令示例措辞的误判拦住。澄清示例如何填写实际路径后通过，未绕过或改钩子。
- `local/result/receipt.json`：只完成两套冷安装，查询 owner 漏建私有 `runs` 目录。修正验收 owner 的目录初始化，业务包不变。
- `local-r2/result/receipt.json`：保存链通过后，runner 把 Uvicorn 处理 SIGTERM 的 `-15` 误判为不正常退出。明确接受 0/主动 SIGTERM，强制超时的 SIGKILL 仍失败。
- `local-r3/result/receipt.json`：新 UNKNOWN 动作复用了另一个动作的幂等键，服务正确返回 409。修正验收请求，使新 action 使用自己的 key；相同动作仍复用同一 key。前三次失败回执保留。
- 修正后的 `local-r4` 完整通过后才上传执行。**WSL 首轮通过**，没有把本机失败记录覆盖成 PASS。

本次 synthetic 验收输入打成一个 28,661,760 B tar，通过 Tailscale/SSH 传输约 96.05 秒；传输前后校验 SHA。该耗时是测试材料传输，不是服务启动/运行耗时，也不改变生产从固定 Release 取包的链路。

目标成功轮次 **5 个服务进程 + 1 个物理 worker** 已退出，临时安装/状态目录已回收。回执下载后核验 SHA，再删除本次专属传输目录；见 `remote-cleanup.json`。生产 6677/18090/18092/18093/18094 的监听与 PID 快照前后一致，只证明未改变这些监听，不作为完整生产健康检查。旧数据、旧 release 和现役服务未修改。

本机记录的自有子进程已退出，7 个自有端口无监听。当前候选的 16 个输入/包/回执/journal 的字节、大小及 mtime 保持不变，13 个旧证据保持既有 SHA；见 `immutable-history-check.json`。该现场阶段原 journal 保持 seq 3，新观测当时尚未接入候选 journal；后续[接线证据](dsh-g0-first-purchase-source-target-gate-20261007.md)已将同一原始回执核验并追加为 seq 4，不改现场回执。

## 仍未关闭

本轮关闭 T3 的新双包目标平台来源 HTTP 子项和 T7 的同版本恢复子项。现场接线后续已关闭，见上方链接；目标 DSH 原生宿主/插件/浏览器、当前包的跨旧版本目标恢复矩阵、真实 CRM/业务 UAT、签名/SBOM/来源信任、生产 activation/reconcile/canary 和物理分仓仍开放。旧包 WSL 14 项不能转给当前包，本次 10 项也不能冒充那 14 项或 DSH WAL 验收。

没有 GitHub push、PR/Release 或生产切换。本轮 runner、回归测试与文档增量另行提交；业务包来源继续保持 `f9726f68`，不因记录验收结果重新编译。

本轮 OCR delegate 已覆盖新增/修改 **8/8 文件**（1 个选中、7 个补审，无跳过），包括当前 runner、负测及全部文档；前置脚本问题已修复，未确认其他阻塞缺陷。审核摘要与逐文件 SHA 在 `OUT/review-summary.json`，237 个本地文档链接目标检查通过。
