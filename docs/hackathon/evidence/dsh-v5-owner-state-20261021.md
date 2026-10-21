# DSH v5 现场身份与 IM 输入复核

日期：2026-10-21（北京时间）。

## 结论

`/srv/shinemage/dsh/current` 实际指向 `dsh-0.2.1-rc.1-core-main-20261020-v5`，服务 active/running，4328、18090–18094、18098 均在监听，重启计数为 0。

该目录是 v4 runtime 的现场副本，后续又追加了三项 `file:` 插件与 IM GitHub 依赖。现有 `release-marker.json` 仍是 v4/PREPARED，`candidate-profile-receipt.json` 记录的 profile SHA 为 `c3ec7df3…`。本回执保留 query.9 的历史观测，并由 [query.11/WeKnora 生命周期回执](dsh-weknora-lifecycle-hardening-20261021.md) 明确 supersede；当前 2026-10-21 重启后的 ephemeral profile 为 package `27566016…`、lock `ea643aa0…`。DSH 启动会生成新的 `runtime/plugin-packs-*` link 根并改写 profile，因此这些摘要只是观测快照。不能把 v5 追认成正式发布身份；本轮保留旧 marker/receipt 原字节，新增本回执记录真实现场。

## 输入身份

- upstream：`0.2.1-rc.1` / `1600d8a1e140dcde43a1a0941940a0480712c011`
- runtime archive：`d3d504dd39cd333fb98acf61cf4597664f6d4fda5482fb2ea970748bd2b8a94f`
- current ephemeral profile：package `2756601693ed99591eae91f2bba3ecef443715e4e62ec730b2ff599380df3ac8` / lock `ea643aa0cbd3aaeeeebd591f28ca005c0ee30667ea34e47bbc9173a8f7842287`；输入防护阶段的 `6c688d22…` 保留在 query.9 历史回执
- CRM：`0.0.0-crm.2` / tarball `1729e2c…` / 包内 manifest `35c3600…`；source commit 未留存
- Knowledge：`0.0.0-candidate.1` / tarball `63366d0…` / 包内 manifest `8e32a1b…`；source commit 未留存
- Query：`0.0.0-query.11` / `9046def0…`（本文件前端段保留 query.9 历史观测，当前身份以生命周期回执为准）
- IM：`@xmanrui/dsh-im@5.2.0` / `0b9cbc24…`
- Plugin hub：`dsh-plugin@2.0.5` / `dfd56ec5…`

机器可读完整值见 [dsh-v5-owner-state-20261021.json](dsh-v5-owner-state-20261021.json)；当前 side-load 修复、浏览器复测和 WeKnora 强制范围见 [query.11/WeKnora 回执](dsh-weknora-lifecycle-hardening-20261021.md)。query.9 文档只保留为历史演进与回滚证据。

CRM 和 Knowledge 的 rc1 owner side-load tarball 与 rc2 formal composer 使用相同包标签但不同字节。现有现场没有保存前两者的 source commit 或 generated pack manifest，因此只能按 tarball 与包内 `package.json` 识别。正式发布前必须从 reviewed source 重建，不能把现场 side-load 追认成正式候选。

## IM 缺口进展

两份 GitHub 归档已按线上 `pnpm-lock.yaml` 中的精确 commit、SHA-512 integrity 和包版本重新获取。两份归档的 SHA-256 分别为：

- `8d87caa71d921e9134b3d987a66ea59878ca445500703712c8b8053d49732d6d`
- `af455abd4d68f3d673e5003ae62a60ef42716a63a18dc7e1c5bbe1c78f976430`

归档、固定声明和校验回执保存在目标机 `/srv/shinemage/dsh/recovery/im-plugin-inputs-20261021/`。因此 `NOT_FOUND_IN_ARCHIVED_PLUGIN_INPUTS` 已不再成立；当前状态应记为 `PINNED_INPUTS_VERIFIED`，但正式发布仍需新的 runtime/profile 身份、发布者签名、独立验收和切换授权。

## 本轮已执行的操作

- 修复 query.8/query.9 半切换，完成 profile manifest、lock、冻结安装三者一致。
- 只受控重启本轮 `shinemage-dsh.service`，完成 query.9 与 WeKnora 强制范围复测。
- 将生产 WeKnora 薄适配层改为固定项目库 allowlist，并保留旧适配器回滚副本。
- 独立复核后补齐非数组筛选、文档 ID 搜索和缺失文档 ID 的 fail-closed 输入防护，再次备份旧 helper、替换并受控重启。
- 最终复核又禁用了上游 tenant-wide 文档名 enrichment；live 探针确认普通项目库 search 只请求 `/api/v1/knowledge-search`，并保留第二组 adapter/helper/overlay 回滚副本。

## 未做的事

- 没有修改现场 `release-marker.json`、`candidate-profile-receipt.json` 或 WeKnora 数据。
- 没有把 v5 标成 ACTIVE、PUBLISHED 或 `release_ready=true`，没有执行正式 canary 或杭州正式切换。
