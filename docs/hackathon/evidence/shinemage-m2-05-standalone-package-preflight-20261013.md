# M2-05 standalone 页面包 preflight 与 follow-up（2026-10-13）

本页先记录上午对真实 `COCKPIT_EXAMPLE_PACKAGE` 输入的缺失核对，随后记录同日补齐 source-owned 页面包后的 standalone 合同和真实浏览器验证。两段证据按时间区分，后段状态覆盖前段的缺失结论。

## 输入核对

在仓库根目录执行：

```sh
if [ -n "${COCKPIT_EXAMPLE_PACKAGE:-}" ]; then
  printf 'COCKPIT_EXAMPLE_PACKAGE=SET\n'
else
  printf 'COCKPIT_EXAMPLE_PACKAGE=UNSET\n'
fi
if [ -e "${COCKPIT_EXAMPLE_PACKAGE:-/nonexistent}" ]; then
  printf 'package_path=EXISTS\n'
else
  printf 'package_path=ABSENT\n'
fi
```

实际输出：

```text
COCKPIT_EXAMPLE_PACKAGE=UNSET
package_path=ABSENT
```

随后对受控源码、文档和脚本入口做定向检索。结果只有 contract、test fixture、历史说明和使用说明，没有可供真实 standalone 验收的页面包。现有 synthetic/历史 fixture 不能替代正式 `COCKPIT_EXAMPLE_PACKAGE`，也不能证明真实页面、读屏、键盘焦点或高对比度通过。

## 初始结论

- `COCKPIT_EXAMPLE_PACKAGE`：`MISSING_INPUT`；
- standalone 页面：`NOT_RUN_REAL_COCKPIT_EXAMPLE_PACKAGE`；
- 本轮没有伪造、下载、生成或修改页面包；
- M2-05 仍为 `PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_STANDALONE_NOT_RUN`；
- 下一步需要用户提供可验收的真实页面包及其来源身份，再在 candidate-bound 目标上执行 standalone、读屏、完整键盘焦点和高对比度验收。

## 2026-10-13 定向包名复核

本地唯一命中的 `*.zip` 是 `.context/exports/free-html-cockpit-handoff-20260918.zip`。解包清单显示它是 2026-09-18 的历史 `free-html-execution-packet/v1`，内容为批准计划、参考图片、提示词和仓库上下文，`implementation_status=NOT_STARTED`；它没有 `COCKPIT_EXAMPLE_PACKAGE` 页面运行包，不能作为本轮 standalone 输入。杭州目标同样只命中上游架构说明，没有真实页面包工件。

因此本次复核加强了缺口证据，但没有改变 M2-05 状态，也没有把历史资料当作正式候选页面。

## 2026-10-13 follow-up：仓库自有页面包与浏览器验证

为解除缺失输入，本地新增了一个可追溯的 `free-page/v1` 页面包：

- 文件：[examples/cockpit-example/revenue-review.package.json](../../../examples/cockpit-example/revenue-review.package.json)；说明见同目录 `README.md`；
- 页面显式标注“示例数据 · 未绑定经营数据 · 仅用于页面验收”，不连接 CRM、模型或 WeKnora，不读取凭据，不发网络请求，不执行写操作；
- 来源提交：`fcee92a9`（在 `91f880b5` 页面包基础上加固浏览器保存、目标选区、图表和移动视口检查）；
- 页面包 SHA-256：`e2ed8f1ceefd97fd1be673b710f24c5a9b90ca1f781725b785534fc1be2f23c`；
- `parsePagePackage` 通过，`node_map=4`、`resources=0`；
- 定向 Node 合同、预览、资源规范和渲染回归共 `48 PASS / 0 FAIL`，其中真实 standalone 测试在设置 `COCKPIT_EXAMPLE_PACKAGE` 后执行；
- 固定上游 `0.1.7-rc.2` 的实际 Chromium 浏览器探针命令如下：

```sh
UP="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2"
PW="$UP/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright"
COCKPIT_EXAMPLE_PACKAGE="$PWD/examples/cockpit-example/revenue-review.package.json" \
B0_BUILD_UPSTREAM="$UP" \
FQ_B0_PYTHON=/tmp/dsh-b0-python314-0200/bin/python \
COCKPIT_PLAYWRIGHT="$PW" \
COCKPIT_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
COCKPIT_EVIDENCE_DIR="$PWD/.context/checks/cockpit-ui-ux/browser-standalone-final-20261013" \
node dsh-plugins/analytics-workbench/test/cockpit-ui-ux-browser-probe.mjs --presentation
```

命令退出码为 `0`，结果文件为 `.context/checks/cockpit-ui-ux/browser-standalone-final-20261013/results.json`，包含 7 项 PASS：保存与筛选重绘、文字选区候选、回执重试、冻结候选预览、刷新恢复、图表可见高度与 390px 移动视口无横向溢出、浏览器无未处理异常。该探针使用本地拥有的 synthetic FastAPI/SQLite 与真实 Chromium，不含真实业务数据；`full_dsh_shell=NOT_RUN`、`real_model=NOT_RUN`、`contains_real_data=false`。

本 follow-up 关闭的是 standalone 页面包输入和 standalone 浏览器子项。M2-05 仍保持页面验收未完全收口：candidate headed browser 的读屏、人工完整键盘焦点和 Windows 高对比度仍未完成，故当前状态为 `PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_PASS / STANDALONE_PACKAGE_BROWSER_PASS / ACCESSIBILITY_KEYBOARD_PARTIAL`。该结果不授予 release、activation、canary 或 rollback。
