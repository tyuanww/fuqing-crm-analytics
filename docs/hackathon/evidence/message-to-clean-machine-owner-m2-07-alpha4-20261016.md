# 发给 clean machine 负责人

## 主题

请在隔离 clean machine 完成 M2-07 alpha4 安装、卸载和 rc2 回退验收

## 消息正文

你好。请在没有开发机缓存和历史依赖的隔离 clean machine 上执行 M2-07 alpha4 验收。

验收对象：

```text
SDK=@deepseek-ai/dsh@0.2.1-alpha.4
artifact_sha256=9f4fe0f466d7699ddd4686ee9692ec10c6d9f98a7d175fd5e55de01b2f64c8d6
upstream_sha=86a402200d95fecef4529d969836f1fe13c6cb0d
Node=v24.19.0
upstream_pnpm=11.28.5
plugin_pnpm=11.28.2
```

请严格按下面顺序执行：

1. 接收正式 artifact。
2. 计算并校验 artifact SHA-256。
3. 校验正式 SBOM 的 subject 和 closure。
4. 校验 provenance、publisher identity、signature、verification 和 revocation 材料。
5. 安装 alpha4 SDK。
6. 执行 `dsh --version`。
7. 执行 `dsh --help`。
8. 导入 SDK 入口。
9. 运行一个最小插件功能。
10. 校验 `katex/dist/katex.min.css`。
11. 卸载 alpha4 SDK。
12. 安装旧版 `0.1.7-rc.2`。
13. 执行旧版版本检查和 `--help`。
14. 验证旧版仍可启动。
15. 保存完整命令、输出、退出码和时间。

请在回执中提供：

- machine 标识。
- OS 和架构。
- Node 版本。
- pnpm 版本。
- artifact SHA-256。
- SBOM SHA-256。
- 每一步的命令和退出码。
- 安装结果。
- 导入结果。
- 最小功能结果。
- 卸载结果。
- rc2 回退结果。
- 旧版启动结果。
- 失败步骤的完整原文。

验收通过条件：

```text
alpha4 安装通过
alpha4 version/help/import/最小功能通过
KaTeX CSS 解析通过
alpha4 卸载通过
rc2 回退通过
rc2 旧版启动通过
正式 artifact SHA 与回执一致
```

当前本地只有 `LOCAL_SIMULATION_ONLY`。请返回正式 clean machine 回执，不要把本地模拟结果作为公司验收结果。
