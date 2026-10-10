# G0 首购分析服务独立包（2026-10-04）

## 范围与状态

上一批服务兼容门禁已完成 OCR delegate 26/26 文件审核及修复，正常 hooks 提交为 `809a9367a94bc8be3c7c329868d8680deeae1377`，提交前 release suite 170 PASS；见[审核证据](./dsh-g0-service-gate-review-20261004.md)。本页记录随后启动的本地未提交增量，分支仍为 `codex/plugin-boundary-review`。

复用既有服务打包器，增加 `shinemage-analytics-first-purchase-service@0.1.0rc1`。[清单](../../../services/analytics-first-purchase/package.json)包含 30 个源文件，另生成 OpenAPI、requirements.lock 与 manifest。包内业务实现原样复制，13 项依赖固定；不携带数据库、fixture JSON、业务数据、身份配置、DSH、CRM/知识应用或 worker。共享 RunStore 内部协议仍在闭包内，不能声称查询服务 API 已彻底拆开。

## 真实验证

```sh
PATH=/Users/hutou/homebrew/opt/node@24/bin:/Users/hutou/homebrew/bin:$PATH \
  /tmp/fuqing-fastapi141-v2-venv/bin/python scripts/run_backend_tests_bounded.py \
  backend/tests/test_crm_service_packages.py backend/tests/test_crm_service_contracts.py
```

结果：**17 PASS / 0 SKIP**。工具为 Node 24.19.0、Python 3.14.4，没有安装或升级环境。Python 包测试实际调用 Node 的 7 个集成场景：

1. 指标/知识两份实际 archive 独立 HTTP 运行与故障隔离。
2. 安装后的缺资源/篡改/链接/额外文件/错误依赖、schema/source 拒绝，输出不可覆盖。
3. 打包输入越界/链接/未知 schema 拒绝。
4. 对真实 allowlist payload 扫描 secret，拒绝时不留下候选回执。
5. 首购包安全解包，在只有 13 项声明依赖的 venv 中完成实际 HTTP 保存、精确重试/冲突、只读身份拒绝写入、候选拒绝、重启后无 RunStore/策略回放、SAVE_UNKNOWN、标题 forward-fix 保留来源与旧写入口拒绝；同输入二次打包摘要一致。
6. 打包源文件和安装 manifest 的 FIFO 在时限内拒绝，不等待写端。
7. 实际暂存源码状态常量与声明不符、OpenAPI 生成时尝试连接 SQLite 均拒绝。

默认包入口没有身份和状态配置：实际启动后请求返回 401，不创建数据库。测试 seed 用当前仓库的合成 worker 生成一个成功任务；serve/recover 则只导入解包后的代码，显式拒绝 DuckDB、CRM/知识应用、worker、httpx 等未声明模块。临时身份走私有 stdin，未进入 argv、日志或 archive。固定 freshness 时钟只属于测试，不是生产 SLA。

依赖按 manifest 从已有锁环境复制到独立 venv，**不是 wheelhouse 冷安装**。进程、端口及小库均为本轮测试新建并回收。业务 API 源码未改，完整 B0、远端 CI、浏览器、真实模型和 WSL 没有重跑。

原始日志目录：`.context/checks/analysis-service-package-20261004/`；最终共享入口 `backend-bounded-final2.log`，runner summary 为 `.context/checks/20261004T152050251473Z/summary.json`。

## 失败与修复

- `service-packages-first.log`：发行包 metadata 中下划线名与依赖锁连字符名直接比较导致测试失败，已按规范化名称比较。
- `service-packages-second.log`：实际包的 OpenAPI 与 B0 JSON 不同。B0 为 FastAPI 0.136.1/Pydantic 2.13.2，服务为 0.141.1/2.13.5；保存回执 discriminator 的 required/const/default 表达不同。已改为从实际暂存 factory 与独立锁环境生成包内 OpenAPI，在 HTTP 进程逐字段核对；未改 B0 合同或客户端类型。
- `service-packages-third.log` 是追加最后一个负测前的 6/6；最终结果以上述共享入口为准。失败日志保留，没有覆盖成通过。

## 同包候选

本地目录 `.context/checks/analysis-service-package-20261004/candidate/`，入口输出 `candidate-pack.json`。保存包与真实 HTTP 集成日志的摘要相同。

| 项 | 实际值 |
|---|---|
| archive | `shinemage-analytics-first-purchase-service-0.1.0rc1.tar.zst` |
| bytes | 75414 |
| archive SHA-256 | `95707c961eadf2f5370efcfb8a98ce9f663c077c40014e68a679af31e7402fb3` |
| manifest SHA-256 | `45875d95fae8dd9d9511258365c0b2df069aeacdf0cd1e8ef58e21301d938df5` |
| source | `809a9367` + `worktree_dirty=true`，逐文件摘要绑定实际输入 |
| release_ready / activation | `false` / `NOT_RUN` |

OpenAPI 生成拒绝 SQLite 连接、socket 连接/绑定及子进程启动；同时核对实际 APPLICATION_ID、STATE_SCHEMA_VERSION 和 provenance schema。包内 `check` 仍只读文件/依赖，不导入应用。候选自带 hash 不等于发布者签名。

## 仍未关闭

- T3/T7：精确旧/新 archive 与各自依赖配对。当前新增的只是同版本包恢复，不能替代固定源码对或跨包兼容证据。
- 目标主机证据验证器、生产鉴权/状态注入、生产形状时限/UNKNOWN、DSH 保存 UI/浏览器；现场激活仍返回 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`。
- T15：平台依赖冷安装、clean reviewed artifact、签名/SBOM/CVE、WSL/canary/回退与 G0/stop-go 后的物理分仓。

下一步先做旧/新包配对，再接目标主机证据。本批没有 push、发布、杭州操作或真实数据访问；产品仍 **PARTIAL**。
