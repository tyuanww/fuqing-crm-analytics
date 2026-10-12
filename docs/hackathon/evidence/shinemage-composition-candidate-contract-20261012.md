# 九包组合 candidate 合同（2026-10-12）

本轮完成 M2-01 的合同和入口实现。它只负责把两份固定 profile、九个正式 pack、service compatibility gate 和本地 journal 绑定成一个可验证的组合身份；不会启动宿主或服务，也不会提升 `activation`、`release_ready`、browser、recovery 或生产状态。

## 已完成

- 新增 `dsh-composition-candidate/v1` 合同和 `scripts/release/composition-candidate.mjs`。
- 新增 CLI：`pnpm dsh plugin composition-candidate`。
- 候选身份绑定两个 profile 摘要、九个插件 ID/路径/source SHA/manifest digest/pack digest 和显式 service gate。
- 隔离组合输出将 `analytics-first-purchase` binding 写入 page profile 快照，同时保留原 profile source digest；candidate profile 摘要按实际写出字节计算。
- service binding 或兼容回执未满足时，在任何 candidate 文件或 journal 事件写入前失败。
- 校验 profile 顺序、profile 插件集合、九包唯一性、tarball 文件名和所有 capability 的 `NOT_RUN` 状态。
- 相关回归 **68 PASS / 0 FAIL / 0 SKIP**；OCR 委托审查覆盖 3 个代码文件，修正死代码和 profile/plugin 集合错配后无开放发现。

## 当前边界

主仓两份正式 profile 仍没有写入 `service_binding`，因此隔离 candidate 不等于主仓正式 candidate。隔离接线已生成独立 candidate/journal，正式主仓注册仍依赖授权、非生产目标和后续宿主门禁；当前产品仍 `PARTIAL`、`release_ready=false`。

机器摘要见[validation JSON](shinemage-composition-candidate-contract-20261012-validation.json)。
