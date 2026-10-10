# 新首购候选杭州隔离浏览器验收（2026-10-07）

**同一新候选 `a490457c…` 在杭州 WSL2 的 Chrome headless 五场景通过，官方 Host 整链 1 PASS；生产未切换，整体仍 PARTIAL。** 本轮是在终态回执门禁审修提交 `db16041a` 后开始的下一项，不沿用旧候选 `861d6ef1…` 的浏览器 PASS。

## 代码交付与输入身份

- 前批 OCR delegate 审核 16/16 文件，修复历史 runner `.py` 导致共享 CI lint 失败的问题（原字节改存 `.py.txt`），以及 CHANGELOG 过期状态。release suite 391 PASS，改名后终态门禁 37 PASS；正常 hooks 本地提交 `db16041a5bb3e209fc3da36e85049e9b3caf8b1d`。本次未 push、发 Release 或改生产服务。
- 候选 `a490457c3e867b3fb0d03fa8daeb04886f7b8657da0b1cf2fbadb30917e7887c`，workbench 来自 `3ffbd2a2`、tgz `c9770d111102791bcc34a0db9a41b23b7e43b3385a9c3909a620617f413ec64b`。CRM、query/save、profile 和官方 runtime 均保持原包；服务来源仍为 `f9726f68`。
- 官方 DSH `0.1.7-rc.2 / 477b4f420553e8a52c2fbccc464d7561b239c443`，Linux runtime SHA256 `a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4`。没有上游修改、业务包重建或现场生产编译。
- 使用已审查 `25d9c53c` 控制器，150 个文件按封存映射逐一核对；唯一未执行历史 verifier 的精确摘要例外沿用[终态门禁记录](dsh-g0-first-purchase-terminal-gate-20261007.md)。原 v2 平台 wheel 回执直接复用其字节；本轮不宣称重跑来源 HTTP 十项。
- Playwright 1.62.1；Chrome for Testing `151.0.7922.34`，zip 193282658 B / SHA256 `ae8736ac28bc69278551500f219fc749575648263c43ec5990749eff43b9fcf8`。实际 viewport 1280×900、locale `zh-CN`、headless。

## 本次实际过程

证据目录 `.context/checks/first-purchase-current-browser-20261007/`，下文相对路径以此为根。脚本和 stdout/stderr 原样留存，不覆盖上一阶段证据。

| 阶段 | 本次结果 / 证据 |
|---|---|
| Tailscale/SSH 只读预检 | WSL2 `6.18.33.2-microsoft-standard-WSL2`、Linux x86_64、Node24.21.0、Python3.14.4，4335–4337 空闲；`remote-preflight.py.result.json` |
| 固定输入 | 510 文件，输入 seal `143e40cbbc28bc6d17273677647162719489c1af55b44d3857e1e19451b0e8ac`；传输包 32522622 B，`transfer-meta.json` |
| 大包由杭州直接下载 | 固定 GitHub Release runtime 29.34 秒，固定 Chrome 31.83 秒；均核对大小和 SHA；`remote-download.py.result.json` |
| 浏览器运行前准备 | `remote-setup.py` 暴露 NSPR/NSS 缺项；固定 libnspr4/libnss3 下载解包至自有目录后零缺项，无系统安装；Noto CJK 固定版本/摘要，`fc-match` 实际为 Noto Sans CJK SC |
| 隔离浏览器预检 | Chrome 151.0.7922.34、UID65534，空白页通过；仅准备层，不替代业务测试 |
| 官方 Host 业务整链 | **1 passed, 2 warnings in 78.00s**，含控制器安装的编排 80.05 秒；`retrieved/browser-result/pytest.stdout`、`receipt.json` |
| 实际页面观察 | **5/5**，`browser-observations.json` 中 errors 为空；两张截图人工复核中文可读、保存确认和原生合成回复可见 |
| 独立来源与保存 | 一个 query worker、一条分析、保存服务不接共享 run-store；保存服务重启后原分析不变，页面 reload 核对同一保存回执。浏览器模式没有执行离线查询重放或 API 同 intent 重放（`query_offline_replay=NOT_RUN`、`same_intent_replay=NOT_RUN_BROWSER_MODE`）；`source-boundary.json` 与两份 `processes.json` |
| 本机保护 | 620 文件大小/摘要/mtime 保持，候选 journal 仍 seq 5；`protected-local-before.json`、`verified.json` |
| 取回与清理 | 184 文件逐项验证，加 inventory 共 185；510 个密封远端输入和 runtime 摘要保持，临时进程全部退出、端口关闭、独有目录回收，生产 current/listener PID 快照不变 |

五场景为：未登录时原生命令拒绝；官方 slot CRM 登录；原生查询经过实际 loop/worker 后确认保存；reload 恢复同一保存回执；不带业务 preset 的原生会话完成合成对话。驾驶舱加入、导出和发送仍 disabled；真实身份和真实模型没有参与。

执行入口仍为 `backend/tests/test_analytics_first_purchase_official_host.py`，设置 v5 artifact manifest、绝对 Python/wheelhouse、`B0_NATIVE_CRM_BROWSER_MODULE` 和 `B0_NATIVE_CRM_BROWSER_EXECUTABLE`。完整白名单环境及命令在 `remote-run.py`，本次不设置 recovery 模式：

```sh
# 从本工作树运行已封存的编排，不能换成新候选或重新使用已回收的目录。
# 以下是本次已执行命令的记录，不是可直接重跑的安装指南。
python3 .context/checks/first-purchase-current-browser-20261007/remote-call.py remote-launch.py 25
```

其子进程以 UID65534、Python `-I -B` 和 pytest `--noconftest -q --tb=short -p no:cacheprovider` 运行，唯一服务实例属于 `/tmp/owned-fp-browser-cku4mhx5`。CRM、模型、DuckDB 和保存 SQLite 均为隔离 synthetic fixture，没有读取真实库、凭据或生产用户状态。

## 回执与边界

回执 `dsh-current-candidate-browser-observation/v1` 显式记录新 candidate、插件/服务独立 source SHA、控制器/输入/runtime/字体摘要和 NOT_RUN 项。该现场阶段尚未接线，journal 保持 seq 5；后续已以显式 browser v2 接入 seq 6，见[门禁记录](dsh-g0-current-browser-gate-20261007.md)。原 observation 字节保持，没有改名为旧 browser schema，也没有把 terminal seq 5 当成旧 HTTP runtime 事件；接线未重跑浏览器。

- 证据 archive 710231 B，SHA256 `63fbf3f00c1762a217f633fc08aa2927e67814faffea1a30d3d08073813a7491`；`verified.json` 和 `remote-cleanup.py.result.json` 证明取回校验先于自有目录回收。
- `retrieved/browser-result/tests/test_official_host_crm_query_s0/official-host/browser-saved.png`、`browser-native.png` 已实际查看；只确认中文字形与两项可见结果，不声明完整视觉、键盘或读屏验收。
- Starlette/httpx 与 AnyIO 两条弃用警告保留；没有为了清除警告升级固定依赖。
- 本轮的 runtime/Chrome/CJK 字体及库下载都是固定版本摘要核对，不构成签名/SBOM/发布者身份认证。
- 生产仍 `/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3`，6677/18090/18092/18093/18094 监听及 PID 保持。旧 release/runtime/data 没有删除。
- 后续已关闭当前浏览器 journal 适配；完整跨版本 corpus、真实身份/模型/UAT、供应链、生产 activation/canary/rollback、G0 stop/go 和物理分仓仍开放。此阶段后续只有文档改动，随浏览器 v2 门禁批次审查提交。
