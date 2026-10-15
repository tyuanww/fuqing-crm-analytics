# M2-06 隔离 candidate 真实分享与撤权回执（2026-10-15）

本记录关闭 M2-06 的真实“成功分享后撤权”缺口。验收只在杭州目标的临时 CRM storage candidate 中执行；live `4328`、共享 CRM `18093/18094`、主仓 profile/journal 和真实生产账号均未修改。

## 隔离边界

- 临时 backend：`127.0.0.1:18099`，使用现役 backend 镜像的只读数据挂载。
- 状态目录：`/srv/shinemage/tmp/m2-06-crm-storage-admin1`，owner-only，独立于共享 `18093`；验收完成后容器和目录均已删除。
- 临时账号：`admin1`，由 candidate 启动时的 `FQ_CRM_PASSWORDS` 注入；密码只存在于本次临时进程环境，不写入日志、仓库或证据。owner 使用同一 candidate 内的 `admin` 凭据。
- 数据口径：`data_kind=real`；快照由 candidate backend 实际读取只读 CRM 数据源生成。
- 账号范围：`admin1` 不是生产账号，也没有写入 live/shared 的账号配置。

## 实际链路

使用 `/api/v1/auth/*` 登录和 `/api/v1/metrics/*` 真实合同接口，响应正文中的金额、客户标识和 token 未写入回执：

1. `admin` 登录成功，candidate library 为空。
2. `admin` 创建真实 `dashboard-snapshots` 快照并保存一条真实 `crm-analysis`。
3. `admin` 将该分析分享给 `admin1`；响应为 HTTP `200`，grant 列表仅包含 `admin1`。
4. `admin1` 登录后按分析 ID读取成功，HTTP `200`；`scope=shared` 列表也包含该分析并标记 `access=shared`。
5. `admin` 调用撤权接口；响应为 HTTP `200`，grant 列表为空。
6. `admin1` 使用同一分析 ID再次读取，返回 HTTP `404` / `NOT_FOUND`；`scope=shared` 列表不再包含该分析。
7. `admin` 再查 shares，grant 列表仍为空，证明撤权状态已经持久化。

## 门禁结论

```text
CRM_REAL_SHARE_READ_PASS
CRM_REAL_REVOKE_READ_DENIED_PASS
CRM_REAL_REVOKE_PERSISTED_PASS
CRM_REAL_CANDIDATE_CLEANUP_PASS
CRM_REAL_LIVE_UNCHANGED_PASS
```

清理复核：临时容器 `shinemage-m2-06-crm-storage-admin1`、状态目录和 `18099` 监听均为 0；live `4328` 与共享 `18093` 仍在监听。临时 `admin1` 账号随 candidate storage 一并销毁。

这条回执证明真实 backend 权限合同的成功分享、共享读取、撤权和撤权后拒绝读取。它不扩展 M2-07 供应链门禁，也不授予正式 release、activation、canary 或 rollback 权限。
