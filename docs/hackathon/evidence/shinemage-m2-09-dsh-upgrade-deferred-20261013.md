# M2-09 DSH 升级候选延后复核（2026-10-13）

本轮先核对当前 DSH pin 与运行现场，随后识别官方升级候选并在 ignored 隔离目录准备精确 checkout；不修改主仓 pin、上游源码、锁文件或 live/current。

## 当前基线

本地 `dsh-plugins/plugin-kit/toolchain.json` 实际读取为：

```json
{
  "sdk_version": "0.1.7-rc.2",
  "upstream_sha": "477b4f420553e8a52c2fbccc464d7561b239c443"
}
```

该文件 SHA-256 为：

```text
8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe
```

`git diff -- dsh-plugins/plugin-kit/toolchain.json` 为空。固定 pin 没有被本轮改写。

杭州目标只读现场核对：

```text
current=/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3
candidate-runtime-present
upstream-dirs=upstream-0.1.7-rc.2-477b4f42
```

candidate 与 live 均继续使用 rc2 上游；杭州目标没有新的隔离升级 runtime。官方新候选的本地准备与静态矩阵见下文，不能直接替换当前 pin，因为插件 peer、profile、lock、SDK closure、浏览器、恢复和真实业务兼容矩阵尚未重跑。

## 结论

M2-09 更新为 `CANDIDATE_IDENTIFIED / STATIC_MATRIX_PASS / RUNTIME_NOT_RUN`。后续仍需准备隔离 runtime、安装并核对固定依赖、完成插件适配、新旧兼容矩阵、恢复矩阵和回退条件，并取得切换授权；升级不混入当前九包发布 candidate。

## 2026-10-13 版本目录复核

授权目标的 release 目录只包含历史 `dsh-0.18.0.2-r2.*`、`dsh-0.19.0.0-r3` 和当前 `dsh-0.20.0.0-r3`，没有新的现场升级 runtime。仓库与目标仍使用 `0.1.7-rc.2` / `477b4f42`；旧版本目录不能作为升级候选输入。

## 2026-10-13 官方候选识别与静态矩阵

官方仓库发布页列出预发布 `dsh-v0.2.1-alpha.2`；远端 tag 的 peeled commit 为 `d743267388641bc76f17c45ce8b4c231aed1d32c`。本地以该精确 tag 创建 ignored checkout：

```text
.context/dsh-b0/upstream-0.2.1-alpha.2
tag=dsh-v0.2.1-alpha.2
commit=d743267388641bc76f17c45ce8b4c231aed1d32c
```

没有安装依赖、构建 SDK、启动宿主或修改当前工具链。新增的兼容矩阵入口由本地提交 `39cdb9c3` 提供可选 candidate 参数，要求完整 id/version、绝对 checkout 和 40 位 commit SHA；默认 rc2/旧 advisory 行为保持不变。

使用固定旧 checkout 与新候选 checkout 运行离线静态矩阵，结果文件为 `.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/compatibility-matrix.json`：

| 行 | 结果 | 范围 |
|---|---|---|
| `dsh-0.1.7-rc.2` / `477b4f42…` | `SUPPORTED` | 精确 checkout 的 source family 静态命中 |
| `dsh-0.2.1-alpha.2` / `d7432673…` | `SUPPORTED` | 精确 checkout 的 source family 静态命中 |
| `dsh-0.2.0-rc.2` | `DEFERRED` | 本地未提供 checkout |
| overall | `PARTIAL` | runtime、插件、恢复和真实业务尚未执行 |

该 `SUPPORTED` 只表示四组 source family 文件名扫描通过，不表示 SDK/宿主运行兼容，不表示 release readiness，也不授予切换授权。
