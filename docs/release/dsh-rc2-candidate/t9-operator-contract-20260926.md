# T9 operator and capacity contract evidence（2026-09-26）

实现提交：f56c85f2、45d1a796。

synthetic ephemeral loopback server 验证了 operator positive probe 的 release_tag/source_sha identity、negative probe 的 403，以及错误 source SHA 的拒绝；operator_gate_method=none 仍返回 PARTIAL。100 请求/10 并发的 scheduler backpressure fixture 返回 synthetic PASS；真实 HTTP 证据仍独立返回 NOT_RUN，不冒充线上容量证据。

验证：Node24 aggregate release tests 54/54 PASS。真实 Cloudflare Access/Tailscale/mTLS route、15 分钟 HTTP SLI、真实 HTTP 10x backpressure、现场 operator session 和 route SHA 尚未运行；T9 保持 PARTIAL。
