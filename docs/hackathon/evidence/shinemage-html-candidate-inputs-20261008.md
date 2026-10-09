# 当前 HTML candidate 输入准备（2026-10-08）

**“当前576项author/input尚未准备”这一纯本地准备项已完成。** 本页接续[先前差异核对](shinemage-html-candidate-gap-20261008.md)，原报告及旧输入保留。只执行现有输入校验，没有启动headed、DSH或服务，也没有build/重打包；当前候选UI与正式回执仍NOT_RUN，release_ready=false。

先核对前轮 `html-remaining-20261008/input.json`：它是原生观察控制器的简要输入，缺少原校验器要求的schema/head/author_plugin/source_files/upstream_sha/cli_sha256/pin_sha256共7字段，不能充作完整输入。本次没有覆写它。

新目录 `/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/html-candidate-inputs-20261008` 中，`input.json` 使用既有 **html-host-input-audit/v1** schema：

- 576个当前插件源码文件逐项与集成树已核对清单相同，按明确清单复制到独立author；没有递归复制依赖、库、缓存或会话。
- 5个lib文件从原candidate包逐字节取出，author合计581文件；不是新build，也未声称重新证明编译。另在received目录接收原包8成员。
- 复用原 `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b` tgz；candidate仍993daf31…、打包源bd647352…；input执行树HEAD为8aabaaeb…。
- Node24.19.0、Python3.14.4、固定DSH rc2/477b4f42、原CLI与pin摘要、de75f75c… runner均保留。

Node24.19.0执行本目录 `validate.mjs`，实际调用仓库现有 **validateProbeInputs** 和 **verifyReceivedMembers**，退出0：576个source/author摘要、8个包成员、HEAD、固定上游/CLI/pin与解释器检查通过。planned `headed-not-run` 输出目录没有创建。这个PASS只属于纯输入门禁，不是25项headed、设备、业务或正式candidate/journal通过。

新input SHA-256：`6edbb79b5faff4eeb2c3ea2f9fa165fc2cc02d1e89025fc0d63eb2cd7541bf42`。实际参数与结果见 [validation.json](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/html-candidate-inputs-20261008/validation.json)，逐文件author清单见 [preparation.json](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/html-candidate-inputs-20261008/preparation.json)。入口、原始引用和摘要见 [shinemage-html-candidate-inputs-20261008-validation.json](shinemage-html-candidate-inputs-20261008-validation.json)。

后续可直接在本执行树用既有 `html-host-browser-ui.probe.mjs --check` 消费该input；运行观察仍需按原入口另行执行并核验端口归属。本次没有运行旧headed，也没有改runner、放宽guard或写新schema。绝对路径绑定本树author与原candidate；复制归档不等于可随意改路径后复用原input摘要。

现在剩余的是当前candidate自身实际UI/身份回执，以及原生菜单/200% Tab焦点、真实设备、standalone页面包和probe外审原缺口。它们没有因输入准备完成而变成PASS；不重试已知无效CUA路由，不寻找或制作替代页面。
