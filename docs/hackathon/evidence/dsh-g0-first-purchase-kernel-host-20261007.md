# 固定插件、保存服务与独立查询包的本机组合

2026-10-07，`codex/plugin-boundary-review` 从 clean `43630981` 继续。本批补查询 API / dispatcher / worker 的代码包隔离与独立重启验收，承接[保存服务包组合](./dsh-g0-first-purchase-service-host-20261007.md)。业务代码、官方 DSH 与原三包未改；产品仍 PARTIAL，`release_ready=false`。

## 固定输入与实际边界

证据根 `OUT=.context/checks/first-purchase-kernel-host-20261007`，相对本工作树。

| 对象 | 已核对身份 / SHA256 |
|---|---|
| 官方 DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，既有构建未改 |
| workbench / CRM / 保存服务 | 复用上轮 `b3571f04…` / `d682081d…` / `d7025f75…`，完整摘要见前序证据 |
| 查询代码来源 | `4363098106cf5f77d8f0eaa7674e5d6a3d76707d`，46 个受限 Python 文件；命名空间使用该 SHA 内既有 `service-namespace.py` |
| 查询包 | `kernel-pack-r2/kernel.tar.zst`，107445 B，`4f2a5412eec1b0694ed11dc9bf16ebba21d55684b4bad992c273673a64957c86` |
| 查询 manifest | `5476628f7cf88fff23df375058f4cc9331bd33afc8fc4d1b83a85e05c45d8bcd` |
| 查询回执文件 | `e30eb0d7faf877235ed62029ddb97aa80f33909c5b7cb607feb283d97c72041f` |
| 打包 recipe | `services/analytics-first-purchase-kernel/package.json`，`b1bc5d3b0bb845fd6287a188007f841da357ef08c086deecb02947cf7c60064e` |
| v3 组合输入 | `input-r2.json`，`19ce764774aacd2aef87d7b2bb4d41ecc853c5bb4a4db5eab47056d5da9e56c6` |
| 原 candidate | `ca79774b3bed3f733e3ab0ddfebc5f4f89586577dc8c2b06a886b9dab2a0e72c`，journal 仍 seq 3 |

查询包仅为 `synthetic-composition-only` 演练输入；新的 recipe 与测试驱动不冒充 `43630981` 内已有实现。业务文件逐个从该 Git tree 导出，recipe 另以摘要绑定。复用已有 pack、secure-unpack、secret scan、文件验证、离线 wheel 安装器，不扩展生产 verifier 或候选准入规则。

查询环境独立安装仓库锁定的 15 个依赖：Python 3.14.4，FastAPI 0.141.1、Pydantic 2.13.5、DuckDB 1.5.6、psutil 7.2.2 等，具体 wheel 名与 SHA 在查询回执。13 个已有 wheel 复用，本机另外取得两个明确固定版本的 wheel；冷安装使用 `--no-index --no-deps --require-hashes`。原 B0 测试解释器仍是 DuckDB 1.5.5/FastAPI 0.136.1/Pydantic 2.13.2，没有原地升级。父测试使用旧解释器不代表查询子进程也用旧依赖；独立闭包与实际解释器分别核验。

查询子进程 `-I -B` 启动，仅从解包目录导入业务；实际 WorkerManager 的根目录与包目录相同，子 worker 使用同一独立解释器。启动和退出记录模块来源、实际 PID、worker 出生/退出、文件完整性。私有 pipe 仅驱动既有 dispatcher / 读取状态，真实用户路径仍经官方命令和现有 HTTP API；没有把测试控制端点打入业务包。这是执行来源检查，不是恶意插件安全沙箱。

**仍有明确的存储耦合**：保存服务读取同一合成 RunStore/SQLite，独立保存分析库。本轮关闭代码包依赖工作树这一项，不证明两个服务可以各自变更 RunStore schema。CRM 身份端点、模型响应与 JSON 数据均为合成夹具；HTTP 驱动的 save controller 是测试源码，Chrome 消费实际插件客户端。首购计算走 JSON，不读取 DuckDB 文件；DuckDB 是现有共用 worker 的导入依赖，版本正确不等于真实数仓验收。

## 本轮实际结果

| 验证 | 最终结果 | 日志 / 记录 |
|---|---|---|
| kernel archive + pinned host + mock-provider Node tests，显式已有包/Python/wheels/upstream | **30 PASS / 0 SKIP** | `guards-final.log` |
| 两份 packed process support 的真实启动失败/回收 pytest | **5 PASS** | `python-final.log` |
| 无 artifact 的 workspace HTTP 回归 | **1 PASS** | `workspace-final.log` |
| v2 插件 + 保存服务 HTTP 回归 | **1 PASS** | `service-final.log` |
| v3 插件 + 保存服务 + 查询包 HTTP | **1 PASS** | `http-final.log` |
| v3 Chrome headless | **1 PASS / 5 场景** | `browser-final.log` |
| Ruff、Node 语法、Git diff / 引用与证据核对 | PASS | `ruff-final.log`、`final-integrity.json`、`document-links.json` |

四种宿主模式顺序执行，使用新的 `--basetemp`，完整命令和显式变量记录在 `final-acceptance-results.json`。每个 pytest 宿主日志仍有一条既有 warning；Node 合成包夹具也有 module-type warning，不声明零告警或完整 CI 通过。

v3 HTTP 经真实官方 command 准入，完成 CRM 登录、原生 loop / worker、保存 ACK 丢失核对、精确取消、DSH 会话重启/重新登录。额外将保存服务与查询进程分别关闭、同端口重启：查询 snapshot 保持一致，同一 command-derived request 重放仍是同一 run，实际 worker 总数 1；同一保存意图重放仍是一条分析。查询重启不是重新生成 fixture 状态。Chrome 五场景为未登录拒绝、原生 slot 登录、输入框查询/确认保存、刷新同一回执、未连接 CRM 的普通原生对话；之后两服务重启另以 HTTP/持久状态核对，未冒称重启后再次浏览器点击保存。

已核对 19 个记录的自有 Host/服务/worker PID 全部退出，6 个记录端口无监听；实际服务无强制 kill，原 437 文件内容/大小/mtime 与 journal 不变。回执摘要见 `final-integrity.json`；journal 文件 SHA 为 `515d714de61ef7049c29029e5152df03c26c07c38b7b8f011c9b013dcd3755f8`。演练目录保留，不删除旧版本/运行时。Chrome 截图已查看；既有登录拒绝 toast 短暂残留，完整视觉/移动端/读屏仍 NOT_RUN。

## 失败调查与审核

- 初次打包的不完整 SHA 和漏掉数字的文件名校验均在创建包前拒绝，已更正输入/规则，保留 `pack.log`、`pack-current.log`。
- 初次实际冷启动 `http-1` 暴露 `backend.semantic.__init__` 连带导入旧 CRM `filters`；查询包现沿用其他独立服务的命名空间 bootstrap，没有把旧 CRM 整体打入闭包。失败日志与首个包保留，只有 `kernel-pack-r2` 进入最终通过的组合。
- OCR delegate 自审补修了启动解释器不存在时的日志句柄泄漏，并增加真实失败回归；保存服务观测的 `query_runtime` 按 v2/v3 实际来源记录，避免沿用“workspace”旧结论。最终代码复验见上表。
- 负测实际覆盖相对路径、回执/包/wheel 篡改、已存在输出、包内 worker 修改、错误状态 ownership、错误 manifest、解释器启动失败。只修改自有临时副本，未污染仓库源码。

提交前 OCR delegate 已覆盖 **18/18 文件、0 skipped、100%**，包括默认排除的两份测试与五份 Markdown。逐文件清单、修复发现与最终源码摘要在 `review-summary.json`；本批没有未修复的新增代码发现。上文列明的存储、目标平台和生产准入限制继续保留，不被本地审查结论覆盖。

## 重现与下一步

显式打包入口（既有 wheelhouse 须完整匹配当前 recipe；不会下载依赖）：

```sh
node scripts/dsh-b0/first-purchase-kernel-artifacts.mjs \
  --source 4363098106cf5f77d8f0eaa7674e5d6a3d76707d \
  --python /absolute/python3.14-with-pip \
  --wheelhouse /absolute/pinned-query-wheels --output /absolute/new-kernel-evidence
```

在上轮 v2 组合输入上将 schema 改为 `dsh-first-purchase-host-artifacts/v3`，增加 `kernel_receipt_path`（绝对路径）与该文件的 `kernel_receipt_sha256`。保留原包/服务输入，并设置：

```sh
export B0_NATIVE_CRM_ARTIFACT_MANIFEST=/absolute/v3-input.json
export B0_NATIVE_CRM_KERNEL_WHEELHOUSE=/absolute/pinned-query-wheels
# 同时保留 v2 所需的 HOST_UPSTREAM、SERVICE_PYTHON、SERVICE_WHEELHOUSE。
python -m pytest --noconftest -q -W error::ResourceWarning \
  --basetemp=/absolute/new-http-evidence backend/tests/test_analytics_first_purchase_official_host.py
```

Chrome 另加既有 `B0_NATIVE_CRM_BROWSER_MODULE` 并使用新输出。不要并行占用 4335/4336/4337；不提供 v3 时保留原模式，不伪造包验收。实际冷安装 guard 用 `B0_NATIVE_CRM_KERNEL_RECEIPT` 指向同一查询回执，配合 SERVICE_PYTHON/KERNEL_WHEELHOUSE 运行 `node --test scripts/dsh-b0/first-purchase-kernel-artifacts.test.mjs`。

接续工作是明确查询/保存的服务间状态访问合同，将**同一字节**候选带到 WSL 冷安装/恢复与目标回执，再推进物理分仓。当前本机 macOS wheel 不能直接宣称已验证 WSL；供应链、真实模型/业务 UAT、生产保存准入和 activation/canary 保持开放。本轮没有连接杭州、读取真实 DuckDB、push 或发布。
