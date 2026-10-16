# M2-07 consumer runtime closure 执行复核（2026-10-16）

## 结论

本次只执行了本机隔离的最终消费者 production-only 安装预检。安装在依赖解析阶段失败，不能形成正式 consumer runtime closure；公司发布环境的 production-only install、完整 dependency graph、SBOM 和独立验证仍为 `NOT_RUN`。

```text
company_execution=NOT_RUN
local_production_install=FAIL
closure_result=REBUILD_REQUIRED
release_ready=false
```

## 固定输入

```text
sdk=@deepseek-ai/dsh@0.2.1-alpha.4
candidate_source_sha=50d241cbd23aa2a9d188fe84c3864528a2206917
consumer_package=@shine-mage/dsh-crm-knowledge@0.0.0-crm.1
consumer_tarball=.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz
consumer_tarball_sha256=0954f1c9b66ff46151a20500132a370760c2383755a9c7faaacafc9bca474e06
node=v24.19.0
npm=11.17.0
```

Node 使用本机固定安装 `/Users/hutou/homebrew/opt/node@24/bin/node`。本次命令未修改仓库、未启动服务，也未读取受保护的 `security-audit-skill/`。

## 实际执行

在隔离临时目录执行：

```sh
npm install --omit=dev --ignore-scripts --no-audit --no-fund \
  --package-lock=false \
  .context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz
```

退出码为 `1`。npm 的真实错误为：

```text
ERESOLVE unable to resolve dependency tree
Found: @deepseek-ai/cordis@4.0.2
peer @deepseek-ai/cordis@"4.0.2" from @shine-mage/dsh-crm-knowledge@0.0.0-crm.1
Could not resolve dependency:
peer @deepseek-ai/cordis@"~4.0.5-alpha.2" from @deepseek-ai/dsh-tools@0.2.1-alpha.4
```

独立的 registry 元数据查询确认 `@deepseek-ai/dsh-tools@0.2.1-alpha.4` 的 Cordis peer 为 `~4.0.5-alpha.2`；当前消费者 tarball 的 `package/package.json` 仍声明 Cordis `4.0.2`。这两个约束不能在默认 production-only peer resolution 下同时满足。

## 门禁影响

安装未完成，因此本次没有合法的生产安装树：

```text
dependency_graph=NOT_GENERATED
production_install_resolves_all_runtime_imports=NOT_RUN
katex_runtime_closure=NOT_RUN
sbom_subject_matches_artifact=NOT_RUN
independent_verification=NOT_RUN
```

消费者 manifest 中 `dependencies.katex=^0.18.7` 的本地静态检查仍为 `PASS`，但它不能抵消 peer contract 冲突，也不能证明正式 closure。不得使用 `--legacy-peer-deps`、`--force` 或手工覆盖把这次失败改写为 PASS；那会跳过正式 peer 约束。

## 后续条件

需要先协调 alpha4 消费者的 Cordis peer 合同（或提供经过批准的兼容适配），然后重新生成受影响的 plugin tarball、manifest、dependency graph、SBOM、provenance 和签名输入，再重复 production-only install、KaTeX runtime import 与独立验证。该协调变更本轮未实施。

在公司环境完成上述闭包前，`M2-07=BLOCKED`，`release_ready=false`，不得进入 publisher signing 或 clean machine 门禁。
