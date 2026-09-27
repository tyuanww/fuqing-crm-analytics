# T7 compatibility contract evidence（2026-09-26）

实现提交：f56c85f2。

synthetic matrix 覆盖 rc1 fixture 到 rc2 fixture 的 session/runtime/WAL-like JSON roundtrip，并明确返回 real_duckdb=NOT_RUN、wsl2=NOT_RUN。没有读取、复制或创建真实 DuckDB/WAL，也没有声称 Node/Python/systemd ABI 通过。

验证：Node24 compatibility tests 与 `dsh verify` synthetic compatibility 通过，aggregate release tests 57/57 PASS。目标 WSL2 冷启动、锁、磁盘不足、损坏恢复和现场回退仍待授权环境；T7 保持 PARTIAL。
