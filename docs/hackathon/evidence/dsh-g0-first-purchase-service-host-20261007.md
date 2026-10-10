# 固定插件与独立保存服务包的宿主组合验收

2026-10-06 至 2026-10-07，`codex/plugin-boundary-review` 从 clean `212005bc` 继续。承接[插件包宿主验收](./dsh-g0-first-purchase-artifact-host-20261006.md)，本轮复用原始 tarball/archive，将保存服务改为独立进程和离线最小依赖环境，未重新打包或修改业务插件、服务业务代码、DSH 上游。产品仍 PARTIAL、`release_ready=false`。

## 固定输入与范围

| 对象 | 已核对的 SHA256 / 身份 |
|---|---|
| workbench 包 | `b3571f04618f44cdc7e0772d99980a4087a2f5a6a3a71e6cbbde778c85a86001`，来源 `9611589c` |
| CRM 包 | `d682081d8754d68cb34acff59fb7655d84dd7e4b0dd65caaed1499f5a76aafe7`，来源 `d3fe7f94` |
| 保存服务 archive | `d7025f754a6c1fe57ff0aa84e3de5c5bf353a099d4612101a8dccbb6fb871ff9`，来源 `9611589c` |
| 服务 manifest | `6b6ebe41d64db6b962bf11bfffa21476daae02f63e3cf787145834726a6cd323` |
| 原双包回执 | `a2b0a8b172b07c0260813cb320b0b4a2fc876212cc8b56fe9d935aea9a553ccc` |
| candidate digest | `ca79774b3bed3f733e3ab0ddfebc5f4f89586577dc8c2b06a886b9dab2a0e72c` |
| 本次 v2 演练输入 | `55282fcdae945e812f0ff6ec8fb013542225107da646ef1f36ed0b91ea61a793` |
| 最终 HTTP 宿主回执 | `ec3880748a91fb50c04c1fe344e4dd790013ccd0e660269f7140cddaeb76d8ed` |
| 最终 Chrome 宿主回执 | `60bbf7c2bd2c7375143d8fa90f542466162a9550a6939cf6d6dd13483ab44e03` |

宿主仍是未修改的官方 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`。Node 24.19.0、Python 3.14.4；13 个固定依赖从已有 wheelhouse 按原双包回执的 wheel 摘要复制并离线安装，不查询 registry。不是生产安装，也不证明发布者签名或供应链已放行。

新增 v2 输入只扩展隔离验收，不改原候选、profile 或 journal。先复用 `verifyServiceArtifactEvidence` 核对来源/双包合同，再核对实际 archive、manifest 和 wheel 字节；解包安装前后均检查文件集与摘要。子进程以 `-I -B` 排除仓库 PYTHONPATH，业务模块从解包目录导入，依赖来自独立 venv；这不是进程安全沙箱。业务模块实际来源记录在 `processes.json`，OpenAPI 与包内合同相同。错误/篡改或不完整 opt-in 均失败退出，父测试也要求 v2 携带独立服务描述，不降回源码服务。

**这次验证的是插件包 + 保存服务包组合。** CRM/model 仍是合成端点；查询 kernel/dispatcher/worker 仍由源码测试夹具启动。保存进程通过当前 RunStore 合同访问同一自有合成 SQLite，再独立持久化分析。已核对该读取边界，不把它描述成“查询内核已独立打包”或“服务间已经解除存储耦合”。HTTP 驱动器的 save controller 仍来自测试源码；Chrome 使用已打包客户端。

## 本次实际运行

证据根 `OUT=.context/checks/first-purchase-service-host-20261006`（相对当前工作树；跨日继续保留原目录名）。

| 验证入口 | 本次结果 | 日志 |
|---|---|---|
| `node --test scripts/dsh-b0/pinned-host-acceptance.test.mjs scripts/dsh-b0/mock-provider.test.mjs`，显式 fixed upstream 与 v2 服务输入 | **27 PASS / 0 SKIP** | `guards-final.log` |
| `pytest --noconftest -q -W error::ResourceWarning`，packed_service_support / save_ui / native_crm_http | **5 PASS** | `python-regression-1.log` |
| official_host.py，无 artifact 变量 | 旧 workspace 路径 **1 PASS** | `workspace-reviewed.log` |
| 同一 official_host.py，v2 artifact HTTP | **1 PASS** | `http-reviewed.log` |
| 同一 official_host.py，v2 artifact Chrome headless | **1 PASS / 5 场景**、page errors 为空 | `browser-reviewed.log` |
| Ruff、Node 语法、diff、包/进程/旧证据核对 | PASS | `ruff-reviewed.log`、`final-integrity-reviewed.json` |

三个宿主模式按 workspace → artifact HTTP → artifact Chrome 顺序执行，各用新 `--basetemp`。最初 `http-1`、`browser-1` 也通过；最终 reviewed 记录使用补齐进程退出证据、并显式拒绝 v2 回落到源码夹具后的代码。Ruff 曾发现新增测试的一个未用 import，已移除；业务逻辑未变。Python 各日志仍有一条 warning，Node 合成包夹具仍有 module-type warning，不宣称零告警或完整 CI 通过。

HTTP 实际覆盖官方 Cookie/Origin/CSRF、CRM 登录、原生命令/worker、保存 ACK 丢失核对、精确取消、宿主会话重启和重新登录；本轮另将**保存服务进程单独停止、在相同端口重启，再通过官方 Host 重放同一保存请求**，核对同一回执，分析记录仍为 1。缺 CSRF 的当前固定宿主结果是 CONNECTION_CLOSED，不伪记成 HTTP 403。

Chrome 实际覆盖登录前拒绝、CRM 原生 slot 登录、composer 查询/确认保存、刷新同一回执、无 CRM 登录的普通对话。之后另重启保存服务，公开 HTTP 列表保持完全一致；Chrome 模式的“重启后再次点击保存”仍为 NOT_RUN，不能用列表核对冒充。截图已查看；既有拒绝 toast 短暂残留未改，完整视觉、headed、移动端/读屏验收仍开放。

负测覆盖错误服务回执、同名 wheel 篡改、重复安装目录、修改 bootstrap 在执行前被拒绝，以及子进程启动失败/非 loopback CRM 输入的回收。本次新增检查在默认 B0 中仅运行无真实宿主的保护/失败夹具；服务包安装负测需要显式 opt-in。

## 重现、审核与后续

使用上一轮同一 pytest 入口与 Node24。输入 schema 改为 `dsh-first-purchase-host-artifacts/v2`，在 v1 五个字段上增加绝对 `service_evidence_path`（原双包 `pair/receipt.json`）及其 `service_evidence_sha256`。同时指定：

```sh
export B0_NATIVE_CRM_ARTIFACT_MANIFEST=/absolute/owned/v2-input.json
export B0_NATIVE_CRM_SERVICE_PYTHON=/absolute/existing/python3.14-with-pip
export B0_NATIVE_CRM_SERVICE_WHEELHOUSE=/absolute/existing/pinned-wheelhouse
export B0_NATIVE_CRM_HOST_UPSTREAM=/absolute/unchanged-built-dsh-0.1.7-rc.2
python -m pytest --noconftest -q -W error::ResourceWarning \
  --basetemp=/absolute/new-http-evidence backend/tests/test_analytics_first_purchase_official_host.py
```

浏览器模式另加 `B0_NATIVE_CRM_BROWSER_MODULE=/absolute/existing/playwright/index.mjs` 并使用新的 `--basetemp`；不能并行占用同一 B0 端口。保护测试使用 `B0_BUILD_UPSTREAM`，服务 guard 同时要求上述 v2 manifest/Python/wheelhouse。v1 插件包模式与无 artifact 的 workspace 模式保留原语义。

已核对最终 9 个 Host/保存服务 PID 全部退出、5 个对应端口无监听；每个服务进程退出回执均无 forced kill。两份原证据目录共 **437 个文件**的内容、大小与 mtime 保持不变；原 candidate journal 仍 seq 3。新安装目录、合成状态和截图保留在本轮证据根，不清理旧版本或数据。

提交前继续采用 OCR delegate，由当前 Agent 审查全部 **15/15** 文件（含默认排除的 2 份测试和 6 份 Markdown），**0 skipped、100%**。补齐 v2 不可回落和失败进程退出记录后，本轮无未关闭代码发现；清单与摘要在 `review-summary.json`，文档链接/源码一致性在 `document-links.json`。没有调用外部 reviewer，也没有修改生产 verifier 来接受本轮局部回执。

本机“保存服务 archive 接入同一官方宿主组合”子项完成。接续 T3/T7/T13/T17/T21 的新包目标 WSL/恢复与回执门禁，补查询运行内核包级组合、供应链、真实模型/业务 UAT；生产保存准入、发布/激活和物理分仓仍未关闭。本轮未连接杭州、读取真实 DuckDB、push 或发布。
