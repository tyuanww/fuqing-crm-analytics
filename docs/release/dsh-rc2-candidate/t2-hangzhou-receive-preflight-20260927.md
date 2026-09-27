# 杭州 artifact receive 预检（2026-09-27）

## 范围

将 merged-main internal app artifact、manifest、`scripts/dsh.mjs` 和接收器代码临时传到杭州 `/tmp` 隔离目录，执行 `node scripts/dsh.mjs receive`；不写入 `/srv/shinemage`，不安装依赖，不启动/重启/切换服务。每次临时目录在结束时已清理。

## 结果

- 传输：app tarball、manifest 和接收器代码均成功传到临时目录。
- 接收：`NOT_RUN/BLOCKED`。接收器进入 secure unpack 后，目标主机 Python 3.12.3 无法找到 `zstd`，错误为 `FileNotFoundError: [Errno 2] No such file or directory: 'zstd'`，进程退出码 `2`。
- artifact digest、manifest schema 和目标路径校验尚未在杭州完成，因为解包前置依赖缺失；不能把这次结果写成 receive PASS。
- 未读取真实 DuckDB/WAL、runtime token、Cookie 或生产配置；现役 checkout、systemd、端口和 Cloudflare 未改动。

## 后续门槛

由现场 owner 在变更窗口内提供并批准固定的 `zstd` 运行时（同时满足项目 Python 3.14+ 工具链），再重跑同一接收命令；不得在生产主机现场浮动安装后直接宣称 rc2 冷验证通过。

