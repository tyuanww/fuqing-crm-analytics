# 工程闭环与正式发布门禁分离

日期：2026-10-17

## 结论

本项目的架构和本地技术验证已经闭环。剩余事项分成内部运行准备和正式发布门禁两条独立线路，不再用 M2 门禁反复描述整个工程没有完成。

| 线路 | 当前结论 | 是否阻塞架构闭环 |
| --- | --- | --- |
| 架构 | `CLOSED` | 否 |
| rc2/既有候选本地技术闭环 | `CLOSED_FOR_ARCHITECTURE` | 否 |
| rc1 最新 candidate | `LOCAL_REPLAYABLE_CONSUMER_CLOSURE_PASS_BROWSER_ENTRY_PASS` | 否；history/board、lifecycle/recovery smoke 仍待执行 |
| 内部 Stage 0 wrapper | `NOT_IMPLEMENTED` | 只在要启动真实内部试点时触发 |
| 内部 Stage 1 | `DEFERRED` | 是内部扩大到 10–20 人的前置项 |
| 正式发布 | `DEFERRED` | 不阻塞内部架构建设 |

已经完成的架构结论和隔离证据包括：单一 DSH Agent Loop、插件边界、runtime/plugin manifest、Cordis peer 合同，以及 rc2/alpha2/alpha4 的本地生命周期与回退探针；rc1 local replayable lane 另外完成了 9 个插件的 build/provenance、pack、reader 回读、四 tarball production-only consumer closure 和真实 Chrome headed browser 入口。rc1 的 history/board recovery、rollback 和正式发布仍未完成，所有隔离证据也不能升级为公司发布证据。

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

仓库现有 `DSH 0.1.7-rc.2` 是既有主仓兼容基线和历史证据边界。它不能继续被描述成最终内部部署版本。rc1 的 immutable inputs、9 个 pack、两个 profile-pack inputs 和四 tarball consumer closure 已在本地 replayable lane 生成；切换到 `0.2.1-rc.1` 前仍需完成真实 headed browser、history/board 重启回读和兼容性 lifecycle smoke check，不需要重做已经完成的架构审查和旧证据。

## 最终剩余任务

这些任务是有限清单，不包含重复的 M2 解释。

1. **最新 runtime manifest**。固定 `dsh-v0.2.1-rc.1`、upstream SHA、tarball SHA、9 个插件 pack SHA、Node 和 lockfile；输入冻结、local replayable pack/reader、四 tarball consumer closure 和 headed browser entry 已完成，仍需运行绑定该 subject set 的 history/board restart、rollback 和 lifecycle compatibility smoke check。
2. **Stage 0 harness**。只有要启动 1–3 名真实内部用户时才实现。它负责 fresh runtime、credential deny、digest 检查、local receipt 和 owned cleanup；没有真实任务卡时结果只能标记 `HARNESS_SMOKE_ONLY`。
3. **真实任务卡**。只有要证明工作流价值时才补部门、岗位、用户、任务、输入输出、数据类别和频次；没有任务卡不能宣称用户可行性或 500 人 readiness。
4. **Stage 1 基础设施**。只有要扩大到 10–20 人时才处理 OIDC、共享存储、备份恢复、日志告警、容量和支持责任。云空间或云硬盘未落地前停留在 Stage 0。
5. **正式发布链**。只有要对外分发或把 `release_ready` 改为 `true` 时才处理 M2-07、M2-08、M2-09 的公司 runner、签名、独立验证、正式目标、activation、canary 和 rollback。

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

这表示正式发布没有授权，不表示架构或隔离 candidate 工作没有完成。rc1 目前已有 local replayable pack/reader、consumer/runtime closure 和 headed browser entry；在 history/board 重启回读、rollback 和 lifecycle smoke 完成前，不能把最终内部 runtime 写成 ready。
