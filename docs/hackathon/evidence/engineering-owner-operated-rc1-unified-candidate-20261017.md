# rc1 unified owner candidate

本记录只覆盖个人 owner-operated 的统一候选。它不关闭正式 M2 门禁，也不切换杭州公网。

## 候选绑定

| 输入 | 实际结果 |
| --- | --- |
| candidate | `rc1-unified-owner-20261017-r1` |
| source SHA | `85a92e05880d1b37b6d01491b7713d3cb23bf770` |
| source tree | `91c564e56095d86d7d146b766265cddbf619258209c20fb50236dccc2ab93173`；3698 entries；47875944 bytes |
| source archive | `dsh-rc1-source-85a92e05.tar.zst`；22321965 bytes |
| source archive SHA | `d3f6cf54b4b012b62695c184e7063813634b6fa2717770f254afb69c305a5b66` |
| SDK | `0.2.1-rc.1` |
| upstream | `1600d8a1e140dcde43a1a0941940a0480712c011` |
| upstream pnpm / plugin pnpm | `11.28.5` / `11.28.2` |
| Node | `v24.19.0` local build；target `v24.21.0` |

`source archive` 的实际字节数应以机器可读回执为准。该候选使用当前隔离 checkout 的 tracked tree，并包含 profile bridge、rc1 workspace toast 类型声明和 KaTeX CSS 声明。主仓 rc2 pin 没有改变。

## 插件包与 profile

- 9/9 `dsh-plugin-pack/v1` 已重新构建。
- 9/9 的 `source_sha` 都是 `85a92e05880d1b37b6d01491b7713d3cb23bf770`。
- 9/9 的 `generated_bytes_provenance.status` 都是 `PASS`。
- page profile 的 `profile_sha256` 是 `e93e6f5e7975311f55bf1ee070b7aea009c938449c9a1542f3c2a503f40253fc`。
- page profile inputs 的 `inputs_sha256` 是 `256cbe5e462dfaf12f338156edc99be3682d9eb09b82cc4e3e62927a93fe46b5`。
- CRM/Knowledge profile 本地 reader 通过，`profile_sha256=7ed8ba8589f76dbd656897edadd5d9a6098549962c6a2882b8827f81f02c2245`。
- 杭州 target 的真实 `profile-pack-install.json` 记录 7 个 page plugin，7 个 `source_sha` 全部相同。

## Linux x64 runtime 合并

合并 runtime 来自杭州 r4 owner candidate。它把 Darwin base runtime 与 Linux x64 native overlay 放在同一运行目录中。

| 输入 | 实际结果 |
| --- | --- |
| runtime archive | `runtime-linux-x64-owner-r4.tar.zst` |
| runtime archive SHA | `b92d758994a09d7c315cd81f51ea16333fec0cc8b60364b63c40ccacb12a2d7b` |
| runtime tree | `c24c20be77a4e334ed8d44ddc5220722c9927bc75c360d2672e2443f154d7be7`；122258 entries；1307812947 bytes；6652 symlinks |
| target runtime | Node `v24.21.0`；Python `3.14.4`；固定 upstream pnpm `11.28.5` |
| target import | `PASS_TARGET_RUNTIME_PROFILE_IMPORT` |

4 个 Linux x64 native 文件已逐字节记录。runtime 仍保留 5 个包含 `/private/var` 的 package metadata 文件。因此该 runtime 是 owner-only merged runtime，不能作为正式可移植 Linux release asset。正式 Linux builder 重建仍是 M2-07 的外部缺口。

## 目标复验

杭州目标使用新目录 `/tmp/shinemage-owner-rc1-unified-20261017-r1`，没有修改 `shinemage-dsh.service`、`/srv/shinemage/dsh/current`、live `4328` 或旧 candidate `4329`。

1. `dsh-dev check` 读取新 page profile，返回 `DSH_DEV_CHECK pinned=1600d8a1e140dcde43a1a0941940a0480712c011 plugin=on`。
2. 未认证 HTTP 回读：web `401`，page HTTP `404`。
3. 真实 headed browser 打开 `http://127.0.0.1:14327/`，标题为 `DeepSeek Harness`。
4. 插件页显示 7 个新候选插件，7 个开关均为启用状态。
5. console errors 为 `0`。只有未配置 DeepSeek 登录/API key 产生的 connection retry warnings。
6. fresh runtime 显示选择工作区提示。没有伪造真实用户任务或真实业务数据。
7. 统一 candidate 的 recovery 细节见 [fixed recovery receipt](unified-history-board-recovery-fixed-20261018.md)。该回执记录 native transport 通过、synthetic headed UI readback 通过，以及严格 cold fixture 仍为 `HOST_AUTO_RESUMED`。

## 正式状态

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```

完整机器可读输入、SHA256SUMS、pack manifest、profile inputs 和 target profile install receipt 位于外部候选目录：

```text
/Users/hutou/.codex/tasks/rc1-unified-candidate-build-20261017/
```

机器可读摘要见同目录的 `evidence/unified-candidate.json`，合并 provenance 见 `evidence/unified-provenance.json`。这些回执保留了 formal Linux rebuild、headed history/board recovery 和正式发布为未完成状态。
