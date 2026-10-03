# G0 / T15 图表领域包解耦证据（2026-10-03）

## 本轮结论

已解除 workbench 对 funnel/waterfall 的 **6 条源码/类型引用**。计算函数和声明由 `@shine-mage/board-components@0.1.0` 独立拥有，三个消费者只通过公开 exports 消费同一个固定 tarball，构建后打入各自插件。旧 DSH 插件 ID、profile 组合、上游 SHA 和产品 VERSION 未改变。

T15 **仍为 PARTIAL**：CRM → workbench 的 5 条内部源码引用尚未解除；完整 invariant、精确宿主生命周期、签名/SBOM/CVE、服务保存/回放和远端门禁仍开放。本页不能作为新 Release 或杭州上线的验收。

## 工作树与输入

- 活动位置：公共 checkout `fuqing-crm-analytics-public`，`main@d4261aa338ff4ed5543866b8c63cdba627e49518`，仍 ahead origin/main 13。
- 保留上一阶段未提交成果；本轮没有在产品仓库 commit、push、切分支或发布。
- Node `24.19.0` / pnpm `11.7.0`；B0 Python `/tmp/dsh-b0-python.qW3lHO/venv/bin/python` 为 3.14.4、锁定 DuckDB 1.5.6。
- 图表后端专项使用上一阶段创建的隔离 `.context/checks/g0-boundaries-20261003/backend-venv/bin/python`。未升级全局环境。
- 固定 DSH `477b4f420553e8a52c2fbccc464d7561b239c443`，tracked 状态复核为空。未修改上游、访问真实 DuckDB、调用真实模型或操作杭州。
- 本轮日志目录：`.context/checks/g0-board-components-20261003/`；`working-tree-inputs.json` 记录当前 dirty 输入摘要，`changed-files-this-step.txt` 与文末列出相对上一阶段的变更。

## 包与兼容合同

| 产物 | 结果 |
|---|---|
| board-components tarball | 1,955 bytes；SHA-256 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182` |
| 领域包内容 | package.json + funnel/waterfall 的 `.mjs` 与 `.d.mts`；无 DSH/React/service 依赖、hooks 或源码路径导出 |
| 三消费者 | workbench、funnel、waterfall 各自锁精确版本和同一 tarball 摘要，并将 lock 纳入自身发布 files |
| 旧子路径 | `dsh-shine-funnel/funnel` 与 `dsh-shine-waterfall/waterfall` 保留；独立验证 ESM、Node require、TypeScript，类型不依赖相邻源码 |
| workbench 隔离 pack | 416,777 bytes；SHA-256 `74508caf2f1a589ef892a489cec707d5750e4340b89ed0af37bd80f7703a0dc6` |
| workbench pack 来源 | 命令拥有的临时 Git fixture；receipt 明确 `fixture_only=true`、`activation=NOT_RUN`，不是产品 reviewed SHA；测试结束已清理临时目录和包 |

kit 的包输入适配器只做开发期验证/绑定。tar 仅向 stdout 读取，限制大小、成员与类型；绑定前核对摘要、manifest、files/exports/types，拒绝 symlink、缺项、hooks、未锁定版本和 workspace/file/link 替代。已安装内容每次与包字节比较；拒绝覆盖非本工具拥有的依赖位置。旧内容寻址目录保留。没有隐式联网解析 latest 或源码 fallback。

图表标本迁入领域包 `test/`，Python 与旧插件消费者读取同一份 JSON；计算语义未重写。包本身独立 build/test，workbench 的干净重建只复制 workbench + kit，输入 tarball 明确传入；六份编译产物与当前构建逐字节一致。

机器 inventory 当前为 **10 包 / 579 源码 / 29 跨包引用**：9 条构建到 kit、10 条受锁约束的公共领域导出、5 条 CRM 内部源码例外、5 条测试引用。原 6 条图表源码例外已删除。190 处字面路径、57 处仅测试动态 import 的范围不变；合同增加到 10 条。计数增加源于显式公共包边界，不表示新增业务源码反向耦合。

## 实际验证

| 命令/范围 | 当前结果 | 本轮日志 |
|---|---|---|
| `node --test scripts/dsh-b0/package-inputs.test.mjs dsh-plugins/board-components/test/geometry.test.mjs` | 35/35 PASS；独立打包、重复打包同摘要、公开类型、损坏/缺失/符号链接/错误版本与同版本冲突负测 | `package-inputs-r2.log`；最终 B0 再包含这些测试 |
| `node --test scripts/dsh-b0/legacy-geometry-exports.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs scripts/dsh-b0/package-inputs.test.mjs scripts/release/plugin-boundary.test.mjs` | 20/20 PASS | `final-boundary-check.log` |
| `node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python` | 最终退出 0；Python **618/618**；Node 各阶段合计 **1408 PASS / 1 SKIP**；7 profile 插件构建、host/client 完整类型、真实 Cordis Loader + 合成服务、隔离 leaf pack、workbench clean rebuild + pack 均 PASS | `b0-check-final.log`、`build-evidence.json` |
| `node --test scripts/release/*.test.mjs` | **119/119 PASS** | `release-check.log` |
| `python scripts/run_backend_tests_bounded.py backend/tests/test_board_funnel.py backend/tests/test_board_waterfall.py` | **43/43 PASS**；同一领域标本、比率/人数、守恒、持久化/权限等既有消费者回归 | `backend-geometry.log` |
| `node dsh-plugins/crm-knowledge/build.mjs` | host/client 类型和构建 PASS；CRM 仍使用现有五条内部依赖，不是独立包证据 | `crm-build.log` |
| `pnpm dsh doctor`、两个改动 Python 测试的 Ruff、`git diff --check`、上游 tracked 状态 | PASS | `doctor.log`、最终检查记录 |

1408 是流水线阶段合计，包含 clean 重建后再次运行的 83 项，并非 1408 个不重复场景。1 项 SKIP 是未提供 `COCKPIT_EXAMPLE_PACKAGE` 的真实 HTML 样例测试，未伪装通过。B0 Python 有 23 条既有 warning，图表后端有 2 条 warning；没有把未执行的浏览器、模型或宿主 UAT 计入 PASS。

首个隔离包测试真实失败：从临时根目录调用 pnpm 会选择 11.19.0。根因是版本探针未设置包 cwd；已改为从包目录按 `packageManager` 校验 11.7.0，未绕过版本检查。失败日志 `package-inputs-r1.log` 保留，后续独立/完整回归通过。B0 r1/r2 是中间状态证据，最终结论以上表 final 为准。

本轮没有重跑无改动的完整旧 CRM/Vue 全套；上一阶段的 2922/223 结果保留为旧证据。本轮按影响范围执行完整 B0、release 专项和图表后端消费者回归。

## 下一步与放行状态

1. 处理 CRM 的 5 条 workbench 源码引用：先确认 page-tools/page-family、theme、cockpit slot 的领域 owner 与公开合同，再抽取薄 adapter；不能把业务代码塞进 kit。
2. T2/T17 继续精确 DSH 宿主 load/unload/restart/WAL 与失败恢复；同进程隔离当前仍 BLOCKED，不承诺热卸载。
3. T3/T7 决定 durable save，T13/T21 补完整状态/远端回执、canary/rollback。签名、SBOM/CVE、最终 reviewed source 和杭州现场授权仍是发布门禁。

**尚未达到创建正式新 Release/杭州激活条件。** 本轮只完成图表包边界与验证，没有请求或执行生产动作。

## 修改文件清单

以下是相对上一阶段输入快照的本轮变化；不把此前已有但本轮未动的修改重复算入。

- `CHANGELOG.md`
- `STATUS.md`
- `backend/tests/test_board_funnel.py`
- `backend/tests/test_board_waterfall.py`
- `config/shinemage-plugin-boundaries.v1.json`
- `docs/architecture/shinemage-plugin-boundaries.json`
- `docs/architecture/shinemage-plugin-boundaries.md`
- `docs/architecture/shinemage-plugin-platform.md`
- `docs/hackathon/TODOS.md`
- `docs/hackathon/evidence/dsh-g0-board-components-20261003.md`
- `docs/operating/dsh-plugin-author-quickstart.md`
- `docs/operating/verification.md`
- `docs/plans/shinemage-plugin-platform-split.md`
- `dsh-plugins/analytics-workbench/README.md`
- `dsh-plugins/analytics-workbench/bundled-dependencies.json`
- `dsh-plugins/analytics-workbench/package.json`
- `dsh-plugins/analytics-workbench/src/board-spec/component-view.mjs`
- `dsh-plugins/analytics-workbench/src/board-spec/funnel.d.mts`
- `dsh-plugins/analytics-workbench/src/board-spec/waterfall.d.mts`
- `dsh-plugins/analytics-workbench/src/client/library-components.tsx`
- `dsh-plugins/board-components/.gitignore`
- `dsh-plugins/board-components/README.md`
- `dsh-plugins/board-components/build.mjs`
- `dsh-plugins/board-components/package.json`
- `dsh-plugins/board-components/src/funnel.d.mts`
- `dsh-plugins/board-components/src/funnel.mjs`
- `dsh-plugins/board-components/src/waterfall.d.mts`
- `dsh-plugins/board-components/src/waterfall.mjs`
- `dsh-plugins/board-components/test/funnel-cases.json`
- `dsh-plugins/board-components/test/geometry.test.mjs`
- `dsh-plugins/board-components/test/waterfall-cases.json`
- `dsh-plugins/plugin-kit/README.md`
- `dsh-plugins/plugin-kit/packaged-dependencies.mjs`
- `dsh-plugins/plugin-kit/toolchain.mjs`
- `dsh-plugins/shine-funnel/build.mjs`
- `dsh-plugins/shine-funnel/bundled-dependencies.json`
- `dsh-plugins/shine-funnel/lib/funnel.d.mts`
- `dsh-plugins/shine-funnel/lib/funnel.mjs`
- `dsh-plugins/shine-funnel/package.json`
- `dsh-plugins/shine-funnel/src/funnel.d.mts`
- `dsh-plugins/shine-funnel/src/funnel.mjs`
- `dsh-plugins/shine-funnel/src/funnel.test.mjs`
- `dsh-plugins/shine-funnel/tests/funnel-cases.json`
- `dsh-plugins/shine-waterfall/build.mjs`
- `dsh-plugins/shine-waterfall/bundled-dependencies.json`
- `dsh-plugins/shine-waterfall/lib/waterfall.d.mts`
- `dsh-plugins/shine-waterfall/lib/waterfall.mjs`
- `dsh-plugins/shine-waterfall/package.json`
- `dsh-plugins/shine-waterfall/src/waterfall.d.mts`
- `dsh-plugins/shine-waterfall/src/waterfall.mjs`
- `dsh-plugins/shine-waterfall/src/waterfall.test.mjs`
- `dsh-plugins/shine-waterfall/tests/waterfall-cases.json`
- `scripts/dsh-b0/clean-build.mjs`
- `scripts/dsh-b0/legacy-geometry-exports.test.mjs`
- `scripts/dsh-b0/package-inputs.mjs`
- `scripts/dsh-b0/package-inputs.test.mjs`
- `scripts/dsh-b0/pipeline.mjs`
- `scripts/dsh-b0/plugin-boundaries.mjs`
- `scripts/dsh-b0/plugin-boundaries.test.mjs`
- `scripts/release/plugin-boundary.test.mjs`
- `scripts/release/preflight.mjs`
