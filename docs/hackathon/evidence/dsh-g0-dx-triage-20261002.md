# G0 DX T22/T23 证据（2026-10-02）

## 范围

本记录只验证文档入口和只读 release readiness 输出。它不证明 GitHub Release、DSH 宿主、杭州 WSL2、真实模型或真实业务数据已经验收。

## T22 文档入口

- 根 `README.md` 当前事实指向 `STATUS.md`：产品 `0.20.0.0`、DSH `0.1.7-rc.2`；已明确 `dsh-0.20.0.0-r1` 已发布但杭州 current 仍是上一份运行版本。
- `docs/README.md` 增加独立插件作者入口。
- `docs/operating/dsh-plugin-author-quickstart.md` 提供 `doctor → verify --scope local → build/test → plugin candidate` 三步路径，并写明 package/DSH peer/files/原生回退合同。
- 没有把现场 UAT、canary、rollback 或远端 receive 写成已完成。

## T23 readiness 摘要

执行：

```text
pnpm dsh doctor --release
```

本次结果：**BLOCKED（预期）**。输出逐项保留 `code`、`remedy`、`ref`，末尾输出 `_BLOCKERS count=2`，并列出：

- `RELEASE_BLOCKED_DIRTY_WORKTREE` → `dsh-rc2-quickstart.md#dsh-quickstart-clean-tree`
- `RELEASE_UPSTREAM_RUNTIME_REQUIRED` → `dsh-rc2-quickstart.md#dsh-quickstart-runtime`

命令没有联网、安装依赖、生成 artifact、启动服务或读取真实 DuckDB；退出码仍为 `2`，没有放宽 release gate。

## 回归

```text
pnpm dsh test
```

结果：**102/102 PASS**。`git diff --check`、本轮修改脚本的 `node --check` 和插件边界回归通过。
