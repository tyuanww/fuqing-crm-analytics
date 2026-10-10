# 当前配方查询包冷安装（2026-10-08）

承接 [剩余准入](shinemage-abc-remaining-20261008.md)。没有重跑完整 B0，没有改 2026-10-07 的 `kernel-pack-r2`，没有改旧 journal，没有提交。

## 现场

集成树仍是 detached HEAD `e577f41b9247e3ac56052e21f84daed9dd32f163`。本地引用 `codex/shinemage-abc-integration` 仍指向该提交。当前查询配方 `ddb70716f363e35661d9e1db24b25a4d18311843ce3c6c475302e7a135f1eb17` 已经在这个提交里，工作区的 `services/analytics-first-purchase-kernel/package.json` 没有未提交改动。因此新包可以直接绑定这个已有 SHA，不必先再交一次。

## 实际执行

证据目录 `.context/checks/abc-kernel-current-20261008/`。Node 24.19.0，Python 3.14.4 来自既有 `abc-resume-20261008/b0-venv`。15 个 wheel 从历史 wheelhouse 复制到本目录 `wheelhouse/` 后使用；历史 wheel 字节未变。

第一次打包失败并保留：`kernel-pack/` 与 `pack.log`。原因是当时 PATH 里没有 `zstd`，`scripts/release/pack.py` 在压缩前退出。没有生成回执。

第二次在 PATH 中加入 `/Users/hutou/homebrew/bin/zstd`（v1.5.7）后，用现有入口打包并冷安装：

```text
node scripts/dsh-b0/first-purchase-kernel-artifacts.mjs \
  --source e577f41b9247e3ac56052e21f84daed9dd32f163 \
  --output .context/checks/abc-kernel-current-20261008/current-pack \
  --python <既有 b0-venv python> \
  --wheelhouse .context/checks/abc-kernel-current-20261008/wheelhouse
```

打包退出 0，1.503 秒。新回执：

| 项 | 值 |
| --- | --- |
| 回执 SHA-256 | `6d792dde914af13e2007d3fc56449481d17a4a83606cdb7c43e7fd2007b16683` |
| 归档 SHA-256 | `a8db9aab0edb3a31633e7784f841b4c3ad85fe6f8232b35abb82fe611e345de7` |
| 归档字节 | 113686 |
| manifest SHA-256 | `dc566f94a5f381af4d3efd0eeb701a2f3bcdfb0b9add7d11a5ed15ff367c2ddf` |
| 源码 SHA | `e577f41b9247e3ac56052e21f84daed9dd32f163` |
| 配方 SHA-256 | `ddb70716f363e35661d9e1db24b25a4d18311843ce3c6c475302e7a135f1eb17` |
| release_ready | false |

随后 `first-purchase-kernel-artifacts.test.mjs` 指向这份新回执：**3 PASS / 0 FAIL / 0 SKIP**，0.713 秒。冷安装、依赖闭包、篡改拒绝都实际执行。历史回执 `e30eb0d7…`、历史归档 `4f2a5412…`、历史 manifest、上游 `477b4f42…` 与主成果树 14 个未提交文件均未变。

这是当前已提交配方的新包。它不替换 2026-10-07 历史包，也不是正式 candidate。

## 正式候选仍未做

`pnpm dsh plugin candidate` 会先检查插件目录是否干净。`dsh-plugins/analytics-workbench` 仍有 16 个已跟踪修改和 2 个未跟踪夹具，打包器会报 `PLUGIN_PACK_SOURCE_DIRTY`。本轮没有提交。

当前仓库里的发布 profile 是 `config/dsh-profile.rc2.json`，没有 `service_binding`。旧正式候选用的是另一份 profile `first-purchase-source-http-local`，服务源码 `f9726f68…`，插件包 `c9770d…`。那份 profile 不在当前配置里。没有新写 profile，也没有把旧 journal 接上。

机器记录见 [shinemage-abc-kernel-current-validation-20261008.json](shinemage-abc-kernel-current-validation-20261008.json)。
