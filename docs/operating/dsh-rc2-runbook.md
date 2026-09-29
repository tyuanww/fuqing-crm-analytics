# DSH rc2 发布与回退 Runbook

发布 owner 只接收 `PUBLISHED_VERIFIED` 的 publication sidecar，核对 tag、reviewed source SHA、rc2 upstream SHA、manifest schema、source tarball、固定 rc2 production runtime tarball、CI evidence index 和 `SHA256SUMS`。由于启用 immutable release 后发布资产不可再追加或修改，publication sidecar 在 draft 阶段只做合同预检，发布后由 workflow 重新生成并作为 Actions evidence artifact/杭州 evidence 文件交付；它不作为发布后再上传的 GitHub Release asset。release workflow 在固定 upstream checkout 上构建并 attests 两个 tarball；杭州必须同时提供两个文件和两份 attestation，服务器禁止 `git pull`、浮动 main 和现场编译。

## 现场顺序

1. 记录旧 checkout/source SHA、旧 rc1 upstream、env SHA-256、runtime 路径、systemd 状态、端口、磁盘、WAL 和 route config SHA 到 `host-preflight.md`。
2. 先在新 `releases/<tag>` 目录执行 `deploy/wsl/install-release.sh`，必须显式提供 `RELEASE_UPSTREAM_RUNTIME`、`RELEASE_RUNTIME_ATTESTATION_BUNDLE`、`RELEASE_OWNER`、`RELEASE_RESTART_DEPENDENCY`、publication/checksum/evidence 路径和 source attestation bundle；脚本会绑定 reviewed ref、校验五类 release asset 摘要，并在 runtime、checksum、evidence 或 provenance 未验证时拒绝解包。
3. 运行内部 loopback healthcheck 和七组 UAT。没有 operator 隔离时，`operator_gate_method=none`，不能把 hostname 验证写成 canary；service 重启即正式 cutover gate。
4. 获得对应授权后再执行 `activate-release.sh`，必须再次提供匹配的 `RELEASE_OWNER` 与 `RELEASE_RESTART_DEPENDENCY`，只切换 `current` symlink；仅重启自己拥有的 DSH service。CRM、WeKnora、Cloudflare route 不因 rc2 自动重启或修改。
5. 失败时记录 `rollback.json`，使用 `rollback-release.sh` 并再次提供匹配的 owner/restart dependency 恢复旧 target/env/runtime，再复验 `healthcheck.sh --all`。稳定窗口结束前不删除旧版本。

触发回退：manifest/checksum 不一致、systemd 未 active、DSH/page/CRM healthcheck 失败、认证或 CORS 失败、关键路径 5xx、控制台未处理异常或产品 owner 明确阻断。现场真实路径、用户、权限和恢复命令以 systemd unit/receipt 为准，不能照抄示例路径。

真实模型、完整真实业务、移动端、131GB DuckDB 和 WSL2 冷验证在证据未运行时保持 `PARTIAL/NOT_RUN`。
