# T3 查询来源 HTTP 的固定双包组合（2026-10-07）

结论：**LOCAL SOURCE HTTP ARTIFACT PASS / 整体 PARTIAL**。先按用户要求完成 [源码边界复审](./dsh-g0-first-purchase-source-http-20261007.md)，23/23 文件审核、228 项后端与官方 Host 新路径通过，正常 hooks 提交为 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`。随后从这个干净提交生成新查询包和保存服务包，实际跑通官方 DSH 的 HTTP、Chrome headless、独立重启和查询离线后的回执重放。此页记录的组合驱动与文档是该源码提交之后的独立增量；业务包来源始终是 `f9726f68`，组合驱动提交号以 Git 为准。

没有 push、Release、杭州操作或真实业务数据访问。所有 CRM/model、查询 JSON 和 SQLite 均为隔离合成夹具；官方 DSH 上游 `477b4f420553e8a52c2fbccc464d7561b239c443` 未修改。

## 固定输入

原始证据根：`.context/checks/first-purchase-source-packages-20261007/`，下文记为 `OUT`。输出目录新建且独占，失败轮次不覆盖。

| 对象 | 固定身份 |
|---|---|
| 新查询/保存源码 | `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6` |
| 查询 archive | 113681 B；`109251614197e515a34a4824206e93ef53c0185e5c09a24a7906f9f7a967b8b7`；52 个明确允许文件 |
| 查询 manifest | `139a24b15c7c5e059c0404dbdea406a3d3e5b11e9b662f4a838a7db90227dc19` |
| 保存 archive | 82908 B；`ee4908c40c7c8d127cec1c25b4bfae83ec6b0997d006bc7bf9615e8ee23f0ac7` |
| 保存 manifest | `44719e57755a151bc64bf5c9e5075271e301dd26952a9b808181242a0c857a9a` |
| 服务兼容双包 receipt | `59a20d3c57831e8caeb40f25a9969deff0c7a97e56d8633f2366bdf4af33ba26` |
| workbench | 435294 B；`b3571f04618f44cdc7e0772d99980a4087a2f5a6a3a71e6cbbde778c85a86001`；正常 candidate 命令打包，字节与前版相同，没有重新构建插件 |
| CRM | 复用 `d3fe7f94` 的既有包，234926 B；`d682081d8754d68cb34acff59fb7655d84dd7e4b0dd65caaed1499f5a76aafe7` |
| workbench candidate | `861d6ef1c42b23b5f2ad4427ba9a19ecb032651c61efa6414303e0729feea4d4` |
| profile | `first-purchase-source-http-local`；`be3948850fc414ce1524226a544783de1ecb3253514cc7f1d8f3280280b3d0af` |
| 新 journal | seq **3**；文件 SHA `f8996e2cf17538d595ba4992ae564b61ce83257425965512b532c3f765d68af1` |

candidate 仍只是 workbench 与保存服务的本地绑定，不是完整发布包或生产 profile。CRM 包、查询包及 HTTP 来源模式由显式 `input-v4.json` 组合；不能把该局部 candidate digest 当成完整部署身份。旧 candidate、旧包和旧 journal 保留。

## 组合边界

- 在既有演练入口增加 `dsh-first-purchase-host-artifacts/v4`，要求固定插件/CRM、保存双包证据和查询 receipt。两份业务包必须都有新接口实现且领域 source 合同文件摘要相同，才允许进入新模式；缺少或不一致拒绝，不能回落到源码夹具或共享数据库。
- 保存服务获得自己的 `save-owner` 目录和固定 loopback 来源 URL；不获得查询状态路径，`run_store=None`。进程级 SQLite audit hook 在加载包之前启用，只允许自己的 `analyses/first_purchase_analyses.sqlite3`。负测实际尝试打开另一查询库，启动被拒绝且没有创建该库。
- 查询 API、dispatcher、worker 从独立查询 archive 加载；保存 API 从独立服务 archive 加载。两套 venv 各自从已有 hash wheelhouse 离线安装 15/13 个锁定依赖。查询依赖含 DuckDB 1.5.6，但测试输入仍为合成 JSON，不读取真实 DuckDB。
- HTTP 整链在真实保存之后关闭查询进程，再重启保存进程，经原生 Host 重放同一请求，得到原回执和唯一分析。之后恢复查询，再验证 run 重放仍只有一个 worker。浏览器轮次也独立重启服务/查询；浏览器轮次没有把查询离线期间的 Host 重放记为 PASS，该证据只来自 HTTP 轮次。
- v3 的原本机来源模式也用同一批新包实际回归；这不等于重新执行旧 `43630981` 查询 archive，亦不修改或沿用旧包的验收结论。

## 本次实际验证

| 入口/范围 | 结果 | OUT 下证据 |
|---|---|---|
| `service-save-compatibility.py --baseline 56198c32… --candidate f9726f68…` | 源码 **9/9 PASS** | `source/receipt.json`、`source.log` |
| `service-package-compatibility.mjs`，同一 SHA 对、固定解释器/wheelhouse | 实际保存双包 **9/9 PASS** | `pair-r2/receipt.json`、`pair-r2.log` |
| `first-purchase-kernel-artifacts.mjs --source f9726f68…` | 固定源码打包、15 依赖冷安装 **PASS** | `kernel-pack/receipt.json`、`kernel-pack.log` |
| `pnpm dsh plugin candidate …` / `plugin verify-service …` | 新候选绑定、seq 3、幂等重试 **PASS** | `candidate.log`、`verify-service*.log`、`plugin-state.json` |
| `node --test --test-concurrency=1` 的 pinned-host / kernel-artifact 两文件 | **29 PASS / 0 SKIP** | `artifact-guards.log` |
| 两个 packed-service/kernel support Python 文件 | **6 PASS** | `driver-tests.log` |
| 官方 Host / v4 source HTTP | **1 PASS，9.54 秒** | `http-v4-r2.log`、`http-v4-r2/…/source-boundary.json` |
| 官方 Host / 同一新包 v3 兼容模式 | **1 PASS，8.46 秒** | `http-v3.log` |
| 同一 v4 固定包 / Chrome headless | **1 PASS / 5 场景，12.29 秒** | `browser-v4.log`、`browser-v4/…/official-host/http-observations.json` |

Chrome 五场景：登录前拒绝；原生 CRM 登录 slot；原生命令、真实 loop/worker 与确认保存；刷新恢复同一回执；无 CRM/业务 preset 的普通原生对话。模型是本地 mock，不称为真实 DeepSeek。三轮 pytest 各有一项既有 warning，Node 的演练 fixture 有模块类型 warning；没有声称零告警或完整 B0/CI 通过。

测试控制器为已有 Python 3.14.4 测试环境；服务打包使用已有固定 FastAPI 0.141.1/Pydantic 2.13.5 环境。Node 24.19.0；没有升级环境或重建 DSH。源码兼容依赖与两个实际独立 runtime 的证据范围分开。

重跑组合入口（在仓库根，所有输出使用新目录）：

```bash
# PATH 先选择 Node 24；把下列 /absolute 路径替换为上文指定的实际固定输入。
# v4 模式不设置工作树专用的 B0_NATIVE_CRM_SOURCE_HTTP。
B0_NATIVE_CRM_HOST_UPSTREAM=/absolute/built-pinned-rc2 \
B0_NATIVE_CRM_ARTIFACT_MANIFEST=/absolute/input-v4.json \
B0_NATIVE_CRM_SERVICE_PYTHON=/absolute/pinned-build-python \
B0_NATIVE_CRM_SERVICE_WHEELHOUSE=/absolute/13-dependency-wheels \
B0_NATIVE_CRM_KERNEL_WHEELHOUSE=/absolute/15-dependency-wheels \
  /absolute/test-python -m pytest --noconftest -q -W error::ResourceWarning \
  --basetemp=/absolute/new-owned-output \
  backend/tests/test_analytics_first_purchase_official_host.py
```

浏览器轮次另设置 `B0_NATIVE_CRM_BROWSER_MODULE` 为现有 Playwright 的绝对模块路径。v3 回归改用明确的 `input-v3.json`。保护测试另设 `B0_BUILD_UPSTREAM`、`B0_NATIVE_CRM_KERNEL_RECEIPT`；完整输入均留在 OUT，旧输入和失败证据不重写。

## 失败、修复与清理

1. 原提交的单行 message 被 commit-msg hook 拒绝；补齐实现与验证说明后正常提交，没有跳过 hook。
2. `pair/receipt.json` 为真实 FAIL：第一次命令误用了测试解释器打基线包，固定依赖检查返回 `SERVICE_DEPENDENCY_VERSION_MISMATCH`。改用已有固定版本 build Python，在 `pair-r2` 完成，版本检查不变。
3. `http-v4.log` 为真实 FAIL：组合夹具新分离 `save-owner` 目录，却漏建安全存储要求的 `analyses` 子目录。修正测试 owner 初始化后，在 `http-v4-r2` 通过。没有改业务包、存储目录校验或旧输出。

`final-integrity.json` 记录：重试前后 **16** 个当前输入/包/回执/journal 的字节、大小和 mtime 不变；**13** 个旧包/journal/验收文件按已有 SHA 复核一致；三次成功组合及首次失败组合记录的 **23** 个 Host/查询/保存/worker PID 均已退出，6 个观测端口无监听。不是宣称扫描了整机进程。三次组合均验证安装后包文件与依赖闭包未变。

提交后的这批增量也已按 OCR delegate 复核 **15/15** 文件（7 个选中、8 个补审，无跳过）：目录初始化问题已经修复，未确认其他阻塞缺陷。当前 Ruff、差异检查和 232 个本地文档链接检查通过；`review-summary.json` 保存文件摘要与范围。原批 23 个审核文件已逐一对照 `git show f9726f68:<path>`，与提交前摘要一致。没有为这批演练驱动重打业务包。记录审核时增量尚未提交；后续正常提交只固定驱动与文档，不改变业务包来源。

## 剩余门禁

本机新来源的固定双包组合子项关闭。新包的 Windows/WSL runtime、冷安装与恢复为 **NOT_RUN**，旧包的 WSL 14 项不能继承。真实生产身份/候选准入、真实模型/业务 UAT、headed/移动端/无障碍、来源签名/SBOM、生产 activation/journal/reconcile/canary 仍开放。生产保存与激活没有开启。

源码中仍有本机兼容适配与传递导入；本次证明运行时数据库 owner 分离，不宣称已消除所有共享代码。后续继续目标环境与 G0/stop-go，然后物理分仓；不为了分仓替换官方 DSH 的运行时或插件 ABI。
