# DSH G0 后续复核证据（2026-10-02）

本记录接在代码审查提交 `2dafe85fb2e4a791e3f53fb40c0165983253733f` 之后，记录当前 clean commit `2782b854126abe40f68d347ec1b4e9ded3c9a84a` 的正式本地候选复核。只使用 synthetic fixture、固定上游 checkout 和隔离临时目录；没有读取真实 DuckDB、启动 6677/旧 CRM、连接杭州主机或执行 GitHub 发布。

## 先失败后修复

第一次正式 preflight 在 `runtime` 阶段失败，保留证据目录：

```text
.context/release-preflight-runs/dsh-preflight-2dafe85f-NNyObM/failure.json
```

失败根因是 runtime 打包脚本在 prepare 已完成后仍强制 `pnpm deploy --online`，再次访问 `cdn.sheetjs.com/xlsx-0.20.3` 时 ETIMEDOUT。固定上游 checkout 的依赖已经准备好；同一 checkout 直接运行 `pnpm deploy --legacy --offline` 成功。

修复提交 `2782b854`：正式 preflight 的 prepare 阶段负责依赖准备，runtime bundle 阶段改为消费同一 pnpm store 离线打包；回归测试和 Quickstart 已同步。没有修改 DSH 上游源码、lockfile 或网络代理。

## 当前正式 preflight

```bash
pnpm dsh preflight \
  --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python \
  --source-sha 2782b854126abe40f68d347ec1b4e9ded3c9a84a \
  --tag dsh-preflight-2782b854
```

结果：`DSH_RELEASE_PREFLIGHT_PASS`。七个阶段均为 PASS；runtime 为离线构建，大小 `180476788` bytes，SHA-256 为 `e799dd1a23f7fa31f02c8ab956b4dc63a10240b919ff950c22e7a838971f6ed0`，上游 SHA 为 `477b4f420553e8a52c2fbccc464d7561b239c443`。完整摘要在：

```text
.context/release-preflight/dsh-preflight-2782b854/release-preflight.json
```

同一 runtime 的只读门禁也通过：

- `DSH_UPSTREAM_RUNTIME_BUNDLE=... pnpm dsh doctor --release`：`DSH_DOCTOR_RELEASE_STATUS PASS`。
- `DSH_UPSTREAM_RUNTIME_BUNDLE=... pnpm dsh preflight --check ...`：`DSH_PREFLIGHT_CHECK_STATUS PASS`。
- `pnpm dsh verify --scope local`：`LOCAL_PASS`。
- `pnpm dsh test`：102/102 PASS。
- release/CLI 回归：49/49 PASS；`git diff --check` 和脚本语法检查 PASS。

## T2/T17 与插件 candidate

- 0.1.7-rc.2 与 0.2.0-rc.2 精确 checkout 的静态兼容矩阵为 `SUPPORTED`，证据：`.context/checks/rc2-2782b854/compatibility-matrix.json`。
- 固定 0.1.7 checkout 的官方 plugin-manager、Cordis runner、session checkpoint、session format 测试为 167/167 PASS，日志：`.context/checks/rc2-2782b854/dsh-0.1.7-lifecycle.log`。
- 0.2.0 checkout 没有已准备的 Vitest 依赖，生命周期运行标记为 `DEFERRED`；不把静态矩阵当作 0.2.0 runtime 通过。
- synthetic host evidence 复现 timeout/crash → native fallback、WAL checkpoint 和 profile reconcile，但 `in-process-unload` 为 `BLOCKED`，exact DSH host 为 `NOT_RUN`：`.context/checks/rc2-2782b854/host-feasibility.json`。
- workbench candidate：candidate digest `ed3ba262c9cda3b8a986ff37091aba0fc9d38ce2e973a7a6211688cc659f5f3c`，pack SHA `891bdceb710b4ac9dbd2a5008028a55dd08e3e17825ec8be58acf92fb160b65d`。
- shine-brand candidate：candidate digest `c6cef17bc81f2a61812a1d6db313fe82d1cd66254aa60494b1d6ad5a8dda1f2b`，pack SHA `7f73bc9128199297a062d816296ec7beb977e4d93ae65a4d41e719b4dcd0af7c`。

两份 candidate 都绑定 source SHA `2782b854126abe40f68d347ec1b4e9ded3c9a84a` 和 profile digest `c8c9df8c36f11060ad8fbcce68cb2ebf28d783c5eb5759d1b71ff5463782c981`；save/export/send 仍为 `NOT_AVAILABLE`，canary/rollback/远端 receive 仍为 `NOT_RUN/NOT_AVAILABLE`。

## 尚未关闭

1. T17 exact 0.1.7 DSH host 的进程内 unload、真实 runtime session/WAL 与原子激活仍未证实；当前安全回退边界是保留旧 profile、disable/native、host restart。
2. T13/T21 的完整崩溃 replay、远端 receipt/reconcile、canary/rollback 接线仍未运行。
3. T15 的签名、SBOM、来源信任和跨包源码边界仍未关闭；叶子包当前仍引用 workspace 的 workbench toolchain/组件源码。
4. 15 分钟 HTTP SLI、WSL2 冷启动、真实权限/网络/容量、杭州 UAT 和 GitHub protected tag/Release 仍是后续授权门禁。
