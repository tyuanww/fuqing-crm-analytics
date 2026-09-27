# T6 promotion contract evidence（2026-09-26）

实现提交：f56c85f2、628fdd7e。

synthetic promotion 现在把 release marker 与 service owner、restart dependency 一起落盘。激活和回退都会校验 owner 与 restart dependency；错误 owner/dependency 会在切换前拒绝，side-by-side 目录和旧 current 保持不变。连续激活会记录 previous target，rollback 会原子恢复旧 release 并写入 `ROLLED_BACK` receipt。杭州 systemd readiness、真实 service restart、healthcheck 和现场回退仍未运行。

验证：Node24 aggregate release tests 66/66 PASS；promotion owner/dependency mismatch、previous-target rollback、重复激活/回退幂等、活动锁、死锁文件保守恢复、provenance fail-closed fixture 和 deploy wrapper gate 通过。默认安装入口拒绝未提供 publication/attestation 的未验证路径；T6 保持 PARTIAL。
