# 主仓 profile 测试归属迁移（2026-10-11）

本轮继续既有主仓装配迁移，不新增业务功能。主仓 HEAD `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`；代码及记录未提交。独立 Workbench 的八份待授权修改保留原字节，其余作者仓未改。

## 改动与归属

- profile 生成器属于主仓，原 `dsh-plugins/crm-knowledge/test/profile.test.mjs` 的五项测试正文移到 [主仓测试](../../../scripts/crm-calibration/profile.test.mjs)。只改变生成器 import 的相对路径，夹具及所有断言同字节，正文 SHA-256 为 `4b10a1a5f8fcd13e731ef000485c977c0dbf22c33da43d1145d557be9daffdf2`。
- CRM 旧测试路径保留两行兼容转发；[默认 B0](../../../scripts/dsh-b0/pipeline.mjs) 的 page/knowledge/profile 三入口组使用新路径。
- 本次不修改 `prepare-profile.mjs`、组合读取器、profile 配置、插件 manifest、peer 或运行 JS。不修改正式包、candidate/state/journal；历史原始证据保留。

## 本次实际验证

固定 Node `24.19.0`、Python `3.14.4`，DSH `0.1.7-rc.2` / 上游 `477b4f420553e8a52c2fbccc464d7561b239c443`。page/knowledge 沿用两份既有 profile 的正式固定包，Cordis 实际 `4.0.4`，声明 `4.0.2` 未改。

| 命令层级 | 实际结果 | 边界 |
|---|---|---|
| 默认 B0 对应三入口组 | 14 PASS / 0 FAIL / 0 SKIP，exit 0 | 同次含两组公共组合九项与原 profile 五项；指定插件源码/原作者仓拒读，网络只准 localhost |
| CRM 旧测试入口 | 5 PASS / 0 FAIL / 0 SKIP，exit 0 | 相同五项的兼容重跑，不能累加为十九项 |
| 指定源码负对照 | 五份 EPERM，exit 0 | 含旧 profile 测试、CRM/Knowledge 源码与两个作者 manifest；不是整机 deny-default |

三入口命令与 pipeline 参数相同；本次只执行这一组，不是执行整条 pipeline。profile 检查创建并删除自有合成夹具，公共组合沿用原测试的 HTTP 生命周期回收；未生成逐个端口回执，不宣称现场端口验收。

原始材料在 `/Users/hutou/.codex/tasks/shinemage-profile-test-ownership-20261011-nrmjmovb/`：`snapshot-r1.json`、`assertion-migration-r1.json`、`validated-results-r1.json`、源码拒读策略/负对照、`composition-r1/*/runtime-inputs.json` 和 `logs/`。机器记录见[validation JSON](./shinemage-main-profile-test-ownership-20261011-validation.json)，其中记录实际命令、输入摘要和保护文件核对。

## 仍开放

Workbench 源码构建、七个生产者入口、历史作者输入守卫/源码隔离夹具仍保留。新 hosted CI 还缺固定 artifact 定位与读取权限，完整 B0 未执行；Workbench 新干净提交与新正式包仍待对应授权及验证。不能用原包或旧 CI 覆盖未提交字节，也不能据此删除副本。

当前 candidate 的正式服务、目标、浏览器与回退、整体 Cordis 兼容和真实模型/CRM/WeKnora/UAT，独立发布/install/rollback、独立 DSH 升级及适用 SDK 门禁均未由本轮关闭。SDK 分发仍 BLOCKED，产品 PARTIAL，`release_ready=false`，VERSION `0.20.0.0`。本轮没有 commit、push、PR、合并、发布、部署、远端配置或删除。
