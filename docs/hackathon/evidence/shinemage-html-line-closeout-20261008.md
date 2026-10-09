# HTML 线收尾交接（2026-10-08）

本工作树能执行的当前包观察已经完成。收尾方式是把已有结果交给主 Agent 收录，其余门禁保持原状态。没有新的设备、页面包、WSL2 目标或隔离窗口路由，本树不再重跑同一失败。产品仍 PARTIAL，`release_ready=false`。没有改产品源码、candidate、journal、主树 STATUS/TODOS，也没有 commit。

## 可以收录

当前包 `b75d90e9…`、candidate `993daf31…` 的 headed 观察：25 PASS / 0 FAIL，退出码 0，Chrome 154.0.8037.98，`headless: false`。原始结果在 `.context/checks/html-candidate-headed-b75-20261008/results.json`，SHA-256 `94a55fc113d9efb1bbe7b689a40998c8aa77133d0f32dafddef59f8247529d89`。说明见 [shinemage-html-candidate-headed-20261008.md](shinemage-html-candidate-headed-20261008.md)。

更早的 [缺口核对](shinemage-html-candidate-gap-20261008.md)、[输入准备](shinemage-html-candidate-inputs-20261008.md)、[原生路由](shinemage-html-native-route-20261008.md) 和 [剩余观察](shinemage-html-remaining-20261008.md) 保持原文。其中“当前包 headed 仍 NOT_RUN”是当时的快照；以本次 headed 记录覆盖这一句。旧包 `ecaa86…` 的 25 项仍只属于旧包。

## 停住的项

| 项 | 状态 | 继续所需材料 | 本树动作 |
| --- | --- | --- | --- |
| 原生 View 菜单、200% 人工 Tab 焦点 | NOT_RUN | 能绑定本次隔离 Chrome 窗口的输入路由，或有人在该窗口里操作 | 不再重试现有 CUA。它只能建用户 Chrome 的任务标签 |
| 真实读屏、真机触控、移动设备、Windows 高对比度 | NOT_RUN | 各自的隔离设备或环境 | 不把 CDP 缩放、Chrome forced-colors、Playwright 视口写成设备通过 |
| standalone 原测试 | NOT_RUN | 已有页面 JSON 的绝对路径，含 `window.RevenueReview`、`#kpiGrid`、`#chartBars`，交给 `html-rendered-text.test.mjs` 的原 named test | 不制作替代页，不重新搜索 |
| probe 外审 | 两次超时后未关闭 | 新的外部审查执行条件 | 不跑第三次 |
| 正式 source HTTP、terminal、browser 回执 | NOT_RUN | 已授权的真实 WSL2：Linux x86_64、内核含 microsoft 与 wsl2、UID 65534、Python 3.14。成功后按原链生成新 v5，再走原目标入口 | 本机已通过的 terminal 不重跑，也不当成目标通过 |
| 真实模型、真实业务 | NOT_RUN | 单独授权的模型与业务验收条件 | 合成 fixture 与模型 stub 保持原范围 |
| 正式 receipt、journal、`release_ready` | 未写、false | 主 Agent 在上述回执具备后，用已提交 SHA、对应包、匹配 profile 与 service binding 写入 | 本树不改 journal，不代写通过 |

SDK 来源门禁和 stop/go 的维护指标、具名主备属于其他线，不由本页关闭。

主 Agent 收录时只并入上面的 headed 记录和本页状态。不要把 25 项 Playwright 观察写成原生菜单、设备、WSL2、业务或正式候选通过。
