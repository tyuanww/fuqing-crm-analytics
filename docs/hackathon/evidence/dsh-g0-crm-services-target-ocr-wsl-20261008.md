# OCR 修复后的 CRM 指标/知识服务 WSL 复验（2026-10-08）

**提交 `5bf2bc77` 的验收器已在杭州 WSL 的新自有隔离环境实际运行：2/2 离线冷安装、15/15 HTTP 与保护观测通过，4 个自有服务进程全部回收。** 安装用时 3.268 秒，HTTP 阶段 4.770 秒。本次关闭上一轮审修后的新版 runner 现场 `NOT_RUN`，产品仍 **PARTIAL**、SDK 分发 **BLOCKED**、`release_ready=false`、生产 `activation=NOT_RUN`。

## 与上轮证据的关系

从干净分支 `codex/plugin-boundary-review`、HEAD `5bf2bc77bde1e00ae82832a8b5aa2d6726563e38` 开始。[OCR 审修](dsh-g0-parallel-followup-ocr-review-20261008.md)已修复输出父目录别名、两套安装启动前核验和 owned 进程退出竞态；这改变了验收器行为，不能把旧 WSL 通过直接算到新源码。

本次使用提交中的验收器原字节，不再以 AST 等价替代现场执行；源码没有新修改。领域服务、资源与打包配方仍来自 `68845ad0dfce2737d5e7b017916f16d4c8ec5255` 的原包，47 项源输入本次再次核对未变。没有重打服务包、重建 DSH 或下载另一套依赖。

| 输入 | 本次固定摘要 |
|---|---|
| 实际执行 runner | `94b7d43891c0fd2ec109eee7be330da2d55d963f67b5f41428a041ee00f32031` |
| 新 input manifest | `daa7934a7193af1b01cfec36e5f4931da647cee8ca6a2846d84e3d0b104a97de` |
| 复用输入的旧 manifest | `edb1ed57892c0333adfe2dd85395d0c12857231758f8ef230542a5471d159022` |
| metrics archive，50,015 bytes | `1492219b59c82da4901ad3c9608d217e1fe583bc41bb46fb41f7527711eb3edf` |
| knowledge archive，50,835 bytes | `7a48bb22c7de0d4b36a4afb1b94e2ef41c90ee4bf431798fbda95450d31041a6` |

metrics 仅安装原 14 个精确 Linux wheel，knowledge 仅安装原 13 个、不含 DuckDB。依赖版本、来源元数据、manifest 摘要和首轮失败保留在[原服务目标报告](dsh-g0-crm-services-target-20261008.md)。本轮未重新查询 PyPI，也不把以前的 HTTPS 摘要核对当成发布者身份或签名证明。

## 实际执行

本次经既有 Tailscale SSH 连接杭州 WSL2；内核 `6.18.33.2-microsoft-standard-WSL2`、x86_64、Python `3.14.4`、pip `26.0.1`。控制器和 namespace 原字节与上轮审核版本相同，新传输入只包含当前 runner、新 manifest 与控制器；先重核旧输入，再在新 owned 目录复制原 archive/wheel，两个 venv 重新冷安装。39 项输入只有 `helpers/crm-services-target.py` 的字节变化，manifest 另记录当前 observer source commit。

新目录为 `/tmp/owned-crm-services-ocr-20261008-rvc2e9_i`。使用独立 mount/network/PID namespace、nobody、独立 HOME/TMP；input、Python prefix 只读，安装后两套 app/venv 只读 bind。生产 release/runtime/data、root/home/mnt 与其他临时目录不可读，外网禁用，仅监听 namespace 内 loopback 临时端口。**12/12 隔离预检通过**；这是既有 WSL 工具链下的新隔离工作区，不是整台新机器验收，也不是任意代码安全沙箱。

自有 transient unit 仍限制 MemoryHigh=2G、MemoryMax=3G、CPUQuota=100%、TasksMax=192、RuntimeMaxSec=900、KillMode=control-group；install/http 各限 360 秒。实际命令由控制器以非 root 身份执行：

```sh
python3.14 -I input/helpers/crm-services-target.py \
  --input /absolute/owned/input --input-sha256 VERIFIED_INPUT_SHA256 \
  --output /absolute/owned/work/result --phase install
# controller 将 app/venv 只读 bind 后，运行同一 runner 与 manifest：
python3.14 -I input/helpers/crm-services-target.py \
  --input /absolute/owned/input --input-sha256 VERIFIED_INPUT_SHA256 \
  --output /absolute/owned/work/result --phase http
```

精确 argv、cwd、阶段超时、服务包 check/安装日志均在本地证据根 `.context/checks/crm-services-target-ocr-20261008/retrieved/work/`，不把上述示例路径当成精确原始命令。业务 result 和 complete 正文均 PASS，namespace 返回 0，不仅依据 systemd 的 `Result=success`。

| 验证范围 | 当前实际结果 |
|---|---|
| 冷安装、完整依赖闭包、包内 check | 两个服务 2/2 PASS；3.268 秒 |
| capabilities、缺合同头/Origin 拒绝、OpenAPI | 两服务均通过，与各自包内合同一致 |
| 三种固定 synthetic 指标查询 | 200，source/metric version/facts 核验通过 |
| 声明真实数据的请求 | 400 FORBIDDEN，无真实数据源访问 |
| 知识解释 | 包含 D001，明确服务包不代表真实业务验收 |
| 分别停止/重启指标和知识服务 | 端点停止、新进程恢复；另一服务原进程继续可用 |
| HTTP 与保护观测合计 | 15/15 PASS；4.770 秒 |
| 启动前与结束的安装清单 | metrics app/venv 39/585 项，knowledge 26/514 项，前后相同 |
| 自有服务清理 | 4/4 reaped；自有 unit inactive/dead、MainPID=0、ControlGroup 为空 |

四个服务导入守卫无禁止 attempt/已加载前缀；SIGTERM 后为 `snapshot_phase=guard-installed / final_snapshot=false`，不声称完整退出快照。上轮 **20 项本地边界回归**保留在 OCR 报告，本轮未重跑，也未声称它们在 WSL 全部执行。本次 WSL 未另行注入恶意路径、安装漂移或 TERM/KILL 竞态；通过范围是当前固定源码/两包的正常冷安装和限定 HTTP/保护链。

## 完整性、保护与开放项

取回证据 archive 为 **64,045 bytes**，SHA `9e8b10ff68954c2931030a08be2cfd1c072c1985132c0eed75f3c745f831ac4b`，73 项证据文件逐项校验，另含 collection inventory。两个旧远端 archive 和新旧各39项输入结束后再次核对；本地原135项证据完整校验未变。旧失败/恢复目录、包及日志保留。

本次生产 current 前后均为 `/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3`；6677、18090、18092、18093、18094 的完整监听/PID 元数据与上一轮结束一致。仅核对指针与监听，不读取真实 DuckDB、生产 API、环境变量或凭据。旧 plugin candidate、journal、领域 tar 与 kit toolchain pin 本地摘要保持，未部署、push 或发布。

本地准备保护清单时曾使用旧 upstream checkout 路径，已核对 preparation-failure.json 记录 FileNotFoundError，失败发生在远端 dispatch 前。修正为核对实际 kit pin 与原候选/领域输入后继续；`preparation-failure.json` 保留，不因这个路径错误创建/拉取上游源码，也不隐藏为首次准备成功。

| 本地证据 | 用途 |
|---|---|
| `review-inputs.json` / `preparation-check.json` | 当前提交、runner、控制器和39输入的固定摘要 |
| `dispatch-result.json` / `owned-root.json` | 自有目录、unit 与限制的实际启动记录 |
| `collection.json` / `evidence.tar.gz` | 73证据逐文件摘要与原始日志 |
| `target-after-verification.json` | 结束后目标输入、旧 archive、源码摘要、unit 与生产元数据复核 |
| `final-result.json` / `protected-after.json` | 本轮通过范围、未执行项与原候选/pin 保护 |

本次只关闭当前验收器的 WSL 冷安装/HTTP 子项。生产安装/激活、真实身份与私有知识 ACL、候选 journal 准入、生产形状验收、浏览器/真实模型、完整发布门禁和远端 CI 仍未由这次观测证明。供应链的官方 release/发布者身份/签名/撤销等开放项不变；后续仍按既有队列补未覆盖宿主/UI 与生产形状，再按 stop/go 推进物理分仓。
