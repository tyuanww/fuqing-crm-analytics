# 原授权租约包的组合接收记录

候选组合从 CRM 作者 `ed5940f` 更新到 `21a7368decf3a72f784436880ccb8e597673cae8`，包含 `openNativeSnapshotLease`。主仓组合锁、来源清单、artifact 锁和公共契约锁使用同一来源。DSH 保持 `0.2.1-rc.3`，Cordis 保持 `4.0.5`。

此单元交付固定包输入。Host 页面代理、Python resolver 与结果桥、Workbench 同源传输仍未接通。真实业务和杭州切换未执行，产品仍为 PARTIAL。

## 严格包与运输来源

作者 [CI 40120160600](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/40120160600) 成功。其内容包缺少生成字节证明，严格接收器拒绝直接使用。实际准入包另从干净作者源码离线、隔离构建，保留生成字节证明；没有降低接收规则。

| 对象 | 固定身份 |
|---|---|
| 严格包 manifest SHA-256 | `32ac0c057e924a28ad8bad2fc17602aaa537b39b108526529cce1cb07213ef19` |
| CRM tarball SHA-256 | `08dcb2fef9f99fe8f9b41fc6f35aac874e8f8fbba4021264da3eead149e0544b` |
| 组合锁 SHA-256 | `a765253433bb76c0a98b5c9183bcd59567fcbb428ed4b227970ddd4753be5832` |
| 运输提交 | `5a507e2fd745db038b1341fd2c9838c8f91ccd8a` |
| 上传 CI | [40122150615](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40122150615)，SUCCESS |
| 组合 artifact | `12571627062`，729891 bytes |
| 组合 ZIP SHA-256 | `d799ff5b26fd2f626c3c873602d6cb9fa20939334a932807c84cf437ffe2c5ec` |
| 公共契约 artifact | `12570806402`，来自同一作者提交 |

严格包的四个运行文件与作者 CI 内容包逐字节一致。`package.json` 仅因 `pnpm pack` 去掉 `packageManager` 而不同，其余 JSON 字段严格相等。首次全字节比较失败的证据保留，不把两种打包方式宣称为完全相同。

运输分支只保存组合输入，不合入主仓。20 个 payload 中仅 CRM manifest 和 tarball 改变，其余 18 个保持原字节。其他八插件、领域输入与 profile 不变。

## 实际接收与验证

远端 ZIP 已下载，大小和摘要与 GitHub metadata 一致。受限解包后 20 个文件逐字节匹配运输输入。严格接收核对九插件、一个领域包、来源 SHA、生成证明与 peer，主仓实际 CLI 使用新锁接收通过。公共契约 31 份材料读回通过。

负测拒绝旧组合锁配新 CRM 包，也拒绝旧 artifact 锁配新组合锁。两次检查保持门禁，不通过修改版本号或接收器绕过输入不一致。

输入独立审查未发现新增已确认 P0–P2。初次审查未找到 Comment Sicko 正文，随后从已安装插件定位真实规则，补做专项检查，删除、恢复与修改建议均为零。审核采用已获授权的同模型 Codex CLI 替代，不是跨模型审计或零缺陷证明。

本地复跑组合和契约检查使用当前仓库命令，输入目录必须指向这一组合。

```sh
node --test scripts/ci/composition-pack-inputs.test.mjs \
  scripts/ci/public-contract-inputs.test.mjs \
  scripts/release/plugin-source-manifest.test.mjs
```

## 运行包和业务边界

前置修复提交 `3d7dd687` 已正常推送，全后端 3408 项通过、79 项跳过，另有 71 项未选入和 28 项警告。B0 Python 897 项及 41 个子测试通过，保留 23 项警告。其[运行包预检 40121477077](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40121477077) 成功，artifact `12571353989` 仅核对元数据，未下载或部署。该运行包仍消费旧 CRM 组合，不代表本次新组合预检已通过。

旧预检 `40115158182` 的陈旧断言已修，新预检未再失败；旧失败后的长等待原因仍未定位。本次组合提交的 CI 和运行包预检以 [PR #164](https://github.com/tyuanww/fuqing-crm-analytics/pull/164) 精确提交为准，不借用旧结果。

正式 main bundle 仍为 `NOT_RUN`，删除门禁为 `BLOCKED`，`release_ready=false`。真实登录、知识库诊断看板、页面保存重开与撤权、近两年 RFM 预热及商品缓存仍需独立验收。本轮没有合并、发布或操作杭州。

本机接续证据位于 `/private/tmp/dsh-rc3-final.ELtVwt/native-page-composition-r1/`，临时目录不作为公开持久附件。
