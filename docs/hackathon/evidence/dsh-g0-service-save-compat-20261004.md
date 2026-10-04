# G0 服务跨版本保存与 forward-fix

2026-10-04。上一批 D15 审核修复已正常 hooks 提交为 commit `a50bd42492195040efaa6989c90e4fe84030551c`，提交后工作树干净，未 push。本轮随后新增独立验证入口与[兼容窗口](../../architecture/first-purchase-service-compatibility.md)，未修改产品服务实现。

## 真实命令与结果

```sh
/tmp/fuqing-fastapi141-v2-venv/bin/python scripts/dsh-b0/service-save-compatibility.py \
  --baseline 56198c32a52d9822c7a3338d92b0fa077d1c61bc \
  --candidate a50bd42492195040efaa6989c90e4fe84030551c \
  --output .context/checks/d15-service-compat-20261004-r5
```

退出 0，**9/9 预期观测完成**。旧源码 159 文件、新源码 160 文件均从指定 Git tree 导出并逐文件记录摘要，拒绝软链接/特殊文件和非源码资产。驱动程序摘要也写入回执。临时源目录、小库、worker 和进程组均由本命令创建并回收，不接入 DSH、网络或生产数据。

实测包含：旧 v1 保存；新版读取/候选准入；旧服务只读身份读取和拒写；恢复新版后无任务/无策略精确重放、标题 forward-fix；SQLite 小库备份恢复；隔离副本中旧服务可写行为及新版检测；新旧服务拒绝未知 schema 99。旧只读路径和未知 schema 检查验证了数据库字节不变。

关键结论：**旧服务可读，不可安全写入 D15 状态。** 旧版改标题不会复制来源旁证，最新版来源在新服务返回 PROVENANCE_NOT_RECORDED；原版本与原回执仍可查。回执明确 `candidate_state_old_writes=BLOCKED_PROVENANCE_NOT_PRESERVED`、`old_service_d15_api=NOT_AVAILABLE`、`release_ready=false`。

额外验证：4/4 真实 CLI 负测通过（浮动 HEAD、不存在的 SHA、相同提交、复用输出目录），未生成候选目录或覆盖已有回执；Ruff 与 `git diff --check` 通过。

Raw：`.context/checks/d15-service-compat-20261004-r5/receipt.json`、各步骤 `.stdout/.stderr`、`cli-negative-tests.json`，以及同名目录旁的 `.log`。

## 失败与修复

- r1 FAIL：驱动在输出源码位置时混用了 macOS 的 `/var` 与 `/private/var` 路径；统一 resolve 后修复。
- r2 FAIL：测试策略使用带斜杠标识，服务正确拒绝；改为符合既有 opaque 格式的合成策略名。
- r3 完成原始矩阵；r4 加入自有 synthetic 状态标识及列表去重断言；r5 加入依赖/平台记录与旧服务只读后的数据库摘要核对。最新结果只引用 r5，各轮失败未删除。
- 上一份审核报告的命令转录已更正为实际 B0 `--check --python` 入口，bounded 六文件中的 source 曾误写为 cockpit，也已按原始 summary 更正；原始通过数字未变。

## 本次边界

Darwin arm64，同一已安装 Python 测试依赖环境；ASGI TestClient 执行实际路由与独立服务进程，未启动监听端口。这里验证固定服务源码与 SQLite 状态，不替代最终独立包、干净依赖安装、WSL、浏览器、真实模型/业务或生产认证。

T3/T7 仍 PARTIAL：还需将兼容约束接入候选/激活门禁，验证独立服务包及依赖窗口、生产形状时限/UNKNOWN；DSH 保存 UI 仍 NOT_AVAILABLE。本轮验证器/文档是上一 commit 后的新增工作，尚未再次提交。

## 提交前审核（2026-10-04）

OCR delegate workspace 清单 total_files=10、reviewed_files=10、skipped_files=0、coverage_rate=100%；2 个 Python 文件与 8 个补审文档均已核对，没有新的已确认代码缺陷。审核涉及源码导出 allowlist、独立导入路径、状态与子进程归属、重放/拒写断言、证据范围和文档引用。

本次重新执行同一固定源码对：9/9 观测、4/4 CLI 负测通过；Ruff、git diff --check 通过。当前 raw 为 `.context/checks/service-gate-review-20261004/compatibility/`，OCR preview/rules/逐文件清单位于其上级目录；未把上一轮结果冒作本次运行。用户已授权此批本地提交，准确提交号以 Git 为准；下一批再接控制面门禁。
