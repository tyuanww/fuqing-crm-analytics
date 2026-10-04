# T15 CRM 页面与主题解耦（2026-10-03）

本轮在 `codex/plugin-boundary-review@f55908df` 继续上轮未提交的 slot 增量；原公共 main 保留。当前改动未提交、未推送、未创建 PR/Release，未改杭州或真实数据。产品和 T15 仍 PARTIAL。

## 实际改动

- CRM 原有 5 条 workbench 生产源码/类型引用已全部解除：上一轮 slot 1 条，本轮页面工具/页面族 2 条及主题 2 条；边界 policy 不再保留源码例外。仍有组合/浏览器测试的跨包引用，不把测试依赖归零冒充完成。
- HTML 交付的注册与实现归 workbench 的公开 `./page-tools`，只要求官方 tools 服务。CRM 不携带页面解析器，也不自行注册页面工具；profile 通过 `--page-tools-plugin` 显式选择已构建包，核对 identity/peer/export/files，记录 entry digest 和 CONFIGURED_NOT_RUN。默认不隐式装配提供方；省略时查询/登录保留，health 明确 NOT_AVAILABLE 和原因。
- 已注册页面工具在当前 scope 可见时，health 仅记 AVAILABLE/NOT_RUN。交付仍产出 PACKAGE_RECEIVED、published=false；保存由工作台及后端另行确认。单装 tools adapter 不代表页面 UI 或保存接通。
- `shine-brand/contracts/content-theme.v1.json` 拥有插件内容主题；生成双方本地 TypeScript 副本并校验源摘要。品牌插件可以关闭，CRM 不再编译相邻源码，dev kit 不承载业务主题。与修改前的 dark/light/native 三组完整 token 比对完全一致，没有重画 UI。
- CRM package 明确 pnpm 11.7 与四份 lib 文件 allowlist，防止目录级打包纳入额外输出。隔离测试只复制 CRM、kit 和本包 type/package 测试，再用固定 SDK 构建、执行、受控 pack；没有 workbench/brand/backend 源码。
- B0 本地/CI 入口增加主题 drift、CRM build、单包注册与 profile/页面组合测试。跨插件组合测试单列为 `page-composition.integration.mjs`，不让 CRM 的常规测试 glob 隐式要求相邻 workbench 产物。

## 实际验证与证据

使用 Node 24.19.0、pnpm 11.7.0、只读固定 DSH `477b4f420553e8a52c2fbccc464d7561b239c443`。CRM HTTP/持久化 fixture 使用完整锁定的 Python 3.14.4 和隔离小库；完整 B0 使用独立最小 Python。两者均不读取真实库、凭据或调用真实模型。

日志目录：本工作树 `.context/checks/crm-decoupling-20261003/`。

| 验证 | 当前实际结果 | 日志 |
|---|---|---|
| 主题、slot、边界、profile 正反例 | 19 PASS / 0 SKIP | `contracts-final.log` |
| 主题实际消费者与原有 shell/generate-context | 8 PASS；原 dark/light/native token 完全一致 | `theme-regression.log`、`theme-parity.json` |
| 固定 Cordis/ToolRuntime 的 CRM 单包与页面组合 | 5 PASS；正反加载顺序、页面卸载、CRM 卸载、原生工具保留、无提供方、REFUSED 和 abort | `composition.log`（文件改名前同一实现；最终入口由 B0 复验） |
| CRM 完整 Node/Host/UI 合成回归 | 135 PASS / 0 SKIP；含 9 项编译后 React/AntD DOM 测试 | `crm-final.log`（原失败修复复验另保留 `crm-regression-after.log`） |
| CRM / workbench 构建 | host/client types 与正式固定构建 PASS | `crm-build.log`、`workbench-build.log` |
| brand/query/CRM 隔离 build/test/pack | 3 PASS；CRM 中的 package 测试为 2 项，不包含完整后端或浏览器旅程 | `isolation.log` |
| 最终 B0 pipeline | 退出 0；Python 618 PASS / 22 warnings；Node 阶段合计 1425 PASS / 1 SKIP；7 份编译产物干净重建一致 | `b0-final.log`、`build-evidence.json` |
| 实际构建包生成候选 profile | CRM 单包为 NOT_AVAILABLE；显式组合为 CONFIGURED_NOT_RUN，文件/摘要已生成，未加载宿主 | `profile-crm-only.log`、`profile-with-pages.log` |

Node 阶段合计包含 clean 重跑的 83 项，不是不重复场景数。唯一 SKIP 为未提供的外部 standalone HTML 样例，不记作通过。

关键命令：

```sh
node --test scripts/dsh-b0/content-theme-contract.test.mjs scripts/dsh-b0/cockpit-slot-contract.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs dsh-plugins/crm-knowledge/test/profile.test.mjs
B0_BUILD_UPSTREAM=/absolute/pinned node --test scripts/dsh-b0/plugin-isolation.test.mjs
B0_BUILD_UPSTREAM=/absolute/pinned node scripts/dsh-b0/pipeline.mjs --check --python /absolute/b0-python
# 完整 CRM：使用完整 backend 锁，不用最小 B0 Python；源码包浏览器旅程另列。
CRM_METRICS_PYTHON=/absolute/backend-python B0_BUILD_UPSTREAM=/absolute/pinned node --input-type=module <<'JS'
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const base = 'dsh-plugins/crm-knowledge/test/';
const tests = readdirSync(base).filter(name => name.endsWith('.test.mjs') && name !== 'crm-journey-browser.test.mjs').sort().map(name => base + name);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests, base + 'host.integration.mjs', base + 'page-composition.integration.mjs'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
JS
```

CRM 临时 fixture 包为 241,648 bytes，SHA-256 `d5ff0855235e9254d51ef42f6ef3d6cde5f3420f537876ecc58e584998135d97`；只含 package.json、cordis.patch.yml 和 index/host/graph-tools/client 四份编译产物。fixture_only=true、activation=NOT_RUN；临时 Git 身份不是产品 reviewed SHA，不是新 Release。workbench fixture 包含新增公开页面入口，421,582 bytes，SHA-256 `5efdbec5d0239bdd5ead109442a30430163b867d684bf0168cc31ca59a44321d`；构建后临时目录已按 owner 清理。

## 失败与修复记录

- 初次完整 CRM 回归 130 PASS / 5 FAIL：一个 GSV 测试仍固定总请求数 4，已有实现会额外读取 `/api/v1/metrics/cutoff`，导致本项及依赖它的三个子断言、父测试失败。实际查询代码未变。修复为核对 login/me/overview/trend/cutoff 的完整路径序列和 cutoff 结果；拒绝跨会话、伪造参数、断开后的查询不得追加请求。修复后 135 PASS。保留 `crm-regression.log` 原失败证据。
- 新边界状态误用了 policy 不支持的枚举；改回现有 DOMAIN_V1，不放宽 schema。主题测试最初把 esbuild 当作 kit 的依赖而加载失败，改用项目固定 Node24 的原生 TS 读取实际消费者，无新增依赖；原失败在 `contracts.log` / `contracts-after.log`。
- 最小 B0 Python 不能运行完整 CRM assets fixture（缺 dateutil）；没有升级工具链或跳过正式 CRM 测试，完整 CRM 由原已锁定 backend Python 执行。B0 仅承接不依赖完整 CRM Python 的组合测试，两个范围保持清晰。

## 尚未关闭

1. CRM 的合成查询/离线知识仍调用本仓 Python CLI、backend 与 knowledge 资源；真实 HTTP 适配虽独立调用 CRM 服务，服务 API/version、知识领域分仓和状态 forward-fix 矩阵仍待 T3/T7。
2. 当前不是新包版本或正式 clean reviewed candidate；签名/SBOM/CVE、精确 runtime invariant、session/WAL、原子切换/回退、canary 与远端 receive/reconcile 未执行。
3. 未运行真实 Chrome/DSH profile/模型/账号 UAT。固定 ToolRuntime + mock/native slot 与 JSDOM 不替代上述验收。未操作真实 DuckDB 或杭州。

下一步先收敛 CRM 服务/合成 CLI 与知识资源的公开边界，再推进精确宿主和 profile 证据；不把生产源码 import 归零当成服务、物理多仓或上线全部完成。
