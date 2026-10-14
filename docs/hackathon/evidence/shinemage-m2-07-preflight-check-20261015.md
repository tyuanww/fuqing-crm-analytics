# M2-07 正式 preflight 只读检查（2026-10-15）

本轮只执行正式 `preflight --check` 的只读路径，未创建 artifact、未访问 registry、未触发 workflow、未创建 tag、未签名、未发布、未部署，也没有修改凭据或受保护的 `security-audit-skill/` 目录。

## 实际命令

```text
node scripts/release/preflight.mjs --check \
  --python /Users/hutou/homebrew/opt/python@3.14/bin/python3.14 \
  --tag dsh-m2-07-local-check-20261015 \
  --output-dir "$PWD/.context/release-preflight/dsh-m2-07-local-check-20261015"
```

第一次按当前 shell 的 Node 25.8.2 执行时，检查额外报告 `NODE_TOOLCHAIN_REQUIRED`。随后显式使用项目固定的 Node 24.19.0 重跑：

```text
PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH \
node scripts/release/preflight.mjs --check \
  --python /Users/hutou/homebrew/opt/python@3.14/bin/python3.14 \
  --tag dsh-m2-07-local-check-20261015-r2 \
  --output-dir "$PWD/.context/release-preflight/dsh-m2-07-local-check-20261015-r2"
```

固定 Node 24.19.0、Python 3.14.4、pnpm 11.28.2、zstd、rc2 upstream `477b4f42…` 和 profile manifest 均通过识别；第二次检查因以下三项阻断并以 exit 2 结束：

| code | 当前事实 | 正确处理 |
|---|---|---|
| `RELEASE_BLOCKED_DIRTY_WORKTREE` | 工作树含受保护的 `security-audit-skill/` 未跟踪目录 | 保留该目录；正式发布需由发布环境提供干净 reviewed checkout |
| `PREFLIGHT_PLUGIN_PACKS_INVALID` | 未提供绑定当前 profile 的 `DSH_PROFILE_PACK_INPUTS` | 由正式候选准备阶段生成并核对九包输入 |
| `RELEASE_UPSTREAM_RUNTIME_REQUIRED` | 未提供 rc2 upstream runtime bundle | 由正式发布准备阶段提供与 upstream SHA 绑定的 runtime bundle |

这次检查没有改变既有结论：本地合同测试已通过，但当前候选仍缺正式 SDK artifact、完整正式 SBOM、发布者身份、最终签名/验签、撤销验证、干净机器安装/回退和 current-SHA attestation；M2-07 继续为 `BLOCKED`，`release_ready=false`。上述 preflight 阻断也不能通过删除受保护目录、漂移 Node 或复用旧 candidate 来绕过。
