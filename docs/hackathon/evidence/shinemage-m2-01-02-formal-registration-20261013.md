# M2-01/M2-02 主仓组合 candidate 与 service binding 登记（2026-10-13）

本轮将隔离目录中已经通过合同校验的九包组合 candidate、两份候选 profile 快照和 `release-state/v2` journal 登记到主仓 `config/candidates/shinemage-composition-20261013/`。只做本地文件登记，不启动服务、不切换 live、不激活、不发布。

## 登记对象

- candidate 文件摘要：`916826710c7e49124eb0d4284b8b2fe00f19c4dd46ddf181144761d566eefede`；内部 candidate digest：`125c8e538816835cad212048b8fd0302d98588d704b09de559789df9bf6e6bdb`。
- 两份候选 profile 快照：CRM `7ca35116…`，page `2df9934f…`。page 快照保留 `analytics-first-purchase` 的 `service_binding`；CRM 快照按组合合同保持无绑定。
- journal 文件摘要：`abd088d9b6e06793b85cefe72c867bc79e6157ca35c2f56672f518eafd8f4937`，链完整到 seq 4；最后事件为 `COMPOSITION_TERMINAL_HOST_OBSERVED`，release tag 为 `dsh-composition-5716227293a4d793fd779c71`。
- service gate 仍为 `LOCAL_COMPATIBLE`，source SHA `f9726f68…`，binding/evidence 摘要与隔离 candidate 一致。

## 验证

使用 `validateCompositionCandidate`、`validateProfile` 和 `readState` 读取主仓登记文件，并逐项核对 candidate、profile、journal 的文件摘要、candidate digest、release tag、journal 链和 service binding。定向回归：

```sh
node --test --test-concurrency=1 \
  scripts/release/composition-candidate.test.mjs \
  scripts/release/composition-host-evidence.test.mjs \
  scripts/release/profile.test.mjs
```

结果为 **7 PASS / 0 FAIL / 0 SKIP**；`jq empty` 与 `git diff --check` 也通过。`ocr delegate preview` 覆盖新增 5 个 JSON 文件，逐文件检查 JSON key 与摘要边界，无 High/Critical 发现。

## 边界

该登记形成主仓可追溯的 candidate/profile/journal 身份，但 `activation=NOT_RUN`、`release_ready=false` 仍保持。candidate-bound browser、真实模型/CRM/WeKnora UAT、SDK 供应链、release、canary、rollback 和生产切换继续按各自任务卡收口。默认 `config/dsh-profile*.json` 仍是无绑定组合输入，避免把运行时 service binding 反向耦合到源 profile。

机器摘要见 [validation JSON](shinemage-m2-01-02-formal-registration-20261013-validation.json)。
