# T15：官方与插件包管理器拆分及新 SDK 验证

## 范围与结论

2026-10-07，从 `codex/plugin-boundary-review@7efb52070153da490ecf8bd6cb6678cdda9c9e86` 干净工作树继续。本批按用户授权本地提交，父提交为上述 SHA，实际提交号以 Git 为准；没有 push、发布、杭州操作或真实数据访问。

本轮关闭本机开发工具链的默认迁移：官方 DSH 的构建声明和 ShineMage 插件工具分别固定，实际已安装 kit 在新目录准备 SDK，再用新输入完成 10 个消费者的安装、构建和选定测试。产品仍 **PARTIAL**，SDK 分发仍 **BLOCKED / release_ready=false**。这是工具链维护批次，不是每次插件更新的前置构建。

| 合同 | 本轮结果 |
|---|---|
| 官方 DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，不修改源码 |
| 官方构建 manager | `upstream_pnpm=11.7.0`，匹配上游 packageManager |
| 自有构建 manager | `pnpm=11.28.2`，root、kit、build-tools 和 10 个消费者共 13 份清单 |
| 工具链 schema | `dsh-b0-toolchain/v2`，两个字段都必须是精确版本，旧 schema 不猜测 |
| 新 pin SHA-256 | `8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe` |
| 上游锁 SHA-256 | `5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa` |
| 实际环境 | Darwin arm64，Node 24.19.0，归档测试 Python 3.14 |
| 实际 SDK | **READY / 552.808 秒**，26 个 SDK 包、32 个 bindings；host/client 开发输出 |
| 新默认消费者验收 | **24 PASS / 0 FAIL / 0 SKIP**，10/10 消费者 |
| 生产 runtime | **NOT_BUILT**；完整 pipeline、WSL、新机器、GitHub CI **NOT_RUN** |

## 实现与边界

- `managerVersions` 集中验证两个角色；prepare 和 pipeline 按 cwd 的真实声明分别调用并校验版本。Corepack 不自动补写上游 packageManager。
- SDK 准备回执记录两者；官方 runtime preparation 和 dsh-dev 来源回执继续记录上游 manager，避免把旧 runtime 标成由插件 manager 构建。
- 插件打包与 readiness 读取自有版本；CI 从项目声明安装并与工具链比对，不再重复写死全局版本。CI 增加 kit/pipeline 等维护入口触发，未增加整个 `dsh-plugins/**`，避免普通插件业务修改触发完整 runtime 构建。
- 更新边界清单中的来源摘要；领域 tarball、所有 tracked 锁/补丁、运行时合同和官方源 SHA 不变。kit 仍是 private `0.1.0` 本地包，未发布 registry。
- pin 字节改变意味着新的 SDK 身份，不能直接借用旧 closure。实际旧 kit + 旧 SDK 返回 READY；新 kit + 旧 SDK 返回退出 2 / `KIT_CLOSURE_IDENTITY`。旧 kit 的来源为 HEAD 的 tracked 文件导出，没有 reset/checkout。

## 真实执行与失败处理

原始记录统一保存在工作树 `.context/checks/kit-manager-split-20261007/`。该目录是本地证据，不纳入可分发包，也未上传。

1. 在自有目录实际 pack 并离线安装 kit，调用安装后的 `prepare.mjs`。首次源码获取在 180 秒超时，失败目标 `sdk-inputs` 和 `prepare-result.json` 保留。
2. 检查本机已有网络配置：系统代理已启用，但当前 shell 未显式传入代理；有界直接请求超时，经现有 loopback 代理访问同一公开 GitHub 地址成功。因此仅本次在线阶段显式传入 HTTP/HTTPS 代理和 loopback NO_PROXY，并使用 `--ca-file /etc/ssl/cert.pem`，在另一个新目录 `sdk-inputs-r2` 重试。没有关闭 TLS、改全局 Git/代理或覆盖失败目录。
3. 新准备完成：官方冻结安装 272.005 秒、host 133.327 秒、client 98.436 秒、自有工具安装 10.473 秒；完整命令 552.808 秒。来源树 `e3e63253d1d35ad07f785273235c40813cb6c8bd`，源码 clean 检查通过。准备结果仍明确 `supply_chain=NOT_VERIFIED` / `production_runtime=NOT_BUILT`。
4. 新缓存 pnpm 11.28.2 的 454 个原始 tar 成员与先前已核验来源匹配，来源包 SHA-256 `30d4099fa03b9ba1124d81527808b1e4d8e719aeb0ddfe169426df3c4a038a5f`。该字节核对不是本轮完整 SDK 漏洞/签名审查。
5. 第一次消费者套件为 23 PASS / 1 FAIL：10 个消费者已全部通过，但验证脚本的 PATH 漏了现有 zstd，工具定位测试失败。只修正本次 runner 的 PATH，在新 HOME/TMPDIR 复跑同一套件，最终 24 PASS / 0 SKIP，耗时 45.332 秒（含 SDK 前后核对的 runner 68.718 秒）。

消费者采用新 upstream/build-tools/Corepack，未设置候选版本 override。macOS sandbox 拒绝外网、原 SDK/旧依赖读取以及新 SDK 写入；只允许 synthetic loopback。实际核对 **140821 个内容/链接/权限条目不变**。十个消费者为 board-components、shine-brand、shine-query、shine-board、shine-crowd-action、shine-funnel、shine-waterfall、crm-knowledge、knowledge、analytics-workbench；每个均通过已安装 kit 构建及其选定测试，不能外推全部业务 UAT。

## 验证命令与结果

下列 Node 命令均使用现有 Node 24，隔离 HOME/Corepack、准备好的精确依赖和禁止外网的 sandbox；完整 argv/cwd/允许环境记录在对应 `*-command*.json`。

| 命令/范围 | 本次实际结果 | 原始记录 |
|---|---|---|
| 安装后 `prepare.mjs --destination <new-sdk> --ca-file /etc/ssl/cert.pem` | 首次 timeout；新目录重试 READY | `prepare-command*.json`、`prepare-result*.json`、`sdk-inputs-r2/preparation.json` |
| `node --test scripts/dsh-b0/plugin-kit.test.mjs scripts/dsh-b0/package-manager-env.test.mjs` | 首次 23/24；修正 runner PATH 后 **24/24，0 SKIP** | `consumers-command-r2.json`、`consumers-result-r2.json`、`logs/consumers-r2.log` |
| package-manager-env、plugin-kit-prepare、package-inputs、clean-build、plugin-boundaries | 首次 **39 PASS / 1 FAIL**；失败为 pin/清单变更后的生成边界摘要待更新 | `guards-command.json`、`logs/guards.log` |
| `node scripts/dsh-b0/plugin-boundaries.mjs --write` | 按真实当前文件再生成摘要；未新增跨包依赖 | tracked boundaries JSON |
| `node --test --test-concurrency=2 scripts/release/*.test.mjs` | **478 PASS / 1 FAIL / 0 SKIP**；失败为旧测试仍要求 CI 写死全局 pnpm 11.7.0 | `release-command.json`、`logs/release.log` |
| 上述五套 + release.test + dsh-dev/pin.test | 修正 CI 合同断言、边界清单后 **87 PASS / 0 SKIP** | `guards-command-r2.json`、`guards-result-r2.json`、`logs/guards-r2.log` |
| `node --test --test-name-pattern='^release preflight builds the runtime' scripts/release/release.test.mjs` | 最终 CI 触发限定后 **1 PASS** | `logs/ci-trigger-final.log` |
| `python3.14 -m pytest --noconftest -W error::ResourceWarning -q scripts/dsh-b0/test_sdk_archive.py` | **27 PASS / 41 subtests PASS** | `logs/archive.log` |
| 变更 mjs 的 `node --check`、CI manager shell 的 `bash -n` | **PASS** | `syntax.json` |
| 旧 kit/旧 SDK 与新 kit/旧 SDK 真实只读预检 | **READY / 预期 BLOCKED** | `old-sdk-compatibility.json` |

这些套件有重叠，不相加宣称总通过数。完整 release 首轮的失败保留；修复后重跑了失败文件及相关套件，没有冒充再次完整 479 PASS。消费者用当前 v2 新输入重新运行，不沿用上一轮 11.28.2 候选数字。

## 输入保护与可复核性

- `protected-inputs.json` 确认安装后准备配方/pin/build-tools 与当前源码一致、tracked 锁/patch 未变化。
- 图表领域包 SHA-256 保持 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`，消费者原锁保持。
- 旧首购 `candidate.json` SHA-256 保持 `cb5a24e0183a41af75cc09bdbb9dd44be4c38ae2fecd185166de83e3f4787833`；`plugin-state.json` 保持 `b9ef9b1730abf2f9acfe0ba48473323e8aece9a4b8d85e79783932c9fe7f0149`。
- 原缩减 SDK 的 closure `7fa86cc9cc190f64735378e5a5bc2b1b74aece33aaa0f2b6b816c91492bcfdc6` 保留，不修改其旧准备回执来伪装 v2。

## 剩余与推进顺序

1. 对新身份 SDK 重新生成最小开发输入、归档接收并验证消费者；旧 pin 的 63.75 MB 包不能成为本次新 pin 的证据。
2. 对新字节重新做内容/完整 SBOM/CVE、发布者身份/签名/撤销与不透明文件审查。新完整准备中仍包含官方 11.7.0，不能宣布旧 SDK 的 10 版本/42 公告被本次升级清零。
3. 官方 DSH 升级独立验证其源码/依赖/合同，不为清除公告而改固定上游源码；新 SDK 的目标平台/WSL、整台干净机器和其他服务安装仍开放。
4. 未覆盖宿主/UI/生产形状验收与 stop/go 完成后再做物理分仓和独立 CI。

本轮保持用户初衷：官方 DSH 独立跟随固定上游候选，插件独立开发，业务服务/数据各归 owner。尚未发布的开发工具迁移不能被表述为全部解耦、生产升级或发布已收尾。

## 本地提交前检查点

本次按仓库 `/review` 要求检查当前增量，主审覆盖 41 个路径的差异和新增证据；宿主内只读对抗复核未发现可行动缺陷。对抗复核对 7 份测试文件只看摘要，主审读取测试变更并实跑受影响入口。范围不扩展到整个长期分支或 PR；未调用外部模型，也不产生完整分支发布批准。

本次重新运行 `node --test scripts/dsh-b0/package-manager-env.test.mjs scripts/dsh-dev/pin.test.mjs scripts/release/runtime-inputs.test.mjs`，**20 PASS / 0 SKIP**，包含真实嵌套 manager、错误声明、runtime 身份和离线 pnpm deploy；日志 `logs/review-smoke.log`，完整调用 `review-command.json`。上一轮 41 文件与 `final-checks.json` 字节相符，之后只更新本节和提交状态文字，不重跑未受影响的整套构建。已知 SDK 分发/目标平台缺口保留，当前局部审查无未关闭缺陷。
