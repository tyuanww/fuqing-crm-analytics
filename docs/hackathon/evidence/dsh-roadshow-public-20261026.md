# 公网 rc3 路演验收

2026-10-26，用户授权快速上线后接管现场。产品仍为 PARTIAL，本记录不代表正式 release 或全量无缺陷。

## 运行与交付

公网 `https://app.tyuan.chat` 由 `shinemage-dsh-rc3-warehouse.service` 承接，端口 4328，经 nginx 6677 和既有 Cloudflare Tunnel 访问。上游为 DSH `0.2.1-rc.3`、`1f81c047`，未修改上游源码。后端安装源为 `cc9626ba`，Workbench 安装包为 `b747937d`；本地作者新提交不自动视为已部署。

现役目录为 `/srv/shinemage/validation/warehouse-chain-56a5975b-20261026.t6ddq_wb`。CRM、来源、页面、Web、路演入口五项服务均 active，现场自动重启计数均为 0。当前进程仍由 transient unit 管理；已另存永久 unit、开机链接和失败重启配置。机器重启恢复未实测。

原 rc1 服务停止并取消开机启用。回退脚本保存在 `/srv/shinemage/dsh/recovery/roadshow-rc3-20261026/rollback.sh`，未实跑。品牌通过恢复已有 brand-assets 和 brand-globals 配置生效；公网左侧品牌、新会话品牌已在 Aside 确认。新会话默认标准模式，问数需选择“问数智能体”并连接 CRM。

主仓 `a023a0ebf0b870264ce7ba77232a8c24d8a1f46c` 的[预检 CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40270208102)成功。产物 `12627892942` 已下载，三项 SHA256SUMS 校验通过。其历史名称仍带 `dsh-rc2-preflight`，实际 manifest 固定 rc3。CI 的 WSL2 与 host_http 阶段为 NOT_RUN，不能用预检代替现场验收；下载的新正式运行包尚未安装到公网。本轮未合并 PR。

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

## 未关闭

- AI 文案修复首版未部署。独立审查发现页面版本与展示文案分别保存时存在并发丢失窗口，最终草稿测试失败。继续施工必须复用可恢复的正式保存路径并重新审核。
- 旧页 `page_86709b07bc944bdeb6031265a6a2d359` v3 保留。DSH 重启后旧来源的内存授权索引失效，重新登录不会恢复旧引用；保存仍会拒绝。本轮新页通过不代表旧页续编已修好。
- 界面仍提示实时事件不可用并使用刷新扫描，偶有连接重试；本轮保存成功不代表长连接稳定性已关闭。
- H1 完整业务链路、近两年筛选矩阵、自动持续预热、PR 拆分及正式发布门禁仍保留。回退演练和主机重启验收未执行。

## 原始证据

本地审查、脚本、回执和截图位于 `/private/tmp/dsh-business-closeout-stack.TetGDq/roadshow-20261026`。包括 `fresh-all-source-proof.log`、`roadshow-table-proof.log`、`roadshow-manual-reopened.jpg`、`july-product-status.json`、`main-preflight-result.json`、`brand-review-result.md` 和 `canvas-ai-fix.md`。父目录的 `quarter-reporting-final-summary.json` 记录三窗口 18 项回读。

现场对账报告位于现役目录的 `roadshow-all-source-proof.json`、`roadshow-table-proof.json` 和 `roadshow-runtime-check.json`。不把凭据或业务库放入 Git。CLI 独立审查为用户授权的同模型替代，不能当作跨模型验证。
