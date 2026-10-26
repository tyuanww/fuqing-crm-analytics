# 公网 rc3 路演验收

2026-10-26，用户授权快速上线后接管现场。产品仍为 PARTIAL，本记录不代表正式 release 或全量无缺陷。

## 运行与交付

公网 `https://app.tyuan.chat` 由 `shinemage-dsh-rc3-warehouse.service` 承接，端口 4328，经 nginx 6677 和既有 Cloudflare Tunnel 访问。上游为 DSH `0.2.1-rc.3`、`1f81c047`，未修改上游源码。后端基础安装源为 `cc9626ba`，Workbench 基础安装包为 `b747937d`。随后安装主仓 `487a775e` 的五个页面服务文件，最终客户端为 Workbench `9bf344447297`，原生 AI 工具说明为主仓 `5e0dd819`。两项后续修复均经独立审查和回归后推送、安装；DSH PID/InvocationID 未变，临时 HMR 配置已恢复。本地作者新提交不自动视为已部署。

现役目录为 `/srv/shinemage/validation/warehouse-chain-56a5975b-20261026.t6ddq_wb`。CRM、来源、页面、Web、路演入口五项服务均 active，现场自动重启计数均为 0。当前进程仍由 transient unit 管理；已另存永久 unit、开机链接和失败重启配置。机器重启恢复未实测。

原 rc1 服务停止并取消开机启用。回退脚本保存在 `/srv/shinemage/dsh/recovery/roadshow-rc3-20261026/rollback.sh`，未实跑。品牌通过恢复已有 brand-assets 和 brand-globals 配置生效；公网左侧品牌、新会话品牌已在 Aside 确认。新会话默认标准模式，问数需选择“问数智能体”并连接 CRM。

主仓 `a023a0ebf0b870264ce7ba77232a8c24d8a1f46c` 的[预检 CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40270208102)成功。产物 `12627892942` 已下载，三项 SHA256SUMS 校验通过。其历史名称仍带 `dsh-rc2-preflight`，实际 manifest 固定 rc3。CI 的 WSL2 与 host_http 阶段为 NOT_RUN，不能用预检代替现场验收；下载的新正式运行包尚未安装到公网。本轮未合并 PR。主仓页面修复及 fixture 检查修复已正常推送至 `5e0dd819`，全量后端分组和 B0 主仓检查通过；配对回归由显式作者环境的 257 项记录另行证明，不能用分组测试中的跳过项代替。最新代码 `5e0dd819` 的 GitHub Actions 查询为空，未记为远程 CI 通过。

## 真实业务结果

在公网“CRM全店GSV经营诊断”会话，用户重新连接 CRM 后完成商品、analysis、R、F、M 五类查询，并实际检索 WeKnora 的运营方法。知识库中的他牌案例没有作为本店 ROI 依据。

本轮窗口为 2026-07-01 至 07-05，全店、GSV、不剔除低价。数据截止日为 2026-07-05，来源版本为 `warehouse-v1:d11003182dee4b8c7f153f51c4444f115e2470171e7e55f5c0c2837fc2358a55`。真实 DuckDB 的大小、mtime 和无 WAL 状态未变，没有复制或改写业务库。

首次商品查询返回 WAREHOUSE_CACHE_MISS。检查发现旧缓存语义与当前版本不同，因此没有复用旧结果。按当前口径只补算这一个组合，随后独立进程零计算预算命中。面膜 F 的新客为 356、老客为 414、用户为 770、GSV 为 105525.80 元。旧页的 358/412 来自旧口径，不能与新页混用。

Q1、Q2、H1 的六类来源已有 18 项缓存回读成功、计算次数为 0 的独立记录。本次补算的是另一个七月商品组合。两者均不证明近两年任意筛选已预热，也不证明 H1 完整聊天和编辑验收通过。

| 来源 | source_ref | snapshot_id |
|---|---|---|
| 商品 | `crm_ref_ed48e054c5fd402c88288ffe61de40cb` | `crm_w_0701da3dc0394d348dc4ef8503baf26d` |
| RFM | `crm_ref_0b220ea2acf24327bd026ba05ede5409` | `crm_w_75e60952c9b54f9d8fdf62fdc16026c7` |
| R | `crm_ref_4b2af24e9c0144e89a244c2eef31c836` | `crm_w_db65ce031eb4482a8f05f57a4be38993` |
| F | `crm_ref_153c4855804f4a7d9db67e02d9e356a8` | `crm_w_735d33f7f2f94fec830d24ea70b2edc5` |
| M | `crm_ref_260dbcb80f4f4e999dd33cd707298675` | `crm_w_35c0914bced847c6998d086a26d00ea5` |

新页面为 `page_524d6d5c911b4d5abf81b5280702b6f4`，五个来源均通过绑定核验。页面 HTML/CSS 不含外部资源，业务 JavaScript 为空。商品及 RFM/R/F/M 五张表共 316 格数值按来源单位逐项核对通过，空占比保持“未提供”。这项检查覆盖表格，不能替代对所有诊断文字的业务复核。

Aside 实际操作已确认：标题从“商品与人群增长诊断·路演版”改为“商品与人群增长诊断·董事会路演”，保存为 v2，退出、返回对话后重新打开仍显示新标题。选中面膜 F 的 105525.80 金额时，界面提示仅可查看且没有文本编辑框。没有尝试或声称可以改写业务事实。

AI 文案验收已通过：模型用 16 秒生成候选，只把 `action-1` 改为“先验证面膜F新客复购，再决定是否扩大投放。”；在 Aside 收取、预览并确认保存，随后返回驾驶舱、重新打开，仍显示新文案和人工标题。页面 head 为 v3，任务 `ai_97b5ee0d-e3b0-494f-8e0d-e531965f90fc` 为 `SAVED`、`saved_version=3`。SQLite 比较确认 v2/v3 的 package、binding_manifest、来源及会话字段相同；仅独立 presentation overlay 增加上述文案。重开后再次选中金额，仍没有文本编辑框。

前两处缺陷分别是实际工作区回调漏传受控文案选区，以及工具说明缺少合法 presentation JSON 和三种哈希的区别。Workbench 最终调用方回归 81 项、作者核心 1234 项通过；工具说明修复的后端相关回归 60 项通过。复用这些对应提交的测试与独立审查记录，本次没有重复全量测试。首个失败任务已取消，未生成错误版本。

## H1 追加验收（2026-10-26）

公网原会话完成 2026-01-01 至 06-30 的商品、analysis、R/F/M 五类查询及 WeKnora 检索。口径为全店、GSV、不剔除低价，对比 2025 同窗，仓库截止日仍为 2026-07-05。五个来源均有持久快照；快照时间不用于推断缓存命中。

新页 `page_21349054adbc48a4a4f3483deea46a89` 的五张事实表共 316 格通过来源对账。对账脚本 `verify-h1-tables.py` 仅剥离商品同比的固定“小基数”后缀，再按原数值比较；前后运行日志分别保留失败与通过结果。面膜 F 当期 GSV 为 6,613,638.15 元，用户 45,574、新客 21,834、老客 23,740；这些半年数字不与七月窗口混用。

本轮现场操作记录为人工标题保存 v2，再收取、预览和确认 AI 候选为 v3；AI 只精简 `action-1`。独立留存证据包括基于 v2 的已收取候选预览、v3 持久状态及重开结果，未逐次保存全部点击回执。重开显示“2026上半年增长董事会·运营复盘”和“先建同窗同群基线，再验高价值客群复购策略”。任务 `ai_314a17dc-ef22-4b66-aa42-afd3f5e442b3` 为 SAVED，saved_version 为 3；SQLite 读回确认 v2/v3 的 package 与 binding_manifest 相同。重开后选择面膜 F 金额，界面提示绑定或只读数据仅可查看。AI 任务的最初要求文本并非本轮操作日志完整记录，不将其归为已复现的输入步骤。

诊断阶段曾出现跨窗口混数、把半年回购率当短期实验基线、无依据的实验门槛及成因推断。经明确纠正后才生成当前页面。表格对账不证明诊断自动可靠，运营方向仍需人工复核。近两年任意筛选和持续预热不在本次通过范围。

追加原始证据位于 `/private/tmp/dsh-closeout-swarm-20261026`，包括 `h1-source-proof.json`、`verify-h1-tables.py`、`h1-table-check.log`、`h1-table-check-annotated.log`、`h1-chat-evidence.log`、`h1-preview-browser.log`、`h1-ai-preview-browser.log`、`h1-closeout-saved-proof.json`、`h1-reopen-browser.log`、`h1-readonly-selected-browser.log`。本次使用真实浏览器文本与小型状态库只读取证，未取得重开截图，未重启 DSH。

## 未关闭

- AI 保存后旧任务操作残留已有作者候选 `ca437f5`，见 [Workbench #4](https://github.com/tyuanww/dsh-analytics-workbench/pull/4)。56 项相关测试、严格类型检查和构建通过。独立审核发现的候选预览错配已修正，第二轮无新增 P0–P2；未部署、未作该补丁现场复验。
- 旧页 `page_86709b07bc944bdeb6031265a6a2d359` v3 保留。DSH 重启后旧来源的内存授权索引失效，重新登录不会恢复旧引用；保存仍会拒绝。本轮新页通过不代表旧页续编已修好。
- 界面仍提示实时事件不可用并使用刷新扫描，偶有连接重试、历史预览恢复和离开提示；本轮保存成功不代表这些交互问题已关闭。
- H1 当前授权周期内的取数、生成、人工及 AI 保存重开已通过；诊断质量、近两年筛选矩阵、自动持续预热、PR 拆分及正式发布门禁仍保留。回退演练和主机重启验收未执行。

## 原始证据

本地审查、脚本、回执和截图位于 `/private/tmp/dsh-business-closeout-stack.TetGDq/roadshow-20261026`。包括 `fresh-all-source-proof.log`、`roadshow-table-proof.log`、`roadshow-manual-reopened.jpg`、`july-product-status.json`、`main-preflight-result.json`、`brand-review-result.md` 及 `canvas-ai-final/`、`canvas-ai-caller-fix/`、`canvas-ai-tool-guidance/`、`roadshow-ai-saved-proof.json` 和 `ai-v3-reopened-browser.log`。本轮 AI 重开的截图两次因 CDP 超时未取得；使用 Aside 页面文本和 SQLite 读回取证，不声称截图验收通过。`canvas-ai-fix.md` 仅是早期未采用草稿；不能作为最终验收结论。父目录的 `quarter-reporting-final-summary.json` 记录三窗口 18 项回读。

现场对账报告位于现役目录的 `roadshow-all-source-proof.json`、`roadshow-table-proof.json` 和 `roadshow-runtime-check.json`。不把凭据或业务库放入 Git。CLI 独立审查为用户授权的同模型替代，不能当作跨模型验证。
