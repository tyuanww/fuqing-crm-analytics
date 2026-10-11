# Workbench 发布客户端包消费迁移（2026-10-11）

基线为主仓 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`。本轮只作本地实现、验证和证据同步，没有 commit、push、PR、合并、发布、部署或旧副本删除。机器记录见[validation JSON](shinemage-workbench-client-pack-migration-20261011-validation.json)。

## 实际变化

将原 `built.test.mjs` 的一项浏览器 factory 检查，以及 `plugin-ui-lifecycle.test.mjs` 的十一项客户端检查，移到主仓 `scripts/dsh-b0/workbench-client-pack.integration.mjs`。现在读取既有七包 profile 中 Workbench 正式包公开 `./client`，不读取主仓 `lib/client.js` 或业务源码，也不触发插件构建。旧生命周期路径只作兼容入口；pipeline 排除其重复源码/干净重建运行，另登记固定包入口。原 built Host 入口测试正文保持逐字节一致，仍在源码生产者阶段执行；它不是本轮通过项。

原客户端断言全部保留：原生会话/B0 状态区分、槽位注册释放、回执丢失与同请求重放、离开保护、驾驶舱导航、账号登录/退出、主题、重复 apply、可信结果组板与 public factory 白名单。新增 factory ID 核对，并补齐一处 JSDOM window.close；没有改产品 UI 或放宽合同。正文保留比较见原始 `assertion-retention-r1.json`。

输入准备复用既有 CI 准备器输出：七包 page profile、来源 SHA、正式 manifest/tarball 摘要均不变。读取器先通过原正式包/profile/叶子合同，再核对 Workbench 的公开客户端、web 平台及固定 SDK peer；固定上游 SHA/锁、React 和 ReactDOM `18.3.1`、store `0.1.7-rc.2` 继续核对。JSDOM 实际为 `29.1.1`。只解包到本次新的 `workbench-client` 子目录，不安装 peer、不导入 Workbench Host，也不启动服务。回执状态为 CLIENT_INPUTS_PREPARED，不预写测试通过。

本轮 Workbench 来源 `92dfa171cf8ea298bdceee5634b418269e711a37`，正式 manifest SHA-256 `9f518393e544099b5a31fde6073c2b0e321649f7e1134829d0dcd5bc608801f4`，tarball `a0d5dd08c5e97237fc38033f929eec33627ac42efa594a5ca5c87a0ee311d6b2`。客户端消费通过不能抵扣该原包已知的运行 peer 缺口，不能继承同摘要历史 candidate 或 WSL/浏览器结论。

## 本轮实测

| 记录 | 范围 | 结果 |
|---|---|---|
| consumer-r1 | 固定正式包，`node --test --test-concurrency=1 scripts/dsh-b0/workbench-client-pack.integration.mjs` | 12 PASS / 0 FAIL / 0 SKIP，exit 0 |
| contracts-r2 | 新客户端输入守卫及既有叶子/profile/CI 输入/正式包/显式构建输入八文件 | 97 PASS / 0 FAIL / 0 SKIP，exit 0；含 9 项本轮新增守卫 |
| boundary-probe-r1 | 沿用列明源码拒读策略，实际负对照 | 21 个 EPERM、3 个 READ，exit 0 |
| consumer-r2-existing | 同一结果目录再运行 | 预期 exit 1 / EEXIST，首轮回执摘要不变 |
| assertion-retention-r1 | 原测试正文比较 | Host 入口正文不变；十一项生命周期断言机械迁移后与原正文一致 |

12 与 97 分开记账；97 含前轮 88 项的本次复跑，不能加成新的总体通过数。首次 guards-r1 为 8 PASS / 1 FAIL：SDK 漂移实际被原包读取器提前以 PLUGIN_PACK_DSH_PEER_INVALID 拒绝，测试却期待后置错误码；修正断言后通过，没有修改生产门禁，失败日志保留。

consumer 在 macOS arm64、Node `24.19.0`、Python `3.14.4` 上运行，固定 DSH `0.1.7-rc.2` / `477b4f42`。策略拒绝主仓十个业务目录、九个原作者仓及两处来源副本共 21 个根，只允许 localhost 网络；历史证据、固定上游、Kit/build-tools 与未列明路径仍可读，不是整机 deny-default。React SSR、JSDOM 与内存 fake fetch/槽位是合成消费者夹具，不是 Chrome、原生 Settings 或真实 HTTP 服务验收。没有启动完整 DSH、浏览器、业务服务或模型。

## 留存和未关闭项

原始目录：`/Users/hutou/.codex/tasks/shinemage-workbench-client-pack-20261011-93e6if5u/`，保留原测试正文、固定包运行回执、策略/负对照、失败/成功日志和防覆盖记录。包、上游、candidate 与 journal 不修改。

Workbench Host 和其余私有运行测试、CRM/知识源码构建、历史作者输入守卫与隔离生产者夹具仍待迁移；不宣称默认完整 B0 已脱离源码，也不删除旧副本。完整 B0、新 hosted CI、修复后 Workbench 干净新提交/正式包、当前候选宿主/服务/目标/浏览器及正式恢复、live CLI reload、真实模型/CRM/WeKnora/UAT、独立发布和 DSH 升级仍开放。candidate `591134e8…` / journal seq 3 不变。SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION `0.20.0.0`。
