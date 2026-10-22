# 审查问题修复与部署验收

日期：2026-10-22（北京时间）。

## 结论

上一轮代码审查发现的问题已经修复，并部署为 CRM `0.0.0-crm.5`、Query `0.0.0-query.14`。商品接口使用 `product-customer/v3`，但服务端在没有版本请求头时继续返回 v2，避免后端和插件分开切换时再次断开当前 query.13。

v3 在计算前读取仓库数据截止日。当前期或同期范围超过截止日时返回 `INSUFFICIENT_COVERAGE`，不再把未覆盖日期填零或生成假的同比下降。当前期、同期和截止日读取位于同一只读事务。

模型和工具卡只收到 `display_name`、覆盖状态和指标。内部商品名及 SPU class 留在 Host 内。Vue“核心单品新老客”页已经改用去重后的商品接口；周表不再把多个 SPU class 的购买人数相加，日期范围锚定到实际最新可用周。

机器回执见 [dsh-review-fixes-20261022.json](dsh-review-fixes-20261022.json)。

## 修复项

| 审查问题 | 当前处理 |
|---|---|
| 截止日后静默填零 | v3 先检查覆盖，返回 `INSUFFICIENT_COVERAGE` |
| 查询跨越不同数据库状态 | 覆盖、当前期、同期在同一只读事务 |
| 工具卡暴露原始商品名 | 公开投影只保留 `display_name` |
| 旧 Vue 前端跨 SPU 相加用户 | 迁移到商品级去重接口 |
| 空商品结果被接受 | v3 客户端 reject |
| 内部名与展示名冲突 | 模块加载时检查互斥和唯一 |
| v2 到 v3 无兼容窗口 | 无版本头默认 v2，新客户端显式请求 v3 |
| supervisor 启动失败遗留进程 | 统一启动事务和停止测试 |
| 黑白膜显示为爆款品类 | 改为爆款面膜F/G，精华改为爆款精华A |

## 运行身份

| 项目 | 结果 |
|---|---|
| 源码 | `482d149dea223139e693e85c127d8da5398dd925` |
| CRM | `0.0.0-crm.5` |
| Query | `0.0.0-query.14` |
| 后端 digest | `sha256:362779ab…5d4ba` |
| 后端基底 | `sha256:85c3b72d…d895c` |
| 前端 digest | `sha256:6b4516cb…a715c` |
| 前端入口 | `index-BxfW5qHX.js`，`18094=200` |
| Profile package | `eaf71912…e3915` |
| Profile lock | `00a202bc…ff310` |
| DSH | `active/running`，七个端口正常监听 |
| 插件页 | CRM 与 Query 均为 `2/2` 运行中 |

## 验证

- 后端商品、只读路由和分类：`53 passed / 1 skipped`。
- CRM dashboard：`45 passed`。
- CRM 全包：`102 passed`，另外 2 项因当前 SDK checkout 缺少 jsdom 或 vendor Cordis 测试入口而未能启动。
- 前端相关单测：`12 passed`。
- 前端生产构建：`PASS`。
- 前端生产静态入口已替换，v3 请求代码存在于实际部署资产中。
- Query Agent：`10 passed`。
- supervisor 生命周期：`3 passed`。
- CRM 0.2.1 目标类型检查和 bundle：`PASS`。
- 最终浏览器健康会话返回 CRM `NOT_CONNECTED`、知识库 `AVAILABLE`、页面交付 `AVAILABLE`。

## 仍未完成

- 最终浏览器会话没有连接 CRM，真实 v3 商品查询和 Vue 页面登录 UAT 未执行。
- 完整 Dockerfile 在线构建仍因 Docker Hub 网络不可用而未复验。
- 原生 `competition_board_*` 工具仍未加入问数预设，`board_tools` 状态仍为不可用。
- 页面保存、重开和驾驶舱编辑仍需真实登录后验收。

恢复目录为 `/srv/shinemage/dsh/recovery/review-fixes-20261022/`，包含旧 profile、旧安装包和后端 Compose 覆盖文件。
