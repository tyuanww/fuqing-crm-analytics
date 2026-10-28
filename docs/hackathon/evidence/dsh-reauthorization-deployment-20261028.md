# 原快照重新授权隔离部署回执

2026-10-28，隔离 19327 已应用候选。真实 CRM 重登及聊天到看板验收等待用户在原会话登录。公网现役未切换，PR 保持草稿，`release_ready=false`。

## 消费身份

| 对象 | 提交或归档 |
|---|---|
| 来源实现 | `eeb2f4cd05c45f4b73b4e871881105b0c0cfaa73`，[Source #189](https://github.com/tyuanww/fuqing-crm-analytics/pull/189) |
| 消费配置 | `17f49275741e016ae913484f0f26f97f276f7c18`，[消费 #190](https://github.com/tyuanww/fuqing-crm-analytics/pull/190) |
| CRM 作者 | `721d2bb9f4ea6a71144636ba819daf38070a01b5`，[CRM #6](https://github.com/tyuanww/dsh-crm-knowledge/pull/6) |
| Workbench 作者 | `63718e782d4f3353f324f4d50fa83067a97b1372`，[Workbench #14](https://github.com/tyuanww/dsh-analytics-workbench/pull/14) |
| 组合归档 | artifact `12791792973`，[run 40632190062](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40632190062) |

组合 ZIP SHA-256 为 `922ef4e0b10cfbbff319944cccdfa1037eed199261912e2ee706a7c5dc2d48b6`。20 个成员逐字节回读通过，只替换 CRM 和 Workbench 的四份载荷，其余十六份不变。组合清单的 `consumer` 字段保持原值，本轮消费提交以表中 `17f49275` 为准。

## 本地门禁

| 范围 | 结果 |
|---|---|
| 完整后端 | 4105 passed、81 skipped，0 failures、0 errors |
| 前端 | 构建通过，236 项单测通过 |
| 新组合 B0 | 六个阶段通过，Python 1043 passed、41 subtests passed；不与后端或作者测试累加 |
| 作者证据 | 当前 Workbench 1394 项固定 CI 测试与新正式包身份匹配 |
| 部署核对 | 四文件应用通过，16 个实际插件及来源文件与候选一致 |

首次 B0 被旧组合归档摘要阻断，更新实际归档锁后该检查 24 项通过。正常推送又因新工作树固定依赖目录是符号链接而失败；改为独立实体目录后，失败点 2 项通过，完整推送门禁及 B0 随后通过。两次失败均未放宽检查或进入部署。

部署安装器采用已有备份、失败回退和幂等机制，只扩展目标文件和重启单元。主会话实际运行合成回退检查通过。独立 Codex CLI 静态审核未确认 P0–P2；该审核未运行成功合成测试，不属于跨模型审核。

## 杭州应用范围

目标为 `/srv/shinemage/validation/uat-76fd03d9-20261027`。更新 CRM `lib/host.js`、Workbench `lib/client.js`，以及来源服务的 `crm_native_snapshot_source.py` 和 `crm_native_snapshot_host.py`。

来源与 Web 两个单元已重启并为 active。六项保护服务 PID 保持，包括隔离 CRM、隔离页面服务及四项公网服务。私有来源、页面和 Web 的无凭据探测均为 401，证明边界仍要求授权，不代表业务验收通过。刷新浏览器后，增长董事会品牌、新会话页、原会话及模型账号可见。

原文件备份与应用回执位于该目标的 `reauthorization-eeb2f4cd/`。回退入口为 `python3 -I reauthorization-eeb2f4cd/install-isolated-batch.py rollback`，从目标根目录执行。它会先核对保护服务和文件摘要，发生漂移则拒绝执行。原发布及来源回执未改写，业务 DuckDB 不在本次文件写入范围。

## 未完成

- 当前消费提交的远程 CI 和运行预检。
- 同一 CRM 账号重登后，旧来源预览、确认、恢复读取，并核对原页面版本与内容不变。
- 真实问数聊天查询商品和 RFM、诊断、生成看板，再进行人工编辑、AI 编辑及保存重开。
- 通过上述验收后的公网切换。

全筛选缓存、portable Linux 和正式发布身份保持原开放状态。先前业务边界见[来源功能验收记录](dsh-source-reauthorization-20261028.md)。
