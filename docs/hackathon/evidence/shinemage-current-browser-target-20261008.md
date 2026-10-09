# 当前候选 WSL2 浏览器验收交接（2026-10-08）

当前封存 candidate `993daf31…`、workbench 包 `b75d90e9…` 已在用户指定 WSL2 的独占 synthetic 目录执行原 browser runner：**1 PASS / 0 FAIL / 0 SKIP，5 个既有浏览器场景，原 runner exit 0**。本子任务没有写正式 journal；主 Agent 已使用真实 terminal seq 5 作为父事件完成 v2 正式校验，并写入 seq 6（digest `d36af3d53c2e1932916bfe4fe677c42aa0f73e124c01cd57be8b40f765d74b3f`），本子任务已只读核对。`release_ready=false`。

- Chrome 151.0.7922.34 headless、Playwright 1.62.1、Python 3.14.4、UID 65534；DSH 固定 477b4f42。原 runner 仅替换 owned 根首行，正文未改。不是本机 headed 25 项重跑，也不包含主树新“保存后提示”修复。
- 新 510 项输入包含当前候选与实际新 source 回执；`input-v5.json` 由原 runner 在目标派生。5 场景依次覆盖登录前拒绝查询、原生插槽登录、原生命令真实 loop/worker/确认保存、重载复用同保存意图、无 CRM 登录/业务预设的普通原生 composer。模型 provider 使用原 synthetic/mock 合同。
- 原 runner 79.216 秒退出 0，内部 pytest 为 76.78 秒、1 passed、2 条依赖弃用警告。2 张合同要求截图，另保留 1 张 browser-last（与 browser-native 同字节）；HTTP、进程、包组合观察均在原 collection 中。
- 510 项密封输入逐一不变；结果归档 717009 字节、SHA-256 `7e273c3835dddc0171c1de06f5c0c4b0eb22678d60d289ae44a7daee46c2f356`。194 个归档成员与 193 项 inventory 加自身形成 exact set，全部大小/hash 一致。
- 原 collector 及 completion 都实际 exit 0。4335–4337 无监听，自有进程为 0；五个受保护端口 PID 及 current 指针元数据不变。证据取回并核对后，仅 `/tmp/owned-fp-browser-24r03yzo` 已删除，未连接或操作 6677。
- 首轮带 curl progress 的下载记录、真实 quiet 二轮记录、所有 preparation stdout/stderr 均保留。没有补写成功回执，没有复制浏览器 profile/cookies 或真实业务库。

原始资料：`.context/checks/current-browser-target-20261008/`；`handoff.json` 给出关键引用的大小与摘要，`archive-manifest.json` 列出本次准备/运行/取回的精简归档文件；同字节 quiet 二轮 Chrome zip 只引用首轮原资产及摘要，不重复复制 193 MB。固定下载资产及历史准备记录另见 `.context/checks/browser-fixed-assets-20261008/manifest.json` 与 `.context/checks/browser-target-input-review-20261008/`，不覆盖历史缺口报告。

正式 v2 封套使用 `transfer/input-seal.json`、`transfer/controller/sources.json`、`retrieved/results-inventory.json`、`remote-collect.py.result.json`、`remote-cleanup.py.result.json`、`remote-cleanup.py`、`results.tar.gz`，以及既有固定 runtime a049f061…。真实 terminal 父事件为 seq 5 / `2dd9dbdeaec697731146d99c19811a1403e3ca3c772d5bf7c9a695e3575eaae8`。清理脚本 normalized SHA 为原 `da098e44…`。

移动设备、真实无障碍、跨版本恢复、生产身份、激活和真实模型仍未执行；供应链仍未验证。本轮通过只覆盖固定 synthetic 浏览器合同，不构成发布通过。无产品修改、提交、push、PR、合并、发布或部署。
