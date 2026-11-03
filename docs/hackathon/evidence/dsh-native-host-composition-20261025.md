# 原生 CRM Host 候选进入 rc3 组合

2026-10-25，主仓组合输入从 CRM 作者 `46111c5` 更新到已审核的 `ed5940fcfaa3bba3a41bb7c9c897d651ed635650`。这是候选输入更新，尚未证明真实 rc3 Host、页面 resolver、业务 UAT 或杭州切换。

## 固定身份

| 输入 | 身份 |
|---|---|
| CRM 严格 manifest | `b7af0ef3e194326b05b48721913e92608ac8ffe0f4663db736f7e74526c331a9` |
| CRM tarball | `43308d4de80f50698c308a493bb4f0dfbcf3ec6230308805371e050efdddb18f` |
| 组合锁 | `e7bacd9b542a8037e0aec2299988d78c2ae6c20ee783e91f1b07e64b8d2efa17` |
| 上传提交 | `756f8ead932134c7b5118b0aa2e5c4068b5e2a04` |
| 上传 CI | [40114375096](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40114375096)，成功 |
| 组合 artifact | `12568060723`，729736 bytes，有效期至 `2027-01-22T17:03:24Z` |
| ZIP SHA-256 | `b480988a6fa59adc6aee825802c43f4a77e81ada79b80b0325a5e4db6d4a6e95` |
| CRM 公共契约 | 作者 CI [40111888916](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/40111888916)，artifact `12567225935` |

CRM 仍为 `0.0.0-crm.5`，DSH pin 为 `0.2.1-rc.3`。源码 SHA 和内容摘要区分候选。新包声明 Host 实际使用的 `@deepseek-ai/dsh-session` rc3 peer；其余 peer 与上游 pin 保持。

## 实际接收

隔离上传分支只替换 CRM manifest 和 tarball。20 个 payload 中其余 18 个文件与原输入逐字节一致，包含其他八插件和一个领域包。没有把运输文件或上传提交合入主仓。

从真实 CI ZIP 下载后核对大小、SHA-256、run、head、未过期状态及成员字节。现有严格接收器通过九插件和领域的来源、manifest、tarball、生成证明及 peer 核验。旧锁配新包、旧 artifact 引用配新组合锁均被拒绝。

公共契约锁同步到同一作者 ed 的实际 CI 档案。31 份材料已从固定归档读回；CRM 的两份生成常量字节不变，不复制作者运行源码到主仓历史目录。组合锁、来源清单、artifact 引用和公共契约锁一起更新，三个既有 workflow 与接收器保持。

本地及远端检查按路径矩阵执行，当前结果看 [PR #164](https://github.com/tyuanww/fuqing-crm-analytics/pull/164) 的检查。作者代码、合成跨进程测试和主仓组合检查是不同层级，不合并测试数量作为业务验收。

## 尚未关闭

新 Host 来源能力仍须显式配置 `nativeSnapshot`，默认不启用监听。此包消费不自动接上页面 resolver，也不完成 WeKnora、真实登录、聊天诊断、看板保存恢复或两年 RFM/商品缓存验收。

来源清单的正式 main bundle 保持 `NOT_RUN`，删除门禁保持 `BLOCKED`，`release_ready=false`。没有合并 PR、部署、切换现役或访问真实业务库。

独立输入审查与注释检查使用用户已批准的 Codex CLI 同模型替代，不构成跨家族审计。注释检查无发现；输入审查未发现本范围新增、已确认的 P0–P2。完整 transcript 不可用，证据复核不代表完整历史独立审计。

本轮私有命令、准备及接收回执位于 `/private/tmp/dsh-rc3-final.ELtVwt/native-host-composition-r1/`，决策追加到 `/private/tmp/dsh-rc3-six-gates.f5NEEP/decisions.tsv`。这些临时路径用于本机接续，不是公开持久附件。
