# PR 审核问题修复（2026-10-26）

本轮修复此前确认的 F1–F8，并修复复审追加的三处边界问题。维护源为主仓 commit f40bdfb0 和 Workbench 作者仓 commit ca437f56。没有操作旧主工作区、业务库或杭州服务，没有合并 PR。

## 行为与兼容边界

| 问题 | 修复后的行为 |
|---|---|
| F1 绑定事实被普通保存的文案覆盖 | 预览与确认共用服务端校验，拒绝绑定事实、祖先、后代及不能可靠定位的文本覆盖；独立文案和样式仍可保存 |
| F2 旧版收件箱迁移后写入失败 | INSERT 明确列名，迁移后的新增记录、幂等与新连接回读一致 |
| F3 非 void HTML 的自闭合绕过 | 命名绑定和只读范围共用 namespace 规则；MathML 的 mglyph、malignmark 与合法兄弟文案保持区分 |
| F4 同比值被截断 | 商品和全店保留有限的真实 raw ratio，解除该业务输出合同的武断上限；Inf、NaN 仍拒绝 |
| F5 商品与全店跨闰年口径不同 | 共用 PeriodBuilder.yoy；回执带实际比较窗口，周表核验两端窗口和来源 |
| F6 正常文本误判导航 | 固定 Acorn 完整解析后识别导航 token；业务字符串、注释与正则正文保持原样 |
| F7 原生交付依赖未创建收件箱 | 新作者包保留基线已有的 native intake 修复，完整 core 含对应行为验证 |
| F8 弱统计指纹冒充版本 | verified 来源继续使用内容身份；legacy 返回 unknown 并绕过概览缓存，周表拒绝混合来源 |

复审另复现并关闭：对象除法被词法器误认正则、合法大额同比触发 HTTP 500、MathML 集成点误锁。导航使用完整 parser，未采用仍会漏判的独立 tokenizer。

未知来源的旧 Vue 周表会显示“数据来源未验证”，本轮没有新增 verified overview 路由。不能把安全拒绝写成该旧链路仍可用。商品计算语义变化使旧聚合缓存失效，杭州新版本的预热与业务复验仍须按后续发布流程完成。

HTML 范围验证采用保守子集，不承诺任意错误 HTML 的浏览器等价解析。Acorn 8.18.0 对少见合法语法也可能拒绝，例如异步函数表达式后直接除法；解析失败返回 INVALID_PAGE，保留原有 CSP 与沙箱。未迁移历史已应用的异常页面版本。

## 实际验证

所有业务数据使用合成 DuckDB 或 SQLite。Node 固定 24.19.0，Python 为 3.14.8。分组结果有重叠，不累计成总数。

| 入口 | 结果 |
|---|---|
| Workbench scripts/run-package-tests.mjs | 163 文件，1,325 PASS，0 FAIL，0 SKIP |
| Workbench 严格 host/client 类型检查和构建 | PASS |
| Workbench 固定输入检查 | 12 PASS |
| 后端页面写入交叉回归 | 203 PASS；两个外部作者输入用例另行补跑均 PASS |
| 商品、数据版本与接口合同组合 | 77 PASS |
| warehouse 来源、产品运行时、启动与数据版本 | 81 PASS |
| 合同 lint | 19 PASS |
| Vue 周表、vue-tsc、Vite 构建 | 13 PASS；类型检查和构建 PASS，保留既有大 chunk 警告 |

先前 category 交叉回归的 4 项真实归档测试按隔离条件跳过，不计通过。没有运行本轮真实浏览器、模型、杭州或完整业务 UAT。

OCR 初始范围 16/16 reviewable 文件与 5 个排除测试全部审查，追加的依赖、许可和 namespace 文件也有账本。独立复审使用两种 OpenAI 型号，不宣称跨供应方。导航复核 20 个探针通过，同比独立复现转为 HTTP 200，MathML 独立复核 87 项通过。当前范围没有剩余确认发现，不表示软件没有其他缺陷。

原生 no-comments 子任务两次未执行，技能状态 FAILED；按既有授权使用 CLI 只读替代审查，删除两组四行注释，保留解释外部 HTMLParser 语义的两行。没有新增抑制。详细命令、RED/GREEN、文件摘要与审查账本在本机 `/private/tmp/dsh-all-pr-fixes-20261026/`。

## Git 与候选包

主仓按完整目的提交：ce58cda8 修收件箱迁移，e33da20a 修事实保护，df8d5966 修商品比较与来源回执。Workbench 的 [PR #5](https://github.com/tyuanww/dsh-analytics-workbench/pull/5) 修绑定范围，[PR #6](https://github.com/tyuanww/dsh-analytics-workbench/pull/6) 修导航解析，两者按 #4、#5 的顺序叠放，均为 draft。

Workbench commit 9093147e 已在新 clone 中离线冻结安装、严格构建并通过正式 pack reader。manifest SHA-256 为 f5c545e0eaf580d5ee3db38443bdbf10cc4fd13e2ba86fd8b59e05a3cc5a09a7，tarball 为 3bbff8e90babd4c03ba5f054d930acea4522021bb2675c2a5d296328e030fa03。包为 482,034 字节，附 Acorn MIT 许可。

九包组合输入仅替换 Workbench，其余八个插件和领域包保持原字节。运输提交 a200bfd6 的 run 40317551623 已成功，artifact 12646823772 下载后严格回读通过，20 个 payload 与已审输入逐字节一致。归档 SHA-256 为 99b05508856388740d01990091656aef8b4a7d1c07c94040301abdf2df704c0c。仓内五份输入锁已同步这一候选，`activation=NOT_RUN`，`release_ready=false`。

Workbench PR #5、#6 的两项 PR CI 均通过。#6 的固定输入 run 40315804015 提供 1,325 PASS 的测试归档，31 份公共合同与主仓逐字节一致。作者 CI 的另一份 formal tar 缺少 generated provenance，严格 reader 已拒绝；组合采用上段本地干净构建包，不混用两份包身份。两份输入接收复审没有确认的 P0–P2 发现。

完整后端 synthetic-not-slow profile 在 e2a7ab84 为 3,886 PASS、81 SKIP、0 FAIL，前端为 236 PASS。全量后端的服务包检查先因本机 11 项依赖低于配方 pin 失败，改用新建隔离环境中的精确依赖后通过。下一次 push 的 B0 在启动前因验证输出目录未创建而拒绝，源码没有变化，也没有跳过 hooks；补齐独立输出根后，新五锁候选的完整 B0 precheck 已通过；Workbench core 仍归属固定作者 CI。最终 Git 结果以 PR 检查为准。
