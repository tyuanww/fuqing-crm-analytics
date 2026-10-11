# CRM/Knowledge 固定宿主兼容补查（2026-10-11）

主仓基线 `5390667cc990fa558b0445aa455b086d325a6c77`，本轮只新增本地运行证据与当前说明，没有产品源码修改或 Git/远端动作。沿用[现有两包 profile 准备](shinemage-crm-profile-pack-migration-20261011.md)和[公共合同组合](shinemage-fixed-pack-composition-20261011.md)，没有新写服务 profile。机器记录见[validation JSON](shinemage-crm-knowledge-host-compat-20261011-validation.json)。

## 固定输入与实际对象

| 输入 | 本次对象 |
|---|---|
| DSH | 固定上游 `477b4f420553e8a52c2fbccc464d7561b239c443` / `0.1.7-rc.2` 的既有 CLI 构建输出，不是一次新的 npm 宿主安装 |
| CRM 正式包 | 来源 `5a839fa86de2240cf661a9034c58e0ead2d4b4ef`；tarball SHA-256 `0da9f8edd40b17a92377aa4b35d219229c8461b942060a7dd0e12265343500fd` |
| Knowledge 正式包 | 来源 `94ef29fa6c39d3dc506fbc5ef734f0a7ea9eb2b0`；tarball SHA-256 `ed7888204d5cefe7d383632a75319d3427fec9a735863f4e123b8ea17387ef67` |
| Profile | 现有 `crm-knowledge-rc2`；SHA-256 `7ca3511663ab2ea5d1bb8f839c83b29f5bbd6655238450ad08a04510642191ba` |
| Cordis | 两包声明仍为精确 `4.0.2`；官方 profile resolver 的实际安装来源为 `4.0.4`，未设置版本豁免或修改声明 |

两份正式包先由原包读取器验证，再在本次独占目录解包并生成 host/preset patch。没有读取原作者源码作为回退，没有重建插件或 DSH。现有 manifest、tarball、candidate/state 和 journal 未改。

## 分层实测

| 运行与范围 | 结果 |
|---|---|
| r1 两包配置准备 | PASS；服务均为 `SERVICE_NOT_CONFIGURED` |
| r1 官方 `dsh plugin --profile web add <本次解包路径>` | 两条命令均 exit 0；pnpm `11.28.2`，Corepack 联网关闭 |
| r1 官方 profile resolver 导入 | CRM/Knowledge 两包均成功；解析到实际 Cordis `4.0.4` |
| r1 包装脚本整体 | exit 1：导入后误调用不存在的 `Context.dispose`；未启动宿主，失败记录保留 |
| r2 宿主接续 | 6 个检查均 PASS，整体 exit 0；沿用本次 r1 成功安装，不重复安装或改写 r1 |

r2 通过的六项是：配置生成、宿主启动无插件导入失败、无原生 cookie 的业务请求 401、认证后的原生首页 200、指定 `crm-knowledge` preset 创建合成会话且没有 Agent run、CRM 状态响应 200 且 `connected=false`、用户名/到期时间为 null。最后一项是未连接状态检查，不是登录、查数、保存或业务可用证明。

安装日志保留 pnpm 对 linked 包 peer 解析的警告。官方 resolver 使本次两包使用宿主实际的 `4.0.4`，安装和初始化未观察到不兼容；这不能证明精确 `4.0.2` 声明正确，也不能证明独立 file/registry 安装、实际 `4.0.2` 环境或所有运行接口兼容。整体兼容仍 PARTIAL，不能为通过检查而放宽 peer 或版本校验。

## 隔离与回收

Node `24.19.0`；运行平台为本机 macOS。Seatbelt 拒绝列明主仓业务与原作者目录的内容，网络仅允许 localhost；四个实际源码负对照均为 EPERM。这是指定来源拒读，不是整机 deny-default。宿主使用本次新建 DSH_HOME、workspace、临时目录和合成 session，只有 127.0.0.1:4328。没有使用个人 profile、真实数据、模型 API、杭州、6677 或 WeKnora。

本轮没有登录 CRM、调用真实业务/模型或运行浏览器。原生 launch cookie 仅在脚本内存中，私有 launch 文件留在本次权限为 0600 的 runtime，不进入仓库；已保存启动日志经既有入口脱敏。自有宿主 PID 86805 退出码 0，4328 已再次可 bind；不终止其他进程。

## 当前结论与下一步

固定两包在实际 Cordis `4.0.4` 下的官方安装、导入和宿主/preset 初始化层已有运行证据；声明与完整安装/运行兼容仍未关闭。该两包 profile 没有 service binding，不能将此结果写入 Workbench candidate 的服务/目标/浏览器准入或回退事件。

后续仍须交付 Workbench 修复后的干净新提交与正式包，收口主仓源码装配和新 CI 输入，完成当前组合的同包宿主/服务/目标/浏览器/正式回退、真实模型/CRM/WeKnora/UAT、独立发布及 DSH 升级。SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION 0.20.0.0。

原始材料：`/Users/hutou/.codex/tasks/shinemage-crm-knowledge-host-compat-20261011-032z5hxt/`，含 r1 失败、r2 成功、两份安装日志、解析来源、配置摘要、隔离规则及回收记录。此前证据和失败轮次不覆盖、不删除。
