# 驾驶舱 rc1 收口证据（2026-10-21）

状态：`PARTIAL_BLOCKED_ON_CRM_LOGIN`。驾驶舱 rc1 的代码、包、候选启停、杭州 side-load 和合成页面 UAT 已通过；CRM 指标、看板编辑与写入仍未执行，正式 release 门禁也未被本回执提升。

## 源码与提交

- 分支：`codex/cockpit-rc1-closeout`
- 生成页面包收件箱修复：`5842b4d3ac6c82e48f1af3f3c975b1b62b287159`
- 映射祖先草稿保存修复：`7c9244c9a9e1bfc2b99ea20c6e146584ee6bf90b`
- PR：[#162](https://github.com/tyuanww/fuqing-crm-analytics/pull/162)
- 远端 CI `39610154746`：SUCCESS；`b0-contract-build` 与 `merge-gate` 均 PASS。

`5842` 让服务端先规范化 `presentation:null` 再生成页面包权威摘要，并把页面工具卡的登记/交接失败显示出来。`7c9244c9` 只放行与当前选区存在真实祖先/后代关系的 HTML 变化；祖先开闭标签、兄弟节点和未标记插入继续失败关闭。

## rc1 包身份

| 项目 | 值 |
| --- | --- |
| Target peer | `0.2.1-rc.1` |
| Source peer | `0.1.7-rc.2` |
| Upstream | `1600d8a1e140dcde43a1a0941940a0480712c011` |
| Pack manifest SHA-256 | `cec2dbf912c2989cf77e80d3f58e4ec317a7429bc22eb5847e867c4b1f2bfd8b` |
| Tarball | 438881 bytes，`b8808b2554a54ae2e1d719b050e528b2451bf0be802601c439794e484a97834d` |
| Effective `lib/client.js` | `0d653cebbf613f745813c5ab3d9eb6ddd77d0e039254af98927e2902bbb924d4` |
| 7 包 profile inputs | `437456261e90dd171d9d4b289797f8710f7cf8d47bec4b2d7de24b0373372eb9` |
| rc1 contract JSON | `86bde14cd6da593b9cfe81711825ed83f65191d04315b37bcd86273f13d05321` |

Linux x64 构建使用 Node `v24.19.0`、plugin pnpm `11.28.2`、rc1 upstream pnpm `11.28.5` 和 offline clean builder；host/client 全量类型检查、generated provenance、7 包 reader 与 `PASS_LOCAL_BUILD_INPUTS` contract 均通过。默认 rc2 pin 未改。

## 测试

| 检查 | 结果 |
| --- | --- |
| 新增与受影响测试 | 24 PASS / 0 FAIL |
| analytics-workbench `pnpm test` | 204 PASS / 0 FAIL |
| rc2 build | host/client 类型检查与构建 PASS |
| rc1 build | host/client 类型检查、构建与 clean provenance PASS |
| rc1 artifact contract | `PASS_LOCAL_BUILD_INPUTS` |
| 远端 CI | SUCCESS |

本地 push 钩子因工作树缺少完整 `CRM_COMPOSITION_OUTPUT` 固定输入而无法执行完整 B0；按既有流程跳过本地 pre-push，最终由远端 CI 的 B0 与 merge gate 补跑。该环境失败不记作代码失败。

## 杭州 side-load

- `shinemage-dsh.service`：active/running。
- `current`：`/srv/shinemage/dsh/releases/dsh-0.2.1-rc.1-core-main-20261021-cockpit-v3`
- 前一驾驶舱候选：`dsh-0.2.1-rc.1-core-main-20261021-cockpit-v2`，保留。
- 稳定回退目标：`dsh-0.2.1-rc.1-core-main-20261020-v5`。
- `runtime`：仍链接 `...cockpit-v2/runtime` 所共享的 v5 持久 runtime，没有复制 SQLite、DuckDB、浏览器私有状态或 token。
- 端口：4328、18090–18094、18098 正常监听；未鉴权 4328 为 `401`，认证后为 `200`。
- 候选：独占 `4329/18126` 启动、认证、安装 7 包和核验 `lib/client.js` 后停止；停止后两端口关闭。
- 服务与 boot 日志的 error/exception/failed/unhandled 匹配数均为 `0`。

远端证据目录：`/srv/shinemage/dsh/evidence/cockpit-rc1-20261021-r3/`。

## 页面 UAT

页面 `page_eb6caa1c00494995b583027421061d1f`（“本场对话驾驶舱”）原为版本 1，标题为“Cockpit C4 R2 验收”。

1. 进入编辑，选择 `auto_h1_214`，把标题改为“Cockpit C4 R2 草稿恢复”。
2. 点击原生侧栏“插件”，再返回“驾驶舱”。
3. 草稿文字和选中目标均恢复。
4. 点击保存成功，页面进入版本 2，后端 HTML 与版本历史同步；没有再出现“补丁预览被拒绝”。
5. 原生账号菜单与 Settings 打开成功；界面显示真实 DSH 账号入口，不再把本地显示名包装为登录。
6. 显式验证浅色和深色；最后恢复“跟随系统”。

CRM 分析入口显示“请先连接当前对话的 CRM”。因此指标查询、看板编辑和写入保持 `NOT_RUN_HUMAN_LOGIN`，需要用户自行完成 CRM 登录/2FA 后再验收。

## 未执行与剩余风险

- `NOT_RUN_HUMAN_LOGIN`：CRM 指标查询、看板编辑、CRM 写入。
- `NOT_RUN`：正式 publisher identity、签名、independent verification、attestation、publication、公司 clean-machine。
- `release_ready=false`；M2-07 继续 `BLOCKED`，M2-08/M2-09 继续 `NOT_RUN`。
- v3 是 owner-operated side-load，不是新的正式公司 release。
- v5 runtime 仍被 v3 复用；后续清理或迁移必须保留该 runtime，直到有单独验收过的替代。

机器可读回执：[cockpit-rc1-closeout-20261021.json](cockpit-rc1-closeout-20261021.json)。
