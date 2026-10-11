# Workbench 作者测试入口补齐（2026-10-11，本地未提交）

主仓基线 `5390667cc990fa558b0445aa455b086d325a6c77`，Workbench 作者仓基线 `92dfa171cf8ea298bdceee5634b418269e711a37`。本轮接续[四个作者入口的历史记录](shinemage-workbench-producer-ownership-20261011.md)，只改作者仓测试入口及开发说明，不修改原测试正文。机器记录见[validation JSON](shinemage-workbench-author-tests-closeout-20261011-validation.json)。没有 commit、push、合并、发布、部署或删除。

## 归属与改动

作者仓 `scripts/run-package-tests.mjs` 再接入 `native-board-auth.test.mjs` 和 `lane-g-delivery.test.mjs`。前者验证本包原生 HTTP 通道的 cookie、同源、方法和路径拒绝，以及卸载仅移除业务路由；后者验证页面工具包交付、拒绝、取消、超时和已构建客户端的接收卡。两份测试、原生通道 helper 及其他六份既有生产者检查逐字节未改，没有放宽断言或新增 skip。

本轮原生通道使用实际固定 Connection/Cordis 和本包编译输出，HTTP 服务只存在于本次容器内，凭据只在内存中。页面工具与 waiter 使用本包实现，模型提交和文档 HTTP 是既有合成夹具。该范围由插件作者仓拥有，不代表正式组合宿主、真实模型或业务服务验收。

现有 `ci-full.yml` 已调用同一作者入口，本轮不改 workflow；新增入口仍需对应新提交和远端 CI。原测试中的客户端缺 lib skip 条件保留，实际先构建再测试，入口要求 skip 为 0，并去掉嵌套 `NODE_TEST_CONTEXT`、去重文件、核对真实子进程结果。

## 同次实测

| 范围 | 结果 |
|---|---|
| 独立 clone、离线 frozen 安装、输入预检 | exit 0；clone 初始没有 lib/node_modules，没有 Git alternates |
| host/client 严格类型检查与构建 | exit 0，skipLibCheck 未放宽 |
| 新接入的两个原作者文件 | 8 PASS / 0 FAIL / 0 SKIP，exit 0 |
| 实际完整作者入口 | 同次 30 个文件，212 PASS / 0 FAIL / 0 SKIP，exit 0；已包含上述 8，不加总 |
| 作者边界与缺输入检查 | 5 PASS / 0 FAIL / 0 SKIP，exit 0，单独记账 |
| 链接检查和内容打包 | exit 0；8 成员、441127 字节，SHA-256 `f5e9dfe41859b0ae3254cbaddf12a128e89cd3c53bde82b84f366beef03ae5d7` |

普通内容包与前轮修复后内容包同字节；本轮测试入口及原生 helper 的临时构建文件不进入发布成员。前轮 204 是历史入口的结果，本轮 212 是实际完整入口的一次运行，不把两轮结果相加。固定 SDK 锁仍是前轮的 113 包/1,532 文件，本轮没有再获取、安装或扩展 SDK 输入。

执行平台是本地 Docker Linux x64 仿真、Node 24.19.0、Python 3.14.4、pnpm 11.28.2。只挂载新的作者 clone、独占输出和只读固定输入；列明主仓及原 Workbench/CRM/Knowledge 作者路径在容器中为 ENOENT。这不是整台 Mac 的 deny-default 沙箱，也不是 WSL2 或 hosted runner。复用前轮已准备 SDK 闭包，不能写成全新 SDK 安装。十个步骤退出码均为 0，自有容器已退出且无残留；原生 HTTP 由 helper 的 dispose/close 回收，并随容器退出。

## 保护与剩余步骤

主仓本轮产品字节未改，旧证据保留。18 份正式 manifest/归档、现有 candidate/state 及其他受保护输入未变，没有新正式 pack、candidate 或 journal。原 Workbench 正式包的缺失运行 peer 问题，仍须从修复后的干净新提交生成正式包收口；本次内容包不能继承旧包的 headed、WSL、服务或回退身份。

主仓七个旧生产者入口的检查类别，现在均已由作者仓既有 built 入口和六个补接入口在本地覆盖。但主仓重复入口仍保留，不能把“作者入口已接入”写成“主仓已经切走”。下一步先按授权交付作者仓运行 peer、测试入口和输入锁，确认新 CI，再迁移主仓重复执行及剩余 Workbench/CRM/知识源码构建；stop/go 未满足前不删除副本。

主仓新 hosted CI 仍缺固定正式 artifact 定位与专用读取配置。完整 B0、live CLI reload、当前包的完整宿主/服务/目标/浏览器/正式回退、Cordis 声明与实际版本兼容、真实模型/CRM/WeKnora/UAT、独立发布和 DSH 升级仍开放。SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION 保持 0.20.0.0。

原始日志、输入、clone、摘要和审查记录：`/Users/hutou/.codex/tasks/shinemage-workbench-author-final-tests-20261011-mn896gry/`。历史四入口的原始目录与失败轮次保持不动；本轮没有重跑未变化的主仓完整 B0、旧包 headed/WSL 或 SDK 全量审计。
