# How to 运行固定 Node 与 Python 的前置测试

使用 `scripts/ci/pregate-runner.sh` 一次性运行 gstack 选出的 JavaScript 和 Python 测试文件。脚本会在执行测试前核对 Node 24 与 Python 3.14，避免当前机器默认解释器漂移成假通过。

## 前置条件

- 当前目录位于 Git worktree 内；
- Node 测试使用 Node `24.x`；
- Python 测试使用 Python `3.14`，并已安装项目测试依赖；
- 每个文件以 `.mjs`、`.js`、`.cjs` 或 `.py` 结尾。

## 步骤

1. 显式选择两个固定解释器，并确认版本。

   ```bash
   node24_prefix="$(brew --prefix node@24)"
   export PREGATE_NODE="${DSH_DEV_NODE:-$node24_prefix/bin/node}"
   export PREGATE_PYTHON="${FQ_B0_PYTHON:-$(command -v python3)}"
   "$PREGATE_NODE" --version
   "$PREGATE_PYTHON" --version
   ```

   不使用 Homebrew 的机器把 Node 24 的绝对入口写入 `DSH_DEV_NODE`；PATH 上的默认 `node` 即使是 25，也不会被 runner 接受。

2. 传入本次需要运行的文件。

   ```bash
   bash scripts/ci/pregate-runner.sh \
     scripts/ci/pregate-runner.test.mjs \
     knowledge/crm/tests/test_validate_pack.py
   printf 'pregate_status=%s\n' "$?"
   ```

   脚本把所有 JavaScript 文件放进同一次 `node --test --test-concurrency=1`，把所有 Python 文件放进同一次 `python -m pytest -q`。不得用互相覆盖的历史 PASS 数替代本次输出。

## 验证

只有退出码 `0` 才表示两个语言组均通过。至少保留实际命令、解释器版本、文件清单、测试总数和退出码。

可以单独验证 runner 自己的边界测试：

```bash
"$PREGATE_NODE" --test scripts/ci/pregate-runner.test.mjs
```

## 排障

| 现象 | 处理 |
|---|---|
| `PREGATE_REPOSITORY_ROOT_UNAVAILABLE` | 在 Git worktree 中运行，不要在临时目录直接执行脚本 |
| `PREGATE_NODE_REQUIRED` / `PREGATE_NODE_VERSION` | 设置 `PREGATE_NODE` 或 `DSH_DEV_NODE`，并确认主版本为 24 |
| `PREGATE_PYTHON_REQUIRED` / `PREGATE_PYTHON_VERSION` | 设置 `PREGATE_PYTHON` 或 `FQ_B0_PYTHON`，并确认版本为 3.14 |
| `unsupported pregate test file` | 只传入 runner 支持的测试扩展名；不要把配置、文档或二进制文件放入文件列表 |

## 边界

runner 不安装依赖、不升级解释器、不启动服务，也不判断测试是否覆盖完整产品。它只把调用方选中的文件交给固定语言运行时；远端 CI、真实模型、CRM UAT 和生产验收仍需分别取证。

## 相关

- [验证入口](verification.md)
- [DSH IM 插件固定输入参考](../reference/dsh-im-plugin-inputs.md)
