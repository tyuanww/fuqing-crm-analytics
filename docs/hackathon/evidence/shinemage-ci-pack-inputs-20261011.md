# CI 固定插件包输入收尾（2026-10-11）

基线为主仓 `5390667c`，本批改动仍未提交。主仓准备器现在能从已核对的目录或 ZIP 生成两份现有 profile 的固定包输入；三个 CI 工作流已接线。这里只交付本地实现、验证和记录，远端输入没有配置，完整 B0 与新字节的 hosted CI 未执行。机器记录见[validation JSON](shinemage-ci-pack-inputs-20261011-validation.json)。

## 改动与输入身份

`config/shinemage-composition-packs.lock.json` 锁定九份既有正式包的包 ID、版本、独立来源 SHA 和 manifest 摘要，以及两份现有 profile 的原始字节摘要。准备器调用真实正式包读取器及现有领域合同/公开导出/精确 peer 检查，全部输入通过后才创建新输出，不回退主仓源码、不安装 peer、不启动宿主。

目录和 ZIP 均支持；ZIP 限定成员、大小、路径和文件类型，不含源码、SDK、凭据或服务状态。审查修复了外部 ZIP 输入依赖 Python `assert` 的问题，改为明确异常；普通与 `-O` 模式都实测拒绝路径穿越、重复成员和符号链接。输出 EEXIST 保留首轮回执；每次运行使用新目录。

本地 ZIP 703989 字节，SHA-256 `228fdabbdf2c22900c874a1fa61dc700338b128495fd38c6e0d200b86a421ea7`，18 个成员。最新 `archive-r3` 的 18 份密封包文件与原输入逐字节一致，导出三项绝对路径；这不是已上传的 GitHub artifact。运行包、来源提交和 candidate 未改变，旧 Workbench 的完整宿主 peer 问题仍须用作者仓修复后的干净新提交收口。

`pipeline --check` 在源码构建/服务前检查固定输入及结果目录，缺输入、坏结果根或已用结果均失败。三个 workflow 的读取 token 只传给准备步骤，下载仍须显式权限、固定 artifact ID、API/文件摘要及成功 run；不读取个人 gh 登录作为隐式回退。release source allowlist 补入实际维护的 `scripts/ci/`、`scripts/crm-calibration/`，不增加私有包载荷或放宽 denylist。

## 实际验证

| 记录 | 结果 | 适用范围 |
|---|---|---|
| contracts-r3 | 54 PASS / 0 FAIL / 0 SKIP，exit 0 | 包、profile、输入、权限及 ZIP 的普通/优化模式守卫 |
| composition-r1 + readback-r2 | 9 PASS / 0 FAIL / 0 SKIP，两个测试进程 exit 0 | 准备后的真实固定包、官方解析器、合成 localhost 公共合同 |
| tooling-r1 | 189 PASS，exit 0 | 共享 tooling 路径轴、Agent 入口、Python lint |
| workflow-tooling-r2 | 61 PASS，exit 0 | 新增第三个 workflow 后的重叠子集，不加到 189 |
| frontend-r1 | 构建通过，29 文件 223 PASS，exit 0 | 既有 Vue 构建和单测轴 |
| release-r1 | 41 PASS / 0 FAIL / 0 SKIP，exit 0 | 实际 release/source archive 回归，不是发布放行 |
| backend coverage-r1 | 298 个目标全部覆盖，3223 PASS / 78 SKIP / 0 FAIL / 0 ERROR | 既有 synthetic-not-slow 的完整分组目标；不是完整 B0 或真实业务 |

上述范围分别记账，不相加为平台总体通过。backend 由 r1 前五个成功组与 r4 七个成功组覆盖互不重叠的目标；逐项核对目标全集与唯一 JUnit 用例。r1 失败组、r2、r3 不进入成功统计。backend 运行后仅改了 ZIP helper 的校验，该改动另经 contracts-r3（含 `-O`）及 Ruff 验证；backend 源码/测试未改。

backend 三次失败完整保留：r1 PATH 缺已有 zstd；r2 基础 Python 与服务固定依赖版本不符；r3 最小服务 Python 缺合成 seed 所需 psutil。r4 只准备本次拥有的隔离 Python，沿用 14 个服务精确版本，另用 B0 锁的 psutil 7.2.2；wheel 与官方 PyPI digest 一致并按 hash 离线安装。不改全局 Python、服务 manifests 或 SDK。78 个 SKIP 保留实际原因，不能当作真实数据已验收。

组合测试的 12 个自有 HTTP 服务均关闭，进程退出后端口可 bind。第一次清理观察因短时端口 bind 失败退出，保留在 `cleanup-wrapper-failure-r1.json`；后续只复查清理，没有重跑九项测试。隔离策略只拒绝列明的业务/作者源码，允许 localhost，不是整机 deny-default。

## 开放项与交付边界

原始材料在 `/Users/hutou/.codex/tasks/shinemage-ci-pack-inputs-20261011-tsopw7c5/`。OCR delegate 只提供文件选择/规则，主 Agent 审查记录为 `ocr-review-r1.json`，不调用外部 LLM。旧四份本轮证据和失败材料保留原字节。

只读 GitHub 名称盘查显示：三项 `SHINEMAGE_PACK_ARTIFACT_*` variables 和 `SHINEMAGE_PLUGIN_READ_TOKEN` secret 尚未配置，当前没有可用的正式包汇总 artifact 定位。普通插件 CI content pack 不能冒充该正式包输入。没有上传 ZIP、设置 secret/variables、运行 hosted CI、commit 或其他 Git 交付动作。

完整 B0、依赖审计/Docker smoke、其他默认源码装配迁移、新包完整宿主/candidate/service/目标/浏览器、真实模型/CRM/WeKnora/UAT、独立正式发布仍开放。原 candidate `591134e8…` 的 candidate/state 摘要未变，journal 仍 seq 3；不追加准入事件。SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION 保持 0.20.0.0。
