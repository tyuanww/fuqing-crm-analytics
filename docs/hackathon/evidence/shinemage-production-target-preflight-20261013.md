# 授权生产目标前置预检（2026-10-13）

用户已明确授权把杭州现有入口同时作为当前测试和生产目标，后续再迁移云服务器。本记录只关闭目标环境前置，不把现役 DSH release 写成当前 composition candidate，也不授权激活、切换或发布。

## 目标事实

通过既有 Tailscale SSH 只读核验 `100.93.46.46`：

- Linux x86_64，内核 `6.18.33.2-microsoft-standard-WSL2`。
- `/usr/local/bin/python3.14` 为 Python `3.14.4`；Node `v24.21.0`；zstd `1.5.5`。
- `/tmp` 可写，权限 `01777`。
- 只读监听核验看到 DSH `6677`、CRM `18093`、WeKnora `18094` 及相关服务端口。
- 目标现役 release 为 `dsh-0.20.0.0-r3`，source SHA `fcbd1324…`；它与当前隔离 composition candidate `125c8e53…` 是不同身份。

## 现役服务修复

目标服务原先因陈旧 `supervisor.lock` 反复 auto-restart。只读核验确认锁目录为空、创建时间约 3.35 天前、没有 supervisor 进程或打开句柄；随后只执行受条件保护的 `rmdir`，没有删除 runtime、业务状态或其他目录。systemd 自己的下一次重试后，`shinemage-dsh.service` 变为 `active/running`，`ExecMainStatus=0`。

这个动作只恢复了现役服务的稳定状态，不能证明当前 candidate 已接入目标。

## service target preflight

使用当前 service binding 对应的 manifest SHA `44719e57755a151bc64bf5c9e5075271e301dd26952a9b808181242a0c857a9a`，以及精确的 13 个 Linux wheel，在目标的 Python 3.14.4 下执行只读 `service-target-preflight.py`。退出码为 `0`，回执为 `shinemage-service-target-preflight/v1 / SERVICE_TARGET_PREFLIGHT_PASS`：

| 检查 | 结果 |
|---|---|
| Python 版本 | PASS |
| WSL2 识别 | PASS |
| wheel platform/ABI tags | PASS |
| Requires-Python | PASS |
| cold install / HTTP recovery / identity and state | NOT_RUN |
| activation / release_ready | BLOCKED / false |

目标上既有旧 wheelhouse 含 AppleDouble 文件和额外依赖，按合同被拒绝；本次只使用 manifest 声明的精确 13 个 wheel，临时目录随后已回收。

## 当前边界

在本记录形成时，M2-03 的目标环境前置已达到 `TARGET_PREFLIGHT_PASS`；当时 M2-04 尚未接入 candidate。随后同一 candidate 已在该目标取得 source HTTP journal seq 3 和 terminal/recovery journal seq 4，browser 仍由独立门禁负责。本记录没有把现役 release 的结果继承给新 candidate，也没有执行生产激活或发布。
