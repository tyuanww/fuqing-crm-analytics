# board-components 领域库作者提案（2026-10-11）

沿用既有分仓计划，已准备 `@shine-mage/board-components@0.1.0` 的独立本地作者目录，28 个可交付路径。它只拥有漏斗/瀑布图纯计算与公开 `.mjs`/`.d.mts`，不是第十个 DSH 插件。本轮不修改计算口径、不初始化 Git、不 commit/clone/建远程仓/push/PR/发布/部署，也不切主仓默认生产者。

来源为主仓 `5390667c` 的九份干净领域输入：八份 manifest、代码、声明、原几何测试及夹具与 Git blob 一致；仅 build.mjs 改为本仓显式 pnpm JS 入口。新根、锁、开发脚本、回归封存输入和 CI 草案均在 task 目录，未整树复制回主仓。

## 实际验证

| 同次 r2 范围 | 结果 |
|---|---|
| 14 项拒读负对照 | 均 EPERM，exit 0 |
| kit frozen offline ignore-scripts 安装 | exit 0，downloaded 0 |
| 固定输入预检、构建、包成员验证 | 各 exit 0 |
| 原几何断言 | 28 PASS / 0 FAIL / 0 SKIP |
| producer 与显式输入合同 | 5 PASS / 0 FAIL / 0 SKIP |
| 最终 r3 准备脚本守卫 | 4 tests / 0 FAIL；相对路径另有两模式 subtest |

r2 只从官方固定来源下载 pnpm 11.28.2 一份归档，SHA-256 `30d4099f…` 与 SHA-512 均匹配已有精确锁，TLS 保持校验；之后普通安装/构建拒绝网络。最终 r3 将 Python 外部输入 assert 改为显式异常，`-O` 模式相对路径和坏摘要仍拒绝，失败与已有目录留存；同一已哈希归档离线准备包管理器成功。未重建 DSH/SDK，未执行包生命周期脚本；pnpm 安装输出的历史“verified 2d ago”不记为本次供应链审计。

Seatbelt 是 allow-default，拒网络及列明源内容/写入，允许元数据；主仓领域/Workbench、实际上游 checkout/build-tools、新原作者目录及九个原插件作者目录的 14 项读取均为 EPERM。其他历史目录和机器资源仍可读，不宣称整机 deny-default。

## 包与边界

新内容包为 1955 字节、5 个成员，SHA-256 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`，与先前封存的领域 tarball 原始字节一致；不含开发 kit、测试或输入。当前构建无独立 tsc，保持 NOT_IN_CURRENT_BUILD；主仓的公开类型消费合同没有搬成 owner 私有测试。CI YAML/各 Bash run 与本地配方实际通过，Ubuntu/GitHub CI NOT_RUN。

主仓原领域 build、三项 producer 目的、公开解包/类型和跨消费者锁检查继续执行。owner 的 producer.test.mjs 保留可复现、同版本冲突及错/浮动包管理器拒绝目的，跨消费者绑定仍由主仓维护。只有作者提交、真实 clone、CI 与固定包输入具备后才能迁移生产者；不删除旧副本或为了变绿移除门禁。

具体目录、28 路径摘要、来源与日志在同名机器记录及 task HANDOFF。主审已读全部新脚本；本项未执行提交前 skill review 或 OCR，因为尚未授权 Git 交付。SDK 分发仍 BLOCKED，产品 PARTIAL，release_ready=false；普通领域包不获得 DSH plugin-pack/candidate 或签名发布身份。
