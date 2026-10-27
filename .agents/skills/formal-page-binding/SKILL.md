---
name: formal-page-binding
description: "验证页面绑定清单，以及来源重验失败时确认保存的拒绝与重试边界。修改页面生成、绑定解析、PageDocumentStore.confirm、PageRequestContext 或保存事务时使用。"
disable-model-invocation: true
---

# Formal page-binding verification

## 来源重验失败后的确认保存

要形式化保护的承诺是：来源重验失败的首次确认不能新增页面版本或成功回执。破坏它会把来源失效的修改保存为正式页面。真实 SQLite 检查还覆盖已提交确认的同键重试返回原版本，这是具体运行验证，不是另一个形式化证明。

在仓库根目录执行一条命令：

```sh
python3 scripts/formal/verify-native-page-confirm.py
```

需要 Python 3.14、项目锁定的 Pydantic 依赖、Java 和已有的 `.context/formal-tools/tla2tools-1.7.4.jar`。TLC 使用现有 v1.7.4 JAR 的固定 SHA-256，不下载或启动业务服务。`TLA_TOOLS_JAR` 可指向同摘要的已有工具。缺依赖即为环境阻断，不能算验证通过。

运行器先检查覆盖记录，再检查 TLA+ 模型，并在小型隔离 SQLite 中执行真实 `PageDocumentStore.confirm`。它在临时源码副本中删除 `binding_error` 拒绝分支，要求模型发现反例、真实代码出现错误保存，最后重新检查未修改的维护源。临时副本及数据库写入新建的 `.context/formal-page-confirm/` 时间目录，维护源不变。`--output` 可指定一个尚不存在的证据目录。

当前有限模型包含一个已保存 v1、一个待确认预览、一个幂等键、两个确认请求、来源重验成功或失败，以及回执送达或丢失。穷举这组状态的全部可达交错，不检查活性。当前基线为 298 个生成状态、115 个不同状态，最大深度 9。

原子步骤按真实代码划分：

- `Observe` 对应 `PageDocumentStore.confirm` 的只读事务及 `_confirmation`。
- `Validate` 对应编码候选之后的 `PageRequestContext.revalidate`。这里只建模该调用返回成功或抛出错误。
- `Commit` 对应 `asset_state.transaction` 的 `BEGIN IMMEDIATE`、重新读取确认状态和同一事务内写版本、预览状态与回执。外部网络检查不属于这个原子步骤。
- `Reply` 对应事务成功之后，调用方是否收到响应。另一个请求可以在首次响应丢失前后开始。

覆盖记录在 `scripts/formal/native-page-confirm-coverage.json`，同步提交为 `77de746e1e40ee58a3096a0f21c44bd66c8572f5`。覆盖函数为 `PageDocumentStore.confirm`、`_confirmation`、`_bind`，以及记录中的 `page_context.py` 和 `asset_state.py`。函数 AST 指纹与依赖摘要变化会报 `MODEL_SYNC_REQUIRED`。只有检查新的代码仍符合上述步骤后，才能更新指纹和同步提交。运行器只从真实拒绝分支提取 `RejectSourceError`，不能手改该常量掩盖失败。

读结果时区分三种情况：

- `PASS` 表示当前有限模型通过、真实 SQLite 拒绝失效来源、成功重试保持同一版本，而且临时坏代码确实被检查抓住。
- `CURRENT_CODE_FINDING` 表示维护源已经破坏保存边界。保留日志并报告，不能放宽不变量让它变绿。
- `MODEL_SYNC_REQUIRED` 表示代码与模型未重新对齐，不等于产品缺陷，也不等于通过。

已实际观察的坏代码反例是：读取待确认预览，来源重验抛出 `SOURCE_UNAVAILABLE`，拒绝分支被删除，事务仍把 v1 写成 v2 并记录成功回执。恢复维护源后，版本保留 v1，失败操作的成功回执为零。

这个检查不证明 CRM 认证、调用额度、并发容量、DuckDB 数值、HTML 执行、浏览器编辑、完整业务 UAT，或跨服务撤权的原子性。真实 SQLite 负测覆盖来源重验晚失败；并发交错由有限模型覆盖，不等于穷举真实 SQLite 调度。需要重新对齐时使用 `/maintain-formal-verification-skill`。

下文是原有清单交付检查，保留其独立范围和旧同步记录，不能替代以上保存检查。

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

本技能最后一次与代码核对的提交是 `SYNC_COMMIT: d8f87ebc80d081e5c9413d6fcd95635b655d1c5b`。涉及上述覆盖文件的改动后，先运行命令；只有确认模型仍准确描述新状态/合同，才把 `SYNC_COMMIT` 前移并提交技能与脚本。若改动了状态转移或扩大范围，优先更新脚本和本技能，再运行验证。

正式验证工具缺失或 SHA 不匹配时，不能把 Node 快速回归冒充 TLC 结果；应保留失败证据并说明边界。需要把验证重新对齐实现时使用 `/maintain-formal-verification-skill`。
