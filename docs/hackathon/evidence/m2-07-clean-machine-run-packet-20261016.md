# M2-07 alpha4 clean machine 执行包（2026-10-16）

## 执行边界

本执行包用于项目负责人本人执行正式 clean machine 验收。当前本地回执仍是 `LOCAL_SIMULATION_ONLY`。执行包不能把本地机器标记为公司 clean machine。

机器完成后，请填写 [clean machine 回执模板](m2-07-clean-machine-receipt-template-20261016.json)。每一步都必须保存命令、输出、退出码和时间。

## 固定输入

```text
SDK=@deepseek-ai/dsh@0.2.1-alpha.4
artifact_sha256=9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
Node=v24.19.0
upstream_pnpm=11.28.5
plugin_pnpm=11.28.2
```

固定材料也包括：

```text
sbom_sha256=2adb75e23a0af0c60ce202f5e4b265549836b4761e758935111d66bbc257bfca
provenance_sha256=5e81763e0fad9ab5952fb6c7b094cf0e01d0a1b0883f469e63b2f672e8d7a0c4
plugin_pack_verification_sha256=a126775bc0985d6926e9e21a70f4e5d743eb335e7fe38ee22ca876a3614c3b25
```

## 执行顺序

1. 创建全新的工作目录。
2. 接收正式 SDK artifact。
3. 运行 `shasum -a 256 <artifact>`。
4. 对比 `9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6`。
5. 校验正式 SBOM 的 artifact subject。
6. 校验 provenance 的 source、lock、Node 和 pnpm。
7. 验证 publisher identity 和 signature。
8. 执行 revocation check。
9. 安装 alpha4 SDK。
10. 执行 `dsh --version`。
11. 执行 `dsh --help`。
12. 导入 SDK 入口。
13. 运行最小插件功能。
14. 校验 `katex/dist/katex.min.css`。
15. 卸载 alpha4 SDK。
16. 安装旧版 `0.1.7-rc.2`。
17. 执行旧版版本检查和 `--help`。
18. 验证旧版仍可启动。
19. 保存所有命令、输出、退出码和时间。

公司环境必须使用独立 HOME、独立 npm/pnpm cache 和新建临时目录。不能复用开发机的全局包、历史 SDK 或本地模拟回执。

## 回执字段

```json
{
  "machine_id": "",
  "os": "",
  "arch": "",
  "node": "",
  "pnpm": "",
  "artifact_sha256": "",
  "sbom_sha256": "",
  "provenance_sha256": "",
  "publisher_identity": "",
  "signature_verification": "",
  "revocation_check": "",
  "alpha4_version": "",
  "alpha4_help": "",
  "sdk_import": "",
  "minimal_plugin": "",
  "katex_css": "",
  "alpha4_uninstall": "",
  "rc2_version": "",
  "rc2_help": "",
  "rc2_start": "",
  "steps": [],
  "status": ""
}
```

## 通过条件

- artifact SHA 一致。
- SBOM subject 一致。
- provenance 一致。
- signature 验证通过。
- revocation check 通过。
- alpha4 安装、导入和最小功能通过。
- alpha4 卸载通过。
- rc2 安装、启动和 `--help` 通过。
- 回执包含每一步的退出码。

## 当前本地参考结果

```text
alpha4 version/help/import/katex_css/uninstall=PASS
rc2 version/help=PASS
formal_clean_machine=NOT_RUN
```
