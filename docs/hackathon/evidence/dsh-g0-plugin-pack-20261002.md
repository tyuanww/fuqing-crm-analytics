# G0 T15 插件候选包边界证据（2026-10-02）

## 范围

本记录只验证插件包的边界，不验证 DSH 宿主激活、profile 切换、远端接收、GitHub Release、杭州主机或真实业务数据。打包器只接收一个明确的插件目录和一个新的输出目录；不会构建 DSH、上传、重启或写 release journal。

## 已执行命令

```text
node --test scripts/release/plugin-pack.test.mjs
```

结果：**4/4 PASS**。

覆盖内容：

- 合成插件使用固定 `@deepseek-ai/dsh-tools@0.1.7-rc.2`、`pnpm@11.7.0` 和 `type: module`，生成 tarball、SHA-256 和 `dsh-plugin-pack/v1` receipt。
- 未声明文件、源代码/测试路径、特殊文件和符号链接被拒绝。
- `workspace:*`、`file:`、`link:` 依赖被拒绝，避免把工作区或本地路径伪装成可发布包。
- 插件子目录必须属于干净 Git commit；receipt 记录 source SHA、包身份、DSH pin、tarball 大小和 digest。
- receipt 明确 `activation: NOT_RUN` 和 `state_path: NOT_APPLICABLE_PLUGIN_PACK_ONLY`，不把打包结果冒充已激活。
- 打包器先把 allowlist 文件复制到临时 staging，并移除 `scripts` 后再调用 `pnpm pack`；回归测试确认 `prepack` 不执行，防止插件生命周期钩子在收件流程中运行。

## 真实 workbench 结果

执行过：

```text
cd dsh-plugins/analytics-workbench
pnpm build /Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics-public/.context/dsh-b0/upstream-0.1.7-rc.2
```

第一次结果是 **NOT_RUN / 环境阻塞**。精确的上游 checkout 和 SHA 已存在，但该浅 checkout 尚未准备固定依赖，构建在解析 `vite/package.json` 时停止：

```text
Error: Cannot find module 'vite/package.json'
```

随后只在被忽略的 `.context/dsh-b0/upstream-0.1.7-rc.2` 中执行固定 lockfile 的 `pipeline.mjs --prepare`，没有修改上游源码或锁文件。重新构建结果：**PASS**。

- Node `24.19.0`、pnpm `11.7.0`。
- host/client full typecheck 通过。
- workbench host/client/views build 通过。
- 第一次构建发现一个旧的 `@deepseek-ai/dsh-tools` symlink 指向 pnpm store；删除这个忽略的生成链接后，toolchain 按设计重新绑定到精确 upstream 路径并通过。这个环境前置已记录为构建准备步骤，不是代码改写。
- 实际 pack 通过，tarball `440532` bytes，SHA-256 `49096d277731bb4b36f4368d74316d468e35eafcc71436b35f9d5a2eaee2c272`。包内只有 `package.json`、README、`cordis.patch.yml` 和四个明确的 `lib` runtime entry；未包含 source/test/maps。
- 第二个真实叶子包 `@shine-mage/dsh-shine-brand` 已在同一固定上游下完成 build 和 7/7 lifecycle/ownership 测试；受控 pack 在构建入口整理前曾通过，tarball `2444` bytes，SHA-256 `2e0a64e156d17c0c8017cd803ae049f3a81085acbb845f7bb66a3f09e8d7b5f8`。随后发现并修复六个叶子插件直接导入 `analytics-workbench/toolchain.mjs` 的耦合：新增 workspace dev-only `dsh-plugins/plugin-kit`，并由 `scripts/release/plugin-boundary.test.mjs` 固定“共享 kit、禁止 workbench toolchain 源码反向导入”。同时修复 funnel/waterfall 把 `src/` 暴露为运行时 export 的边界错误，改为构建时复制到 `lib/` 并只发布 `lib/`。这些入口改动尚未进入 reviewed commit，因此当前 worktree 上的 pack 会按 `PLUGIN_PACK_SOURCE_DIRTY` 拒绝，需 clean commit 后重跑两个真实 tarball。
- 最新 `node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python` 已完成 618 项 pytest、314 项 B0/Node 测试、七个插件构建和 clean-build 重建；生命周期钩子隔离和 `src/`→`lib/` 发布边界也已进入该链路。该证据证明构建闭包与清洁重建可重复，但不替代 clean reviewed commit 后两包重新打包。

第二个真实独立插件包尚未完成，因此“两套独立插件包构建”仍未通过；T15 仍为 PARTIAL。准备阶段曾报告 upstream build dependency closure 有 **1 moderate vulnerability**（`brace-expansion` 2.1.6）。已将 `build-tools/pnpm-workspace.yaml` 的 override 和锁文件固定到 2.1.7，重新安装并执行 `pnpm audit --prod --registry=https://registry.npmjs.org --json`，结果为 0 个漏洞；`scripts/release/supply-chain.test.mjs` 也把该锁定关系纳入回归门禁。签名、SBOM、来源信任和第二个真实包仍未完成，不能因此称 T15 完成。

## 当前边界

- T15：**PARTIAL**。合成包边界、4/4 pack 回归、拒绝规则、digest receipt、真实 workbench 与 shine-brand 构建/测试、共享 dev-kit 边界、funnel/waterfall `lib/` 发布边界和 build-tools 漏洞修复已有证据；clean reviewed commit 后的两包重打、签名/SBOM/来源信任仍待完成。
- T21：**PARTIAL**。`pnpm dsh plugin candidate` 已生成 profile/pack/capability/journal 收据；canary/rollback/远端 receive 和 clean reviewed commit 后的最新 candidate 仍待完成。
- T17：**PARTIAL / BLOCKED**。进程级 synthetic 失败边界通过；进程内 unload 和精确 DSH runtime 仍未完成。
- 本证据未授权任何 commit、push、tag、Release、远端切换或生产部署。
