# G0 T13/T21 插件候选入口证据（2026-10-02）

## 本轮范围

本轮把 profile 输入和本地插件候选入口接起来。入口只打包一个 profile allowlist 内的插件，生成本地 tarball、pack digest、profile digest、capability matrix、profile diff 占位、canary/rollback 状态和 durable state journal。它不上传、不重启、不激活、不切换杭州主机，也不读取业务数据库。

## 已执行验证

```text
pnpm dsh test
```

结果：**100/100 PASS**。

覆盖内容：

- `pnpm dsh plugin candidate --help` 暴露显式 `--plugin`、`--output-dir`、`--state-path`，profile 和 previous profile 为显式可选输入。
- profile 由 `config/dsh-profile.rc2.json` 唯一提供，加载时固定 DSH 0.1.7-rc.2、upstream SHA、包名、peer 和 build 入口。
- 插件不在 profile allowlist、state path 缺失、输出目录非空时 fail closed。
- 候选 digest 绑定 profile digest、source SHA、pack digest 和包身份；`candidate.json` 与 `plugin-pack.json` 原子写入候选目录。
- `recordEvent` 把候选准备结果写入显式 state path，重复/冲突由现有 journal 合同拒绝；没有隐式使用 `.context/release-evidence/state.json`。
- save/export/send 继续由 capability matrix 标为 `NOT_AVAILABLE`，canary/rollback 明确为 `NOT_RUN`，远端 receive 明确为 `NOT_AVAILABLE`，避免把本地 pack 冒充发布或激活。

## 当前状态

- T13：**PARTIAL**。profile 驱动已实现；release/receive 会在显式 state path 上记录 intent/result，reconcile/status/resume 缺少 state path 会 fail closed，promotion rollback 继续复用 durable journal。preflight state evidence 的打包、完整端到端 replay 和所有现场命令的统一仍待完成。
- T15：**PARTIAL**。合成 pack 规则和真实 workbench build/pack 已通过；build-tools 的 `brace-expansion` 漏洞已升级到 2.1.7，在线生产依赖审计为 0 个漏洞，并由 supply-chain 回归测试固定。第二个真实独立包、签名/SBOM/来源信任和跨包边界仍未完成。
- T21：**PARTIAL**。真实 workbench candidate 已生成：source SHA `fcbd1324ac5a4b7367d9d7d2bb9bbebdbf32ba25`，pack SHA `49096d277731bb4b36f4368d74316d468e35eafcc71436b35f9d5a2eaee2c272`，candidate digest `920337cd69f3dd15ac09cd435bbcc838f2f3deb875e2acf244bf91618cec5fea`，并写入一条 `CANDIDATE_PREPARED` journal。profile diff 仅在显式 previous profile 下计算，canary/rollback 仍 `NOT_RUN`，远端 receive 尚未接通，不能称为发布完成。
- 安全锁文件修复前的 worktree 尚未重新生成 candidate：plugin pack 合同要求插件源目录属于 clean reviewed commit，提交前曾按 `PLUGIN_PACK_SOURCE_DIRTY` fail closed。修复已提交为 `493a27cc`；旧 candidate receipt 只作为修复前证据保留，仍不能替代从该 reviewed commit 重新生成的 immutable candidate。
- `node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python` 已在同一工作树完成：Python 3.14.4 精确依赖闭包、B0 supervisor、618 项 pytest、314 项 B0/Node 测试、全部七个插件构建和 clean-build 重建均 PASS；没有启动服务、读取真实 DuckDB 或接触杭州主机。
- 审查修复后的最新本地回归 `pnpm dsh test` 为 **102/102 PASS**，另有 `node --test scripts/release/plugin-candidate.test.mjs` **3/3 PASS**；其中包含共享 plugin-kit、发布 `lib/` 路径、pack 生命周期钩子、candidate pending/journal 顺序和路径绑定边界回归。当前尚未从 `493a27cc` 重新生成 candidate；这一步必须使用 clean reviewed commit。
- T17：**PARTIAL / BLOCKED**。进程级 synthetic 证据通过，进程内 unload 和精确 DSH host runtime 仍未完成。
