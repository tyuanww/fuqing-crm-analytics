# ShineMage 既有准入三线续接（2026-10-08）

本轮从集成树 detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09` 接续，仅推进已有验收和证据缺口。没有新增产品功能、修改产品源码、重打包或改版本。候选源码仍为 `bd647352d02402c679b04172855e40ec8f2d96a5`，VERSION 0.20.0.0；本轮没有新提交、push、PR、合并、发布或部署。产品 PARTIAL、SDK 分发 BLOCKED、release_ready=false。

## A：新候选服务关联及本机组合

- 沿用同字节 `first-purchase-source-http-local` 与固定服务绑定 `f9726f68…`。candidate digest `993daf31daa79137c22ce8d16c84b61892117386a9b7b8c5119fa0be62abefb0`，workbench 包 SHA-256 `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b` 保持。
- A 在 journal 副本上核验当前 `verify-service` 的关联、幂等及拒绝旧 target/terminal 证据行为。主 Agent 随后用正式本地 journal 执行既有 CLI，退出 0，新增 **CANDIDATE_SERVICE_ARTIFACTS_VERIFIED**，seq 2 → 3。原前两事件保持，未写入宿主/目标通过事件。
- 当前 journal：`.context/checks/abc-local-candidate-20261008/plugin-state.json`，SHA-256 `018bf8a055af8e2315c7071d54aa73bc9ab604c2cb8c2288d1ff2cd2b947ef6c`。CLI、前后快照及链核验在 `.context/checks/abc-admission-closeout-20261008/`。服务 receipt 的 9 场景属于原封存观测，不是本轮新跑 9 场。
- 新候选与既有 CRM、查询、保存服务四包组合，实跑现有本机 official-host terminal 专项：**1 PASS / 1 warning，13.13 秒，exit 0**。使用 synthetic 数据及 mock 模型；在途终止后 FAILED_SLOT_RELEASED，50 条已提交会话前缀保持，原生回退和恢复观察通过。8 个自有 PID 已退出，4335–4337 监听清理。
- 相对旧 input-v4 只改 candidate 路径和摘要。旧 WSL 记录因候选摘要不符、旧宿主记录因 parent 不符被拒绝；本机结果不能写成 WSL 或正式 host journal 通过。首轮收尾脚本对进程回执字段的错误假定已修正，失败日志保留，没有重跑业务或改原始回执。

详见[A 交接](shinemage-candidate-admission-20261008.md)及[机器记录](shinemage-candidate-admission-validation-20261008.json)。

## B：SDK 固定输入补证

- rc-field-form 2.7.1 一次正常 TLS 有界下载成功，lock SHA-512 相符，71 个普通文件一致。累计唯一 tarball 摘要 **196/196**；212 条安装记录为 **201 直接一致＋2 固定补丁一致＋7 types-only 投影已解释＋2 重复路径拒绝**。
- 七条缺文件记录的 305 个文件在原完整归档、sdk-complete 和 registry 中相同，原缩减 receipt 为 types 模式；当前真实 includePackageFile 对 305 条全部排除。只解释阶段差异，未把七条标成完整包 EXACT，两个重复成员拒绝也未豁免。
- 官方 recipe 八份文件对齐固定源码；仍缺 esbuild 0.28.2、native-preview 7.0.0-dev.20260707.2、完整源码和构建依赖。变换输出比较 NOT_RUN。未替换编译器或安装/执行 native、重建 SDK。
- 完整包身份 OPEN，嵌入组成和 EMBED-INLINE-BYTES PARTIAL，产品校验字段 NOT_VERIFIED；八条顶层门禁没有新增 PASS。上游 7 版本/29 公告未重查，签名/撤销/干净主机等仍开放。

详见[B 交接](shinemage-sdk-evidence-followup-20261008.md)及[机器记录](shinemage-sdk-evidence-followup-validation-20261008.json)。证据控制器的 tar 根目录和多文档 lock 解析失败均单独保留；修改不涉及产品检查器。

## C：HTML 原生交互未能执行

新包的固定官方宿主、合成夹具和隔离 Chrome 已启动，但 UI 工具只暴露原有个人窗口，无法精确绑定本次隔离实例。因此没有发送菜单或键盘输入，没有截图或新增交互 PASS。菜单点击、200% 键盘焦点与新候选 headed 均 **NOT_RUN**；不是已确认的产品缺陷。

首轮端口白名单拒绝和次轮 READY/清理记录保留；只清理自有进程，4328/4329 已释放。未使用 JS focus/CSS 注入或 Emulation 代替原生观察，未第三次续跑探针外审。旧包 ecaa86… 的 headed 25/25 与原生 200% 重排证据继续只属于原验收对象，不改写为新候选通过。standalone 页面包仍缺，未制作替代页面。

详见[C 交接](shinemage-html-remaining-20261008.md)及[机器记录](shinemage-html-remaining-20261008.json)。

## 审核、归档与保护

C 只读交叉审核 A 的原始日志、输入差异、组合身份和进程回执；A 只读交叉审核 B 的原始 JSON、控制器逻辑及固定配方源码，均 **0 项待修复发现**。这不是新的外部 OCR 通过或独立重跑字节审计；原探针外审超时仍开放。

主 Agent 复算 A/B/C 共 **47 份原始证据摘要**和 **36 项受保护输入摘要**，核对候选及包内 8 个文件；六棵原工作树的 HEAD、Git 状态和未提交文件字节、固定上游 HEAD/index/lock/status 均保持。三线六份交接文件逐字节收录。见[集成核验 JSON](shinemage-admission-closeout-validation-20261008.json)。

本地按显式清单归档 64 个文件（原始记录、失败日志、交接、候选及 journal 快照），588,384 字节；不递归收取测试数据库、venv 或缓存。归档 `.context/archives/shinemage-admission-closeout-20261008/evidence.tar.gz`，SHA-256 `dd10e5f601a5870d92a292b477e901d38f6c18cf07da1713aa8ae461c5020099`，逐成员摘要核验通过；同目录 manifest 保留源绝对路径及摘要。原目录和历史归档均未删除或覆盖。

## 原范围内仍待完成

1. **正式候选目标准入**：需绑定当前 candidate 的目标 WSL source HTTP、terminal/browser 原始记录，才能按现有验证器继续 journal；本轮不操作杭州，不以本机测试替代。正式 CI 仍 NOT_RUN。
2. **SDK 分发**：需补固定完整 recipe/编译器及依赖输入，再做变换比较；完整身份、签名/撤销、native、干净主机等原门禁继续开放。局部证明不放行分发。
3. **HTML/业务验收**：需可精确控制的隔离原生窗口及真实 standalone 页面包；真实读屏、触控/移动设备、Windows 高对比度、真实模型/业务/生产仍未执行。探针外审不进行第三次续跑，仍保留未关闭项。
4. **物理分仓、各仓独立 CI/发布、DSH 升级**：仍按原 stop/go 后置，当前未进入。

完整 B0、服务 28 项、shell/tool、原查询冷安装、十场更新和旧 headed 25/25 均未重复执行，不能将上述局部进展汇总成全量发布通过。
