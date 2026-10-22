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

## 一条命令验证

在仓库根目录执行：

```sh
/Users/hutou/homebrew/opt/node@24/bin/node scripts/formal/page-binding-invariant.mjs
```

脚本直接加载生产模块，不复制解析逻辑。它用一个有限状态机穷举 6 类清单（缺省、空清单、合法绑定、未知字段、未声明引用、重复引用）与 5 类事件（交付、入箱、确认、重复确认、回读）长度不超过 5 的全部顺序，共 18,750 条轨迹状态（每种清单 3,125 条 5 步轨迹及其前缀）；每条轨迹检查以下不变量：

1. 出现但不合法的 `binding_manifest` 必须被拒绝，不能静默变成空清单；
2. 正式页面有 `result_refs` 时不能是 `UNBOUND_SAMPLE`；
3. 保存页面的绑定清单必须与入箱回执完全相同；
4. 重复确认不能改变已保存结果。

## 如何读失败

失败输出包含 `case`、`trace` 和状态快照。按页面业务词汇理解：先看哪一种清单、哪一个事件顺序触发了错误，再对照 `native-generate.mjs`、`artifact_inbox.py` 和 `page_documents.py`。不要通过放宽不变量或把非法清单改成合法来消除失败。

## 覆盖与边界

模型的原子步骤对应生产代码中的一次清单提取、一次入箱、一次确认或一次读回；清单提取实际调用 `extractBindingManifest`，其合同实际调用 `parseBindingManifest`。状态机抽象了 SQLite 事务、权限检查和结果授权解析，没有证明并发线程调度、真实 DuckDB 内容、网络可靠性、HTML 执行安全或超过 5 个事件的长序列。因此通过只表示本边界和长度内的所有情况，不代表整套系统已形式化证明。

## 保持同步

本技能最后一次与代码核对的提交是 `SYNC_COMMIT: 5c436db7`。涉及上述覆盖文件的改动后，先运行命令；只有确认模型仍准确描述新状态/合同，才把 `SYNC_COMMIT` 前移并提交技能与脚本。若改动了状态转移或扩大范围，优先更新脚本和本技能，再运行验证。

正式验证工具不可用时，不能把普通单元测试冒充形式验证；应保留失败证据并说明边界。需要把验证重新对齐实现时使用 `/maintain-formal-verification-skill`。
