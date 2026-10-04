# G0 精确首购服务包与依赖配对（2026-10-05）

## 结论与范围

旧 `56198c32a52d9822c7a3338d92b0fa077d1c61bc` / 新 `a50bd42492195040efaa6989c90e4fe84030551c` 的实际 archive，在两份独立 venv 中离线安装精确依赖，完成 **9/9 预期观测**。验证仅在 Darwin arm64 / Python 3.14.4 / Node 24.19.0 完成；两版依赖锁恰好相同，不声称跨依赖版本升级或 WSL 验收。**旧服务可写降级仍 BLOCKED**，因为生成的新版本缺少来源。

工作树 `codex/plugin-boundary-review@809a9367a94bc8be3c7c329868d8680deeae1377`；本页与首购应用包、配对验证器均属随后未提交增量。没有切换分支、改业务 API、DSH 或生产状态。上一阶段同版本包证据见[2026-10-04 记录](./dsh-g0-analysis-service-package-20261004.md)。

## 实现边界

- 复用 `package-service.mjs` 的 allowlist、secret scan、安全打包和 `service.py check`。`--source` 只接受完整 Git commit，从该 tree 读取普通 code 文件，并核对历史 requirements-lock；没有 checkout/fetch。
- `service_source` 绑定实际服务 SHA 和历史锁摘要；`source` 绑定当前打包清单与 HEAD/dirty，bootstrap、资源及 OpenAPI 生成流程归当前打包层。历史旧包 `0.0.0rc1` 是此次兼容诊断重打包，不冒充旧 Release。
- 两个包先校验 archive/manifest 摘要，再安全解包。`service-runtime.fixture.py --wheelhouse` 为每包新建不含 pip 的 venv，由调用方 pip 以 `--no-index --no-deps --no-compile --require-hashes` 安装 wheel；最后比对实际安装的全部 metadata 与 manifest，无额外依赖。
- wheelhouse 缺失、链接、重复/额外/错版本依赖拒绝，不退回联网安装。13 个 wheel 的名称、版本和 SHA-256 写入回执；这些摘要固定实际字节，不证明发布者签名或 CVE 审计。
- 旧源码的真实合成 worker 仅在独立 seed 环境创建临时 JSON/SQLite。服务只导入解包内容，拒绝主仓、DuckDB、worker、CRM/知识等未声明模块；临时身份仅走私有 stdin。
- 沿用原 SQLite owner 和保存 API，没有新建发布状态机。应用目录、venv、合成小库和进程在结束/正常失败后回收，两个 archive 与日志保留；不接受现有数据库输入。

## 实际命令与结果

原始证据目录：`.context/checks/service-package-pair-20261005/`。正式配对使用 `run2/`；`run1/` 保留为增加中断处理前的首轮结果，未覆盖。

```sh
export PATH=/Users/hutou/homebrew/opt/node@24/bin:/Users/hutou/homebrew/bin:$PATH
PAIR_EVIDENCE="$PWD/.context/checks/service-package-pair-20261005"
node scripts/crm-calibration/service-package-compatibility.mjs \
  --baseline 56198c32a52d9822c7a3338d92b0fa077d1c61bc \
  --candidate a50bd42492195040efaa6989c90e4fe84030551c \
  --baseline-python "$PAIR_EVIDENCE/build-venv/bin/python" \
  --candidate-python "$PAIR_EVIDENCE/build-venv/bin/python" \
  --baseline-wheelhouse "$PAIR_EVIDENCE/wheels" \
  --candidate-wheelhouse "$PAIR_EVIDENCE/wheels" \
  --output "$PAIR_EVIDENCE/run2"
```

执行退出码 **0**，回执 `PASS` / observations **9** / `release_ready=false`。复跑必须使用新的 output 目录。

| 实际观测 | 结果 |
|---|---|
| 旧包写入旧 v1 保存记录 | PASS |
| 新包读取旧记录，拒绝绕过 D15 的旧写入口，完成受控保存 | PASS |
| 旧包只读访问新记录、拒绝标题写入 | PASS，数据库摘要不变；旧 D15 API 为 404 |
| 新包无 RunStore/策略恢复，精确回放并保留来源修正标题 | PASS |
| 冷备份在新目录/新进程恢复 | PASS，原回执/来源及标题幂等重放保持一致 |
| 旧包在抛弃式合成副本上以可写身份生成版本 3 | 预期观测完成；该动作不兼容 |
| 新包检测该版本来源缺失 | 已验证（`detect-old-write`）：PROVENANCE_NOT_RECORDED，原回执仍可核对 |
| 旧包打开未知 schema 99 | 拒绝，数据库摘要不变 |
| 新包打开未知 schema 99 | 拒绝，数据库摘要不变 |

PASS 包括对不兼容行为的负面观测，不能解释为旧服务可以写新状态。回退插件/profile 必须保留兼容的新服务及 durable state，见[兼容窗口](../../architecture/first-purchase-service-compatibility.md)。

共享验证命令：

```sh
"$PAIR_EVIDENCE/build-venv/bin/python" scripts/run_backend_tests_bounded.py \
  backend/tests/test_crm_service_packages.py \
  backend/tests/test_crm_service_contracts.py \
  backend/tests/test_service_artifact_compatibility.py
```

结果 **25 PASS / 0 SKIP**，日志 `focused-final.log`。其中 `test_crm_service_packages.py` 实际调用 **8 个 Node 包集成场景**，包含固定 Git 源绑定、错旧基线拒绝、空 wheelhouse 不回退安装，以及对已经 HTTP-ready 的服务发出取消并验证端口关闭/日志无 token。另有 8 项配对 CLI 负测，覆盖浮动/相同 SHA、相对路径、重复参数、输出不覆盖和失败回执。

完整配对命令的 SIGTERM 探针在旧包 HTTP 阶段完成后中断：退出码 **2**、`FAIL / SERVICE_PAIR_CANCELLED`、保留 1 项已完成观测，自有端口关闭；原始 `interrupted/receipt.json`、`interrupted.log` 和 `interrupted-probe.json` 保留。构建步骤有超时边界，SIGINT/SIGTERM 不会被记为最终 PASS；SIGKILL 不承诺即时清理。

本次 Ruff（4 个相关 Python 文件）、4 个 JS 文件语法检查和 `git diff --check` 通过。新增/修改文档的 24 条相对链接均存在，7 个验证器摘要和两个实际 archive/manifest 与最终回执一致；汇总保存在原始证据目录的 `summary.json`。业务 API 未修改，完整 B0、远端 CI、浏览器、真实模型、真实数据和杭州/WSL 均 **NOT_RUN**。

## 双包身份与依赖

| 项 | 旧 baseline | 新 candidate |
|---|---|---|
| 包版本 | `0.0.0rc1`（诊断） | `0.1.0rc1`（候选） |
| archive bytes | 66657 | 75838 |
| archive SHA-256 | `5bffce97eae7365ab7b75876dfb2f7c5a0ac30d66003ccd01f308e3c2444509f` | `9a92540edb9c5c6e26ce4857a1d780f4fcc7dcd243016bc4d8dd1a3a10b00775` |
| manifest SHA-256 | `b32e407f8000f5dc0e8d3a99478f5dfeb0ec7b2fd143cdf38d1064bbf3fa3a96` | `29b63d9609a4af8ec0f6464dbdd7ca7a3d6feb89ef5f32db54bf1f950783bc07` |

包文件分别在 `run2/baseline/` 和 `run2/candidate/`。两者 `source.worktree_dirty=true`，不是 clean reviewed artifact。顶层 `run2/receipt.json` SHA-256：`fee4ef71dabc660e3b0de83ed9d816ca2fcb4001a40154b1ce807f255bf7a35a`。

各自实际安装的 13 项版本：annotated-doc 0.0.5、annotated-types 0.8.0、anyio 4.15.1、click 8.5.0、fastapi 0.141.1、h11 0.16.0、idna 3.19、pydantic 2.13.5、pydantic-core 2.46.5、starlette 1.6.0、typing-extensions 4.16.0、typing-inspection 0.4.4、uvicorn 0.47.0。历史锁 SHA-256 均为 `e099e4a3824a0e44ffbf06abc1206c3fc1e9b62c7329835f154dfa98ec276e7d`；平台 wheel 和 7 个实际验证器摘要保存在顶层回执。

候选子回执的 `installation/activation=NOT_RUN` 保留其生成时状态；顶层 `installed` 是此次隔离验证的补充观测，不改写不可变子回执，也不记录生产部署完成。

## 失败与修复

首次沿用旧 `/tmp/fuqing-fastapi141-v2-venv/bin/python` 打包失败，`baseline-initial.log` 为 `SERVICE_DEPENDENCY_VERSION_MISMATCH`。检查实际环境发现 FastAPI/Pydantic 等版本已与服务锁不符；没有绕过检查或修改该环境。改用本次 `.context/.../build-venv`，按仓库固定锁安装构建依赖，另预备精确服务 wheelhouse 后完成验证。

依赖准备明确联网，记录为 `build-env-install.log` / `wheel-download.log`；配对命令的两个实际安装步骤离线。Python 可执行文件沿用已有 3.14.4，未修改系统工具链。保留首轮失败及成功日志，不将以前的测试数作为本轮结果。

## 尚未关闭与下一步

1. 新 `shinemage-service-artifact-compatibility/v1` 回执尚未接入现有源码 `--service-evidence` 门禁；下一步绑定精确 archive/manifest/依赖摘要与目标主机证据，沿用既有 journal。现有 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE` 不变。
2. WSL 平台 wheel 冷安装、Python/runtime 来源、生产身份/状态路径注入、生产形状时限/UNKNOWN 与 DSH 保存 UI/浏览器尚未验证。
3. clean reviewed 包、签名/SBOM/CVE、受信任接收、目标主机 canary/回退，以及 G0/stop-go 后物理分仓仍开放。

T3/T7/T15 仍 **PARTIAL**，所有本机回执 `release_ready=false`。本批未 commit、push、Release 发布或操作杭州；没有读取、复制或修改真实 DuckDB。
