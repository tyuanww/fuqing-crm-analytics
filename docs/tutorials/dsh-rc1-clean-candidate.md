# 教程：从固定上游构建可回退的 DSH rc1 候选

这份教程带你从固定的 Harness 上游构建一个隔离候选，并在不触碰线上 `current` 的情况下验证原生 web、插件市场和 profile。完成后，你会得到一个有 runtime、profile、检查回执和回退边界的候选。IM 输入当前已核验，但仍须绑定统一候选身份和正式发布门禁，不能因输入存在就切到线上。

## 你需要什么

- 本仓库干净的上游 checkout，SHA 必须是 `1600d8a1e140dcde43a1a0941940a0480712c011`，`pnpm-lock.yaml` SHA-256 必须是 `952ca2f79998660dc690b739078a5d6052bc7c5c2193714b918b9d720baaeaba`。
- Node `24.x`，插件 pnpm `11.28.2`，上游 pnpm `11.28.5`。
- `--portable-linux` 这一步必须在 Linux x64 builder 上运行；Mac builder 只运行不带该选项的本机 bundle 检查。
- 已构建的插件 pack inputs 和一个全新的 staging 目录。
- 不要把真实数据库、用户 HOME 或正在运行的线上 runtime 复制进 staging。

## 第一步：锁定输入

```bash
export DSH_UPSTREAM=/absolute/pinned/deepseek-harness
export CANDIDATE=/absolute/staging/dsh-rc1-clean
export PACK_INPUTS=/absolute/staging/profile-pack-inputs.json
export DSH_RELEASE_LANE_CONFIG="$PWD/config/dsh-rc1-release-lane.json"
git -C "$DSH_UPSTREAM" rev-parse HEAD
# dsh-dev diagnose/check/start 还会拒绝 pnpm-lock.yaml 摘要漂移
node --version
pnpm --version
```

输出必须显示上游 SHA 和 Node 24。插件构建使用 pnpm `11.28.2`，上游 checkout 使用 lane 配置记录的 pnpm `11.28.5`，两个角色不能用一个 `latest` 输出代替。`DSH_RELEASE_LANE_CONFIG` 只为本次 rc1 lane 覆盖 SDK/upstream 输入，release toolchain 和 `dsh-dev` 校验都会读取它，不会修改 `dsh-plugins/plugin-kit/toolchain.json`；只有需要另一份完整 `dsh-b0-toolchain/v2` 文件时才设置 `DSH_COMPOSITION_TOOLCHAIN`。若上游 checkout 有修改，先停下来重新准备；不要用 `latest`、浮动分支或邻近 worktree 代替固定输入。

## 第二步：生成 runtime 并运行只读检查

```bash
mkdir -p "$CANDIDATE"
node scripts/release/runtime-bundle.mjs \
  --upstream "$DSH_UPSTREAM" \
  --output "$CANDIDATE/runtime.tar.zst" \
  --provenance "$CANDIDATE/runtime.provenance.json" \
  --portable-linux

node scripts/dsh-dev/cli.mjs check \
  --plugin on \
  --upstream "$DSH_UPSTREAM" \
  --pack-inputs "$PACK_INPUTS" \
  --runtime "$CANDIDATE/runtime-check"
```

`runtime-bundle.mjs` 会检查 peer alias、外部 symlink、生成路径、敏感文件和文本 secret。`cli.mjs check` 只准备 profile 和配置，不启动线上服务。缺少明确的 web peer 时，构建必须以 `RUNTIME_EXTERNAL_WEB_PLUGIN_PEER_MISSING` 失败。

在 macOS 上做本机 bundle 检查时，去掉 `--portable-linux`；该选项只接受 Linux x64 builder。portable bundle 不能由 Mac 结果代替。

## 第三步：启动候选并观察原生功能

先确认隔离端口 `14327` 没有被其他候选占用；启动器遇到占用会失败，不会替你停止其他实例。

```bash
node scripts/dsh-dev/cli.mjs start \
  --plugin on \
  --upstream "$DSH_UPSTREAM" \
  --pack-inputs "$PACK_INPUTS" \
  --runtime "$CANDIDATE/runtime-check" \
  --web-port 14327 \
  --page-http on \
  --page-http-port 18125 \
  --detach

node scripts/dsh-dev/cli.mjs status
node scripts/dsh-dev/probe.mjs
```

未认证的 web 根路径应为 `401`，一次性启动 URL 兑换 cookie 后才允许页面读取。候选浏览器检查至少覆盖：原生插件页、Settings、登录回调、会话入口和插件市场 Discover。控制台没有日志时，回执写 `console_logs=EMPTY`；没有浏览器回读时写 `PASS_WAITING_BROWSER`，不能写成完整登录通过。

## 第四步：确认 profile 与插件市场

候选 profile 必须明确列出 DSH base、web app、7 个 Shine Mage 插件和 `@deepseek-ai/dsh-experimental-plugin-market-bundle`。插件市场是 profile 的一部分，不能靠运行时扫描邻近源码补上。检查 profile SHA、bundle 列表和 plugin market Discover tab 后，再把结果写入候选回执。

## 第五步：IM 输入已核验，但正式发布仍需身份链

当前 IM 输入记录为：

```text
im.inputs=PINNED_INPUTS_VERIFIED
release_ready=false
```

这表示 IM 归档已按线上 lock 的 SHA-512 integrity、SHA-256、commit 根目录和包身份核验并与 recovery 回执留存；它不表示统一候选身份、publisher/signature、独立验收或切换授权已完成。若另一次构建确实没有 IM 输入，应保持失败状态并停止 promotion，不能用旧插件目录、未审查下载包或临时补丁填充。

## 你现在拥有的东西

- 一个可复现的固定上游和 runtime digest。
- 一个只属于本候选的 profile 与 plugin market 输入。
- 原生 web、插件页、Settings 和浏览器登录边界的检查结果。
- 明确的 IM pinned-inputs 状态、仍缺的正式发布门禁和旧 runtime 回退目标。

下一步看[升级操作手册](../operating/dsh-rc1-clean-upgrade-runbook.md)执行完整回执和 side-by-side 切换条件，再看[候选参考](../reference/dsh-rc1-clean-candidate.md)核对字段。
