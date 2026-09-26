# archive → rc2 candidate 功能差异清单

- public main 基线：`ba2f887b1ec55f26d7cb3849d327072140abbd95`（`origin/main`）
- archive 参考 HEAD：`3bb484bb2aaeff3b395a82b6414a31ed5ce0f6b3`；dirty 路径：106 个。候选位于隔离 worktree，archive 工作树未修改。
- 产品 VERSION：`0.18.0.1`（public main `0.18.0.0` 的候选 patch）；DSH：`0.1.7-rc.2`；upstream：`477b4f420553e8a52c2fbccc464d7561b239c443`。

| 范围 | 候选处理 | 当前证据状态 |
|---|---|---|
| DSH pin、peer/build 与 native-first 默认 | 选择性合并 archive 的相关源码与测试；toolchain 固定 rc2；品牌覆盖受 `SHINE_BRAND_OVERRIDE=on` 守卫，默认 off | PARTIAL，Node24/B0 待重跑 |
| release artifact / promotion | 新增 schemas、接收、解包、side-by-side 脚本；本轮安全审查已阻断伪 PASS 与不安全路径，剩余真实 GitHub trust/reconcile 未接通 | PARTIAL / RELEASE_BLOCKED |
| WSL 运行层 | 保留 public main 基础，补 rc2 candidate wrappers；不执行杭州重启、切换或 route 修改 | NOT_RUN |
| auth/action/operator/evidence | 仅有 synthetic contract；尚未接入真实 host handler、operator identity 或 15 分钟 HTTP 场景 | PARTIAL / NOT_RUN |
| 真实业务、模型、131GB DuckDB、Cloudflare 切换 | 明确排除 | NOT_RUN |

该清单是迁移与审查证据，不表示 GitHub Release、杭州接收或生产切换已授权。
