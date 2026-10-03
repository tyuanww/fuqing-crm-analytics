# T1 边界盘点与 T15 构建解耦证据（2026-10-03）

## 结论与范围

T1 **IMPLEMENTED / STATIC PASS**；T15 **PARTIAL**。kit 已独立拥有固定工具链，两个 leaf 在没有 workbench 源码的环境里完成 build/test/pack。CRM/workbench 仍有 11 条源码/类型引用；真实 DSH 生命周期、D15 独立候选和供应链/生产门禁未关闭。

工作区：`fuqing-crm-analytics-public`，`main@d4261aa338ff4ed5543866b8c63cdba627e49518`，保留原有 13 个本地提交及上一轮未提交修复。未 commit、push、改分支、发布或操作杭州。VERSION 仍 `0.20.0.0`，DSH 仍 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`。结束时上游 tracked diff 为空。

## 实际变更

| 文件组 | 变更 |
|---|---|
| `config/shinemage-plugin-boundaries.v1.json` | 每个包的领域/目标 owner，8 条合同、8 个控制入口，11 条具体源码引用及退役条件 |
| `docs/architecture/shinemage-plugin-platform.md`、`shinemage-plugin-boundaries.md`、`shinemage-plugin-boundaries.json` | 长期边界、实际依赖/构建 DAG、源码与合同快照；静态范围与运行时门禁分开 |
| `scripts/dsh-b0/plugin-boundaries.mjs`、对应测试 | TypeScript AST 读取真实源码；新增耦合、循环、清单漂移、未归属包、越界动态导入负测 |
| `dsh-plugins/plugin-kit/toolchain.json`、`build-tools/`、`toolchain.mjs` | 从 workbench 迁入 pin、manifest、lock、补丁；锁/补丁逐字节保持不变；合并 CRM 已有两项官方 SDK binding |
| workbench `toolchain.mjs`、CRM 与六个 leaf 的 `build.mjs` | 业务 typecheck 留在自身包；共用 kit 的固定版本/锁校验；不再从 workbench 读取共享构建配置 |
| B0 合同生成器、`scripts/dsh-dev/`、`scripts/crm-calibration/`、`scripts/release/toolchain.mjs`、`scripts/ci/run_checks.py` 与受影响测试 | 统一 canonical kit 路径；移除两个生成器对相邻历史仓库依赖的隐式 fallback |
| `scripts/dsh-b0/clean-build.mjs`、测试与 `plugin-isolation.test.mjs`、`pipeline.mjs` | 有界白名单复制 kit；source-only 单包构建/测试/pack；本地与 CI 相同入口 |
| `scripts/dsh-b0/competition-c0-contract.mjs`、C0 manifest、前端 `c0-fixtures.mjs` | 生成器同步两处 provenance hash；schema 与 fixture 值不变 |
| `.gitignore`、插件/开发入口 README、Quickstart、verification、STATUS、TODOS、计划、CHANGELOG | 忽略本地 kit 缓存链接、修正当前路径/旧现役描述、同步实际证据和剩余项 |

旧 `analytics-workbench/build-tools/node_modules` 没有删除。本机 kit 复用了这份既有固定依赖缓存，链接不进 Git；锁输入现在独立归 kit，干净环境准备到 kit 自己的目录。隔离测试只允许外部固定 DSH SDK/第三方依赖，不复制 workbench 源码。没有新安装或升级全局 Node/Python；共享 backend 在本次临时 venv 按既有 `requirements-lock.txt` 安装，共享 Vue 检查按既有 lock 执行了 `npm ci --ignore-scripts --no-audit --no-fund`。

工作树完整路径/输入摘要（包含上一轮未提交修复）保存在 `.context/checks/g0-boundaries-20261003/working-tree-inputs.json`；不是发布 manifest。

## 本轮真实验证

所有 Node 命令使用已有 Node `24.19.0` / pnpm `11.7.0`。B0 使用 `/tmp/dsh-b0-python.qW3lHO/venv/bin/python`（Python `3.14.4`，逐项匹配 B0 锁，DuckDB `1.5.6`）；共享 backend 最终使用本次临时 `backend-venv`，48 项 `requirements-lock.txt` 声明全部匹配（同为 DuckDB `1.5.6`），运行同一个日常合成 profile。测试只使用隔离小库/合成夹具。

| 命令/入口 | 本次结果 | 原始证据 |
|---|---|---|
| `node scripts/dsh-b0/plugin-boundaries.mjs --check` 与 AST/负测 | 9 包、572 源码、24 条跨包引用、190 处字面路由；7/7 PASS | `docs/architecture/shinemage-plugin-boundaries.json`；`b0-check-r4.log` |
| 8 个插件各自 `node build.mjs <pinned-upstream>` | 8/8 PASS，包含 CRM 的 host/client 类型检查 | `builds.json` 与各包 build log |
| `node --test scripts/dsh-b0/plugin-isolation.test.mjs` | brand/query 各自仅含单包 + kit，build/test/pack PASS；无 workbench 源码 | `isolated-packages.log` 与最终 `b0-check-r4.log` |
| `node --test scripts/release/*.test.mjs` | 119/119 PASS | `release-check.log` |
| `python3.14 scripts/ci/run_checks.py --files-from <changed-files> --only python` | Ruff/import/Agent 入口通过；合成 backend 2922 PASS、77 SKIP、71 deselect | `shared-python-locked-check.log`；`.context/checks/20261003T092545526708Z/summary.json`，rc=0；锁验证见 `backend-lock-verified.json` |
| 同一 shared runner `--only frontend` | `vue-tsc` + Vite build PASS；29 文件、223 单测 PASS | `shared-frontend-check.log` |
| `node scripts/dsh-b0/pipeline.mjs --check --python <pinned-b0-python>` | 完整 PASS：Python 618/618；Node 各阶段合计 1370 PASS / 1 SKIP；host/client 类型检查、七包构建、真实 Cordis Loader + synthetic services、clean rebuild | `b0-check-r4.log`、本目录 `build-evidence.json` |
| C0 消费者 Node / Python 专项 | 11/11 + 11/11 PASS | `contract-consumer.log`、`c0-python-contract.log` |
| `git diff --check`、本轮 Markdown 本地链接、上游 SHA/锁/无 tracked edits | PASS | 本轮最终检查 |

表内相对日志路径统一位于 `.context/checks/g0-boundaries-20261003/`。B0 的 Node 数是各阶段执行计数，含第二次 clean 编译的 83 项，不宣称 1370 个不重复用例。1 项 Node SKIP 是依赖外部 standalone example 的测试；backend 的 skipped/deselected 属既有合成 profile，不算通过。B0 23 条 warnings 与后端各组 warnings 保留在原日志中。

clean rebuild 实际复制 550 个源码输入、3,483,710 bytes，比较 6 份编译产物字节一致；专属临时目录已清理。额外的 kit 白名单复制和两个 leaf 隔离测试同样只清理本次拥有的临时目录。

临时包证据（非生产候选、非 reviewed source commit）：

| 包 | 包大小 | tarball SHA-256 |
|---|---:|---|
| shine-brand | 1859 bytes | `7f73bc9128199297a062d816296ec7beb977e4d93ae65a4d41e719b4dcd0af7c` |
| shine-query | 1043 bytes | `5fcff9fbe3165b9ad56bcb2e08c768f82c153dc8a2933290ca52bc07c0799743` |

这两个包的现有 UI 测试使用受控 VM/假 Cordis surface。临时 Git fixture 仅用于执行 pack 的真实 clean-source 校验，不是发布来源；所有 activation 均为 `NOT_RUN`，临时包随夹具清理，摘要保留在日志。

## 本次失败与修复

1. 首次 B0 检查正确拒绝系统 DuckDB `1.5.5`，要求锁定 `1.5.6`。改用已准备且完整匹配的隔离 B0 Python；未改全局环境或真实数据。失败保留于 `b0-check.log`。
2. canonical kit 路径改变了 C0 生成器自身摘要，manifest 未更新。用原生成器更新；失败保留于 `b0-check-r2.log`。
3. 随后消费者回归暴露另一份手工维护的 C0 hash。生成器现在在同一步生成/检查 manifest 与嵌入夹具 stamp，避免以后手工同步；失败保留于 `b0-check-r3.log`。最终从头运行的 `b0-check-r4.log` 才是本次 PASS。

4. 共享 backend 首轮 2922 PASS 使用了本机依赖，与完整锁不完全一致；因此不能作为固定环境证据。另建临时 venv，安装并逐项验证 48 项声明后，同一 shared runner 再跑 2922 PASS / 77 SKIP / 71 deselect，退出 0。第一轮记录仍保留，最终采用 `shared-python-locked-check.log`；全局环境和仓库锁未修改。

没有跳过失败用例、放宽 pin、修改 schema 预期或用历史测试数替代本次结果。

## 仍未关闭

- T15：workbench → funnel/waterfall 的 6 条代码/类型引用，CRM → workbench 的 5 条内部引用；board-components 和 CRM 的公开合同、D15 workbench 独立边界、完整 invariant/宿主验收。
- T2/T17：精确固定 DSH profile 的实际 load/unload、挂死/崩溃、受控重启、native fallback、session/WAL；现有 loader/假服务测试不替代。
- T3/T7：服务状态、幂等保存、UNKNOWN 重放和 forward-fix 矩阵，以此决定 durable save 能否进入首个 D15 candidate。
- 签名/SBOM/CVE、完整来源信任、canary/rollback、灰度/RACI、远端 receive/reconcile 与真实 UAT。
- GitHub CI、依赖 advisory jobs、部署容器 smoke、Windows/WSL2、真实模型/浏览器、杭州现场本轮未运行；本地共享 runner 不等于远端 CI 全绿。

本轮尚不具备创建新 GitHub Release 或杭州激活条件。当前仍是未提交修改；正式 preflight 需要授权提交后的 clean reviewed SHA。下一步按已批准顺序处理 board-components 的 6 条引用，并把 T17 宿主证据与 T3 保存矩阵分开验证。
