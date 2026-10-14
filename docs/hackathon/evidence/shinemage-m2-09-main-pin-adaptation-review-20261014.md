# M2-09 主仓 alpha2 pin 适配审计（2026-10-14）

本次只审计主仓是否具备进入 alpha2 适配提交的完整边界，不修改主仓 DSH pin、插件声明、锁文件、正式 profile/journal 或 live/current。

## 已核对输入

| 输入 | 当前事实 |
|---|---|
| 主仓 DSH pin | `dsh-plugins/plugin-kit/toolchain.json` 仍为 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` |
| alpha2 候选 | `dsh-v0.2.1-alpha.2` / `d743267388641bc76f17c45ce8b4c231aed1d32c`，只存在于隔离 checkout |
| 主仓九包 peer | 全部仍声明 `@deepseek-ai/dsh-tools@0.1.7-rc.2` |
| 主仓 CRM/Knowledge Cordis | 正式消费合同为精确 `4.0.4`；不能直接替换成候选 runtime 的 `4.0.5-alpha.1` |
| 主仓锁闭包 | 可追踪的 Workbench 与 build-tools 锁文件仍解析 rc2；候选 workspace 的 peer 变更没有生成可移入主仓的 alpha2 锁闭包 |
| 默认入口 | 多个测试、探针、fixture 和操作文档仍显式指向 rc2 checkout；其中一部分是当前 B0/历史基线，不能用全局字符串替换处理 |

## 结论

当前不进入主仓 alpha2 pin 适配。只改 `toolchain.json` 或九个 `package.json` 会让声明、锁文件、Cordis 消费合同和默认验证入口互相矛盾，无法形成可回退的完整候选。该审计结论为 `MAIN_PIN_ADAPTATION_DEFERRED / MAIN_PIN_UNCHANGED`，不表示 alpha2 运行时失败，也不授予 release、activation 或 live 切换授权。

## 进入代码适配前的必要输入

1. 在独立 tracked candidate 中用 alpha2 upstream 重新生成九包 pack、profile、manifest 和锁闭包，并让每份来源摘要绑定 candidate HEAD。
2. 明确哪些入口属于 alpha2 candidate，哪些入口继续服务 rc2 B0/历史基线；通过参数或独立入口隔离，不能覆盖默认 rc2 路径。
3. 对 dsh-tools、Cordis、SDK bindings、host/client bundle 和插件 peer 做一次完整消费矩阵；至少重跑九包构建、自测、组合 lifecycle、browser 和 owned-host recovery。
4. 只有上述结果稳定后，才把主仓 peer/toolchain、相关文档和必要验证入口作为一个完整代码目的提交；该提交仍需 `open-code-review-delegate` 全覆盖、固定 Node 24 验证和本地 commit，之后才评估正式 profile/journal 与切换授权。

本次没有读取真实业务数据、没有启动或切换 live 服务、没有修改上游 DSH，也没有删除历史回执。原始候选与本审计互相引用，便于后续按同一边界继续推进。
