# DSH 插件作者 Quickstart

这条路径只验证一个插件包。DSH、CRM 服务、知识库和真实业务数据不随插件构建；插件失败时保留 DSH 原生对话。插件包默认不得覆盖原生标题、侧栏、会话或工具合同，未接通的 capability 必须显示 `NOT_AVAILABLE` 及原因。

## 前置条件

- Node `24.19.0`、pnpm `11.7.0`、Python `3.14+`。
- 插件位于 profile allowlist 中，包名匹配 `@shine-mage/*`。
- `package.json` 使用 `type: module`、`packageManager: pnpm@11.7.0`，并把 `@deepseek-ai/dsh-tools` 固定为 `0.1.7-rc.2` peer。
- `files` 只声明运行时 `lib/`、bundle patch 和必要的 README/LICENSE；不得包含 `src/`、测试、`node_modules`、source map、符号链接或 workspace/file/link 依赖。

<a id="plugin-contract"></a>
## 包合同

每个插件有自己的 `build.mjs`、测试和版本。构建期可以使用 workspace 内的 `dsh-plugins/plugin-kit`，但运行时只消费自身包、公开 DSH capability 合同和服务 API；不能导入 `analytics-workbench` 或其他插件的 toolchain 源码。profile 只组合已打包版本，不拥有插件源码。

## 三步本地路径

```bash
# 1. 只读检查当前 profile、工具链和本地合同
pnpm dsh doctor
pnpm dsh verify --scope local

# 2. 在插件目录构建和测试（upstream 路径必须是固定 checkout）
cd dsh-plugins/shine-brand
pnpm build "$PWD/../../.context/dsh-b0/upstream-0.1.7-rc.2"
pnpm test

# 3. 回到仓库根目录生成独立 candidate receipt
cd ../..
rm -rf /tmp/shine-mage-plugin-candidate
pnpm dsh plugin candidate \
  --plugin "$PWD/dsh-plugins/shine-brand" \
  --output-dir /tmp/shine-mage-plugin-candidate \
  --state-path /tmp/shine-mage-plugin-state.json
cat /tmp/shine-mage-plugin-candidate/candidate.json
```

候选回执绑定插件 source SHA、包 SHA-256、profile digest、固定 DSH pin、capability 和 `CANDIDATE_PREPARED` journal。`canary`、`rollback` 和远端 receive 在当前首期显示 `NOT_RUN`/`NOT_AVAILABLE`，这不是发布成功；不能把 tarball 直接放进杭州 current。

## 失败处理

`PLUGIN_PACK_SOURCE_DIRTY` 表示必须先完成 reviewed commit，再从干净 checkout 重打包；不要删除校验或使用 dirty 包。`PROFILE_PLUGIN_*` 表示 profile 与 package 合同不一致。候选输出目录必须为空，state path 必须是绝对路径并与后续 reconcile/status/resume 共用。真实 DSH 宿主、WSL2/WAL、远端回执和生产切换另有门禁与授权。

## 相关入口

- [rc2 Quickstart](./dsh-rc2-quickstart.md)
- [profile manifest](../architecture/dsh-profile-manifest.md)
- [release artifact reference](../reference/dsh-rc2-release-artifact.md)
- [当前状态](../../STATUS.md)
