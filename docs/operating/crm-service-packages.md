# CRM 与知识服务独立候选包

这是 T15 的本地 synthetic 交付入口。插件只消费 HTTP；两个服务分别拥有应用包、资源清单、Python 依赖锁和进程。服务包不携带 DSH、插件、真实数据库、账号配置或主仓运行环境。当前源码仍在同一 workspace；尚未物理分仓、发布或在杭州安装。

## 两个交付单元

| 单元 | 输入与 owner | 对外合同 | 包内资源 |
|---|---|---|---|
| `shinemage-crm-metrics-service` | [指标包清单](../../services/crm-metrics/package.json)，`crm-service` | `crm-metrics-service/1.0.0` | 唯一明确的 synthetic JSON，运行时创建并关闭自己的临时小型 DuckDB |
| `shinemage-crm-knowledge-service` | [知识包清单](../../services/crm-knowledge/package.json)，`knowledge-service` | `crm-knowledge-service/1.0.0` | `pack`、历史验证、节点、边、指标定义与证据索引共 6 份公开 JSON；没有私有源文件、数据库或 DuckDB 依赖 |

服务软件版本初始为 `0.1.0rc1`，与产品 VERSION、DSH pin、API 版本分开。每份输入清单逐文件声明 source、打包后的 target 和 code/resource/bootstrap 归属；不通配复制 `backend/`、`knowledge/` 或仓库。领域实现只有一份源文件，打包原样复制，不生成第二套业务实现。

包内 `backend` 是应用的私有实现命名空间，使用[无副作用初始化入口](../../scripts/crm-calibration/service-namespace.py)，不加载旧 CRM 的聚合合同/语义导出。**两个包各用独立目录、venv 和进程；不把它们混装成共享 Python 库。** 后续移至独立仓库时迁移这些已验证的输入边界；不是把整个旧 backend 搬进每个新仓。

## 本地打包和核对

前置：已有 Node 24、Python 3.14、zstd；Python 环境满足所选服务清单的精确依赖。打包命令不会下载、安装依赖、启动服务或发布。当前本仓的全量后端锁环境可用于构建；每个服务实际依赖更小，知识服务不需要 DuckDB。

```sh
node scripts/crm-calibration/package-service.mjs \
  --service metrics --python /absolute/locked-python3.14 \
  --output /absolute/new-metrics-candidate
node scripts/crm-calibration/package-service.mjs \
  --service knowledge --python /absolute/locked-python3.14 \
  --output /absolute/new-knowledge-candidate
```

每个新目录包含 `.tar.zst`、`service-manifest.json`、`candidate-receipt.json`。回执绑定 archive SHA-256、manifest SHA-256、Git 基线、dirty 状态及实际文件摘要。dirty 输入明确标为未审查候选；所有候选均 `release_ready=false`，签名/供应链、安装和激活初始为 `NOT_RUN`。同样输入产生相同包；输出目录已存在则拒绝，不覆盖旧候选。

打包按顺序完成：验证精确清单 → 拒绝源符号链接/越界/过大输入 → 复制允许的文件 → 生成依赖锁与摘要 → 扫描实际包内容的 secret → 在包内执行只读 `check` → 复查输入未改变 → 复用现有 release tar/zstd 打包器。候选回执最后写入；中断留下的无回执目录不能视为成功候选，使用新目录重试。

将 receipt 中的 archive digest 与实际文件核对后，使用现有安全解包器写入**新的**安装目录，再检查包内 manifest digest：

```sh
/absolute/locked-python3.14 scripts/release/secure-unpack.py \
  /absolute/candidate/shinemage-crm-metrics-service-0.1.0rc1.tar.zst \
  /absolute/new-metrics-install --max-entries 100 --max-bytes 8388608
/absolute/metrics-venv/bin/python -I /absolute/new-metrics-install/service.py check
```

`-I` 必须保留：忽略调用方 PYTHONPATH 和用户 site。`check` 验证 schema、身份、所有文件摘要、额外文件/链接、资源范围、Python 与精确依赖，不导入应用、不监听端口。检查通过只表示本地完整性和运行前置条件；清单自带的 hash 不是发布者签名，生产接收还须验证受信任 receipt/source。

## 显式启动与故障边界

以下是操作入口说明，不代表本轮已启动常驻实例。服务 owner 在批准的隔离环境中分别运行：

```sh
/absolute/metrics-venv/bin/python -I /absolute/metrics-install/service.py serve --port 18101
/absolute/knowledge-venv/bin/python -I /absolute/knowledge-install/service.py serve --port 18102
```

只监听 `127.0.0.1`，没有外部 host、reload、多 worker 或自动重启参数。端口 0 仅供拥有进程的临时测试自动分配。启动先输出 `SERVICE_SOCKET_BOUND` 和包身份，**不把绑定端口当成 HTTP 健康通过**；随后须带合同头探测 capabilities。默认关闭 access log，错误输出稳定代码，不回显资源内容。

通过 [profile 生成器](./crm-plugin-service-boundary.md) 分别配置两个 origin。服务停止不会触发插件偷偷启动 Python、访问旧主仓或改用真实数据。服务使用各自资源路径，不接受模型传入 SQL、文件路径或凭据。

独立指标服务要求合同 header，且不提供旧 `/crm-metrics/explain`；知识服务拥有 `/crm-knowledge/explain`。主仓的旧 Python factory/CLI 仍保留兼容 adapter。新的指标 [OpenAPI](../../backend/contracts/crm-metrics-service.openapi.json) 和插件 HTTP 类型对应独立服务；旧 [OpenAPI](../../backend/contracts/crm-metrics.openapi.json) 保留兼容窗口。

知识服务不再导入指标计算引擎。历史 `verification.json` 作为带来源的旧记录保留，独立包不会据此打开主仓文件，也不会把旧记录冒充当前验证；结果明确标记 `implementation_verification_scope=not_evaluated_in_service_package`。

## 验证与尚未完成的交付

```sh
# 实际 pack → 安全解包 → 最小依赖 venv → 双服务 HTTP → 停止一个服务
CRM_SERVICE_PYTHON=/absolute/locked-python3.14 \
  node --test --test-concurrency=1 scripts/crm-calibration/service-package.test.mjs
# 本地/CI 共享后端入口，也运行同一组真实包验证
/absolute/locked-python3.14 scripts/run_backend_tests_bounded.py \
  backend/tests/test_crm_service_packages.py backend/tests/test_crm_service_contracts.py
```

测试创建并清理本次拥有的应用目录、venv、小型合成库和端口；依赖从已有固定环境按包清单复制，不联网、不复制业务数据。覆盖三种指标查询、知识解释、OpenAPI 一致性、真实数据拒绝、单服务停止、确定性构建、缺资源/篡改/链接/额外文件/错误依赖/secret 拒绝和不覆盖既有候选。CI 的 Python job 配置 Node 24 与 zstd；远端 CI 是否通过须看该次实际运行。

本地最小依赖验证不是 WSL 冷安装。Python 可执行文件、平台依赖 wheelhouse、签名/SBOM/CVE、干净 reviewed SHA、受信任 receive、canary 与回退仍需独立交付证据；生产不能现场编译或在线解析浮动依赖。这两个包也未覆盖真实 CRM 看板、私有知识库权限、持久化数据或 D15 保存。CRM/知识插件仍是组合迁移包，最终插件拆包是下一项；T3/T15 整体仍 PARTIAL。
