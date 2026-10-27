# 仓库快照原生接线验收

本轮固定后端来源合同 `3112b9dc`、页面投影 `d324af18`、CRM 作者 `2db2d8ba` 和 Workbench 作者 `178bdcae`。真实聊天及最终组合包未验收，产品仍为 PARTIAL。

问数智能体允许 `query_crm_warehouse_snapshot`。CRM Host 显式配置 `snapshotMode=warehouse` 并提供私有 native source 后，模型可读取六类明确日期快照。商品、RFM 结果以当前授权的 `crm_ref_` 绑定页面，服务失败不改用旧来源。客户端暂不接入 named period，后端合同保持。

`scripts/crm-calibration/test_warehouse_native_host_chain.py` 使用真实合成 DuckDB、仓库快照路由与 Store、Node 作者服务、Python 私有来源和页面投影。CRM 登录 HTTP 是合成夹具；没有使用真实凭据或业务数据库。

本地新接线 10 项通过，覆盖六类回读、结果和字节摘要、超 JavaScript 安全整数金额、撤权、未撤销引用的登录代次隔离、上游 401、未预热、覆盖不足，以及 Node 启动失败后的自有资源关闭。旧协议加初版新接线曾合计 13 项通过；该结果早于新增的失败清理回归，不将两组重复相加。query-agent 包 10 项、CRM 包 231 项及固定 rc3 SDK 严格构建通过，各自范围不同。

运行时使用 `CRM_NATIVE_HOST_PLUGIN` 指定已固定作者的 `plugin/` 绝对路径，并在仓库根运行 `python -m pytest -q scripts/crm-calibration/test_native_snapshot_host_chain.py scripts/crm-calibration/test_warehouse_native_host_chain.py`。Python 版本为 3.14.4，Node 为 24.19.0。

独立同模型 CLI 复核发现两项 P2。CRM 错期响应在注册前核对全部明确日期窗口，闰日与自定义对比有回归。新测试夹具将首次资源创建纳入 `ExitStack`，启动失败回归修前失败、修后通过。未使用跨模型审查。

源码接线检查不代替正式包、真实 callback、模型生成、浏览器编辑或保存重开。完整两年缓存仍未验收，本轮没有切换杭州现役或合并 PR。
