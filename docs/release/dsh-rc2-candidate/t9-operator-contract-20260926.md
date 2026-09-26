# T9 operator and capacity contract evidence（2026-09-26）

实现提交：f56c85f2。

synthetic ephemeral loopback server 验证了 operator positive probe 的 release_tag/source_sha identity、negative probe 的 403，以及错误 source SHA 的拒绝；operator_gate_method=none 仍返回 PARTIAL。backpressure 只验证本地 scheduler 的并发上限，并明确返回 NOT_RUN，不冒充真实 HTTP 容量证据。

验证：Node24 aggregate release tests 44/44 PASS。真实 Cloudflare Access/Tailscale/mTLS route、15 分钟 HTTP SLI、10x backpressure、现场 operator session 和 route SHA 尚未运行；T9 保持 PARTIAL。
