# rc3 作者同步与审修交付

日期为 2026-10-24。三个作者分支已推送并进入 PR。主仓修复已本地提交，推送仍受组合输入检查阻断。未合并、发布、切换杭州或访问真实业务数据。产品保持 PARTIAL，`release_ready=false`。

## 业务与版本

CRM 作者包从 crm.1 对齐到主仓 crm.5，保留商品新老客 v3、RFM 快照、覆盖不足拒绝返回和会话授权。Workbench 同步数据绑定、原生账号入口、页面导航及预览隔离，保留作者仓自己的合同和测试。

三仓固定 DSH `0.2.1-rc.3`、upstream `1f81c047fc48fa190a683e469daa699857e9afe8`、Cordis `4.0.5`。上游 pnpm 为 11.28.5，作者与 build-tools 为 11.28.2，Node 为 24.19.0。本地 Python 为 3.14.4。不从版本声明推断杭州已升级。

## 审查发现与修复

- CRM 查询中切换对话会误删有效授权。修复后非当前对话不消费返回结果，但保留有效授权。过期、401、账号不匹配和主动断开仍撤权。普通查询、命名指标、资产入口均覆盖。
- CDP 初始化收到 503 后遗留自有 Chrome。工厂现在统一关闭 socket 和进程，先 SIGTERM，超时后 SIGKILL，等待退出。重复关闭复用同一个 Promise。
- 静态 HTML 已保存文案被空沙箱同时禁用。浏览模式现在对惰性 Document 应用声明式文案，再生成显示副本。原始源码、source_hash、绑定数据及空沙箱保持不变。预览宿主和资料库也保留 presentation。
- 静态序列化曾将 xmp 的结束标签文案解释成 HTML。源扫描、运行时选择和 presentation 统一排除 xmp、noembed、noframes、plaintext、noscript 的直接改字，强制修改报告 unresolved。普通文案仍可编辑。
- 排除规则最初误吞 xmp-viewer 等自定义标签，现改为完整标签边界匹配。新增回归保留其内部和后续标记节点。

最后两项由修复后的独立 CLI 复审发现，均先复现再修复。最后一次定向 CLI 复审未发现 P0-P2，且实际运行了 22 项相关测试和标签边界内存断言。这不是全项目无缺陷或无安全风险的证明。

## 验证

全新作者源码副本使用各自固定 SDK 闭包，不继承作者目录的 node_modules 或 lib。构建和打包是 macOS 本地候选验证，不是 clean-commit 重建或 Ubuntu CI。

| 作者候选 | 构建与普通内容包 | 包内测试 | SDK 闭包 |
|---|---|---|---|
| Workbench | 通过，第 9 轮 | 160 文件，1,134 passed，0 failed，0 skipped | 120 包，1,608 文件 |
| CRM | 通过，第 2 轮 | 137 passed，0 failed，0 skipped | 110 包，1,512 文件 |
| Knowledge | 通过，第 3 轮 | 55 passed，0 failed，0 skipped，含作者守卫 | 109 包，1,494 文件 |

最终核对 Workbench 662 个文件与第 9 轮快照一致。CRM 83 个文件、Knowledge 51 个文件与此前验证相比只有非打包文档变化。三份 SDK 无锁外 lib，tracked 上游源码未改动。

补充验证保留独立范围，不重复累加测试数。

- CRM 作者及主仓登录回归各 23 项通过。Workbench 作者及主仓 CDP 回归各 9 项通过。
- 作者及主仓静态文案、只读值、来源哈希、重开及原始文本回归各 6 项通过；源索引及文本选择测试各 22 项通过。
- 主仓 React DOM 回归使用现有配套 React 环境，不代表主仓 rc3 整体集成。作者完整 rc3 构建和 core 验证另列于上表。
- 真实 Chrome 155.0.8059.86 使用自有临时配置。静态侧栏从原文变为已保存文案，sandbox 为空；页面脚本标记为 false，自有资源请求计数为 0。原始文本强制修改不产生新元素。CDP 正常关闭和原 503 命令重放均确认自有主进程退出。
- Workbench 作者及输入守卫 15 项、公共合同守卫 12 项、链接检查 0 越界，CRM 守卫 29 项通过。三仓 Python 输入保护各 6 项通过。
- 缺 B0_BUILD_TOOLS、React 配套及 board-components 构建的早期准备失败均保留，补齐实际输入后复测，没有放宽断言。

普通内容包 SHA-256：

- Workbench 为 `88e61f55f61949f01fae78147f0c5b62454e589980740b1fd1ddc83c8411c610`。
- CRM 为 `de666341f7ec76ce347ddb149004b0dc592d5d1d6a83a706ff741a89776629aa`。
- Knowledge 为 `972f904842efb6614cdce3664f00d2bcbc1edd0bbd1b1c50dc4786a43341094c`。

## 审查能力边界

只读 Codex CLI 审查覆盖三个作者候选，后续按修复范围定向复审。主代理复核因果、补回归并执行真实浏览器探针。

原生审查代理和 Comment Sicko 没有返回有效任务结果。gstack 回执已记录 completed=false、converged=false，技能保持 incomplete。CLI 不能替代该原生门禁，也没有跨模型通过结论。不可用的 deslop 采用主代理定向差异清理，未安装或修改全局工具。

QA 自动汇总仍为 blocked，保留历史 setup-blocked 与旧快照项。已修复合同的通过证据单列，未把汇总改成完整 QA 通过。Workbench 全套 browser、standalone、主仓专属检查、真实模型、业务 UAT 和近两年缓存覆盖均未由 core 测试证明。

## Git 交付

| 仓库 | 已推送 head | PR |
|---|---|---|
| Workbench | `f74d980fec610c44f04a99144a81862662ec2325` | [PR #2](https://github.com/tyuanww/dsh-analytics-workbench/pull/2) |
| CRM | `da0a82c773aa11e967ce195cd3a8a62d0a8fc5b8` | [PR #2](https://github.com/tyuanww/dsh-crm-knowledge/pull/2) |
| Knowledge | `2b0f5745f725eda5b26df20ebd86c79003b08078` | [PR #2](https://github.com/tyuanww/dsh-knowledge/pull/2) |

三个 PR 均为 OPEN、非 draft。Workbench 普通合并远端已有的同内容合同提交，合并前后文件树一致，没有强推或改写共享历史。

主仓分支为 `codex/dsh-rc3-business-sync`。CRM 授权、CDP 清理、静态显示分别保存为 `82f6416a`、`03ef1ae6`、`4c3a3805`。它不是现有主仓 PR #163 的 head，不能把作者推送描述成主仓 PR 已更新。

## 未关闭事项

1. 主仓推送前检查按真实差异要求 backend、frontend、tooling 和完整 B0。B0 在独立空输出目录运行时以 `PROFILE_PACK_INPUTS_REQUIRED` 退出；尚无最终 rc3 正式组合输入。本轮未绕过 hook，也未推送主仓。
2. 三作者新远程 CI 状态未确认。CI 诊断连接返回无法连接 GitHub，不沿用历史绿灯。
3. 作者 formal-pack 缺 `generated_bytes_provenance`。应从已审核 clean commit 使用既有 provenance writer 和 packer 重建，不能放宽主仓 reader 或补写假 clean 标志。普通内容包不是严格正式包。
4. 组合其余六个旧包需要 rc3 输入核验与重建，随后更新组合锁和 artifact。
5. 原生审查、Comment Sicko、完整目标宿主验收及真实业务 UAT 仍开放。杭州版本仍按既有带日期现场记录为 rc1，本轮未探测或切换。

下一阶段先确认作者 CI，补正式包来源证明和组合输入，再执行主仓完整检查及推送。合并、正式发布和杭州切换仍各自独立。

## 本地证据定位

原始构建及包回执位于本轮 dsh-rc3-delivery.Crqdxv 目录。CDP 的 annotations、evidence 和 report 位于 dsh-rc3-review.xo2fQX/qa。静态文案、脚本/资源隔离、原始文本及 CLI 复审位于 dsh-presentation-diagnostic.UZspn8。这些本机临时目录不是远程 CI artifact，不作为可长期下载的公开交付物。
