# DSH IM 插件固定输入参考

`scripts/release/im-plugin-inputs.mjs` 用于核对线上 profile 已选中的 `@xmanrui/dsh-im` 和 `dsh-plugin` 两个 GitHub 源归档。它只验证输入字节，不安装插件、不启动 DSH、不发送消息，也不把输入存在提升为正式发布。

当前输入的维护源是 [`config/dsh-im-plugin-inputs.v1.json`](../../config/dsh-im-plugin-inputs.v1.json)。现场校验结果记录在 [`dsh-im-plugin-inputs-20261021.md`](../hackathon/evidence/dsh-im-plugin-inputs-20261021.md)。

## 命令

```bash
node24="${DSH_DEV_NODE:-$(command -v node)}"
python314="${FQ_B0_PYTHON:-$(command -v python3)}"
"$node24" --version
"$python314" --version
"$node24" scripts/release/im-plugin-inputs.mjs \
  --input-dir /srv/shinemage/dsh/recovery/im-plugin-inputs-20261021 \
  --python "$python314"
```

在持有归档的目标机执行上述命令。`--input-dir` 必填，目录中必须存在 lock 指定的两个普通文件。`--lock` 可选，默认是仓库内 lock。`--python` 可选，默认依次读取 `IM_PLUGIN_PYTHON`、`FQ_B0_PYTHON` 和 PATH 上的 `python3`；实际解释器必须属于 Python 3.14。

成功时向 stdout 输出 `shinemage-im-plugin-inputs-receipt/v1` JSON，并始终包含 `release_ready=false`。失败时只向 stderr 输出稳定错误码，退出码为 `2`。

## Lock 字段

| 字段 | 约束 |
|---|---|
| `schema_version` | 精确为 `shinemage-im-plugin-inputs/v1` |
| `release_ready` | 必须为 `false`；校验器拒绝把输入验证写成发布就绪 |
| `runtime.dsh` | 当前固定为 `0.2.1-rc.1` |
| `runtime.cordis` | 当前固定为 `4.0.5` |
| `inputs` | 恰好两个包：`@xmanrui/dsh-im` 和 `dsh-plugin`，不得重复 |
| `package` / `version` | 包身份与版本，必须和归档根目录 `package.json` 一致 |
| `repository` | 只接受 lock 绑定的两个 GitHub 仓库 URL |
| `commit` | 40 位小写 Git SHA |
| `source_url` | 必须由 repository 和 commit 推导出的 codeload 归档 URL |
| `tarball` | 单文件名，不允许目录或路径穿越 |
| `bytes` / `sha256` | 归档字节数和 SHA-256，必须与实际文件一致 |
| `integrity` | 线上 `pnpm-lock.yaml` 使用的 `sha512-...` integrity，必须逐字一致 |

## 归档检查

校验器先按字节读取输入，再复制到本次独占的临时目录检查，避免校验后又从未受控路径读取。归档必须满足：

- 只有一个 GitHub 顶层目录，目录名以 `-<commit>` 结尾；
- 不包含链接、设备、FIFO、绝对路径、反斜杠或 `.`/`..` 路径段；
- 条目数和声明总字节数不超过上限；
- 根 `package.json` 是普通文件，并在读取上限内；
- 包名和版本与 lock 完全一致。

## 稳定错误

| 错误 | 含义 |
|---|---|
| `IM_INPUT_SCHEMA` / `IM_INPUT_ENTRY_SCHEMA` | lock 顶层或单个输入条目的字段集合不符 |
| `IM_INPUT_RELEASE_BOUNDARY` | lock 试图声明 `release_ready=true` |
| `IM_INPUT_RUNTIME_SCHEMA` / `IM_INPUT_DSH` / `IM_INPUT_CORDIS` | 固定运行时声明不符 |
| `IM_INPUT_SELECTION` / `IM_INPUT_PACKAGES` / `IM_INPUT_DUPLICATE` | 输入不是恰好两个受支持且不重复的包 |
| `IM_INPUT_PACKAGE` / `IM_INPUT_VERSION` / `IM_INPUT_COMMIT` | 包身份格式不符 |
| `IM_INPUT_REPOSITORY` / `IM_INPUT_URL` | 来源不能由当前包和 commit 推导 |
| `IM_INPUT_TARBALL` / `IM_INPUT_TARBALL_PATH` | 文件名不是安全单文件名 |
| `IM_INPUT_BYTES` | 声明字节数不是受支持的正安全整数 |
| `IM_INPUT_SHA256` / `IM_INPUT_INTEGRITY` | lock 中的摘要算法或编码格式不符 |
| `IM_INPUT_SHA256_MISMATCH` | 输入字节与 lock 不一致 |
| `IM_INPUT_INTEGRITY_MISMATCH` | SHA-512 integrity 与线上 lock 不一致 |
| `IM_INPUT_DIRECTORY_REQUIRED` / `IM_INPUT_FILE_INVALID` / `IM_INPUT_SIZE_MISMATCH` | 输入目录缺失，或归档不是锁定的普通文件、字节数漂移 |
| `IM_INPUT_PYTHON_VERSION` | 实际 Python 不是 3.14 |
| `IM_ARCHIVE_INVALID` | 归档不存在、是链接或超过压缩包大小上限 |
| `IM_ARCHIVE_ENTRY_LIMIT` / `IM_ARCHIVE_SIZE_LIMIT` | 条目数或解出总字节数超过上限 |
| `IM_ARCHIVE_LINK_OR_DEVICE` / `IM_ARCHIVE_PATH_INVALID` | 归档含不允许的成员、绝对路径、反斜杠或 `.`/`..` 路径段 |
| `IM_ARCHIVE_DUPLICATE_PATH` / `IM_ARCHIVE_ROOT_INVALID` | 归档包含重复成员，或不止一个顶层目录 |
| `IM_ARCHIVE_COMMIT_MISMATCH` | 顶层目录没有绑定目标 commit |
| `IM_ARCHIVE_PACKAGE_MISSING` / `IM_ARCHIVE_PACKAGE_INVALID` | 根 `package.json` 缺失、超限或不能解析 |
| `IM_INPUT_PACKAGE_MISMATCH` / `IM_INPUT_VERSION_MISMATCH` | 归档内包身份与 lock 不一致 |

## 边界

- 输入校验 PASS 只表示两个归档的当前字节、来源声明和包身份一致。
- 消息发送、账号绑定、权限隔离、失败恢复、canary 和回滚均不在本工具范围内。
- 正式发布仍需统一 runtime/profile 身份、publisher、签名、独立验收和切换授权。

## 相关

- [DSH rc1 干净候选参考](dsh-rc1-clean-candidate.md)
- [DSH rc1 release lane](../operating/dsh-rc1-release-lane.md)
- [DSH 验证入口](../operating/verification.md)
