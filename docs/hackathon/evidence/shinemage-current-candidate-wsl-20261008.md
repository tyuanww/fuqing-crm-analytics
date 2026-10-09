# 当前候选 WSL2 合成组合验收与记账（2026-10-08）

当前 candidate `993daf31…` / 包 `b75d90e9…` 的来源服务、terminal 与 browser 已实际运行，并通过原正式校验器顺序进入新 journal seq 4–6。只关闭这一固定组合的 WSL2 合成观察链；产品仍 PARTIAL，`release_ready=false`，SDK 分发 BLOCKED。

## 身份与执行边界

- 主集成树 detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`；本轮没有提交、改版本、重建插件或重新生成 candidate。
- candidate `993daf31daa79137c22ce8d16c84b61892117386a9b7b8c5119fa0be62abefb0`；包 `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b`，438,511 字节。
- 原 `first-purchase-source-http-local` 与服务源码 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`；DSH `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` 保持。
- 用户安装本次专用公钥后，`root@100.93.46.46` 连接成功。先前不是 Tailscale 卡住，而是客户端没有被目标接受的登录身份。私钥留在本机 SSH 目录，未进入仓库或证据归档。
- 实际目标 Linux x86_64，内核 `6.18.33.2-microsoft-standard-WSL2`，Python `/usr/local/bin/python3.14` 3.14.4；目标 Node 24.21.0 满足既有 runtime 的 Node 24.x 合同，本地控制器 Node 仍为 24.19.0。
- root 只准备新的独占目录；测试以 UID 65534 执行。只运行合成小库和本次拥有的 4335–4337；未连接或操作受保护服务，没有读取真实业务 DuckDB。

## 本次结果

| 层级 | 实际结果 | 正式关联 |
|---|---|---|
| 来源服务 HTTP | 10 PASS；原 runner 新生成当次 platform receipt 和 input-v5 | seq 4 / CANDIDATE_SERVICE_TARGET_OBSERVED |
| terminal | 1 PASS / 0 FAIL / 0 SKIP，2 项依赖弃用警告；原 combined 仅一次，exit 0，89.21 秒 | seq 5 / CANDIDATE_TERMINAL_HOST_OBSERVED |
| browser | 1 PASS / 0 FAIL / 0 SKIP，2 项依赖弃用警告；5 个浏览器场景，原 runner exit 0，79.216 秒 | seq 6 / CANDIDATE_BROWSER_HOST_OBSERVED |

terminal 内部覆盖 23 个 HTTP 观察和 2 个恢复场景，不另与 pytest 数相加；中断终态 `FAILED` / `EXECUTION_UNKNOWN`、execution inactive、只派发一次、50 事件前缀及原生回退符合原合同。browser 使用固定 Chrome 151.0.7922.34 headless / Playwright 1.62.1，覆盖未连接 CRM 拒绝、原生槽登录、真实合成 worker 与保存确认、重载相同保存意图、无 CRM 的原生对话。

主 Agent 查看两张原始截图：中文和合成保存结果可读，原生对话显示 `SYNTHETIC_NATIVE_FALLBACK_OK`。保存截图同时保留先前未连接 CRM 的拒绝提示；不据此宣称视觉/交互全面验收。

旧三条事件完整保留；本次三条分别引用真实上一阶段事件。校验使用原 `scripts/dsh.mjs plugin verify-service` / `verify-host`，均 exit 0；没有改 validator 或手写成功事件。完整命令与每步 journal 前后副本见 `.context/checks/target-root-connected-20261008/{service,terminal,browser}-verification/`；封套分别为 `terminal-evidence/envelope.json`、`browser-evidence/envelope.json`。

## 失败保留与回收

- 首次前置核对因过度扩大 6677 保护边界停止，原停止记录保留，未传输或启动。
- terminal 初次收集把原五端口扩大为全部监听 PID、并用 bind 代替原 `ss LISTEN`，产生两个 cleanup false。初始原件、before/after、原归档保留；新 collection-r2 恢复原 collector 的五端口与 LISTEN 语义，没有重跑验收。18098 的 PID 自行变化仍明确保留，未对该进程采取动作；不能声称全机所有进程不变。
- terminal 349 个输入、43 个来源输入保持；collection-r2 有 265 条结果清单。原五个受保护端口与 current 指针元数据未变，owned 进程为 0，4335–4337 无监听。terminal 新独占证据根保留，本轮没有额外磁盘清理。
- browser 510 个输入保持；193 条结果清单、194 个归档成员逐项一致。原 collection/completion 成功，只有本次 browser 独占根被回收；固定库及 CJK 字体只解压进独占根，未安装系统包。
- Chrome 首轮下载的进度输出和后续同 URL、同字节 quiet 下载记录分别保留；不把旧日志改成空 stderr。

## 证据、复核与范围

主树归档 `.context/archives/current-candidate-wsl-20261008/evidence.tar.gz`：1498 个文件、735,379,615 字节，SHA-256 `8f46ff8274f1c5626b45b990cc87b697252af45551462d0224ce44587a361d13`；逐成员重新读取并核对全部摘要。包括原 sealed terminal 清单内的小型合成 SQLite/WAL；不含真实业务数据库或 SSH 私钥。归档准备首次过宽扩展名守卫停止的记录保留在 `archive-preflight-r1.json`，未改原始证据。

原始交接来自只读执行材料：A 的 `candidate-target-execution-20261008/` 和 C 的 `current-browser-target-20261008/`。主树统一证据目录为 `.context/checks/target-root-connected-20261008/`，包含所有正式封套、输入、原始结果、命令及 journal 副本。归档和独立复核摘要见同目录收尾记录，以及[机器摘要](shinemage-current-candidate-wsl-20261008-validation.json)。

来源/terminal 的独立复核逐项重算 349 输入、265 结果、身份与父链，0 可行动发现。browser 独立复核另核对 510 输入、193 结果及 194 归档成员、seq 5–6 和 collection/completion，0 可行动发现。六棵只读成果树的 105 份既有未提交文件及固定 DSH 上游保持；当前主树已有 HTML 提示修复保持原字节。

本次结果只属于封存 b75 包。主树尚未提交/打包的 HTML 保存提示修复及其 103 项测试不能借用此包的目标验收。完整 B0、冷安装、shell/tool、十场更新和本机 headed 25 项均未重复执行。

仍开放：正式 CI、真实模型/身份/业务及生产激活；standalone 页面包、原生 View/200% 焦点、真实读屏/触控/移动设备/Windows 高对比度、probe 外审剩余项；SDK 八条顶层门禁及既有 stop/go。证据属于未签名的操作者观察，摘要绑定不等于远端 attestation。SDK 无新材料的六包/八路径不再重复查询；不自动物理分仓、升级 DSH、push、PR、合并、发布或部署。
