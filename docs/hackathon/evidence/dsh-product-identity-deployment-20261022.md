# 商品身份映射部署验收

日期：2026-10-22（北京时间）。

> 本页记录 crm.4 / query.13 的商品映射阶段。后续覆盖、公开投影和前端迁移以[审查问题修复与部署验收](dsh-review-fixes-20261022.md)为准。

## 结论

商品新老客接口已从 `product-customer/v1` 前进到 `product-customer/v2`。接口继续用内部 `name` 和 `spu_classes` 完成商品到多个 SPU class 的映射与用户去重，同时返回稳定的 `display_name` 供用户界面和问数 Agent 使用。

杭州现场已 side-load CRM `0.0.0-crm.4` 和 Query `0.0.0-query.13`。插件页均显示 `2/2` 组件运行中，代码来源分别指向对应的 crm.4 和 query.13 tarball。

真实 CRM 商品查询仍为 `NOT_RUN`。最终浏览器会话为 `crm_login=NOT_CONNECTED`，因此当前证据只证明映射合同、构建、部署和工具面，不冒充真实业务 UAT。

机器回执见 [dsh-product-identity-deployment-20261022.json](dsh-product-identity-deployment-20261022.json)。

## 商品身份合同

- 用户侧默认展示 `display_name`，例如 `爆款面膜A`。
- `display_name` 使用固定映射，不由页面临时编号，避免新增商品时已有标签自动移位。
- 当前登记 15 个商品，15 个展示名全部唯一。
- `products` 既接受内部 `name`，也接受唯一 `display_name`。
- 同一商品的内部名和展示名同时提交会返回重复选择错误。
- `spu_classes` 保留在工具结果中用于审计，不作为页面标签。
- 问数提示词要求模型默认输出 `display_name`，不能把内部名或 SPU class 当作页面文案。

## 制品与运行身份

| 项目 | 结果 |
|---|---|
| 源码 | `7a33b93a96ddd39382f8431286720ebae7611a31` |
| CRM | `0.0.0-crm.4`，tarball SHA-256 `9ec385ef…075f6` |
| Query | `0.0.0-query.13`，tarball SHA-256 `d275f0f4…9bd4f` |
| 后端镜像 | `sha256:85c3b72d…d895c`，容器 `healthy` |
| 后端基底 | `sha256:07f19fd3…5bbc` |
| DSH current | `dsh-0.2.1-rc.1-core-main-20261021-cockpit-v3` |
| Profile package | SHA-256 `68b1bdd8…5eb9` |
| Profile lock | SHA-256 `0f5cecad…b112` |
| 服务 | `active/running`，`NRestarts=0`，七个端口正常监听 |

完整 Dockerfile 构建首次因 Docker Hub 拉取基础镜像超时失败。随后从上一张健康镜像 digest 构建离线派生层，只替换同一提交的 `backend/`、`scripts/` 和 `config/`。依赖、入口和非 root 用户保持不变。

## 验证

- 商品与分类后端：`36 passed`。
- CRM dashboard：`43 passed`。
- Query Agent：`10 passed`。
- CRM 0.2.1 目标类型检查和 bundle：`PASS`。
- Query 配置 bundle 的离线 builder receipt：`PASS`。
- query.13 与 crm.4 的 tarball、profile 清单、锁文件、已安装文件逐项一致。
- 插件页显示 CRM `crm.4`、Query `query.13`，均为 `2/2` 运行中。
- 最终健康会话返回 CRM `NOT_CONNECTED`、知识库 `AVAILABLE`、页面交付 `AVAILABLE`。

## 未完成

- 用户尚未连接 CRM，浏览器内真实商品查询未执行。
- 生产接口没有在本次最终会话中返回真实 `display_name`；映射行为由后端和插件合同测试证明。
- 原始 Dockerfile 在线构建仍未在 Docker Hub 网络恢复后复验。
- 页面保存、驾驶舱编辑和人群策略复盘仍未在本轮验证。

恢复目录为 `/srv/shinemage/dsh/recovery/product-identity-20261022/`。旧 profile、旧安装包和旧后端 Compose 覆盖文件均已保留。
