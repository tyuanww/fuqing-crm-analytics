# G0 DSH source pin / static scan 证据（2026-10-02）

本检查只读官方仓库 exact tag，使用被 `.gitignore` 保护的浅 checkout；没有修改上游源码，没有构建或启动 DSH。

| Profile | Tag | Observed HEAD | Role | Static scan |
|---|---|---|---|---|
| `dsh-0.1.7-rc.2` | `dsh-v0.1.7-rc.2` | `477b4f420553e8a52c2fbccc464d7561b239c443` | 首期 blocking | `SUPPORTED` |
| `dsh-0.2.0-rc.2` | `dsh-v0.2.0-rc.2` | `639ed015397290b3745d163aafe02ffee4aa3f84` | 后续 advisory | `SUPPORTED` |

执行命令：

```bash
node scripts/dsh-b0/compatibility-matrix.mjs \
  --checkout-017 "$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" \
  --checkout-020 "$PWD/.context/dsh-b0/upstream-0.2.0-rc.2" \
  --sha-020 639ed015397290b3745d163aafe02ffee4aa3f84 \
  --output /tmp/dsh-compatibility-matrix.json
```

实际摘要：`overall=SUPPORTED`，两条 profile 的 `capability_slot`、`lifecycle`、`shell_tool_timeout`、`session_wal` source family 均有命中；scanner 只保留受控 source 文件名，排除了 tests、fixtures、Markdown、JSON 和 YAML，避免把源码内容或凭据写进 evidence。

同一组受控文件的 exact diff 结果：`apps/cli/src/profile-boot.ts`、`apps/cli/src/process-shutdown.ts`、`packages/client/ui-slots/src/index.ts`、`packages/core/tools/src/types.ts` 和 `packages/session/session-format-v0-to-v1/src/index.ts` 在两个 tag 间相同；0.2.0 的 `apps/cli/src/plugin.ts` 增加 Desktop profile/package-manager 处理，`packages/shell/tool-pwsh/src/index.ts` 增加 Windows 删除/变量安全提示，多个 package manifest 仅发生版本号升级。这个结果支持“0.2.0 不能静默替换 0.1.7 profile”的边界，但不替代运行时 session/WAL、timeout 或 unload 验证。

这不是运行时兼容性通过。in-process unload、真实 shell/tool timeout/result union、session/WAL 恢复和宿主崩溃隔离仍由 [G0 host evidence](./dsh-g0-host-feasibility-20261002.md) 记录为 `BLOCKED/NOT_RUN`，0.2.0 仍不能进入 0.1.7 profile。
