# rc2 web rollback input gap

本回执记录 rc2 web rollback 的真实输入缺口。它不把 rc2 SDK/CLI rollback 当成 web rollback。

## 结果

- 当前只有 `config/dsh-profile.rc2.json` 和 `config/dsh-profile.crm-knowledge.rc2.json` 两份源配置。
- `.context/checks/m2-07-rc2-local-materials-20261015/` 没有 profile-pack artifact、plugin-pack manifest 或 plugin-pack tarball。
- alpha4 profile inputs 的 reader 结果为 `PROFILE_DSH_PIN_MISMATCH`。实际 pin 是 `0.2.1-alpha.4` 和 upstream `86a402200d95fecef4529d969836f1fe13c6cb0d`。
- alpha3 profile inputs 的 reader 结果同样为 `PROFILE_DSH_PIN_MISMATCH`。alpha3 不能充当 rc2 web 输入。
- 旧 SDK/CLI rollback 回执的 `web_rollback` 仍是 `NOT_RUN_RC2_PROFILE_PACK_UNAVAILABLE`。

## 继续条件

先用 upstream `477b4f420553e8a52c2fbccc464d7561b239c443` 和固定 Node/pnpm 重建 9 个插件。然后生成带 `dsh-generated-bytes/v1` provenance 的 manifest、tarball 和 page/CRM profile inputs。reader 通过后，才启动 disposable rc2 web，执行同一 synthetic session、history、board 的 stop/start、headed browser readback 和 cleanup。

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```
