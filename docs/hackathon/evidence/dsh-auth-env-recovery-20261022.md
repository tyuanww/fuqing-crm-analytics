# 杭州 CRM 认证环境修复

日期：2026-10-22 19:02（北京时间）。

## 结论

账号和密码没有被修改。登录失败是生产 Compose 环境解析回归：`format: raw` 保留了
`FQ_CRM_PASSWORDS` 值的外层单引号，认证模块因此缓存了用户名 `'admin`，标准用户名
`admin` 无法命中并返回 401。

## 根因

- 提交 `69f50ea6` 为 `deploy/wsl/compose.production.yml` 增加了 `format: raw`。
- 杭州现场 `/etc/shinemage/compose.crm-release-growth.yml` 也覆盖了同一设置。
- 生产 env 文件中的 bcrypt hash 使用单引号保护 `$`，raw 模式不会去掉这对引号。
- 修复前容器环境用户为 `'admin,fqsw,monitor`，直接认证 `admin` 返回 401
  `账号或密码错误`；hash 本体仍匹配预期测试密码。

## 修复

仓库生产和现场覆盖层都恢复 Compose 标准 dotenv 解析。bcrypt hash 继续使用单引号，
Compose 会去掉外层引号并保留 hash 中的 `$`，不会再污染用户名。

只重建 `backend`，未改动前端、DSH、WeKnora、镜像、数据库或数据卷。

## 证据

| 检查 | 结果 |
|---|---|
| 完整四层 Compose 渲染 | `STARTS_QUOTE=False` |
| 环境用户 | `admin,fqsw,monitor` |
| 管理员名单 | `admin,monitor` |
| 管理员覆盖 | 完整 |
| 容器缓存用户 | `admin,fqsw,monitor` |
| `admin` 账号级认证 | `OK` |
| 后端容器 | `running/healthy` |
| CRM `18093` | `200` |
| 前端 `18094` | `200` |
| 回归测试 | `backend/tests/test_wsl_production_env_contract.py`，`1 passed` |

修复后现场文件：

- `deploy/wsl/compose.production.yml`：`3d4523c9f9da53522bba1d4fc4b9474abd1b38bfd9d94ba3c3dc4aebad95ecf0`
- `/etc/shinemage/compose.crm-release-growth.yml`：`1bcfa277fc875f383ad88abccba9e79bc52bcedd1781bd810560c13d91f7cbb2`

## 回滚

修复前文件已备份到：

`/srv/shinemage/dsh/recovery/auth-env-fix-20261022/`

- `compose.production.yml.before`：`3d4523c9f9da53522bba1d4fc4b9474abd1b38bfd9d94ba3c3dc4aebad95ecf0`
- `compose.crm-release-growth.yml.before`：`fb6a0ab3f84a35da02292637660309652a5ecf342ce7f6fa95ed9343456ba0ff`

回滚只适用于恢复本次环境解析改动；不要用回滚恢复已知会导致 `admin` 401 的 raw
配置。

## 未完成

浏览器中的真实重新登录尚未由 owner 复核。账号级认证和容器状态已经验证，但这不等于
CRM 后的 v3 商品查询、页面保存或驾驶舱编辑 UAT 已完成。
