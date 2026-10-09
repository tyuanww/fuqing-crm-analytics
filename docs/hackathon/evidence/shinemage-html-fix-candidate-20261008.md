# HTML 保存提示修复：本地提交与新候选验收（2026-10-08）

本次按用户“确认授权”仅提交已审的七文件修复，并以原入口生成新插件包、新 candidate、新 journal，完成新包自身的 headed 与 WSL2 合成组合验收。未 push、开 PR、合并、发布或部署。产品仍 PARTIAL，SDK 分发仍 BLOCKED，`release_ready=false`。

## 提交与产物身份

- 本地提交：`f8db3949a7323c1e058c4d57f6287d4dbf54451d`，父提交 `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`。
- 标题：`fix(workbench): clear stale unsaved notices after editing`；正常 pre-commit / commit-msg hooks 通过。
- 保存引用：`codex/shinemage-html-save-status-fix`；checkout 仍 detached，没有切换分支。
- 恰好七文件：四个源码/测试文件、CHANGELOG、两份交付准备文档。没有顺手提交其他历史文档。VERSION 仍 `0.20.0.0`。
- candidate：`fd1fba4cf141c9b41fdcca5a881601b39cdfbebef5d5120ccb7d8a2cc29ca703`。
- 插件包：`a0d5dd08c5e97237fc38033f929eec33627ac42efa594a5ca5c87a0ee311d6b2`，438,480 字节，8 个成员；与 b75 包相比只有 `package/lib/client.js` 改变。
- 沿用 `first-purchase-source-http-local`，profile SHA `be3948850fc414ce1524226a544783de1ecb3253514cc7f1d8f3280280b3d0af`；服务源码 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`，原固定 service binding / pair-r2 未改。
- DSH 仍 `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`。

修复移除了离开确认时把临时“未保存”提示写入持久面板 notice 的操作，干净退出编辑统一显示“浏览中。已结束编辑”。busy/dirty 阻止离开的原逻辑保持；三项回归覆盖干净退出、留在页面再保存、放弃后重新编辑保存。

## 验证范围与实际结果

| 项 | 本次结论 | 执行口径 |
|---|---|---|
| 定向回归 | 103 PASS | 复用同字节源码/日志证据，不宣称新跑；修前三失败保留 |
| 作者 build + host/client full typecheck | exit 0 | 前置准备实际禁网运行；提交后另核对全部 576 个 Git blob 与作者快照一致，复用对应产物 |
| 新包本机 headed | 25 PASS / 0 FAIL，exit 0 | 原 probe，14.08 秒，Chrome 154；不借用 b75 或 ecaa86 结果 |
| 新组合 WSL2 source HTTP | 10 PASS | 原 combined runner 一次运行，真实当次 platform receipt |
| 新组合 WSL2 terminal | 1 PASS / 2 warnings | pytest 79.04 秒；combined 回执 88.71 秒 |
| 新组合 WSL2 browser | 1 PASS / 2 warnings，5 场景 | 原 runner 一次，pytest 80.23 秒，外层 82.628 秒；Chrome 151 headless / Playwright 1.62.1 |
| 原正式 artifacts/source/terminal/browser 校验 | 四次均 exit 0 | 顺序写入新 journal seq 3–6；未改门禁 |
| 独立复核 | 0 条可行动发现 | 七文件、576 Git blob、8 包成员、摘要父链及真实归档关联；不代替未完成的 probe 外审 |

本机 headed 的原截图 `02-after-cancel.png` 显示版本 1、原合成标题；`03-saved-v2.png` 显示版本 2、已保存标题。两张都显示“浏览中。已结束编辑”，旧未保存提示没有残留。主 Agent 与 B 分别查看了原图。这是截图观察与原状态断言的结合，没有声称新增自动 DOM 断言。

本机控制器 Node 24.19.0 / Python 3.14.4；目标 WSL2 x86_64，内核 `6.18.33.2-microsoft-standard-WSL2`，Python 3.14.4，执行 UID 65534。目标已有 Node 24.21.0 满足原 Node 24.x 运行契约，未改本机固定版本。没有安装系统包或修改上游。

## 正式关联与回收

新 journal 最终 seq **6** / `CANDIDATE_BROWSER_HOST_OBSERVED`：

- state SHA：`f6d9848baf1da0a857819bbcf3367f18a9db67db9e0337e1198b8fce4b98e348`。
- seq 6 digest：`b259f36438a2fe3c8996f937ad3197c7d3e6d11f04f7a885642629c0f9299c7e`。
- terminal 父事件 seq 5：`d8ba0f5f788669d8e795de7759efabf6e1a0ddf23c64e5a2a4a2e5433cfef5cf`。
- browser 回执：`d29c8b96b1f5c23306e7d146f131cfc934063afac20e46502929164de6d72e05`。

browser 使用真实 seq 5 和当次 source 回执；原校验器核对封套、输入、runner、结果归档与 completion 后记账。哈希关联仍是 `UNATTESTED_OPERATOR_OBSERVATION`，不代表远端硬件证明或供应链分发认证。

43 source / 349 terminal / 510 browser 输入逐项保持。source/terminal 拉回 292 个文件（inventory 262）；browser 拉回 194 个成员（inventory 193），集合和字节摘要相符。自有进程为零，测试端口 4335–4337 关闭，原五保护端口/PID 及 current 元数据不变。terminal 独占证据根保留；browser 独占根在收取核验后由原 completion 移除。本机 headed 自有 HTTP/宿主亦已退出。

## 归档与历史保留

新证据根：`.context/checks/html-fix-candidate-20261008/`。各 phase 的 `command.json`、stdout/stderr、journal-before/after 和 `result.json` 保存原实际命令及结果；agent-a/b 保存运行器、原始回执、截图和摘要清单。机器摘要见[validation](shinemage-html-fix-candidate-validation-20261008.json)。

精简归档：`.context/archives/html-fix-candidate-20261008/evidence.tar.gz`，**3115 成员 / 523,662,742 字节**，全部成员重新读取核验；SHA `5206a1956498389460abab8ffa36a3059b74ffe58e492996409bea963a3b89aa`。完整清单及归档验证在同目录。包含新包、journal、两个正式封套、原始运行结果和截图；不收浏览器 profile/cookies、SSH 私钥或重复依赖缓存。仅包含原合成 runner 所产状态，不含真实业务库。构建准备另封存于此前 `html-fix-delivery-20261008` 归档，没有改写准备时点的“未提交”回执。

首轮包文本检查因 Unicode 转义大小写判断不匹配的结果保留在 `package-inspection-r1.json`；后续仅修正检查时的解码，原包及原始字节摘要不变。source/terminal 收集器缺少的五个旧模板外层文件名有明确记录，本次实际 before/combined 日志独立留存，未伪造同名旧回执。

旧 b75 candidate、tarball 和旧 seq6 state 三份摘要未变。六棵只读旧树的 HEAD/status 与 105 份未提交文件保持；固定上游 HEAD/status 未变。主树已有未提交成果保持，仅更新三个当前状态入口并新增本报告/机器摘要，不再自动提交。

## 仍未关闭的原有事项

正式 CI 仍 NOT_RUN；实际整支对缓存 `origin/main` 基线的 635 文件与准备阶段 plan-only 输入一致，不能用七文件增量仅选 B0 代替整支 CI。此轮未重跑完整 B0、SDK 全审或旧包验收。

SDK 分发 BLOCKED、EMBED-INLINE-BYTES 账本 PARTIAL、产品默认 NOT_VERIFIED 不变，7 版本 / 29 公告没有重查。外部 probe 两次超时未再续跑。原生 View/200% Tab、真实读屏/触控/移动/Windows 高对比度、缺少已有页面输入的 standalone、真实模型/业务/生产仍未关闭。物理分仓、独立 CI/发布与 DSH 升级继续遵循原 stop/go；本次没有勾完父任务或扩展功能。
