# T11 evidence and content safety contract evidence（2026-09-26）

实现提交：77350599。

Evidence 写入保持原子、不可变和脱敏；新增复核入口校验 canonical JSON、脱敏结果、schema 和 SHA-256。公网 HTML 策略在缺少 CSP 或 iframe sandbox 时 fail-closed 为 `DISABLED`，同时明确 `native_fallback=AVAILABLE`；允许脚本的 sandbox 还必须有显式净化标记。

验证：Node24 aggregate release tests 44/44 PASS；canonical/redaction/schema/digest 负测与 HTML policy synthetic matrix 通过。真实公网 response header、浏览器 CSP/sandbox、插件 loader 和长期 retention 仍未运行；T11 保持 PARTIAL。
