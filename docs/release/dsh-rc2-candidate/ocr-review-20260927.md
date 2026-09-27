# rc2 候选第二轮代码审查（2026-09-27）

审查方式：`open-code-review-delegate`；OCR 负责 range preview/rule，宿主逐文件检查代码、脚本、schema、插件 pin 和验证入口。

| 指标 | 数值 |
|---|---:|
| range | `ba2f887b1ec55f26d7cb3849d327072140abbd95..HEAD` |
| preview total_files | 156 |
| reviewable_files | 131 |
| excluded_files | 25（Markdown/文档类另行核对） |
| reviewed_files | 131 |
| skipped_files | 0 |
| coverage_rate | 100% |

## 发现与修复

- **HIGH** `deploy/wsl/activate-release.sh` 与 `rollback-release.sh`：原先只绑定 owner 或不绑定 owner，可能让错误 service/dependency 使用同一 release root。修复：激活和回退都强制校验 `RELEASE_OWNER` 与 `RELEASE_RESTART_DEPENDENCY`，并在 marker 上 fail-closed。
- **HIGH** `scripts/release/promotion.mjs`：原先只校验 SHA256SUMS/evidence 文件摘要，没有验证 SHA256SUMS 内容和 evidence index 的 schema/tag。修复：解析 artifact/manifest checksum，校验 evidence schema 与 release tag。
- **HIGH** `scripts/release/secret-scan.mjs`：synthetic 豁免原先只依据 secret 值中的 marker，生产配置可通过写入 `test` 等词绕过。修复：豁免必须同时位于显式 fixture/test/spec 文件。
- **MEDIUM** `.github/workflows/dsh-release-evidence.yml`：缺少 job timeout/concurrency。修复：加入 15 分钟 timeout 和按 ref/tag 的并发组，禁止同一 release 互相取消。
- **LOW** `scripts/dsh.mjs`、`scripts/release/promotion.mjs`：清理未使用 import，避免误导后续维护。

## 当前审查结论

上述发现已在当前工作树修复；定向 promotion/auth/operator 测试通过，完整 `pnpm dsh test` 当前为 56/56。未发现仍需阻断本地候选的 Critical/High 代码问题。

外部门禁仍不属于本轮本地审查可替代的证据：GitHub protected tag/OIDC attestation、WSL2 冷验证、真实 HTTP SLI/backpressure、浏览器 UAT 与杭州 service/route 切换继续保持 `NOT_RUN/PARTIAL`。
