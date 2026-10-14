# M2-07 SDK SBOM 闭包缺口（2026-10-14）

本轮先在已有 CycloneDX 364 组件清单上补充 lockfile dependency edges，再按 closure 内实际 package manifest 和 symlink 关系复核，验证当前 SDK closure 是否足以形成完整 SBOM。lockfile 直接投影会产生保守误报，因此以实际 manifest graph 作为运行依赖结论。

## 实际结果

- 输入 closure：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- 组件数：`364`
- dependency entries：`364`
- 已解析到 closure 组件的依赖边：`76`
- 初始 lockfile 投影未解析边：`2`
- 实际 manifest graph 运行依赖边：`1,101`
- 实际 manifest graph 未解析运行依赖：`0`
- 可选依赖 omission：`61`
- types-only omission：`72`
- benchmark fixture omission：`2`
- lockfile 投影报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-sbom-v2-20261014.json`
- 实际 manifest graph 报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-closure-20261014/candidate-sdk-manifest-graph-20261014.json`
- 实际 manifest graph SHA-256：`1c263597848b7ed8c4348fa29cb71acd6423e85809bfc7c1e3e5d248d83d781d`

初始 lockfile 投影显示的两个缺口是：

```text
picomatch@4.0.4
jsbi@4.3.2
```

实际 closure 复核后，`picomatch` 由已安装的 `4.0.7` 满足声明范围，`jsbi` 只属于 types-only package；47 个平台原生包的 lockfile omission 也被实际 manifest graph 归入可选 omission。它们都没有形成运行时未解析依赖。

## 结论与修复方向

当前 SDK closure 的实际运行依赖图已经闭合，但仍不能直接作为完整分发 SBOM：CycloneDX 当前只覆盖 364 个可识别 package manifest，仍缺最终 artifact 的完整 provenance、发布者身份、签名、撤销验证和干净机器回执。后续应从最终 SDK artifact 重新生成带 scope、原生内容和来源字段的 SBOM，再进行签名和干净机器验收；不能直接修改当前主仓或 live runtime。

因此 M2-07 继续保持 `BLOCKED / OFFLINE_INVENTORY_PARTIAL / DEPENDENCY_GRAPH_PASS`，`release_ready=false` 不变。
