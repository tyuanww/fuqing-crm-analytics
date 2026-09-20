# 驾驶舱 0.11.0.0 · Ship 记录

本次从 `f9070431`（#214）接续 `codex/cockpit-history-import` 的累计本地成果。用户授权提交、推送和创建 PR，并明确跳过追加代码审查；未授权本次 merge、reload 或清理。版本由用户确认为 **0.11.0.0**。本轮 fetch 后 `origin/main` 仍为同一基线，无需合并新提交。

## 交付范围

- 汇总原生历史会话产物，保留来源、去重、分页与部分失败信息；主动添加 HTML、Word、Excel、CSV、PDF。
- 通过独立文件/页面服务保存私有原件及不可变版本，本机 ONLYOFFICE 编辑 Office/PDF；DSH 固定上游不变。
- 复用原生 Agent Loop 创建版本副本任务，收取固定候选、只读预览、显式确认；带绑定 HTML 仅开放 CSS。
- 纳入此前 R1–R7 和 D1–D3 修复，原审查报告保留时点。本次仅补损坏 DOCX/XLSX 经 AI collect 拒绝、任务及正式版本不推进的两条接缝回归。
- 发布检查发现 `httpx` 已在锁文件固定为 0.28.1，却未作为新路由直接依赖写入根声明；已补 `requirements.txt`，没有升级或安装依赖。

## 本轮新验证

共享路径矩阵：`python3.14 scripts/ci/run_checks.py --files-from .context/ship-history-20260920/scope.txt --node /absolute/node24`；使用既有固定上游与 Python 3.14，选中 backend full、tooling、B0 和远端 Python 依赖审计。依赖审计由 CI 独立执行，本地入口不代跑注册表审计或启动容器。

| 层级 | 结果 | 证据 |
|---|---|---|
| 首次发布检查 | FAIL，已修复 | B2 import 检查发现缺失 httpx 声明；`.context/ship-history-20260920/checks-missing-httpx.log` |
| 合成后端完整 profile | PASS | 2678 passed、77 skipped、71 deselected；11 个分组全部退出 0。`.context/checks/20260920T020654044802Z/summary.json` |
| 完整 B0 pipeline | PASS | 567 项 Python及所选 Node、编译后 DOM、原生注入、契约、Host/Client 类型、构建和干净重建通过；与后端 profile 有重叠，不能相加作为唯一用例数 |
| 新增 D3 候选接缝 | PASS | 指定 AI 测试文件 19 passed；`coverage-ai-regression.log`，含 DOCX/XLSX 两例 |
| 静态与入口 | PASS | backend/变更 Python Ruff、B2 import、Agent 入口、差异空白检查 |
| 追加代码/设计审查 | 按用户要求跳过 | 既有 delegate 42/42 及其修复记录见[前轮报告](COCKPIT-DELEGATE-REVIEW-2026-09-20.md)，没有冒记本次新审查 |
| 真实浏览器 / 模型 | 本轮未重跑 | 前轮合成候选和真实文档服务浏览器证据保持各自版本时点；真实模型此前返回 MISSING_CREDENTIAL，非成功 |

完整日志为 `.context/ship-history-20260920/checks.log`。测试会生成四份 tracked T0 证据，因此 gstack 的整工作树指纹提示 STALE；本轮逐一核对 52 个源码/配置路径与开跑前 hash 一致，测试结果绑定同一源码。新 T0 另存 `generated-t0/`，原四份 dirty 验收文件按备份逐字节保留，不纳入提交，也不为生成时间戳重复跑测试。

## 交付与开放项

功能 `e90af23a` 与版本/验收 `5df9c315` 已按清单分别提交并普通推送至 `codex/cockpit-history-import`。本记录写入时尚未创建 PR，远端 CI 尚未验收；后续状态见 [STATUS](../../STATUS.md)。正常 hooks 和 Git LFS 保留。`.context`、凭据、原始业务库和原仓 `HANDOVER-CODEX.md` 不入 Git；main/WeKnora 不作本轮修改，6677/18091 未切换。

真实原生模型逐格式修改、P13、用户真实历史/业务文件、用户 UAT、现役切换仍未验收。扫描 PDF OCR、复杂 Office 兼容、PDF 浮动菜单上游异常及原生侧栏离开保护限制仍开放。产品 **PARTIAL**；本地 PASS 不等于远端 CI、正式发布或真实业务通过。

## 推送与文档同步续记

前三次代码推送均先通过正常路径检查。首次在上传阶段遇到SSH连接重置，第二次遇到Git LFS locks/verify超时；独立LFS锁核验成功（双方均0锁）后，第三次推送成功。仅本次命令增加SSH保活与LFS超时参数，未改永久Git配置、未绕过hooks或LFS。失败日志和网络记录保留于本机本轮证据目录。

文档同步更新根README、STATUS、AGENTS版本/状态元数据、M1待办、黑客松入口及插件README，并链接已提交的两份操作说明。V2的#214合入事实与本轮候选分开记账；四份9月20日历史验收/审查报告保持原字节，不回写当时测试数或未提交状态。VERSION维持用户确认的0.11.0.0，CHANGELOG原条目不改；本次没有追加代码、设计或文档评审。

本轮历史读取、文件导入/编辑、Office配置和AI候选确认已有参考、操作步骤及保存边界解释；根入口可达。文件HTTP接口尚缺完整的逐路径参数表（Reference文档债），后续可补充；现有操作说明不承诺完整API参考。未发现本轮变更导致既有架构图实体改名或移除；不改写历史架构图。
