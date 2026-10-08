# A/B/C 后续交接核验（2026-10-08）

承接[剩余准入](shinemage-abc-remaining-20261008.md)和[当前配方查询包](shinemage-abc-kernel-current-20261008.md)。本轮只读核验证据、归档新增输入并明确下一步前提；没有重跑完整 B0，也没有把之前的测试标作本轮新跑。产品仍 **PARTIAL / release_ready=false**。

## 现场与实质进展

- HEAD 与保存引用仍为 `e577f41b9247e3ac56052e21f84daed9dd32f163`，保持 detached HEAD。本地 `origin/main` 引用为 `fcbd1324ac5a4b7367d9d7d2bb9bbebdbf32ba25`，未 fetch，不声明远端实时状态。VERSION 仍 `0.20.0.0`。
- 保留进入时 25 个已跟踪修改、8 个未跟踪文件。原主成果树 14 份未提交文件以及固定上游 HEAD/lock/index/status 与先前保护摘要相同。
- 核对 24 条日志、回执、归档、manifest、当前配方及 wheel 摘要，全部匹配已有记录。shell/tool 12 PASS（内部 25 场景）与查询冷安装 3 PASS 仍是上一轮实测，本轮未重跑。
- 用户确认没有可验收的真实 `COCKPIT_EXAMPLE_PACKAGE`；现有两处 RevenueReview 命中都是测试代码。standalone 保持 **NOT_RUN**，不生成替代页面，不重复搜索。

## 已定位现有服务绑定，不生成新 profile

原始 profile 存在于只读主成果树：

`.context/checks/first-purchase-terminal-candidate-20261007/plugin-candidate/profile.json`

- ID：`first-purchase-source-http-local`。
- profile SHA-256：`be3948850fc414ce1524226a544783de1ecb3253514cc7f1d8f3280280b3d0af`。
- 服务源码：`f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`。
- 对应原始源码兼容回执：`.context/checks/first-purchase-source-packages-20261007/source/receipt.json`，SHA-256 `9a6a4a7a28e0ffc69441394c18030b0a51eb2a881c4d00566b535931f3b391b0`。

使用当前 `validateProfile`、`validateServiceGate` 和 `prepareServiceCompatibility` 只读复核：profile/候选内嵌回执/原回执字节一致，返回 **LOCAL_COMPATIBLE**，激活仍为 `BLOCKED_SERVICE_PACKAGE_AND_HOST_EVIDENCE_REQUIRED`。这验证旧绑定在当前验证器下仍有效，不证明当前 ABC 包组合或真实服务已验收。

当前 `config/dsh-profile.rc2.json` 仍无 service_binding；没有复制或选择旧 profile，没有创建新 profile 或新候选，没有追加旧 journal。`loadReleaseProfile` 要求 profile 位于候选仓库根目录内，不能把另一个工作树的绝对路径直接当作当前可执行 CLI 输入。后续若明确选择保留该历史服务组合，可按原字节导入当前树的独立候选输入位置再核验；本轮未执行此选择。完整组合仍需另对齐 CRM/查询包与 v4/v5 输入。

验证脚本初次因结果汇总误写一层 `profile` 属性而失败，修正控制器后通过；原脚本保留，没有修改产品校验器。详情在 `.context/checks/abc-handoff-verify-20261008/profile-result.json` 与 `final-protection.json`。

## 增量证据归档

新归档位于 `.context/archives/shinemage-abc-20261008/`：

- `remaining-admission-evidence.tar.gz`：95 个文件，18,815,487 字节。
- SHA-256：`ea3287f30142d15419b5e30092f62f2e0d57377ecc016d298e9e3deb7892f4f1`。
- 清单：`remaining-admission-manifest.json`，含原路径、归档成员、大小、mtime 和摘要。

包含 shell/tool 顶层回执/日志/观测、两次查询打包记录、新包及 15 个 wheel、历史 profile/源码回执/candidate/journal 原字节副本。每个成员均回读验 SHA；归档时原文件字节/mtime 未变。运行 HOME、jobs、tmp、安装 venv 和展开源码目录未纳入，原目录仍保留。先前三份归档未覆盖。这是本地封存，不是异机备份、重做验收或发布信任。

## 下一项与边界

standalone 等真实页面包；正式 candidate 等明确提交授权及带服务绑定的既有 profile 选择，当前仍 **NOT_LINKED**，正式 CI **NOT_RUN**。没有运行 candidate，没有 commit/push/PR/合并/发布/部署。

SDK 分发 BLOCKED、嵌入 PARTIAL、内联 NOT_VERIFIED，7 版本/29 公告未重查；B 六项外部 OCR、真实模型/业务/生产和原 document-release 外审仍未通过。物理分仓、多仓 CI/发布、DSH 升级继续受既有 stop/go 约束。未读取真实 DuckDB，未操作杭州、6677、旧 CRM、WeKnora 或 DSH 上游。
