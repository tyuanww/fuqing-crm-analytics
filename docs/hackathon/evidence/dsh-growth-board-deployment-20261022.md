# DSH 增长董事会部署验收

日期：2026-10-22（北京时间）。

> 本页记录 crm.3 / query.12 阶段的部署事实。当前线上商品映射版本以[商品身份映射部署验收](dsh-product-identity-deployment-20261022.md)为准。

## 结论

杭州现场已 side-load `@shine-mage/dsh-crm-knowledge@0.0.0-crm.3` 和 `@shine-mage/dsh-query-agent@0.0.0-query.12`。DSH 插件页显示两个包均为 `2/2` 组件运行中，Query 的来源路径指向 query.12 tarball。

后端商品新老客和 RFM 快照接口已部署。RFM 缓存已生成，商品、RFM、未知商品和 GMV 拒绝路径均完成真实接口检查。最终重启后的浏览器会话可以检索 WeKnora 项目资料库，也可以生成未发布的 HTML 页面包。

这不是正式发布。CRM 用户登录仍为 `NOT_CONNECTED`，最终会话没有完成真实 CRM 数据查询、页面保存、驾驶舱编辑和人群策略跟踪。`release_ready=false`。

机器回执见 [dsh-growth-board-deployment-20261022.json](dsh-growth-board-deployment-20261022.json)。

## 制品与运行身份

| 项目 | 结果 |
|---|---|
| CRM | `0.0.0-crm.3`，tarball SHA-256 `9bb8a511…52a` |
| Query | `0.0.0-query.12`，tarball SHA-256 `67be837e…3eb7d` |
| 后端镜像 | `fuqing-crm-analytics-backend:growth-20261022-6a648d23` |
| 后端 digest | `sha256:07f19fd3…5bbc`，容器 `healthy` |
| DSH | `0.2.1-rc.1`，runtime `dsh-0.2.1-rc.1-core-main-20261020-v5` |
| 服务 | `active/running`，`NRestarts=0`，七个端口正常监听 |

Query 以前只替换了 `node_modules`，而 profile 清单和锁文件仍指向 query.11。本轮将 query.12 tarball 写入受控输入目录，原子修正清单、specifier、integrity 和锁文件，并逐文件核对 tarball 与已安装包。重启后的插件页已显示 query.12 来源路径。

## 数据能力

商品新老客接口为 `POST /api/v1/category/product-customer`。真实只读探针返回 `200`，并同时返回 `data_cutoff`、`new_old_cutoff` 和 `comparison_new_old_cutoff`。未知商品和 GMV 口径返回 `422`。

RFM 接口读取杭州预计算的 `rfm_cache.duckdb`，缓存文件约 `1.1 MB`。接口返回 `200` 和 9 个唯一标签，对应 8 个 RFM 象限加已购客 TTL。缓存 miss 不触发现场大库扫描。

真实金额、客户人数和分群占比没有写入本回执。

## 浏览器链路

最终重启后，在“问数智能体”预设中完成以下检查。

- `crm_service_health` 返回知识库 `AVAILABLE`、页面交付 `AVAILABLE`、CRM 登录 `NOT_CONNECTED`。
- `weknora_search` 真实检索项目资料库，命中 8 条 passage，来自 1 个文档。
- `free_html_page_generate` 返回 `PACKAGE_RECEIVED`，页面请求 ID 为 `page-gen-final-chain-acceptance-preview`，`published=false`。
- 页面工具明确说明保存由工作台完成，模型没有宣称已保存、已分享或已加入驾驶舱。

## 验证

本轮定向验证结果来自部署窗口和最终运行态。

- CRM 全包 Node 回归：`119 passed`。
- Query Agent Node 回归：`10 passed`。
- 商品与 RFM 后端定向回归：`67 passed`。
- DSH 0.2.1 目标类型检查和 bundle 构建通过。
- 最终插件页、健康工具、WeKnora 检索和 HTML 生成均有浏览器证据。

日志仍出现 16 条 DeepSeek 账号 `/auth-api/v0/users/current` 的 `403 / errorCode=network` 刷新失败。它们没有阻断后续模型和工具调用，但仍属于运行噪声，不能写成零错误启动。

## 未完成

- 用户尚未在最终会话中连接 CRM。
- 最终会话未执行真实 GSV、商品新老客或 RFM Agent 工具链。
- 生成页面没有保存，也没有完成重新打开和驾驶舱编辑。
- `crm_service_health` 报告 `board_tools=NOT_AVAILABLE / BOARD_PLUGIN_NOT_INSTALLED_OR_NOT_VISIBLE`。
- 人群策略复盘、订单号导出和增长跟踪仍是产品缺口。

恢复目录为 `/srv/shinemage/dsh/recovery/growth-board-side-load-20261022/`。正式签名 release、独立验收和生产切换不在本回执范围内。
