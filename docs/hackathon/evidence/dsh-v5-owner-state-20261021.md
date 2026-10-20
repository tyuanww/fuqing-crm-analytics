# DSH v5 现场身份与 IM 输入复核

日期：2026-10-21（北京时间）。

## 结论

`/srv/shinemage/dsh/current` 实际指向 `dsh-0.2.1-rc.1-core-main-20261020-v5`，服务 active/running，4328、18091、18092、18093、18094 均在监听，重启计数为 0。

该目录是 v4 runtime 的现场副本，后续又追加了三项 `file:` 插件与 IM GitHub 依赖。现有 `release-marker.json` 仍是 v4/PREPARED，`candidate-profile-receipt.json` 记录的 profile SHA 为 `c3ec7df3…`，实际 profile SHA 已是 `7ec66b32…`。因此不能把 v5 追认成正式发布身份；本轮保留旧 marker/receipt 原字节，新增本回执记录真实现场。

## 输入身份

- upstream：`0.2.1-rc.1` / `1600d8a1e140dcde43a1a0941940a0480712c011`
- runtime archive：`d3d504dd39cd333fb98acf61cf4597664f6d4fda5482fb2ea970748bd2b8a94f`
- actual profile：`7ec66b32e44cc69f5b4941b82e48d7f32bc1ed7fbf7b677fdc0443e0702ae43a`
- CRM：`0.0.0-crm.2` / `1729e2c…`
- Knowledge：`0.0.0-candidate.1` / `63366d0…`
- Query：`0.0.0-query.8` / `2d8a241…`
- IM：`@xmanrui/dsh-im@5.2.0` / `0b9cbc24…`
- Plugin hub：`dsh-plugin@2.0.5` / `dfd56ec5…`

机器可读完整值见 [dsh-v5-owner-state-20261021.json](dsh-v5-owner-state-20261021.json)。

## IM 缺口进展

两份 GitHub 归档已按线上 `pnpm-lock.yaml` 中的精确 commit、SHA-512 integrity 和包版本重新获取。两份归档的 SHA-256 分别为：

- `8d87caa71d921e9134b3d987a66ea59878ca445500703712c8b8053d49732d6d`
- `af455abd4d68f3d673e5003ae62a60ef42716a63a18dc7e1c5bbe1c78f976430`

归档、固定声明和校验回执保存在目标机 `/srv/shinemage/dsh/recovery/im-plugin-inputs-20261021/`。因此 `NOT_FOUND_IN_ARCHIVED_PLUGIN_INPUTS` 已不再成立；当前状态应记为 `PINNED_INPUTS_VERIFIED`，但正式发布仍需新的 runtime/profile 身份、发布者签名、独立验收和切换授权。

## 未做的事

- 没有修改现场 `release-marker.json` 或 `candidate-profile-receipt.json`。
- 没有把 v5 标成 ACTIVE、PUBLISHED 或 `release_ready=true`。
- 没有重启服务、切换 symlink、修改 profile 或执行 canary/rollback。
