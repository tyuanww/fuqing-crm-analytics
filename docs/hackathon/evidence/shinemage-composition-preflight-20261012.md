# 当前正式组合输入预检（2026-10-12）

本页记录当前三份作者仓正式包接入九包组合前的离线输入准备。它只证明包身份、两份 profile 和组合锁可以生成固定输入回执；不证明宿主、服务、目标平台、terminal/browser、candidate/journal 或真实业务准入。

## 实际命令

使用固定 Node 24.19.0、Python 3.14.4，读取当前主仓组合锁和六份既有正式包，再加入本轮 Workbench、CRM、Knowledge 的真实 PR CI formal pack：

```text
/Users/hutou/homebrew/opt/node@24/bin/node scripts/ci/composition-pack-inputs.mjs \
  --input-dir /Users/hutou/.codex/tasks/shinemage-current-composition-inputs-20261012-r2 \
  --output /Users/hutou/.codex/tasks/shinemage-current-composition-preflight-20261012-r2/output \
  --python /Users/hutou/homebrew/opt/python@3.14/bin/python3.14
```

命令退出码为 `0`。原始回执位于任务目录的 `output/preparation.json`，SHA-256 为 `4a7b9cf996ea28e07168e4ee0ef2a3fbd6152b567371bac1d919471ed7c6e400`，4024 bytes；本页的机器摘要见同名 `-validation.json`。

## 回执事实

- schema：`shinemage-ci-composition-preparation/v1`
- 组合锁 SHA-256：`be215557e46c78c6c15b738e1a15dd22281770bee438f30960fbf0de3f4437eb`
- profile：`config/dsh-profile.crm-knowledge.rc2.json`（`7ca35116…`）和 `config/dsh-profile.rc2.json`（`c8c9df8c…`）
- 当前三份作者包：Workbench `3030e3f…` / manifest `90000400…` / pack `b75a5c90…`；CRM `dac0539…` / manifest `4ee58ec3…` / pack `89e6f69c…`；Knowledge `f623c22…` / manifest `feb1187c…` / pack `73641493…`
- 六份既有包沿用组合锁中已核验的身份，没有重写历史回执
- `host=NOT_RUN`、`remote_ci=NOT_RUN`、`release_ready=false`

这次预检把“正式 pack 身份和组合输入可复现”与“目标宿主实际准入”分开记录。当前 profile 仍没有新的 `service_binding`，所以不生成 candidate、不写正式 journal，也不把本次输入预检记作发布通过。
