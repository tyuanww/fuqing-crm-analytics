# M2-07 完整 SDK archive secret/content audit（2026-10-14）

本轮使用 alpha2 pinned audit tool 对完整 development SDK archive 做 bounded content 和 secret-pattern audit。审计读取固定 archive SHA，对接收树的文件、链接、摘要和文本模式逐项核对；没有输出或保存任何匹配值。

## 结果

- archive SHA-256：`969de1d098a07971a34635cd20d93b30051efdad7eac6d125e2f57847c3559bf`
- upstream SHA：`d743267388641bc76f17c45ce8b4c231aed1d32c`
- 文件 hashed：`125,574`
- 字节 hashed：`2,382,628,617`
- 文本 pattern checked：`125,563`
- links checked：`9,327`
- secret-pattern findings：`70`
- opaque/size/git coverage gaps：`827`
- 审计状态：`BLOCKED`
- 原始报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-full-content-audit-20261014/report.json`
- 原始报告 SHA-256：`9bccf6a50ed67dbe6459cf745b6866dc92d7bd1469b63a67c04b288ea5cf4a0a`
- 不含匹配值的分类报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-full-content-audit-20261014/triage.json`
- 分类报告 SHA-256：`145ac724ed7804d78cffd6e7565d857b413423867403aa5d573ca0b8ae894245`

命中分类：

| 分类 | 数量 | 说明 |
|---|---:|---|
| `assignment-non-synthetic` | 51 | 赋值形态命中，涉及测试、第三方文档、协议代码或源码样例，尚未逐项复核 |
| `synthetic-assignment` | 7 | 路径和内容带有 test/fixture 等 synthetic 标记，但 archive audit 仍按 fail-closed 记录 |
| `direct-secret-pattern` | 12 | AWS/证书/签名/第三方实现或 telemetry 测试路径中的直接 pattern 命中，必须人工确认 |

827 个 coverage gap 主要是二进制、原生模块、图片/字体、Git objects、嵌套归档和超出文本审计限制的文件；它们已保留路径和摘要，未被当作通过。

## 结论与下一步

当前完整 archive 不能进入正式 SDK 分发。下一步必须对 70 个命中逐项确认来源和是否为公开测试/协议样例，必要时从最终分发 artifact 排除完整上游测试/fixture/不需要的开发目录；同时为 opaque/native 文件补充 provenance 和人工审计。不能通过修改审计器、增加全局豁免或把所有命中标为 synthetic 来关闭门禁。

因此 M2-07 继续为 `BLOCKED`，`release_ready=false` 保持不变。
