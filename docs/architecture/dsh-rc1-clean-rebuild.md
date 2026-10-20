# 为什么 rc1 候选必须重建 runtime 和 profile

这次问题不是 UI 上少一个开关，而是打包边界和运行时依赖边界不一致。`pnpm deploy --prod` 可以成功，但 web profile 仍可能在启动时找不到只通过 peer 注入的 DSH 包；macOS 复制出来的 `._en.json` 也会被当成 locale 文件读取。干净重建把这些输入变成同一份可校验的 candidate subject，失败就停在构建阶段。

## 问题

一次“下载最新 Harness，再把插件装进去”的操作会把多个变化混在一起：上游 host、SDK、插件包、profile、生成文件和本机 HOME 状态没有共同 digest。这样会出现：

- profile 声明了插件，但 production-only runtime 没有对应 peer alias，页面只在启动或打开插件页时报 `ERR_MODULE_NOT_FOUND`；
- 包里混入 AppleDouble `._en.json`，locale loader 把它当语言 id；
- 插件市场 UI 在壳里出现，但 market bundle 或 index 不在候选输入中；
- 旧 profile 或旧 cookie 被新 runtime 复用，登录后看到空白页，无法判断是认证、包还是状态问题；
- 一个候选失败时没有旧 runtime 可回退，只能在现场继续改文件。

## 设计

```text
固定 Harness SHA + lock
          │
          ├── production-only runtime
          │     ├── peer alias closure
          │     ├── portable/native path scan
          │     └── secret + AppleDouble scan
          │
          ├── profile + plugin-market bundle
          │     └── source/generated/tarball provenance
          │
          └── candidate receipt
                ├── browser/native checks
                ├── IM artifact status
                └── promotion decision
```

`runtime-bundle.mjs` 显式维护 web plugin peer alias 闭包，并在 seed 前执行 fail-closed 检查。`owner-profile-bridge.mjs` 只解析候选 runtime 内已验证的 top-level 或 pnpm canonical peer root。`secret-scan.mjs` 对 Linux x64 生成的 DevTools chunk 只允许精确 path + SHA-256 的已知 vendor 字符串，避免用“整目录忽略”掩盖真实 secret。

profile 和 runtime 是两个不同的证据面：runtime 证明可启动的字节闭包，profile 证明要加载哪些插件。两者都通过后，浏览器才检查登录、插件页、Settings、会话和市场 Discover。IM 仍是独立的输入门禁，缺包不能由 profile 或 UI 通过来代替。

## 取舍

- **显式 alias 清单**：会多维护一小组 DSH peer 名称，但缺包会在构建时失败，避免用户先看到空白页再追模块错误。
- **只链接候选 runtime**：牺牲“本地改一个文件立即生效”的便利，换来 artifact 可复现和 side-by-side 回退。作者开发仍可用 `--plugin-path`，不能把邻近源码带进发布 bundle。
- **保留 plugin market bundle**：候选体积增加，但市场入口和 Discover 不再依赖一个未记录的全局安装。
- **IM 缺口阻塞切换**：牺牲一次提前上线，换来插件集合完整；`release_ready=false` 比上线后部分功能消失更容易回退和解释。

## 为什么不打临时补丁

临时删除 `._en.json`、手工补一个 symlink 或把旧插件目录复制到新 runtime，只修复当前机器的表现，不会改变 source/profile/runtime 的身份。下次重建会再次丢失，且无法证明线上实际运行的字节。正确修复是在打包器、profile bridge 和测试中固定边界，再生成新的 immutable candidate。

## 当前实例

v4 过渡候选 `dsh-0.2.1-rc.1-clean-main-20261020-v4` 已通过 runtime provenance、native boot、Settings/account RPC、浏览器插件页、plugin-market Discover、peer alias 未注入时的 fail-closed 负测和 AppleDouble 检查。2026-10-21 线上指向该 runtime 的 owner-operated 现场 side-load `dsh-0.2.1-rc.1-core-main-20261020-v5`；query.9 与最终 WeKnora 输入防护后的 profile 快照为 `6c688d22…`，旧 marker 仍是 v4/PREPARED、候选 receipt 仍是 `c3ec7df3…`。IM 输入已为 `PINNED_INPUTS_VERIFIED`，但统一发布身份、签名、独立验收和切换授权仍未完成，所以 `release_ready=false`。

## 相关文档

- [构建与验收操作手册](../operating/dsh-rc1-clean-upgrade-runbook.md)
- [候选字段参考](../reference/dsh-rc1-clean-candidate.md)
- [Harness 与插件分离的总体说明](./dsh-candidate-and-plugin-upgrade.md)
