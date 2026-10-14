# M2-07 SDK SBOM 闭包缺口（2026-10-14）

本轮尝试在已有 CycloneDX 364 组件清单上补充 lockfile dependency edges，验证当前 SDK closure 是否足以形成完整 SBOM。结果为 `PARTIAL`，没有把不完整闭包标成发布通过。

## 实际结果

- 输入 closure：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- 组件数：`364`
- dependency entries：`364`
- 已解析到 closure 组件的依赖边：`76`
- 未解析边：`53`
- 未解析边中平台可选原生包：`47`
- 未解析的必需传递依赖：`6`
- 生成报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-sbom-v2-20261014.json`

6 个必需缺口是：

```text
fdir
picomatch
jsbi
@csstools/css-calc
@csstools/css-color-parser
@csstools/css-parser-algorithms
```

47 个其余缺口属于 `esbuild`、`koffi`、`node-addon-require-builtin` 等平台可选原生包；当前闭包是 Darwin arm64 开发 SDK，报告将它们保留为平台 omission，不把它们伪装成已安装。

## 结论与修复方向

当前 SDK closure 可以完成 lockfile inventory 和 OSV 查询，但不能作为完整分发 SBOM。要关闭这个缺口，需要重新生成最终 SDK closure，把 6 个必需传递依赖连同 manifest、文件摘要和许可证纳入，再重新生成 SBOM、签名和干净机器安装回执。这个动作属于候选 artifact 重打包，不能直接修改当前主仓或 live runtime。

因此 M2-07 继续保持 `BLOCKED / OFFLINE_INVENTORY_PARTIAL / DEPENDENCY_GRAPH_PASS`，`release_ready=false` 不变。
