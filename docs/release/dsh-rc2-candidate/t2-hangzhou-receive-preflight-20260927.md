# 杭州 artifact receive 预检（2026-09-27）

## 范围

将 merged-main internal app artifact、manifest、`scripts/dsh.mjs` 和接收器代码临时传到杭州 `/tmp` 隔离目录，执行 `node scripts/dsh.mjs receive`；不写入 `/srv/shinemage`，不安装依赖，不启动/重启/切换服务。每次临时目录在结束时已清理。

## 结果

- 传输：app tarball、manifest 和接收器代码均成功传到临时目录。
- 接收：`NOT_RUN/BLOCKED`。接收器进入 secure unpack 后，目标主机 Python 3.12.3 无法找到 `zstd`，错误为 `FileNotFoundError: [Errno 2] No such file or directory: 'zstd'`，进程退出码 `2`。
- artifact digest、manifest schema 和目标路径校验尚未在杭州完成，因为解包前置依赖缺失；不能把这次结果写成 receive PASS。
- 未读取真实 DuckDB/WAL、runtime token、Cookie 或生产配置；现役 checkout、systemd、端口和 Cloudflare 未改动。

## 后续隔离复验

随后确认目标主机已有 `/usr/bin/zstd`，使用当前 release 分支 `c3a4b55b` 生成的临时 `dsh-0.18.0.2-pre-review` artifact，在杭州 `/tmp` 新建隔离目录复验：

- `DSH_RECEIVE_PASS tag=dsh-0.18.0.2-pre-review entries=1688`
- artifact SHA-256：`9bea1ed55a464d5ba8a3105f91dc00f2266a70d459e701a52420fb1464cc54e6`
- 远端 candidate doctor：Node `24.21.0`、VERSION `0.18.0.2`、rc2 pin、release schemas 全部 PASS
- 目标 Python 仍为 `3.12.3`，不满足本项目 Python 3.14+ 冷运行时要求；该 artifact 是未经过 reviewed merge/publication 的预检包，不能作为正式 Release 或生产安装证据
- `/srv/shinemage`、systemd、Cloudflare、真实 DuckDB/WAL 和现役 checkout 均未修改

## 后续门槛

由现场 owner 在变更窗口内提供并批准固定的 Python 3.14+ 运行时，再对 reviewed、`PUBLISHED_VERIFIED` artifact 重跑同一接收命令；不得把 `pre-review` 包或临时 `/tmp` 接收直接宣称为 rc2 冷验证或生产通过。
