# T6 promotion contract evidence（2026-09-26）

实现提交：f56c85f2。

synthetic promotion 现在把 release marker 与 service owner、restart dependency 一起落盘。激活时校验 marker、source SHA、current-target 记录和 owner；错误 owner 会在切换前拒绝，side-by-side 目录和旧 current 保持不变。杭州 systemd readiness、真实 service restart、healthcheck 和正式回退仍未运行。

验证：Node24 aggregate release tests 49/49 PASS；promotion owner mismatch negative fixture、provenance fail-closed fixture 和 deploy wrapper 的 owner/restart dependency gate 通过。T6 保持 PARTIAL。
