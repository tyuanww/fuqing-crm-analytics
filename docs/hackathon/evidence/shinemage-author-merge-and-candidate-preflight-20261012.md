# 独立作者仓合并与正式目标前置核验（2026-10-12）

本页记录独立仓远端收口与当前正式目标前置核验。它不把作者仓 CI 当成主仓组合准入，也不把隔离 candidate 当成主仓正式 candidate/journal。

## 独立仓远端收口

十个 PR #1 已按普通 merge 合入各自 `main`，远程分支保留。合并对象为九个插件仓与 `shinemage-board-components`；每个合并提交对应的 main CI 均为 `SUCCESS`。机器快照保留完整仓库、PR、合并 SHA 和 CI run：`shinemage-author-merges-20261012-r1/remote-snapshot.json`。

## 当前 candidate 前置

在独占任务目录用当前 Workbench formal pack `dsh-plugin-pack/v1`、原 `first-purchase-source-http-local` profile 和固定 `analytics-first-purchase` 服务绑定完成 candidate 文件与本地 journal 的隔离准备：

- candidate `facb83f36ec76769cfdd5e9c2489f2aea4055afc1bfb31748f75a355bf03f27d`；
- profile digest `be3948850fc414ce1524226a544783de1ecb3253514cc7f1d8f3280280b3d0af`；
- Workbench source `3030e3f21263f6ec65cb01c7aeacd4c80e2eb711`，formal manifest `900004009437e68052e957610e618090a1e7d69d485376a53afea6eb008fed85`，tarball `b75a5c900b94b333a2749a8b35d5ea106f5aea158667a6e338baa240b886b088`；
- 固定服务源码 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`，服务证据 `9a6a4a7a28e0ffc69441394c18030b0a51eb2a881c4d00566b535931f3b391b0`；
- journal 在该隔离目录到 `CANDIDATE_PREPARED` seq 2，主仓 profile 与主仓正式 journal 未写入。

该步骤只证明当前正式包可绑定到隔离 candidate 控制面。CRM/Knowledge 与其余包仍以主仓组合锁和作者 CI 记账。

## 正式目标阻塞

`100.93.46.46` 的只读环境核验满足 x86_64 WSL2 和固定 Python，但项目运维文档将该地址列为杭州生产访问入口；用户确认没有另一台非生产 WSL2。因而本轮没有执行 source HTTP、terminal、browser 或 recovery runner，也没有连接、启动或改变该生产入口。

当前状态继续为 `target=NOT_RUN`、`release_ready=false`、产品 `PARTIAL`、SDK 分发 `BLOCKED`。解除条件是提供独立的非生产 x86_64 WSL2 目标；没有该输入时不伪造正式 receipt/journal。
