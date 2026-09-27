# T10 developer workflow contract evidence（2026-09-26）

实现提交：77350599。

`pnpm dsh` 现在提供统一帮助、版本输出、命令白名单和稳定退出码；未知命令以 `DSH_COMMAND_UNKNOWN` 与退出码 2 失败。`release` 的 tag 配置优先级为显式 `--tag`、`DSH_RELEASE_TAG`、配置文件 `release_tag`、VERSION 默认值；配置文件路径优先级为 `--config`、`DSH_CONFIG_FILE`、仓库 `.dshrc.json`。发布准备仍必须显式 `--offline`/`--dry-run`，不触发远端副作用。

验证：Node24 aggregate release tests 57/57 PASS；`--help`、`--version`、未知命令退出码、`release --help` 和 `verify` 的 synthetic PASS/RELEASE_BLOCKED 输出均通过。clean git-archive checkout 的 CLI doctor/version/verify 已通过（230ms，verify exit 2 为门禁预期）；完整 TTHW、真实 CI 和杭州接收仍未运行；T10 保持 PARTIAL。
