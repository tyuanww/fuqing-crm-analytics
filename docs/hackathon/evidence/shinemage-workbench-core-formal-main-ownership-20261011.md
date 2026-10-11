# Workbench 当前正式包与主仓 core 归属迁移（2026-10-11）

本轮基线为主仓 `codex/shinemage-abc-local-candidate` / `5390667cc990fa558b0445aa455b086d325a6c77` 加起始 118 项未提交内容。保留继承修改、旧包与失败证据；主仓没有提交、推送或合并。Workbench 作者仓仍干净地停在已授权提交并推送的 `d038f3577efec91e75fcf711a60b1fb868d7bcd5`。

机器摘要、实际命令和 55 份原始文件摘要绑定见[validation JSON](./shinemage-workbench-core-formal-main-ownership-20261011-validation.json)。原始材料根为 `/Users/hutou/.codex/tasks/shinemage-workbench-core-formal-20261011-o04gdj_e`。

## 当前正式包身份

从精确 head 的成功 [PR 完整 CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/38107479575) 下载并核对实际归档，真实 clone 使用该提交的干净源码，编译成员来自该次 CI。没有重新构建 DSH、全量查询 SDK 公告或修改作者源码。

| 输入 / 产物 | 当前值 |
|---|---|
| CI archive | artifact `11689909409`，546711 字节，`2e2f2cd677582ebef0620549edc7f4044300537fdf8e44c6916d869e8e870031` |
| 普通 content pack | 441127 字节，8 成员，`f5e9dfe41859b0ae3254cbaddf12a128e89cd3c53bde82b84f366beef03ae5d7` |
| 新正式 pack 回执 | 来源 `d038f357…`、`source_dirty=false`；回执 SHA-256 `9d7f6bf363f86d53f39ad77353a531fda6a5607c3b14be5869841dc5b6432647` |
| 正式 tarball | 438499 字节，8 成员，`e41df9f5a8f7031c092319222543c8d723ca644c0c9d69b2ae53f13257e9b79e` |
| 组合锁 | `598b62ea…` → `89e2b2ea946cb1dfda1a2776651e63a851dcad466183a394ac5af722a625a6d5`；只改变 Workbench 的 source/manifest 行 |

正式 producer 使用固定主仓 `5390667c` 的已核对工具闭包。当前工作树的严格读取器实际读取新回执与 tarball；九包 canonical 准备退出 0，其他八包及两份既有 profile 不变。Formal pack 的 `activation=NOT_RUN`，没有生成 candidate 或 journal。

tarball 与前轮 `fd46b34d` 的正式包逐字节相同。前轮[官方 npm tarball 安装和 macOS 回退](./shinemage-formal-tarball-install-20261011.md)仍属于其原执行身份；本轮没有重启宿主或把旧运行重标为当前 candidate/服务准入。

## 主仓维护什么

- Workbench 的默认 core、严格构建、私有 compiled loader 与 clean rebuild 归独立作者仓。主仓不再扫描并重复执行这些整批测试或直接重建 Workbench；固定证据锁读取实际 CI 的 plan、result 和 content pack，校验 archive/member 摘要与当前正式包 source/manifest/tarball 三重绑定。
- 原三份主仓业务测试未改字节。新的选择入口实际保留 offline Python eval 一项、computed 真实后端四位小数 oracle 一项、query 历史故障/取消/marker 三项。其余作者断言由作者 core CI 承担；过滤掉的测试不写成本地执行通过。
- 公开包消费者、主仓 Python/合同/编排检查继续执行。缺作者归档、错误身份、失败/跳过 core、超范围声明、ZIP 路径或特殊成员均拒绝；没有源码回退或服务启动。
- 三份 workflow 在显式读取权限下准备固定 archive。`--check` 不下载输入。两份输入锁单独变更也选择 B0；混入 backend 改动仍选择相应 backend 检查。

归档读取与实际正式包绑定在列明主仓插件源码、九个原作者仓拒读条件下退出 0；九份作者 manifest 及一份 Workbench 源码负对照均为 EPERM。这不是整机不可读沙箱。

## 本次实跑

| 范围 | 实际结果 |
|---|---|
| Archive / 身份 / 越界门禁 | 13 PASS / 0 FAIL / 0 SKIP，exit 0 |
| 三组原主仓合同 | 分别 1、1、3 PASS，均 exit 0；完整 B0 内已再次执行，不能累加 |
| 完整本地 B0 r3 | exit 0；Python 855 PASS、41 subtests PASS；Node 24 组均 0 FAIL，9 次 opt-in 跳过逐条保留 |
| 路径矩阵、runner、workflow 回归 | 82 PASS / 0 FAIL / 0 SKIP，exit 0 |
| Python Ruff / Node 语法 | 通过 |
| 当前 PR 说明 | 已按既有更新授权修正标题和正文，并读回验证；head 仍为 `d038f357`，PR OPEN |

完整 B0 在独立主仓 clone 的当前产品副本执行，使用固定只读上游、build-tools、已核对的离线 Python wheelhouse 和新输出目录，出网只允许 localhost。r1 保留目录守卫优先级失败，调整为先拒绝输出复用、再执行作者/包绑定；未放宽任一门禁。r2 因隔离 clone 的 Git LFS 刷新找不到 `git-lfs` 失败；r3 只在新独占 Python 环境 bin 放入本机已有固定工具链接，没有关闭 LFS 或修改 Git 配置。

r3 Python 摘要有 22 条 warnings，stderr 另保留 SQLite connection finalization 的 ResourceWarning；不宣称无警告。路径测试的前三轮缺 PyYAML/psutil 环境失败均保留；最终使用单独工具测试解释器，不修改已用于 B0 的环境。完整 B0 后仅补全报告中的 installed-kit 剩余来源名单，以及修正 CI 路径选择与 preflight 触发条件；后者另跑上述 82 项，不把它写成又一轮完整 B0。

主审复核了 12 路径产品增量与实际结果，没有遗留发现。本轮未调用外部模型，也没有新增 OCR delegate 审查。三次 B0 自有父进程组结束后均为空；不停止无关进程或宣称全机端口检查通过。

最终文档核对通过：361 个本地链接目标存在，JSON、Node 语法和 `git diff --check` 通过。12 个产品路径仍与审查摘要一致；108 个未涉及的继承文件、46 个旧保护输入、6 个官方 npm 运行时文件不变，九个作者仓同 HEAD 且干净。主仓任务相关未提交内容为 127 项（72 个产品路径、55 份文档/证据），暂存区为空；无新增主仓 Git 动作。

## 仍开放

主仓仍保留三份业务测试、installed-kit 跨插件源码夹具、board-components 生产者、四插件历史源码隔离夹具、缺输入守卫，以及 formal preflight 的源码构建路径。因此只关闭常规 Workbench core/构建重复阶段，不删除 `dsh-plugins/`，不宣称主仓已是纯官方 DSH 壳。

CI archive 当次 metadata 的到期时间是 `2026-10-25T03:11:57Z`。已封存本地归档可按同一摘要复用；长期托管仍需已获准的持久输入位置与读取权限，路径变量不会自动提供材料。当前主仓 workflow 接线没有新 hosted CI 回执。

当前正式 candidate/journal、服务、WSL2、browser、真实模型/CRM/WeKnora/UAT、PR 合并、独立版本发布与部署仍需各自证据和授权。CRM/Knowledge 原 peer `4.0.2` 未改，`4.0.4` owner 提案未应用。SDK 分发 BLOCKED，产品 PARTIAL，`release_ready=false`，VERSION `0.20.0.0`。
