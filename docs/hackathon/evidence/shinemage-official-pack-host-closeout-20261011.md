# 独立包宿主导入修复与隔离诊断（2026-10-11，本地未提交）

主仓基线 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`；Workbench 作者仓基线 `92dfa171cf8ea298bdceee5634b418269e711a37`。本轮继续[固定包开发入口迁移](shinemage-profile-pack-migration-20261011.md)，不改 DSH 上游、版本、原正式包、candidate 或 journal。代码与本页均未提交；PR #119 与九个插件 PR #1 的既有 CI 不覆盖这些新字节。

机器记录见[validation JSON](shinemage-official-pack-host-closeout-20261011-validation.json)。原始命令、日志、诊断目录与失败轮次保留在 `/Users/hutou/.codex/tasks/shinemage-official-pack-host-20261011-o2mozyxq/`。

## 实际问题与修复

1. 主仓 `pluginInstallEnv` 将固定 Node 的 Corepack 目录放在调用方 PATH 前，遮蔽已经准备的 pnpm。原七包首次官方安装因请求 `pnpm/latest` 而在禁网沙箱失败，保留 `install-r1.json`。本地修复优先使用已准备的 PATH 入口，核对 pnpm `11.28.2` 并禁止 Corepack 联网；DSH CLI 仍由选定 Node 执行。`reload` 在创建 runtime、停止自有实例之前做相同预检。错误 `11.28.1` 的真实 CLI 负测退出 1，runtime 未创建，当前状态文件仍不存在，没有发送停止请求。
2. 原 Workbench 运行输出直接 import `dsh-client-connection` 和 `dsh-llm`，manifest 只声明 `dsh-tools` peer。原七个正式包的官方安装和配置生成通过，但 Workbench 实际宿主导入失败。官方 profile resolver 的只读诊断确认缺失 `dsh-client-connection`，六个 leaf 导入成功；未手工添加 SDK 链接绕过。
3. Workbench 作者仓补齐两个精确 `0.1.7-rc.2` peer。构建读取真实 host 输出的 esbuild metafile，拒绝未声明的外部运行依赖；开发依赖和开发链接不能充当运行声明。原严格 host/client 类型检查、包 ID、版本、其他 peer 及固定工具链保持。

## 分层结果

| 实测层级 | 本轮结果 | 范围与证据 |
|---|---|---|
| 原七包官方安装及配置生成 | PASS | `install-r2.json`；网络禁止，业务源码负对照 EPERM。安装成功不证明激活。 |
| 原 Workbench 宿主激活 | FAIL | `import-diagnostic-r3.json`、`host-r1.json`；缺失运行 peer，原包和失败日志未改。 |
| 修改 manifest 的隔离宿主诊断 | 开启、原生关闭、恢复三阶段 PASS | `host-r4.json`。同一合成会话的原生持久化标题投影和 seq 3 在三个独立进程间保留；每阶段无插件导入失败、未运行 Agent prompt，结束后自有进程及 4328 回收。 |
| Workbench 新修复的本地 Linux 构建链 | PASS | `linux-workbench-r2/result.json`：离线安装、输入预检、host/client 严格类型检查、构建、24 个文件的 196 PASS / 0 FAIL / 0 SKIP、链接检查和内容包。不是 GitHub Actions 或 WSL2。 |
| 主仓开发入口及包合同回归 | 114 PASS / 0 FAIL / 0 SKIP，exit 0 | `dev-regression-r6.json`，13 个测试文件；显式 Node 24.19.0、Python 3.14.4 和固定上游。不是完整 B0。 |
| 错误包管理器提前拒绝 | PASS | `reload-negative-r1/result.json`；发生在创建 runtime、停止实例之前。 |

宿主诊断使用原解包产物的运行文件，Workbench 仅换成作者仓当前 manifest；它不是原正式包验收。策略拒绝主仓九个业务插件、领域源码、九个原作者仓和旧构建来源，两个实际负对照 EPERM；只允许本次 loopback 网络。这是指定产品来源拒读，不是整机 deny-default 沙箱。

Linux 消费者从作者仓固定提交真实 clone 后应用当前四个代码/manifest 改动；没有复制旧 `lib/` 或 `node_modules/`。只挂载该消费者、独占输出与只读固定 CI 输入，没有挂载主仓或兄弟作者仓。使用已有固定 Linux x64 镜像与 Node 24.19.0，在本地 Docker 的架构仿真环境运行，网络关闭。新内容包 441127 字节，SHA-256 `f5e9dfe41859b0ae3254cbaddf12a128e89cd3c53bde82b84f366beef03ae5d7`，8 个成员。7 个非 manifest 成员与诊断输入同字节，manifest 已变；pnpm 去掉 packageManager 的变化仍单独记录。该包是普通 content pack，新的正式 pack/candidate 尚未生成。

## 审查、失败与留存

`open-code-review-delegate` 使用 OCR 1.12.12 实际 preview 和规则解析。主 Agent 覆盖主仓 8/8 可审文件、Workbench 4/4 代码/manifest 文件；主仓此前已审且未改字节按摘要复核。Markdown 由主 Agent 补充检查，默认 OCR 不收录。两个实际产品问题已本地修复，无开放发现；该模式没有调用外部模型，不抵扣历史外审缺口。

失败轮次均保留：`host-r1` 的 RPC 参数使用 `request`，官方 `session/list` 要求 `_request`；`host-r2/r3` 错误假设列表顶层 title 或投影 title 对象，`host-r4` 按官方 `values.title: string | null` 合同核对。Linux r1 将上游自身作为 Docker 挂载根，根目录 UID 0、`.git` UID 501 导致 Git 所有权拒绝；r2 改挂载输入父目录，未添加 safe.directory、未修改所有权或上游。主仓回归 r5 漏配 Python 3.14 PATH/变量，10 项失败保留；r6 按既有解释器入口补齐环境后通过。OCR 首轮 PATH 未包含已安装 CLI，失败记录保留，第二轮使用实际固定入口。

## 当前身份与下一步

candidate `591134e8e4d45913d95d17caf6c4281fcc5b09e96ac11eeb3fe53b4401c1f0d1` 及 journal seq 3 未改；原七包 manifest/tarball 未覆盖。它们不继承修改 manifest 的诊断结果，原 candidate 的当前宿主/服务/目标/浏览器/正式回退验收仍未关闭。

后续按授权审查提交作者仓修复及主仓迁移，再从干净的新固定提交生成新的正式 pack、candidate 和对应回执。live CLI reload、默认源码 pipeline 与 CRM/Knowledge 组合入口迁移、Cordis 4.0.2/4.0.4 运行兼容、真实模型/CRM/WeKnora/UAT、独立版本发布、主仓副本 stop/go 清理和独立 DSH 升级仍开放。本轮没有 commit、push、合并、发布、部署、删除、真实数据访问或远端变更；VERSION 0.20.0.0、SDK BLOCKED、产品 PARTIAL、release_ready=false 保持。
