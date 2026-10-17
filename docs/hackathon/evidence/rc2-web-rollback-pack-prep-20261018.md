# rc2 web rollback pack preparation and reader verification

本记录更新 rc2 web rollback 的输入状态。它只覆盖固定 rc2 pack 重建、profile inputs 生成和 reader；不把 host、headed browser 或正式回退写成完成。

## 结果

- 固定 SDK：`@deepseek-ai/dsh@0.1.7-rc.2`。
- 固定 upstream：`477b4f420553e8a52c2fbccc464d7561b239c443`。
- 固定 Node：`v24.19.0`。
- 固定 pnpm：`11.28.2`。
- 网络模式：`offline`。
- 9 个独立 checkout 均执行了 `build.mjs`，9/9 exit `0`。
- 9 个 `plugin-pack.mjs` 均 exit `0`。
- 9 个 manifest SHA 与 `config/shinemage-composition-packs.lock.json` 全部一致。
- 9 个 pack 的 `generated_bytes_provenance.schema_version` 为 `dsh-generated-bytes/v1`，`status=PASS`。
- 生成了 page profile 的 7-plugin inputs 和 CRM profile 的 2-plugin inputs。
- 直接 profile/pack reader 为 `PASS_RC2_PROFILE_PACK_READER`。
- 官方 resolver composition integration 为 `9 PASS / 0 FAIL / 0 SKIP`。

## 输入和输出

- 重建任务目录：`/Users/hutou/.codex/tasks/rc2-web-rollback-20261018/rebuilt-r2`。
- 新 builder receipt：`/Users/hutou/.codex/tasks/rc2-web-rollback-20261018/rebuilt-r2/receipts/`。
- 新 pack：`/Users/hutou/.codex/tasks/rc2-web-rollback-20261018/rebuilt-r2/packs/`。
- page/CRM prepared inputs：`/Users/hutou/.codex/tasks/rc2-web-rollback-20261018/rebuilt-r2/reader`。
- page inputs SHA-256：`88d23bda388bc908e2601009e1f7d3ded9fd7e348f03bab84a855af4b6dd4a7e`。
- CRM inputs SHA-256：`3ef9dc670a501ef467db412751faf305d19deec5b1a3944fdf41868a667ba015`。
- preparation SHA-256：`08171d1357f72087ece4ccbe094f695bb7fafa6c0431b5455fb525ceb6927eee`。
- direct reader SHA-256：`11c19d232467626cc221fe28b0ba6204b11955d321de2cd58bdae0ef2d8ee1f8`。
- integration log：`/Users/hutou/.codex/tasks/rc2-web-rollback-20261018/rebuilt-r2/integration-reader.log`。

## 仍未执行

本轮没有启动 disposable rc2 web host。以下项目仍为 `NOT_RUN`：

1. rc2 host activation。
2. 真实 headed browser history/board 回读。
3. stop/start 后的同一 session/history/board 回读。
4. rc2 web rollback cleanup。

## 正式状态

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```

旧的 [rc2-web-rollback-input-gap-20261018](rc2-web-rollback-input-gap-20261018.md) 是本次 pack 重建前的输入快照。它不覆盖本记录。

机器回执：[rc2-web-rollback-pack-prep-20261018.json](rc2-web-rollback-pack-prep-20261018.json)。
