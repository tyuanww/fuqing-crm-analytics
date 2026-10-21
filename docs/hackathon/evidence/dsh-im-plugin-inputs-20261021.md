# DSH IM 插件输入固定与校验

日期：2026-10-21（北京时间）。

## 结论

线上 v5 profile 的 `@xmanrui/dsh-im@5.2.0` 和 `dsh-plugin@2.0.5` 已定位到精确 GitHub commit，并取得可复现的离线 tarball。两份归档均通过字节数、SHA-256、pnpm lock 中的 SHA-512 integrity、顶层目录 commit 和后缀 `package.json` 身份校验。

该结果关闭“包或索引完全未归档”的输入缺口，但不把 owner-operated 现场升级为正式 release。`release_ready` 仍为 `false`，签名、公司发布授权、生产切换、canary 和 rollback 仍需单独执行。

## 固定输入

| 包 | 版本 | commit | bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `@xmanrui/dsh-im` | `5.2.0` | `0b9cbc24b60a9218820a10ed1f9c8fe913aa23c5` | 13227610 | `8d87caa71d921e9134b3d987a66ea59878ca445500703712c8b8053d49732d6d` |
| `dsh-plugin` | `2.0.5` | `dfd56ec530b217f1ee7675f470b3a5ff780a2e85` | 6955036 | `af455abd4d68f3d673e5003ae62a60ef42716a63a18dc7e1c5bbe1c78f976430` |

两份归档的 SHA-512 integrity 与线上 profile `pnpm-lock.yaml` 中的记录逐字一致。机器可读回执见 [dsh-im-plugin-inputs-20261021.json](dsh-im-plugin-inputs-20261021.json)，固定输入声明见 [config/dsh-im-plugin-inputs.v1.json](../../../config/dsh-im-plugin-inputs.v1.json)，长期字段和错误码见[固定输入参考](../../reference/dsh-im-plugin-inputs.md)。

## 复验命令

```bash
node scripts/release/im-plugin-inputs.mjs \
  --input-dir /absolute/path/to/pinned-im-inputs
```

校验器拒绝以下情况：

- lock 声称 `release_ready=true`；
- 文件名越界、重复包或未知包；
- tarball 字节数、SHA-256 或 SHA-512 integrity 漂移；
- 顶层目录不绑定固定 commit；
- 归档包含链接、设备、路径穿越或超限条目；
- 归档内 `package.json` 的包名或版本不匹配。

## 边界

- 校验器只读取归档，不安装、不启动插件、不访问模型或 IM 服务。
- 该结果不证明消息发送、账号绑定、权限隔离、失败恢复或生产可用。
- 线上服务、`current` symlink、`release-marker.json` 和候选 receipt 均未因本次输入固定而改写。
