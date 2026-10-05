# 目标主机服务只读预检（2026-10-06）

承接 `1b443646132a8e90b002988c9635b5993ed55d4b` 的服务包接线审核与本地提交。当前工作树 `codex/plugin-boundary-review`，本文件和预检实现为提交后的增量，尚未提交或推送。

## 已实现

`pnpm dsh plugin service-preflight` 薄调用独立 Python 检查器，使用显式绝对解释器、`-I -B`、有限时间与输出大小。输入是已验证 manifest/digest 和目标 wheelhouse；输出为 `shinemage-service-target-preflight/v1`，不新建状态账本。

- 核对 manifest 原字节摘要、首购服务身份、Python 3.14 与 WSL2 内核标记。
- 核对 wheel 的精确名称/版本闭包、文件与 METADATA 一致性，使用所选 Python 的既有 pip/packaging 计算 ABI、平台和 Requires-Python；记录实际 wheel 摘要。
- 普通文件有界读取，拒绝链接/FIFO、缺包/额外包/重复依赖、源码包、摘要和元数据失配。错误不回显不受信任字段。
- 不安装、解包或导入应用，不联网、不访问数据库或监听端口，不写 candidate/journal。即便预检通过，`release_ready=false` 和 `activation=BLOCKED`，四项现场/供应链验收仍 NOT_RUN。

## 实际验证

Node **24.19.0**，Python **3.14.4**。最新记录在 `.context/checks/service-target-preflight-20261006/`；中断前 21 项原始结果保留在 `service-target-preflight-20261005/backend.log`，不覆盖。

| 命令/观测 | 本次结果 | 原始记录 |
|---|---|---|
| `python scripts/run_backend_tests_bounded.py backend/tests/test_service_target_preflight.py` | **24 PASS / 0 SKIP**；包含真实 CLI、输入负测、5 种 WSL 形状标签和 3 种 Requires-Python | `backend.log` |
| `node scripts/dsh.mjs test` | **206 PASS / 0 FAIL / 0 SKIP**；本次重新运行 | `release-suite.log` |
| 实际候选 manifest + 实际 13 个 wheel → CLI | **正确 BLOCKED / 退出 2**：Python、wheel 标签、Requires-Python 均 PASS；当前 Darwin arm64 不是 WSL2 | `actual-preflight-final.json` |
| 输入不可变 | 14 个文件的 SHA-256 和 mtime 全部不变 | `actual-validation-final.json`，同时保存完整命令参数 |
| Ruff 与 Node 语法 | **PASS** | 终端实际执行；只检查本轮 Python 与 CLI |

实际 manifest digest 为 `29b63d9609a4af8ec0f6464dbdd7ca7a3d6feb89ef5f32db54bf1f950783bc07`，来自上一批已核验的 candidate 回执。wheelhouse 仍是上一轮的 Darwin arm64 依赖；其中 pydantic-core 是 `cp314-cp314-macosx_11_0_arm64`，不能用作杭州 WSL wheel。

只读边界测试在隔离 Python 中通过 audit hook 拒绝文件写入、子进程和 socket 操作；WSL 标记和支持标签由测试 mock 注入，没有给 CLI 加“伪装 WSL”参数。测试 wheel 是 validator-only 元数据夹具，不能冒充已安装服务。实际 CLI 只读检查既有真实包清单与 wheel，没有安装或重新执行上一批 HTTP 场景。

## 剩余步骤

1. 为目标 WSL Python/架构准备并固定离线 wheel，保留独立 digest/来源证据；不复制 Mac wheel 冒充兼容。
2. 从同一不可变服务包在隔离目标环境冷安装，完成受控身份/状态注入、HTTP 保存/重启/UNKNOWN/回退验收。
3. 将这些实际观测接回候选服务证据与供应链验证器，再处理保存 UI/浏览器和 G0/stop-go 后物理分仓。

T3/T7/T15/T21 仍 PARTIAL。本轮没有真实 WSL、杭州、真实模型/业务数据或生产切换，不能据此宣布可上线。
