# 主仓旧领域生产者输出防覆盖修复（2026-10-11）

主仓仍在使用旧 board-components 生产者。领域作者仓已有的修复没有自动覆盖它。本次只对原入口补输出文件保护及有意义的回归，没有切换主仓装配入口、包或锁。当前 HEAD `5390667c`；两份源码/测试增量未提交。机器记录见[shinemage-board-components-main-output-guard-20261011-validation.json](shinemage-board-components-main-output-guard-20261011-validation.json)。

## 问题、修复与审查

原 `copyFile(source, root/lib/member)` 会跟随已存在的文件符号链接。在自有临时夹具里，四种输出路径均使标记文件被改写，原构建仍退出 0；回归断言按预期 exit 1。原日志和标记改写结果保留，没有将失败记录改成通过。

修复先核对四个源文件及目标文件；目标是符号链接或非普通文件时返回 `PACKAGE_BUILD_FILE_SYMLINK`。通过预检后，把内容写进自有临时目录，再 rename 到最终路径，并在 finally 清理两处临时目录。包管理器固定版本、源码 allowlist、不可变 tarball 和同版本冲突守卫保持。

[open-code-review-delegate](/Users/hutou/.agents/skills/open-code-review-delegate/SKILL.md) 仅选择这两份增量；OCR 提供 preview/rules，主 Agent 实际审查 2/2、coverage 100%，没有发现；其他主仓改动未纳入本次审查。没有外部模型端点审查。

## 实际验证

- 修复后四个独立负对照均 exit 1，错误码符合预期；标记字节保持，tarball 没有生成，临时输出目录清空。
- 固定 Node 24.19.0、显式 pnpm 11.28.2 的 `node --test --test-concurrency=1 scripts/dsh-b0/package-inputs.test.mjs`：exit 0，13 PASS / 0 FAIL / 0 SKIP。
- 该入口的正向重建仍为 1955 字节、`22245ab9…`，公开导出/类型、离线安装及原坏输入守卫通过。四个负对照已包含在新增外层测试里，不把计数相加。

原始日志、旧代码快照、自有夹具、补丁和审查在 `/Users/hutou/.codex/tasks/shinemage-domain-delivery-preflight-20261011-8dnlp38u/main-producer-fix`。负测只使用自有标记文件，没有写主仓 lib 或现有固定包。两份源码文件之外，先前主仓成果、输入锁、包、profile、candidate/journal 和官方 npm runtime 字节保持。

没有本轮完整 B0、主仓 hosted CI、新组合准入；没有主仓 commit/push/PR/merge、发布或部署。主仓领域生产者迁移仍是下一项，产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。
