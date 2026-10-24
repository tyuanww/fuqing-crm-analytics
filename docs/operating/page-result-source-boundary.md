# 页面授权结果的来源边界

页面结果桥只读取由可信进程登记的结果。浏览器持有的读取令牌不代表数据发布者，不能用它上传数字并获得已验证状态。

## HTTP 与进程内职责

`page_result_access_router()` 保留 `POST /read`、`POST /cancel` 和 `POST /binding-state`。`POST /api/v1/analytics/page-result-access/snapshots` 已移除，返回 404，不保留接受浏览器快照的兼容入口。

`PageResultAccess.put_snapshot()` 只由持有该对象的可信 Python 进程调用。`create_result_access_app(access=...)`、`create_page_app(result_access=...)` 和页面 launcher 的 `build_app(result_access=...)` 接受显式对象注入；对象不会通过 HTTP 交给客户端。

CLI 未传入对象时，launcher 创建空结果表。已登记的 UI 身份仍可认证，空 manifest 为 `UNBOUND_SAMPLE`，未知结果不能获得已验证状态。另一个进程创建同名对象，不会给当前服务发布结果。

## 原问题与兼容影响

旧 `/snapshots` 只检查令牌是否对应某个身份，没有限制发布权限。浏览器能自行指定 owner、来源、数据行与版本，覆盖同名结果或解除原结果的撤销；后续读取校验不能补救错误的发布来源。

本地纯内存探针实际复现了只有 `dashboard:read` 的身份上传成功，并得到 `BOUND_VERIFIED`。删除写入口后，同一探针得到 404，未知结果保持未验证。此证据属于隔离合成环境，不证明线上曾被利用或当前线上已修复。

直接调用 HTTP seed 的消费者需要迁移到可信进程内预置。仓库内两个正向合成测试已迁移，保留实际结果读取和 SQL 禁止断言。本次只核对仓库内调用；其他部署若使用 HTTP seed，需要同步迁移。

本轮没有修改固定作者包中的旧 JavaScript HTTP fake，也不以 fake 的已验证状态作为安全证据。Python 路由及实际 HTTP 测试是本次边界的验证对象。

## 验证与剩余接入

四项回归覆盖独立结果 app、组合页面 app、只读身份和可编辑页面身份，先因旧接口返回 201 而失败。修复后验证不能新建或覆盖快照，原快照行数和值不变，伪造 ref 未验证。结果桥、HTTP 与 launcher 三文件共 31 PASS，原权限、撤销、过期、单位、时间、版本、取消和读取额度测试继续通过。

可信进程能登记对象，不等于已接入真实数据。真实 CRM 身份、DSH 会话、数据库快照来源和 `resolve_binding` 仍需通过受控适配层连接。不能把浏览器提供的身份、快照字段或固定 VERIFIED 回调当作这个适配层。

本轮不改变 CRM 服务端从数据库计算结果的 `/dashboard-snapshots`，不复制业务库，不合并 PR，也不切换杭州现役。
