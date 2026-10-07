# 首购结果年龄策略收口（2026-10-07）

按用户“不考虑陈旧/过期”和本次先处理该事项的决定，当前产品合同明确为**历史快照 + 保存时校验，不按年龄自动失效**。删除当前队列里等待阈值的要求，不新增替代到期系统；未来需要年龄限制时另提需求，不把它作为隐含待办。

## 实现核对

已核对 `backend/services/analytics/first_purchase/save_policy.py`、保存 API/回执测试、公开合同和插件严格 decoder。现有服务 owner 显式设置 `check_freshness=False`、两个阈值 `None`，返回 `NOT_CHECKED / DISABLED_BY_POLICY`，已经符合当前决定，无需重写业务代码或重建包。

- 保留生成时间、数据时间窗、来源和结果版本；更新数据需重新查询，不能把快照标成实时结果。
- 新保存仍重验当前身份/权限、候选准入、成功终态、来源与摘要、冲突和幂等；拿到写锁后再次校验。缺策略仍拒绝。
- 登录/session 有效期、任务/HTTP 超时、权限撤销与 UNKNOWN 恢复不受结果年龄选择影响。
- 保留 `freshness` wire 字段、旧回执读取和旧时限策略兼容分支，不修改历史结果；旧构造调用默认值不变。
- 同步[保存准入](../../operating/first-purchase-save-admission.md)、[服务包合同](../../operating/crm-service-packages.md)、[拆分计划](../../plans/shinemage-plugin-platform-split.md)、STATUS 和 TODOS，避免历史 D9 再引出生产阈值询问。

## 本次实际验证

在独立工作树、Python 3.14.4 / pytest 9.1.1 / DuckDB 1.5.6 的已有隔离环境执行：

```sh
PYTHONPATH="$PWD" .context/checks/service-package-pair-20261005/build-venv/bin/python \
  -m pytest --noconftest -W error::ResourceWarning -q \
  -o addopts='-ra --strict-markers' \
  backend/tests/test_analytics_first_purchase_save_api.py \
  backend/tests/test_analytics_first_purchase_save_receipts.py
```

**90 PASS，31.72 秒**；两条既有 Starlette/httpx 与 AnyIO 弃用警告，没有升级依赖。原始日志：`.context/checks/snapshot-policy-closeout-20261007/tests.log`。覆盖无年龄结果、无策略拒绝、权限撤销、候选/来源变化、写锁重验、提交前后故障及严格消费合同。所有状态均为隔离夹具，不读取真实业务数据库。

该结果只关闭产品年龄决策和对应本地合同回归；没有运行全后端/真实身份/UAT，没有启用生产保存、修改现场策略或追加候选 journal。其他准入条件继续各自验收。
