# 工具会话语料杭州跨版本验证（2026-10-07）

在 `aebf4e38ee0ed8a6e6748a885a081b1c51a1acc5` 正常 hooks 提交且工作树干净后，使用该提交的控制器继续 T2/T7。**本次工具持久化矩阵 4/4 PASS；完整 G0 与生产准入仍 PARTIAL / release_ready=false。** [本机阶段](./dsh-g0-session-tool-corpus-20261007.md)不再是这一语料唯一的运行证据。

## 固定输入与隔离

- 通过既有 Tailscale/SSH 连接杭州 WSL2，Linux x86_64、kernel `6.18.33.2-microsoft-standard-WSL2`、Node `24.21.0`。
- 控制器四文件来自上述提交：`session-recovery.mjs`、`session-recovery.probe.mjs`、`session-recovery-tool-corpus.mjs`、`secure-runtime-unpack.py`，传输后逐文件 SHA-256 核对；未修改上游源码或现场构建。
- rc2 使用已发布的固定 runtime：上游 `477b4f420553e8a52c2fbccc464d7561b239c443`，archive SHA-256 `a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4`、164918950 字节。杭州直接从既有 `dsh-0.20.0.0-r1` Release 下载，13.58 秒；下载与 digest 验证不等于签名/构建来源认证。
- rc1 从原只读 checkout `46a7f68b0922371ce7144b668b90e377d8e799f4` 加载现存编译模块，tracked clean，记录三个包的版本及 package/entry 摘要；**编译闭包构建证明仍 NOT_VERIFIED**。
- 新建自有 `/tmp/owned-session-tool-qyvvk6c_`，解包与矩阵均以 UID 65534 执行、独立 HOME/TMPDIR、清空继承环境。只创建合成会话，不读取已有会话、业务 DuckDB 或凭据；不启动宿主服务，不调用真实模型或工具。

实际入口为已提交的控制器，参数如下（路径为本次临时环境，已回收，重跑必须创建新目录）：

```sh
node controller/session-recovery.mjs /absolute/new-matrix-output \
  /absolute/isolated-runtime/node_modules/.pnpm/node_modules/@deepseek-ai \
  /srv/shinemage/dsh/upstream/apps/cli/node_modules/@deepseek-ai --corpus tool
```

## 实际结果

矩阵退出 0，**1.016 秒，10 个冷进程退出码均为 0**。此时长仅指矩阵，不含下载、解包和证据采集。

| 场景 | 结果 |
|---|---|
| rc2 截断末帧恢复 | PASS；13→26 事件，注入 65 字节不完整帧；只读不改文件、续写保留已提交前缀 |
| rc1 写入 → rc2 读取/续写 | PASS；format 4→4，13→26 事件 |
| rc2 续写 → rc1 读取 | PASS；读取全部 26 事件，未改变新状态 |
| rc1 + 保留的旧状态回退 | PASS；恢复原 13 事件；旧快照不包含后来的 rc2 写入，不能当成数据回滚 |

每次冷读写均核对成功/失败工具调用、结果、错误身份、meta 与官方 `Session.create().deriveMessages()` 消息投影。这证明这套已完成工具回合的持久化兼容性；不证明真实工具执行、在途工具重发、媒体/委派事件或任意历史会话都兼容。

## 证据与回收

本机证据根：`.context/checks/session-tool-wsl-20261007/`。

- `remote-run.py`、`retrieved/controller-seal.json`：执行脚本与固定控制器字节；本机再次与提交源码核对。
- `retrieved/work/matrix/session-recovery.json`、`process-0` 至 `process-9` stdout/stderr：逐进程事件、版本、模块摘要与结果。
- `result.tar.gz`：SHA-256 `b53b23f271e9a921501f05a75952c17a264237ccdb30dea622a5d2694ac790c9`；48 个归档输入/结果文件及清单已取回，逐文件校验。runtime archive 本体不重复打入结果包。
- `retrieved/integrity.json`：rc2 的 30147 个文件/链接输入条目不变，四个控制器及 runtime archive 摘要不变，rc1 已记录入口/package 字节不变。
- `cleanup.result.json`：确认结果归档已校验、无自有进程存活后，仅回收本次临时目录；生产 current 和 6677/18090/18092/18093/18094 五个监听/PID 快照不变。current 仍为 `/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3`。
- `local-integrity.json`：1318 个本机既有受保护文件字节/mtime 不变；当前候选 journal 保持 seq 6，未追加事件。

本项只关闭“工具持久化语料目标机四项验证”。媒体/委派等完整 corpus、rc1 编译闭包来源、真实身份/模型/UAT、签名/SBOM/CVE、生产 activation/canary/rollback、G0 stop/go 和物理分仓仍开放。没有 push、发布、生产切换或修改真实数据。

本次 6 个文档按 OCR delegate 工作流核对原始结果与声明（6/6 reviewed，0 skipped，覆盖率 100%，无未关闭发现），含 STATUS/TODOS/计划/验证入口；只补记录，不重复运行上一提交已通过的本地套件。
