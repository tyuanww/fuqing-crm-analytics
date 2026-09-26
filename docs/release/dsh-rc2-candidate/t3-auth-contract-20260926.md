# T3 auth contract evidence（2026-09-26）

实现提交：474cf177。当前实现仍是可复用的 release/auth contract，未改 DSH upstream，也未把 synthetic contract 测试冒充浏览器或杭州 host 验收。

本轮覆盖并通过：

- 一次性 token 原子消费、并发只成功一次、重启后消费状态保留；
- TTL、默认限流、foreign-origin 限流和稳定拒绝码；
- session TTL、Origin 绑定、POST/PUT 等修改方法必须提供 CSRF；
- POST→303、Cache-Control no-store、Referrer-Policy no-referrer；
- host-only HttpOnly session Cookie、独立 CSRF Cookie、HTTPS Secure 语义与 loopback synthetic 例外；
- token、Bearer、session、CSRF、Cookie 和授权字段脱敏。

验证：Node24 执行 pnpm dsh test，当前 aggregate 32/32 PASS，其中 auth 专项 7 个测试通过。浏览器真实 DSH/page HTTP、HTTPS 真实 Cookie、杭州 host/route 和 access-log 现场验证仍为 NOT_RUN；T3 保持 PARTIAL。
