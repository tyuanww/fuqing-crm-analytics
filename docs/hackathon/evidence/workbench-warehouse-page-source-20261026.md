# 商品与 RFM 仓库快照接入页面

本单元基于主仓 `3112b9dc` 和 Workbench 作者 `c836d3f`，仅扩展现有原生页面链路。固定接口样例及小型合成仓库回归不代表杭州集成或业务验收。

## 来源读取

CRM `openNativeSnapshotLease(...).read(refId, signal)` 新模式返回 `NativeWarehouseSnapshotRead` 七字段对象。已有私有 callback 外层仍为 `{ref, epoch, identity, snapshot}`，将整个七字段对象赋给 `snapshot`。`snapshot_json` 是来源端序列化的 JSON 字符串，Node 只转发字符串；它不是原始存储文件字节。旧模式的 `snapshot` 仍是 `CrmSnapshot`，没有新旧失败回退。

`NativePageSource` 校验当前原生会话、ref、授权期限，并对新 envelope 校验 UTF-8 字节摘要、类型化快照、snapshot ID、data_kind、payload 摘要。授权缓存键继续包含 actor、会话、连接 generation、epoch、ref、结果摘要、目标版本，新增仓库投影版本、snapshot ID、data_version 与 semantic_revision。同请求观察改变、过期或撤权按现有边界拒绝。

浏览器读取的是 `crm-warehouse-page-aggregate/v1` 投影，不是原始仓库 JSON。来源证明、过滤条件、实际 periods、金额/比例单位和覆盖状态保留在 `summary`。商品行只使用公开展示名，不暴露内部 name 或 spu_classes。RFM 行保留 group，区别全体、本渠道、会员与会员本渠道；不能跨组相加。

## 数字与单位

- purchases：五个购买指标沿用现有投影，金额为分。
- product：每商品一行，current/comparison/yoy 分开；金额为元，客单为元/买家。
- analysis/r/f/m：行保留对应分群键；金额为元、人数为买家、比例为 raw ratio。`change_ratio` 展示百分比才乘 100；`ratio_difference` 展示百分点才乘 100，不能把比例差称为同比增长率。
- `column_units` 按合同字段明确列出，不从后缀推断。null 保留 null，覆盖不足不补零。
- 新投影的整数超出 JavaScript 安全整数范围时返回十进制字符串，`summary.integer_encoding=unsafe-integers-as-decimal-strings`。展示和中转不能转成 Number。源合同本来就是 float 的商品/RFM 金额不因此变成任意精度金额。

旧 `crm-page-aggregate/v1` 的行结构和数值类型保持不变。

## 编辑与保存

页面生成工具继续交付 free-page/v1；必须在 binding_manifest 中登记本会话真实 crm_ref_，每个事实节点登记 node_id/result_ref，node_id 与元素 data-shine-node 一致，并使用 data-page-readonly。来源文字、HTML 内硬编码数字或模型声称已核验不能代替绑定。

文案及结构布局沿用现有 presentation/source 编辑预览、确认与版本保存。绑定事实节点两条编辑通道均拒绝修改；绑定清单随保存重开保留。撤权后文档仍可打开，结果读取与绑定检查拒绝，不把历史 BOUND_VERIFIED 文档字段当作当前授权。

## 主会话集成顺序

1. 在独立集成树接收本单元主仓提交，保持 `3112b9dc` 合同及本轮 CRM 作者改动；不要复制未提交目录。
2. CRM 新模式保留 callback 外层，将七字段 envelope 原样放入 snapshot；保留 owner/session/generation、授权、过期、撤权及取消检查。
3. 接收 Workbench 作者提交，用固定 SDK/锁构建正式作者包，更新组合包与来源摘要；本单元不修改主仓派生插件副本或最终组合锁。
4. 先跑 Python → Node → Python 字符串与摘要回归，以及原生页面/编辑/保存回归，再由主会话完成隔离实例真实聊天、商品/RFM 诊断、成板、人工/AI 编辑与保存重开。
5. 单独验证实际 UI 对超安全整数的字符串展示、过期/撤权遮蔽数字及当前热集覆盖。未合并、未部署、未切换现役。

## 本次验证

主仓使用 Python 3.14 的 `pytest --noconftest`，针对 warehouse_page_source、native_page_source、warehouse_native_source、page_edit_context、page_documents、page_result_access 六个测试文件，153 项通过，3 条既有警告保留；Ruff 与 `git diff --check` 通过。测试使用自有临时 SQLite 和小型合成 DuckDB，不读取真实业务库。

Workbench 固定 Node 24.19.0、rc3 SDK `1f81c047` 下，host/client 完整类型检查及构建通过；真实编译 client 的 native-prompt-inject，加 native-page-http、generate-context、store、source-draft、selection-context、intent-router，48 项通过。首次调用该组测试缺显式 B0_BUILD_UPSTREAM 而失败，按作者入口补齐原固定 SDK 输入后通过，没有改断言或绕过校验。

现有 TLC 2.19 / Tools v1.7.4 固定摘要校验通过，75 生成状态、14 独立状态、深度 4，无不变量违例。Node 快速绑定检查通过；它运行的是主仓已有作者副本，不代替独立作者的 48 项回归。以上不含完整 B0、远端 CI、真实模型、真实浏览器业务、杭州、最终包或发布准入。

提交前主 Agent 审核及独立同宿主同模型对抗审核完成。独立审核两项 P2：本次临时依赖符号链接可能误入暂存区、页面 prompt 混入 snapshot_json 传输细节；均已删除并静态复核关闭。最终作者源码已重建，48 项回归仍通过。新运行代码没有新增复述型注释、docstring 或 lint 抑制。独立审核的夹具按摘要模式评估；未声称跨模型或整个项目无缺陷。
