# T8 action contract evidence（2026-09-26）

实现提交：f56c85f2、45d1a796。

synthetic action contract 覆盖 save/export/send 的 NOT_AVAILABLE capability matrix、cancel、双击幂等、unknown receipt、首次 NOT_AVAILABLE terminal receipt、状态损坏和终态冲突。已有 terminal receipt 不会被后续成功/失败覆盖，客户端不能从未知结果推断成功。

验证：Node24 aggregate release tests 54/54 PASS；terminal receipt 现在绑定 `action_id`、actor、idempotency key 与 capability type。真实 action API、浏览器断网/刷新/权限撤销和服务重启恢复尚未接入；T8 保持 PARTIAL。
