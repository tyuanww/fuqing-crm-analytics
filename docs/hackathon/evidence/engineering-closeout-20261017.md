# 工程闭环与正式发布门禁分离

日期：2026-10-17

> 事实纠偏（2026-10-18）：本文件是 2026-10-17 快照。其 `rc2 web rollback NOT_RUN` 条目已由 [rc2 web rollback headed recovery](rc2-web-rollback-headed-recovery-20261018.md) 更新为 `PASS_INTERNAL_SYNTHETIC_ONLY`。该更新不改变正式 M2-07、M2-08、M2-09 或 `release_ready=false`。

## 结论

本项目的架构和本地技术验证已经闭环。剩余事项分成内部运行准备和正式发布门禁两条独立线路，不再用 M2 门禁反复描述整个工程没有完成。

| 线路 | 当前结论 | 是否阻塞架构闭环 |
| --- | --- | --- |
| 架构 | `CLOSED` | 否 |
| rc2/既有候选本地技术闭环 | `CLOSED_FOR_ARCHITECTURE` | 否 |
| rc1 最新 candidate | `LOCAL_REPLAYABLE_CONSUMER_CLOSURE_PASS_BROWSER_ENTRY_PASS_HISTORY_BROWSER_PASS_BOARD_TRANSPORT_PASS_NATIVE_BOARD_CANVAS_PASS_PAGE_HTTP_ON_ROLLBACK_SDK_CLI_PASS_WEB_ROLLBACK_NOT_RUN` | 否；rc2 web rollback 仍未完成 |
| 内部 Stage 0 wrapper | `NOT_IMPLEMENTED` | 只在要启动真实内部试点时触发 |
| 内部 Stage 1 | `DEFERRED` | 是内部扩大到 10–20 人的前置项 |
| 正式发布 | `DEFERRED` | 不阻塞内部架构建设 |

已经完成的架构结论和隔离证据包括：单一 DSH Agent Loop、插件边界、runtime/plugin manifest、Cordis peer 合同，以及 rc2/alpha2/alpha4 的本地生命周期与回退探针；rc1 local replayable lane 另外完成了 9 个插件的 build/provenance、pack、reader 回读、四 tarball production-only consumer closure、真实 Chrome headed browser 入口，以及 candidate-bound synthetic history 的重启后回读。上一轮原生 DSH board canvas 的阻塞根因是 candidate 没有启用 page HTTP。本轮以 `--page-http on --page-http-port 18140` 重启，并修正临时 board fixture 的 TEXT 公共字段后，真实 headed browser 在重启前后都读到了原生 canvas。首次进入驾驶舱需要一次真实刷新来完成异步 board 列表回读，预览仍保持 `PENDING`。rc2 SDK/CLI rollback 通过，rc2 web rollback 因无 profile pack 未运行。所有隔离证据也不能升级为公司发布证据。

## 最终运行时口径

2026-10-17 通过 Git 远端 tag 和 npm registry 实查得到。最终目标采用 Harness 最新发布 tag `dsh-v0.2.1-rc.1`，不使用浮动 `latest`。

| dist-tag | 版本 | 口径 |
| --- | --- | --- |
| Harness 最新发布 tag | `dsh-v0.2.1-rc.1` / `1600d8a1e140dcde43a1a0941940a0480712c011` | 最终内部环境目标 |
| npm `latest` | `@deepseek-ai/dsh@0.2.0-rc.2` | 稳定 dist-tag，不是本项目最终目标 |
| npm `next` | `@deepseek-ai/dsh@0.2.1-rc.1` | 与最终目标版本一致 |
| `alpha` | `@deepseek-ai/dsh@0.2.1-alpha.5` | 候选轨道，不进入默认环境 |

目标 rc1 tarball 的本次读取摘要如下：

```text
version=0.2.1-rc.1
upstream_tag=dsh-v0.2.1-rc.1
upstream_sha=1600d8a1e140dcde43a1a0941940a0480712c011
sha256=6d0c6fe8ad0c21797a27d6afc0cb69a022714ea0cd7331e4cba8b07b8ce19009
integrity=sha512-ce+4rnRuhkheK8++2EGm0CjHKVfF7IjUk4DO/NydRS8inAM8A0GFGQmX3cWKM4OzzbT+diIMyOiDuA1wYAZioA==
```

仓库现有 `DSH 0.1.7-rc.2` 是既有主仓兼容基线和历史证据边界。它不能继续被描述成最终内部部署版本。rc1 的 immutable inputs、9 个 pack、两个 profile-pack inputs、四 tarball consumer closure、真实 headed history 回读、重启后 history/board transport 回读、原生 board canvas 回读和 rc2 SDK/CLI rollback 已在本地 replayable lane 生成。rc2 web rollback 仍未完成，不需要重做已经完成的架构审查和旧证据。

## 最终收尾清单

EC-01 至 EC-04 的本地工程闭环已经完成。下面只保留仍有边界条件的项目，不重复已经通过的构建、依赖、SBOM、浏览器和回退检查。

| 项目 | 当前状态 | 何时继续 | 当前动作 |
| --- | --- | --- | --- |
| rc2 web rollback | `NOT_RUN_RC2_PROFILE_PACK_UNAVAILABLE` | 取得可消费且绑定 rc2 manifest 的 profile-pack artifact 后 | 暂停。不能把两个 rc2 配置文件当作 profile pack，也不能用 SDK/CLI rollback 冒充 web rollback。 |
| EC-05 Stage 0 wrapper | `NOT_IMPLEMENTED` | 准备让 1–3 名真实内部用户试用，并提供真实任务卡 | 暂停。没有任务卡时最多运行 `HARNESS_SMOKE_ONLY`，不能宣称用户可行性或 500 人 readiness。 |
| Stage 1 | `DEFERRED` | 内部试用扩大到 10–20 人 | 暂停。届时再处理 OIDC、共享存储、备份恢复、日志告警、容量和支持责任。 |
| 正式 M2 | `DEFERRED`，正式状态仍保持门禁值 | 要对外分发、生产激活或设置 `release_ready=true` | 暂停。M2-07 继续等待公司供应链和治理回执，M2-08 等待 activation、canary、rollback 和授权，M2-09 等待正式目标 browser/recovery 和切换授权。 |

当前没有需要继续修改的本地代码。没有合法 rc2 profile-pack 输入、真实 Stage 0 任务卡或正式发布授权时，不再启动新的候选、服务或重复验证。

## 不再重复的事项

- 不重复运行已通过的本地 Cordis closure、依赖图、SBOM、runtime import 和 clean-machine replay。
- 不把 owner-operated 回放写成公司 publisher 或独立 verifier 证据。
- 不把 alpha2/alpha4 候选混入最终 `latest` 内部环境。
- 不因为正式发布线路未关闭而反复重做架构设计。

## 正式门禁状态

正式发布线路仍保持原状态：

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```

这表示正式发布没有授权，不表示架构或隔离 candidate 工作没有完成。rc1 目前已有 local replayable pack/reader、consumer/runtime closure、真实 headed history 回读、重启后 history/board transport 回读、原生 board canvas 回读和 rc2 SDK/CLI rollback；rc2 web rollback 仍有明确未完成项，不能把正式发布写成 ready。
