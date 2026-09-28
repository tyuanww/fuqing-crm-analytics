# DSH rc2 release trust model

DSH rc2 的生产输入是经过审查和校验的 immutable artifact。杭州主机不从 Git 工作树拉取代码、不追踪浮动 `main`，也不在现场重新编译。这样做解决的是一个具体问题：同一个版本如果在开发机、CI 和杭州被分别构建或分别选择文件，文件来源、依赖和回退目标就可能不一致。

## 发布链路

```text
reviewed clean commit
        |
        v
pre-manifest + exact allowlist + secret scan
        |
        v
source tar.zst + fixed rc2 runtime tar.zst + release-manifest + SHA256SUMS + CI evidence
        |
        v
secure receive -> new side-by-side release directory
        |
        v
owner/restart dependency check -> atomic current activation
        |
        v
healthcheck + release UAT -> authorized cutover or rollback
```

每一层都绑定 source SHA、产品版本、DSH upstream SHA 和 payload digest。当前 `0.18.0.2` 分支的 allowlist 还明确保留 `.github/workflows/dsh-release-evidence.yml`，因为接收后的 reviewed source 必须包含生成和验证 evidence 的 workflow；无关 workflow 不会因此被放进 artifact。

## 为什么 fail-closed

- **allowlist** 先定义允许进入包的路径，denylist 和 secret scan 再排除凭据、缓存、日志、数据库、WAL 和构建残留。
- **schema** 固定 manifest 的字段、路径和类型。未知、重复或不安全路径在解包前失败。
- **secure unpack** 先写入新的 staging 目录，限制条目和展开后大小；source 包拒绝 traversal、链接和设备文件，runtime 包只允许 stage 内的相对 symlink/hardlink；成功后才允许接收方继续校验。
- **payload digest** 同时核对 archive、manifest 和每个 payload 文件。只验证 archive 外层 SHA 不能证明解包内容没有被替换。
- **publication trust** 将 GitHub Release、protected tag、reviewed SHA、CI evidence、`SHA256SUMS` 和 attestation 绑定在一起。缺少其中任一项时，安装保持 `NOT_AVAILABLE` 或 `RELEASE_BLOCKED`。
- **side-by-side activation** 新版本先独立落盘，`current` 只在 owner 和 restart dependency 匹配后原子切换。旧版本在稳定窗口结束前保留，回退使用已记录 receipt。

## 取舍

这条链路比 `git pull` 和现场构建慢，也会留下 manifest、receipt 和旧 release 目录，需要持续维护证据格式。代价换来的是可审查来源、可重复接收和可执行回退。真实 GitHub/OIDC、WSL2 冷启动、operator route、15 分钟 SLI 和现场 UAT 仍是独立门禁；synthetic 测试通过不会把这些门禁变成 PASS。

## 相关文档

- [release artifact reference](../reference/dsh-rc2-release-artifact.md)
- [rc2 Quickstart](../operating/dsh-rc2-quickstart.md)
- [rc2 发布与回退 Runbook](../operating/dsh-rc2-runbook.md)
- [T2 接收历史证据](../release/dsh-rc2-candidate/archive/t2-receive-gate-20260926.md)
- [当前验证账本](../release/dsh-rc2-candidate/verification.md)
