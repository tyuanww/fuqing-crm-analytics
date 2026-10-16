# M2-08 WSL2 目标冷运行与恢复补验（2026-10-14）

本轮在用户授权的杭州目标 `100.93.46.46` 上执行当前组合候选的 synthetic source HTTP 目标探针。目标是 Linux x86_64 / WSL2；探针只在 `/tmp` 下创建 UID 65534 的临时目录和自有子进程，没有启动、停止或切换 live DSH（4328）或候选 DSH（4332/4336）。

## 输入、命令与结果

- 目标主机：`DESKTOP-FAEJK8S`，`Linux 6.18.33.2-microsoft-standard-WSL2`，`x86_64`
- 目标解释器：Python `3.14.4`，运行 UID `65534`；`zstd` 可用
- sealed input：`/Users/hutou/.codex/tasks/shinemage-composition-source-target-20261013-r2/verify/target-input/`
- input SHA-256：`b1c5de00bec17cde54ac53ebc9ef8ee273dd678683ea7a470d8e81ee137c4d96`
- source SHA：`f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`
- candidate digest：`125c8e538816835cad212048b8fd0302d98588d704b09de559789df9bf6e6bdb`
- 目标命令：

  ```text
  runuser -u nobody -- /usr/local/bin/python3.14 -I -B \
    /tmp/shinemage-target-input-20261014-r3/helpers/first-purchase-source-target.probe.py \
    run-wsl /tmp/shinemage-target-input-20261014-r3 \
    b1c5de00bec17cde54ac53ebc9ef8ee273dd678683ea7a470d8e81ee137c4d96
  ```

- 退出码：`0`
- 结果：`10 PASS / 0 FAIL`
- 原始回执：`.context/checks/shinemage-m2-08-wsl2-target-20261014-r3/result/receipt.json`
- 回执 SHA-256：`4649984fe9ba462f5ed3288cb5d50a96e608a9b8f0abbb5f2bef9e473bb86988`
- 回执状态：`PASS`，scope `actual-wsl2-synthetic-package-http`
- 清理：`OWNED_PROCESSES_AND_INSTALLS_REMOVED`

通过项覆盖：双包 Linux wheel 离线冷安装、独立 HTTP owner 与物理查询 worker、来源认证/合同/权限、保存幂等和冲突、查询下线后保存 SIGKILL 重放、未知新保存 fail-closed、SQLite 冷备份恢复、查询重启重放，以及输入/安装产物完整性。

## 门禁边界

这是一份目标平台 synthetic package HTTP 证据，`release_ready=false` 保持不变；它关闭了 M2-08 的 WSL2 cold runtime/WAL 与 host HTTP 这一组前置观察，但不等价于正式 release。15 分钟 SLI、最终 SDK 供应链材料、正式 release authorization、activation、canary、rollback、真实模型/业务写入和读屏/Windows 高对比度仍未完成。原始输入和目标临时目录均未写入 live profile、journal 或生产服务。
