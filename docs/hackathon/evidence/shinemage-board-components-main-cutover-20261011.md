# board-components 主仓领域入口迁移（2026-10-11）

本轮按用户授权将完整 r2 的 18 路径应用到主仓，HEAD 保持 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`。暂存区为空，未提交、推送、创建 PR、合并、发布、部署或删除旧源码。VERSION 保持 `0.20.0.0`，产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

## 已应用的边界

默认 B0 不再在主仓重建 board-components 或执行其私有几何测试。主仓从独立领域作者的固定 Ubuntu PR CI `38121126913`、干净提交 `e78e040e14792c89f99a2e3181004dbdaefd9bf6` 核对 30 个来源文件、真实执行回执与几何 28 / producer 输入 6 的原日志，再对三个正式消费者的包、公开类型和领域输入锁做实际消费验证。原源码构建、输入绑定和旧测试正文逐字节保留为三个显式 `.legacy.mjs`，不进入默认阶段。

原封存归档 `22245ab9…`（1955 字节）是当前消费者锁定的输入；作者 CI 内容包 `66d53381…`（1951 字节）的五个成员同字节，但外层归档不同，没有替换为旧回执。新证据锁同时接入三个工作流与路径选择。新远端下载模块尚未 live 执行；下载守卫的自有 mock 与已经核验的真实 CI/API/ZIP 分别记账。artifact 的实际到期时间是 `2026-10-25T07:22:54Z`，14 天保留不等于持久发布。

应用记录见 [main-application-r2.json](/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji/main-application-r2.json)。完整补丁 105351 字节，SHA-256 `5d08d71940fce931f000ec42da01a028c1a8d7f101d6167670ed89a1b8c0bef0`；18 路径与权限核对一致，164 份增量之外的继承文件不变。可审准备和各自计数保留在[隔离提案](shinemage-board-components-main-cutover-proposal-20261011.md)，不能当作另一次主仓全量结果累计。

## 当前字节的完整 B0

从主仓真实 `git clone --no-local` 的隔离副本开始，以主仓当时未提交字节和已应用 r2 为输入，2920 个源路径与实际主仓逐字节及权限核对一致，已包含修正后的固定脚本、公共品牌资产和服务清单。拒绝读取/改写实际主仓，固定上游及已安装 build-tools 只读放行；隔离副本仍可读取保留合同的旧源码，因此此结果不宣称整条 B0 无源码依赖。网络只允许 localhost。Node `24.19.0`、独立 Python `3.14.4` 按现有 B0 锁核对 25 包；未改变全局环境。

完整第 r4 次执行 exit 0：Python `855 passed, 23 warnings, 41 subtests passed in 113.43s (0:01:53)`；Node 26 个组各自 0 FAIL / 0 cancelled，本次共 9 次跳过，原 opt-in 条件及原因保留。Ruff 与公共包消费者通过。没有把作者 CI、局部守卫或旧轮结果相加作为总体数字。Python warnings、负测预期报错与 stderr 均原样保留；详细分组见[机器回执](shinemage-board-components-main-cutover-20261011-validation.json)。

入口为 `scripts/dsh-b0/pipeline.mjs --check --python <固定隔离 Python>`，本次完整命令、环境、时间、PID/PGID、退出码见 [full-b0-run-r4.json](/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji/full-b0-run-r4.json)，[stdout](/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji/full-b0-run-r4.stdout)、[stderr](/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji/full-b0-run-r4.stderr) 与 [build-evidence.json](/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji/full-main-qa-r1/.context/dsh-b0/build-evidence.json)。

第一次完整执行因验证副本缺 `deploy/wsl/install-release.sh` 停止；第二次在品牌检查发现副本未带公共图标/许可证，91 项中 89 PASS / 2 FAIL。另一次单独预检因 PATH 缺少 `lsof` 报 4 PASS / 1 FAIL；补齐系统搜索路径后 5 PASS。第三次执行的 Python 为 853 PASS / 2 FAIL、41 subtests PASS，两个失败均因副本缺少现有服务包 manifest；补齐后单独两项通过。失败日志与修正输入都保留，未改产品补丁，也未放宽断言。

最终 `git diff --check` 发现两份测试文件各有一个多余末尾空行；已各删除一个换行字节，其他内容不变，两份 `node --check` 和最终差异检查均 exit 0。该修正仍限于授权的 18 路径，未增加功能；完整 B0 r4 覆盖修正前 r2，不为 EOF 空白重复全量运行。原补丁和历史回执保持，当前两份摘要、两路径格式增量和复核见 [post-application-format-r3.json](/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji/post-application-format-r3.json)。

## 剩余源码和准入

本次仅关闭领域 producer/私有几何的默认主仓执行子项。`remaining_source_producers=[]` 只描述该批生产者，不能解释为主仓已经完全不读插件源码。盘查发现默认流程仍有 15 个合同生成/比较入口，另有八插件 build CLI 缺输入守卫、两项 Workbench 作者/协调器合同、三组主仓 backend/query 合同，以及扫描旧插件源码的静态边界入口。独立的 Python 图形回归还引用旧夹具，且不属于默认 B0 Python 清单。详见 [remaining-source-contracts-r3.json](/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji/remaining-source-contracts-r3.json)。这些消费者迁移之前不删除旧 `dsh-plugins/` 副本。

OCR delegate 对同字节 r2 的 17/17 可审文件已完成人工模型审查，默认过滤的一份 backend 路径测试另行人工核对；无未解决发现。没有外部模型审查，记录见 [review-r2.json](/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji/review-r2.json)。

当前主仓新 hosted CI、正式 preflight/candidate 的同一对象服务/目标/browser/回退、真实模型/CRM/WeKnora/UAT和发布均未执行。Cordis 原严格声明冲突及适用 SDK 分发门禁保持，不能用本轮 B0 抵扣。其他八包、profile、candidate、journal、DSH 上游 pin 没有修改。

最终保留核对：18 个授权产品路径、160 份产品/当前说明之外的继承文件以及 VERSION 已核对；暂存区为空，领域作者仓仍是干净 `e78e040e`。主仓本轮文档的 387 个本地链接目标均存在，差异检查 exit 0；详见 [最终核对回执](/Users/hutou/.codex/tasks/shinemage-domain-main-cutover-proposal-20261011-yk072kji/main-application-final-audit-r1.json)。
