# 固定官方 DSH 的 CRM / 首购 HTTP 整链

2026-10-06，从已审修提交 `c7bbf3ae` 继续；本次使用当前本地构建，没有生成或发布 clean candidate。

## 已实际验证

不修改上游的 **DSH 0.1.7-rc.2 / `477b4f420553e8a52c2fbccc464d7561b239c443`** Web CLI，加载实际 CRM / workbench 编译产物。身份端使用隔离合成 CRM HTTP，模型端使用固定官方 mock，计算使用真实 worker / 小型 JSON fixture，结果及回执使用独立 SQLite。

`test_analytics_first_purchase_official_host.py` 本次 **1 PASS / 0 SKIP**（`host-5.log`），覆盖：

- 真实官方 Cookie 换取与 API 授权；无 Cookie 为 401，跨 Origin 为 403。CRM 登录前可以读取未连接状态，不经过旧 B0 gateway 的 query gate。
- 缺少 CRM 防 CSRF 自定义头被拒绝。固定 carrier 对未读取的 streaming 请求可能在发出 403 前关闭连接；本次实际为 `CONNECTION_CLOSED`，没有将它写成 HTTP 403。后续合法请求成功，未将该容差用于任何正向请求。
- 登录前查询拒绝；登录后查询 owner 为 `crm-owner`。现有 Host bridge 经官方 `sessionController.prompt` 进入原生 Agent Loop，实际工具调用、method context、JSON worker 和 journal/退出证明完成同一 run；只有一个 worker、一次 dispatch。
- 保存通过官方 `Connection.fetch` 路由进入实际插件与公开服务，生成可信来源；丢失 ACK 后显示 UNKNOWN，重新打开核对为 SAVED，精确重放只保留一条分析记录。
- 正常停止并重启本次宿主，原 session 事件前缀 digest 不变。同一 authority 下复用官方 Cookie；CRM 凭据没有持久保存，必须重新登录。登录后重放原 request 仍是同一 run、一次 dispatch；断开后拒绝访问。

**验证边界**：查询准入由本次测试驱动器调用私有 kernel HTTP，未从浏览器原生输入框受理。保存使用浏览器同形 HTTP 协议与实际 save controller，但不是 headed 浏览器点击。没有真实模型、生产账号、真实业务库、杭州或生产放行证据；T3/T9/T14 保持 PARTIAL。

## 输入、命令和清理

日志：`.context/checks/first-purchase-official-crm-20261006/`。

```sh
# Node 24 在 PATH；工作树里的两个插件先按其既有 SDK 绑定构建。
B0_NATIVE_CRM_HOST_UPSTREAM=/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics-public/.context/dsh-b0/upstream-0.1.7-rc.2 \
  /tmp/dsh-b0-python.qW3lHO/venv/bin/python -m pytest --noconftest -q -W error::ResourceWarning \
  --basetemp=.context/checks/first-purchase-official-crm-20261006/run-5 \
  backend/tests/test_analytics_first_purchase_official_host.py
```

上面 `run-5` 是本次已存在证据目录；重跑必须换新的目录，不覆盖历史结果。实际宿主观测在其 `test_official_host_crm_query_s0/official-host/http-observations.json`。两个 Host PID **65285 / 65307** 已退出，4335/4336/4337 本次监听已关闭；模型/CRM/保存 HTTP fixture 与 worker 在 finally 中回收，见 `cleanup.json`。没有停止无关服务。

附加本次验证：两个插件 Node24/固定 rc2 构建 PASS；宿主启动/不可覆盖/错误 pin/坏包及 model adapter **7 PASS / 0 SKIP**（`host-guards.log`）；共享 HTTP 两文件 **2 PASS**（`shared-http-regression.log`），Ruff、JS 语法与 diff 检查 PASS。该入口显式 opt-in，默认测试收集不会启动 DSH。

## 调查过的失败

- `host-1.log`：旧目录扫描规则不能声明 rc2 preset。改用官方 `@deepseek-ai/dsh-agent-preset` 显式声明，不改上游。
- `host-2.log`：测试观察器读取 `connection/webServer` 缺少 inject；补齐实际依赖。
- `host-3.log`：负向 streaming 请求断连；核对固定 carrier 源码及真实后续请求，准确记录上述拒绝方式。
- `host-4.log`：每次随机端口与官方 Cookie 的 authority 绑定冲突。采用本测试专用固定端口块，重启保持同一 authority；没有放宽 Cookie 校验或复用别的宿主凭据。

已核对[上一轮审修](dsh-g0-native-crm-review-20261006.md)。下一步需要独立落地浏览器到查询的受控准入：共享 `/api` RPC interceptor 已由官方 Typert gateway 占有，不能重复注册抢占；应使用官方扩展边界，保持原生普通对话与 CRM 登录可用。随后完成浏览器操作，再准备 clean 插件/服务候选和目标环境验证。

本阶段提交前补做 OCR delegate：3 个选中文件和 8 个默认排除项均已按 diff/全文核对，`total_files=11`、`reviewed_files=11`、`skipped_files=0`、`coverage_rate=100%`；无剩余确认缺陷。选择、规则与逐文件摘要保留在本轮目录的 `review-*.json`。本阶段只新增显式验收入口、复用启动 helper 并记录事实，没有接管原生 RPC 或修改生产默认启动。
