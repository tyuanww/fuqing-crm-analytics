# DSH rc2 发布与回退 Runbook

发布 owner 只接收 `PUBLISHED_VERIFIED` 的 publication sidecar，核对 tag、reviewed source SHA、rc2 upstream SHA、manifest schema、source tarball、固定 rc2 production runtime tarball、CI evidence index 和 `SHA256SUMS`。创建 `dsh-*` immutable tag 前，必须先完成同一 reviewed SHA 的 `dsh-release-preflight`；evidence workflow 会下载并复用 preflight 生成的 runtime tarball，而不是在 tag 后首次发现依赖扫描问题。由于启用 immutable release 后发布资产不可再追加或修改，publication sidecar 在 draft 阶段只做合同预检，发布后由 workflow 重新生成并作为 Actions evidence artifact/杭州 evidence 文件交付；它不作为发布后再上传的 GitHub Release asset。release workflow 在固定 upstream checkout 上构建并 attests 两个 tarball；杭州必须同时提供两个文件和两份 attestation，服务器禁止 `git pull`、浮动 main 和现场编译。GitHub tag 信任由 `dsh-release-tags-immutable` Ruleset 校验，不使用已废弃的 `/tags/protection` API。

## 现场顺序

1. 记录旧 checkout/source SHA、旧 rc1 upstream、env SHA-256、runtime 路径、systemd 状态、端口、磁盘、WAL 和 route config SHA 到 `host-preflight.md`。
2. 通过 Tailscale 只传入 `release-publication.v1.json` 和两份 attestation sidecar；随后在杭州执行 `deploy/wsl/fetch-release.sh`。该脚本让主机直连 GitHub Release，支持断点续传和重试，使用临时文件校验六个资产的大小/SHA-256，最后才原子改名并生成 `release-fetch.v1.json`。不要用 `scp`/`rsync` 中转大 runtime 包。
3. 再在新 `releases/<tag>` 目录执行 `deploy/wsl/install-release.sh`，必须显式提供 `RELEASE_STATE_PATH`、`RELEASE_UPSTREAM_RUNTIME`、`RELEASE_RUNTIME_ATTESTATION_BUNDLE`、`RELEASE_OWNER`、`RELEASE_RESTART_DEPENDENCY`、publication/checksum/evidence 路径和 source attestation bundle；脚本会绑定 reviewed ref、校验五类 release asset 摘要，并在 runtime、checksum、evidence、provenance 或 durable journal 未提供时拒绝解包。
4. 运行内部 loopback healthcheck 和七组 UAT。没有 operator 隔离时，`operator_gate_method=none`，不能把 hostname 验证写成 canary；service 重启即正式 cutover gate。
5. 获得对应授权后再执行 `activate-release.sh`，必须再次提供同一个 `RELEASE_STATE_PATH`、匹配的 `RELEASE_OWNER` 与 `RELEASE_RESTART_DEPENDENCY`，只切换 `current` symlink；仅重启自己拥有的 DSH service。CRM、WeKnora、Cloudflare route 不因 rc2 自动重启或修改。
6. 失败时记录 `rollback.json`，使用 `rollback-release.sh` 并再次提供同一个 `RELEASE_STATE_PATH`、匹配 owner/restart dependency 恢复旧 target；该 wrapper 只切换 `current`/`current-target` 并写 receipt，同时把回退事件写入 durable journal；它不恢复 env、Python/runtime、CRM image，也不重启 systemd。现场必须按回执逐项恢复这些 owner-owned 依赖，再由同一 owner 重启自己的服务并复验 `healthcheck.sh --all`。稳定窗口结束前不删除旧版本。

触发回退：manifest/checksum 不一致、systemd 未 active、DSH/page/CRM healthcheck 失败、认证或 CORS 失败、关键路径 5xx、控制台未处理异常或产品 owner 明确阻断。现场真实路径、用户、权限和恢复命令以 systemd unit/receipt 为准，不能照抄示例路径。

真实模型、完整真实业务、移动端、131GB DuckDB 和 WSL2 冷验证在证据未运行时保持 `PARTIAL/NOT_RUN`。

## 2026-09-30 r3 现场记录

当前实际 release、source/upstream SHA、杭州 receipt、sidecar 和未关闭门禁见 [r3 收尾记录](../release/dsh-rc2-candidate/closeout-20260930.md)。r3 已在杭州 `current` 运行；生产 durable `release-state.json` 仍是旧 r1 journal，不能把 r3 resume/reconcile 写成已验收。r3 的 immutable source/runtime 包不含 `node_modules`，本次安装后手工补充了 8 个 peer links；自动生成链接的修复尚在本地提交，下一次 release 前必须重新构包。
