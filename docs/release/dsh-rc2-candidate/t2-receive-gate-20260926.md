# T2 artifact receive gate（2026-09-26）

候选 worktree：`codex/dsh-rc2-candidate`；本轮实现提交：`81f8cf3a`；产品版本：`0.18.0.1`；DSH upstream：`477b4f420553e8a52c2fbccc464d7561b239c443`。

## Public receive CLI

从干净提交生成 synthetic artifact 后，使用与 `deploy/wsl/install-release.sh` 共用的 `receiveArtifact` 实现，通过公开命令入口接收：

```text
PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH pnpm dsh release --offline --tag dsh-0.18.0.1-t2-receive
PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH pnpm dsh receive \
  --artifact .context/release-evidence/dsh-0.18.0.1-t2-receive/dsh-0.18.0.1-t2-receive.tar.zst \
  --manifest .context/release-evidence/dsh-0.18.0.1-t2-receive/release-manifest.v1.json \
  --destination /tmp/dsh-t2-receive.WMc9Jd/out
```

结果：`DSH_RECEIVE_PASS tag=dsh-0.18.0.1-t2-receive entries=1663`；artifact bytes `4119089`；artifact SHA-256 `3362a632f425d06b107f059b1942a843b9f208c4946a0ff4c335dadfc55f00e3`；manifest source SHA `81f8cf3af2e8ead6544e43439b8ef7377f4754b0`。接收目录为一次性临时目录，未触碰真实 DuckDB/WAL。

## Fail-closed evidence

`PATH=...node@24... pnpm dsh test`：**22/22 PASS**。新增隔离负测覆盖：

- archive digest mismatch、manifest 非规范路径和 payload 路径不一致；
- `..` traversal、duplicate path、symlink/link/device 和 group/world writable mode；
- 压缩流/展开后大小限制、最终内容 secret scan 和 deny-name；
- zstd bounded stream、runtime entrypoint 缺失和空/非法 receive limits。

`secure-unpack.py` 在失败时只写入同级 staging 目录，并在 zstd 超限或解压失败时 kill/wait 子进程；成功后再 rename 到目标目录。接收方随后重新枚举 allowlist、逐项校验 payload bytes/SHA-256，并扫描最终树。

## Scope and remaining gate

该证据只证明本机 Node 24、隔离 synthetic artifact 的 receiver gate。GitHub `PUBLISHED_VERIFIED`、OIDC/signature provenance、杭州 Windows/WSL2 冷接收、operator gate、真实业务 UAT 仍保持 `NOT_RUN/PARTIAL`，不能据此宣称 release 或生产切换完成。
