# 2026-10-27 真实编辑 UAT 修复组合准备

基线为主仓 `76fd03d97594fa97087f964e0ef32e284204d6d5`，主仓 PR 叠加 #179。两项作者修复与组合运输均已推送，CI 成功；新插件尚未应用到杭州，真实编辑 UAT 仍未通过。隔离缓存 19 项已用新进程回读，全部 READY、computed=0。这不能代替修复后编辑、保存和重开复验。

## 输入和能力边界

Workbench PR `tyuanww/dsh-analytics-workbench#7` 固定来源 `240ec691af49d3157028303b723df19420a03987`，作者 run `40448022894`；CRM PR `tyuanww/dsh-crm-knowledge#4` 固定来源 `ee7ebeccc4401a8801f866d950dd11f34dc1b85d`，作者 run `40448177408`。主会话已核对两项 workflow success。本地再次核对六份 ZIP 的字节数与主会话提供的 GitHub artifact SHA-256。

作者 CI formal ZIP 分别为 artifact `12708519307` 和 `12709496654`。两份 manifest 均缺少 `generated_bytes_provenance`，实际严格消费者返回 `PLUGIN_PACK_BUILD_PROVENANCE_REQUIRED`，没有直接采用，也没有放宽守卫。使用现有 `writeBuildProvenance`、`packPlugin` 和 `readPluginPack`，在精确来源的独占 clean clone 中离线冻结安装并真实构建，得到以下本地严格包；它们与 CI formal ZIP 是不同对象。

| 包 | 严格 manifest SHA-256 | 严格 tarball SHA-256 |
|---|---|---|
| Workbench | `f84d61a191907b4c49e3ec19f53c0d68db07daa0c3d309b9959637618b7eaa40` | `06236a69b997fbecbf6b75228e1a1082e7368b1a892725d5200cba4435f2d65c` |
| CRM | `81f630646e48b950712d32ffef01f84f468effb2b94ac054641ce490db88bcf2` | `bc1570538783c9d22d6e02d1e506a539f87357d263e7eb12c091a6a35af71ae6` |

Workbench 公共材料来自 artifact `12708838768`，core 回执来自 `12708314624`；CRM 公共材料来自 `12709302143`，CI 证据 ZIP 为 `12709601265`。公共锁保留原 Brand 来源与原生成器摘要。Workbench 作者回执实际读取为 163 文件、1,342 PASS、0 FAIL、0 SKIP；主仓没有重跑作者 core。浏览器、standalone 和真实业务未由该 core 回执覆盖。

原组合 artifact `12646823772` 的本地封存 ZIP 按原锁 SHA-256 `99b05508856388740d01990091656aef8b4a7d1c07c94040301abdf2df704c0c` 再核对。复用现有安全解包白名单，只替换上述两个严格包。其他七插件、领域包与两份来源 profile 保持原字节；SDK `0.2.1-rc.3`、固定上游及 Cordis `4.0.5` 未改变。

## 实际验证与剩余门禁

- 原 `composition-pack-inputs.mjs` 接收本地严格组合 ZIP 成功，核对九包、领域包、两份来源 profile 及完整业务 profile。新组合锁 SHA-256 为 `79d1657cba40fd55fecbaff6cf6b68c7a2bafbc00893dc34c5968b2ec43f2d75`。
- 原公共合同读取器核对 31 份材料，投影与主仓全部同字节，未修改派生源码。原 15 个生成器检查及两组公共合同测试（4、2 项）成功，检查暂存目录字节保持不变。
- 作者 core 读取与正式严格包来源、manifest 及 tarball 三项绑定通过；其余七包和领域包的原始字节比较通过。
- 初轮四文件输入守卫为 66 项、65 PASS、1 FAIL；旧 artifact 锁与新组合锁不匹配，来源检查也被阻断。真实运输归档回读并更新 artifact 锁后，连同来源检查的五组测试为 80 PASS、0 FAIL、0 SKIP。失败证据保留，未跳过检查或修改断言。
- CRM 首次本地冻结安装因未设置其专属 pnpm entry 而失败；补齐 `CRM_KNOWLEDGE_PNPM_ENTRY` 后在新的独占 clone 完成严格构建。首轮失败证据保留。一次性验证脚本曾误读默认 toolchain 不含的 Cordis 字段，改为核对正式 rc3 lane 与实际包 peer 后完成验证，仓内校验逻辑未修改。

本地独占证据根为 `/private/tmp/dsh-uat-fixes-artifacts-20261027/composition-preparation/`，含派生脚本、strict 构建回执、接收回执、公共合同日志、守卫失败及完整 diff。Node 为 `24.19.0`；本机 Python 为 `3.14.8`，使用既有 B0 依赖环境，未安装或升级依赖。

## 真实运输归档回读

运输提交为 `d1ac5ddcd18df1080a884128068ddd02f830f414`，[运行 40450769373](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40450769373) 成功。artifact `12710800468` 为 781,287 bytes，SHA-256 为 `aabc01fb79731076ea7df971079efb8f089254293812d0525fd6ed106cd40a8a`。已核对 GitHub 元数据、真实下载字节及来源提交，并用原消费者重新接收九包、领域包和完整业务 profile；artifact 锁绑定新组合摘要。

运输分支 7/7 文件独立审核通过。20 个运输成员中，仅两插件的四个文件改变，其余 16 个保持原字节。原作者 CI formal 包和本地严格重建包仍分开记录，不能混称同一份 CI 字节。

隔离访问曾因私有 SSH 路径大包丢失而反复重连。单客户端运行时 MTU 限制已恢复模型与 CRM 连接 UI；自动回退试验也已完成。这是连通性复核，不是修复后业务 UAT，也不是永久 VPN 配置修复。未重启或切换现役，未改业务库。

完整 B0、主仓 hosted CI、正式运行包接收和修复后的真实编辑复验仍待完成。产品为 `PARTIAL`、`release_ready=false`。
