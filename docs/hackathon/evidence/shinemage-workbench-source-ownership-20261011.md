# Workbench 当前 Git 交付与源码测试归属（2026-10-11）

Workbench 原八文件的两笔提交已按授权推送现有 [PR #1](https://github.com/tyuanww/dsh-analytics-workbench/pull/1)，当前远端和作者仓均为 `fd46b34d04ddf143811fd1eba7ef2ff6c3ca230b`。四项 CI 均为 SUCCESS。扩大作者测试提案只在隔离执行树，尚未应用、提交或运行新 hosted CI；主仓仍保留原源码阶段。本记录覆盖此前“原八文件未提交／新 CI 未跑”的当前句，历史记录保持原文。

## 原八文件 Git 交付

| 提交 | 完整目的 | 路径数 |
|---|---|---:|
| `74afa7a1f4f562105b085e83b062bb0b7faefa01` | 声明并守卫实际运行 peer | 4 |
| `fd46b34d04ddf143811fd1eba7ef2ff6c3ca230b` | 补固定测试输入和原作者验证入口 | 4 |

正常 push exit 0，无 force 或 hook 绕过。PR 和 push 两组分别有边界与完整构建 CI；完整链各自实际运行 30 文件、212 PASS / 0 FAIL / 0 SKIP，不相加。[PR 完整 CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38104163773)、[PR 边界 CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38104163836)、[push 完整 CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38104161742)、[push 边界 CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38104161545)均确认当前精确 head。完整链的普通 content pack 为 `f5e9dfe41859b0ae3254cbaddf12a128e89cd3c53bde82b84f366beef03ae5d7`，441127 字节。这些结果没有生成正式 candidate，也没有合并、Release、发布或部署。

原始 run JSON、日志及其摘要在 `/Users/hutou/.codex/tasks/shinemage-workbench-local-commits-20261011-dhz_zzgd/remote-ci-r1`。现有 PR 已更新到新 head，不另开 PR。

## 未应用的作者测试提案

提案目录：`/Users/hutou/.codex/tasks/shinemage-workbench-source-ownership-20261011-z3fuanpd`。执行副本实际仍是旧 Git HEAD `92dfa171…` 加逐字节绑定的八文件 overlay 与增量，不是新干净提交；应用基线明确为现有作者提交 `fd46b34d`。

- 作者入口从固定命令串扩展为发现本包六个根下的全部测试：154 core、2 browser、1 standalone。旧 30 文件全在 core，编译 host/skills、私有视图、授权与交付检查仍归作者。
- 主仓当前 141 源码测试文件映射为 139 core + 2 browser；Python 业务 eval、实际 backend 模型与 decoder 对照、主仓 query scenario/serve 编排三组仍由主仓执行，原文件与主仓 `5390667c` 同字节。主仓 pipeline 没有切走旧阶段。
- 十五份冻结合成合同 JSON 与主仓同一提交的源文件同字节，并有路径/摘要/长度锁；不复制 backend 或宿主/服务实现。
- 固定官方 lib 清单仅增加精确 `dsh-client-modules@0.1.7-rc.2` 的 10 成员，113 条旧记录不变，提案为 114 包/1542 成员。ui-layout 检查改用官方实际 `/client` 工厂，不把未公开内部类复制进作者仓。
- 新输出根以 EEXIST 拒绝复用；冻结输入的缺失、同长摘要漂移、文件/父目录/锁 symlink、重复和越界路径均拒绝。未运行 browser 和 standalone 保持 NOT_RUN，不制作替代页面。

## 实际验证范围

| 层级 | 实际结果 | 限定 |
|---|---|---|
| macOS r3 core | 154 文件、1072 PASS / 0 FAIL / 0 SKIP | 后续官方 client 修改定向两文件 16 PASS、导入清理 HTML 20 PASS、最终守卫 8 PASS，各自另记，没有重跑完整 core |
| Linux x64 r4 core | 154 文件、1072 PASS / 0 FAIL / 0 SKIP | 严格 host/client 类型检查、构建、链接各 exit 0；该轮打包目录遗漏使 wrapper 仍为 FAIL |
| Linux r6 定向补跑 | 输入守卫 8 PASS；计划和内容包 exit 0 | 不重跑 core；重复打包 EEXIST，首包不变 |
| OCR delegate | 25/25 可审条目覆盖，0 跳过，无未解决发现 | 另查 3 份说明、15 份冻结输入；当前主 Agent 审查，没有外部 LLM 调用 |

Linux r6 普通内容包与此前 Linux 包及本次已推送 CI 的内容包同字节，8 个成员；不继承旧正式包的验收身份。macOS 归档压缩字节不同，8 个解出成员逐字节相等，不把平台计数累加。

macOS 只对列明主仓/原作者路径拒读，固定 upstream/build-tools 只读放行，不是整机不可读。Linux owned consumer 未挂主仓/原作者树，复用固定依赖闭包；不是 WSL2，也未新建整套 SDK 安装。首轮缺模块、挂载所有权、夹具复制和打包目录等失败轮完整保留，没有把 r4 wrapper 改成 PASS。完整原始摘要见 `/Users/hutou/.codex/tasks/shinemage-workbench-source-ownership-20261011-z3fuanpd/summary-r2.json`。

## 增量与下一步

唯一提案增量：`/Users/hutou/.codex/tasks/shinemage-workbench-source-ownership-20261011-z3fuanpd/product-delta-r2.patch`，40 路径、SHA-256 `180ed79edba9a79f225b715dcf76fcdb804bc0c33af6770b0cfdaa9a9249feb1`，120507 字节。针对现有干净作者仓 `git apply --check` exit 0；没有应用四个继承的运行文件，也没有提交新提案。可审交接为 `/Users/hutou/.codex/tasks/shinemage-workbench-source-ownership-20261011-z3fuanpd/HANDOFF-r2.md`，机器记录见[同名 validation](shinemage-workbench-source-ownership-20261011-validation.json)。

先单独审定/集成作者增量、追加提交并验证该 head 的新 CI，再从干净提交产出新正式 pack/profile 输入并迁移主仓消费者；满足 stop/go 后才能清理历史源码。当前推送授权仅覆盖已有两笔，不含本提案、合并、发布或部署。Cordis 精确 4.0.4 提案仍待 owner 校准，原两作者声明仍为 4.0.2；主仓已有迁移代码仍未提交，正式组合/目标/browser/回退、真实模型/CRM/WeKnora/UAT、安装发布和独立 DSH 升级未收尾。SDK 分发仍 BLOCKED，产品 PARTIAL，release_ready=false，VERSION 不变。
