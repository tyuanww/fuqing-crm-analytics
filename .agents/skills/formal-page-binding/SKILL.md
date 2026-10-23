---
name: formal-page-binding
description: "验证 free-page/v1 页面绑定清单在原生生成、产物入箱、确认保存和回读过程中的状态不变量。修改页面生成、绑定清单解析、产物回执或页面保存代码时使用。"
disable-model-invocation: true
---

# Formal page-binding verification

## 何时使用

修改下列任一入口时先运行本技能：

- `dsh-plugins/analytics-workbench/src/client/free-html-library/native-generate.mjs` 的页面交付/回执提取；
- `dsh-plugins/analytics-workbench/src/free-page/contract/schema.mjs` 的 `parseBindingManifest` 或页面文档合同；
- `backend/services/analytics/artifact_inbox.py` 的产物校验、幂等入箱、确认关联；
- `backend/services/analytics/page_documents.py` 的绑定解析、预览、保存和回读。

## 一条命令验证（TLA+ TLC）

在仓库根目录执行：

```sh
scripts/formal/run-page-binding-tlc.sh
```

该命令使用 TLA+ TLC 2.19（TLA+ Tools v1.7.4，SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`）检查 `scripts/formal/tla/PageBindingInvariant.tla` 的完整有限状态图。运行器位于 `.context/formal-tools/tla2tools-1.7.4.jar`；缺失或 SHA 不匹配会直接失败，不会静默降级。

模型穷举 5 类清单（空、合法绑定、未知字段、未声明引用、重复引用）与 5 类事件（交付、入箱、确认、重复确认、回读）的所有可达状态，而不是只跑一条手写路径。当前模型生成 75 个状态、14 个不同状态，深度 4，无不变量违例。每个状态检查以下不变量：

1. 出现但不合法的 `binding_manifest` 必须被拒绝，不能静默变成空清单；
2. 正式页面有 `result_refs` 时不能是 `UNBOUND_SAMPLE`；
3. 保存页面的绑定清单必须与入箱回执完全相同；
4. 重复确认不能改变已保存结果。

快速回归仍可运行真实生产模块：

```sh
/Users/hutou/homebrew/opt/node@24/bin/node scripts/formal/page-binding-invariant.mjs
```

Node 检查器直接加载 `native-generate.mjs`，对 6 类真实输入做合同检查，并检查 112,500 个有界状态；它是快速接缝回归，不替代 TLC。

## 如何读失败

失败输出包含 `case`、`trace` 和状态快照。按页面业务词汇理解：先看哪一种清单、哪一个事件顺序触发了错误，再对照 `native-generate.mjs`、`artifact_inbox.py` 和 `page_documents.py`。不要通过放宽不变量或把非法清单改成合法来消除失败。

## 覆盖与边界

TLA+ 模型的原子步骤对应生产代码中的一次清单交付、入箱、确认或回读；`FailOpen = FALSE` 对应当前拒绝非法 manifest 的实现。Node 检查器则实际调用 `extractBindingManifest` 和 `parseBindingManifest`，把模型与生产解析代码接上。模型没有证明 SQLite 事务实现、权限检查、结果授权解析、并发线程调度、真实 DuckDB 内容、网络可靠性或 HTML 执行安全；模型也只覆盖当前有限的状态域。因此通过表示该状态域的完整可达图，不代表整套系统已无条件证明。

## 保持同步

本技能最后一次与代码核对的提交是 `SYNC_COMMIT: 5c436db7`。涉及上述覆盖文件的改动后，先运行命令；只有确认模型仍准确描述新状态/合同，才把 `SYNC_COMMIT` 前移并提交技能与脚本。若改动了状态转移或扩大范围，优先更新脚本和本技能，再运行验证。

正式验证工具缺失或 SHA 不匹配时，不能把 Node 快速回归冒充 TLC 结果；应保留失败证据并说明边界。需要把验证重新对齐实现时使用 `/maintain-formal-verification-skill`。
