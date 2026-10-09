# SDK 配方固定运行时预热 — 2026-10-08

固定 pnpm 12.7.0 已在专属 HOME/state/store/cache 中原生物化 Node 26.10.0 与 24.6.0；随后两轮真正禁网查询成功。此前“冷 runtime 无法只靠 PATH 和原始 tar 离线消费”的静态结论仍正确，本轮通过原管理器支持的实际预热补齐了这项准备条件。

| 实际执行 | Node 26.10.0 | Node 24.6.0 |
| --- | --- | --- |
| 原生 dlx 精确 runtime --version，正常 TLS 准备 | exit 0，13.233 秒 | exit 0，17.385 秒 |
| 同 state/store/cache，sandbox deny network*、offline=true | exit 0，v26.10.0 | exit 0，v24.6.0 |
| 新隔离 HOME，禁止写既有 state/store/cache、禁止网络 | exit 0，v26.10.0 | exit 0，v24.6.0 |

六次查询只执行版本入口，没有安装源码依赖或运行源码 build。GVS 实际 Node 的 SHA256 分别为 `56d28b39a8048f0cd1af7ad7e09f6cbe1c04439b6dfeb6c8d9090c082af60861`、`ef8ab7964265226a7d162bb33e85c1ad6181b69a7e2282ebb526c6b0be65c204`，与前轮官方归档中核验的二进制逐字节相等。

原生解析器取得 SHASUMS 和 detached `.sig`，按固定实现的正常签名路径成功，未关闭 TLS、签名或完整性验证。缓存清单正文与前轮官方 TLS 清单一致。该记录不扩大成独立撤销审计或 SDK 顶层签名/native 门禁通过；`release_ready=false`。

## 接收位置与边界

根目录：`/Users/hutou/.codex/worktrees/shinemage-candidate-admission/fuqing-crm-analytics/.context/checks/sdk-runtime-prewarm-20261008/`。

- `offline-environment.json`：准确配置键，尤其 `PNPM_CONFIG_STORE_DIR`、`PNPM_CONFIG_STATE_DIR`、`PNPM_CONFIG_CACHE_DIR` 和 `PNPM_CONFIG_OFFLINE`。
- `runtime-identities.json`：原生 slot、实际 canonical 二进制、官方摘要对照。
- `logs/`：两次在线准备、两次禁网和两次异 HOME 只读消费原始命令、环境和结果。
- `online.sb` / `offline.sb`：用户原 HOME 内容不可读，只允许新根及两个精确协调锁写；离线 profile 加 deny network*。
- `readonly-consumer/readonly.sb`：仅新消费者目录允许写，已有缓存禁止写。前后 6461 个常规文件摘要一致，没有新增、删除或变化。
- `runtime-baseline-manifest.json`：6461 个常规文件、8 个链接的基线；SHA256 `5d561d4500457043e0ef5f7b7a578ec444f72db7176aa3892e11968d5f6994b4`。

原生 slot key 包含 store/v11/links 的绝对路径，所以搬目录后是否仍可消费没有验证，不能凭复制成功推断可用。原位消费已用另一份隔离 HOME 和禁写缓存的 sandbox 验证。

主 Agent 已授权将这一个根下的 **store、state、cache 三目录** 原位交 B 独占写入后续配方依赖。A 完成基线后停止对这些目录写入。这里是“基线时点可核验，live cache 后续由 B 追加”，不是全目录永久封存。原始请求/日志、控制器、环境、基线和 summary 保留；接收方 HOME/work/tmp 继续隔离，不与 A 的版本查询环境混用。

机器记录见 [validation](shinemage-sdk-runtime-prewarm-validation-20261008.json)，与基线 summary 字节相同，SHA256 `863de9f059f62a9c4fb0fd8ab12e613ac708866699334857d801fc4371afbed5`。本次没有重跑 B0、业务验收或源码配方，没有改产品代码、candidate/journal、默认工具链，也没有提交或发布。
