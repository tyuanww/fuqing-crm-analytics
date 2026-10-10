# 同一首购候选的杭州 WSL 浏览器验收（2026-10-07）

结论：杭州 Tailscale/SSH 已恢复，固定官方 rc2、原 workbench/CRM/查询/保存四包在实际 WSL2 的隔离 Chrome headless 完成 **5/5 交互观测，官方 Host 测试 1 PASS**。这关闭目标桌面 headless 的 synthetic 子项，产品仍 PARTIAL，`release_ready=false`。本轮没有生产切换、Git 提交或 GitHub 操作。

## 候选与执行边界

- 当前分支 `codex/plugin-boundary-review`，HEAD `4d792eebc577686e452757d1986051aaf03d47ba`；前一阶段未提交的 Host 回执门禁/CI 增量保留。
- 候选 digest：`861d6ef1c42b23b5f2ad4427ba9a19ecb032651c61efa6414303e0729feea4d4`。查询/保存源码仍为 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`，未重打业务包。
- DSH `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`；Linux runtime SHA256 `a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4`，从既有 GitHub Release 直接下载并核对原摘要。不修改上游，不使用浮动 main。
- 实机为 Linux x86_64 / WSL2 `6.18.33.2-microsoft-standard-WSL2`、Node 24.21.0、Python 3.14.4；测试以 UID 65534 在本次独有临时目录运行。CRM 身份端点、模型响应和业务数据均为 synthetic，查询 worker 和独立查询/保存进程实际运行。
- Playwright 1.62.1，固定 Chrome for Testing `151.0.7922.34`，headless、1280×900、`zh-CN`。浏览器及依赖只解包到自有临时目录，不做系统安装、不改系统字体/网络/服务配置。

## 实际观测

证据根目录：`.context/checks/first-purchase-target-browser-wsl-20261007/`。前次连接失败证据仍在[原准备记录](./dsh-g0-first-purchase-target-browser-20261007.md)，本次成功不能反推先前中断的具体原因。

| 场景 | 本次结果 |
|---|---|
| 未登录 CRM 时从原生输入框查询 | 拒绝，显示 NOT_CONNECTED |
| 官方 slot 的 CRM 登录 | 合成账号连接当前会话 |
| 原生 `/first-purchase` → 实际 loop/worker → 确认保存 | SYNTHETIC 结果、保存为独立分析版本；驾驶舱/导出/发送保持禁用 |
| 页面 reload | 同一保存 intent 的已保存回执恢复 |
| 无业务 preset 的普通原生会话 | 原生对话完成，不包含首购查询工具 |

浏览器 `pageerror` 为空。测试末尾实际检查分析记录 1 条、worker 1 个；保存服务和查询服务分别重启后数量不变，保存进程只开自有分析库。浏览器分支不包含 HTTP 分支的全部二十项观察，也不代表本轮重跑了宿主正常重启、ACK 丢失重放或跨版本恢复。

## 暴露的问题与修复

1. 已核对本轮预检和 `browser-library-receipt.json`：连接恢复后，系统未发现可用 Chrome/Playwright；使用固定 Playwright 输入及其 revision 1234 对应 Chrome for Testing。缺失的 NSPR/NSS 通过现有 apt 元数据固定版本、下载并校验摘要后解包，浏览器 launcher 单独设置库路径，不传给业务服务。
2. `browser-r1` 实际失败：Linux 默认语言为英文，原驱动等待中文“继续”，实际按钮为 Continue，超时。增加明确 `zh-CN` context，并记录实际版本/平台/locale；`browser-r2` 官方测试 **1 passed, 2 warnings，76.30 秒**，含离线控制器安装的编排时间 78.18 秒，五场景通过。
3. r2 截图复核发现中文字形为方框：WSL 缺 CJK 字库。固定 `fonts-noto-cjk` `1:20230817+repack1-3`，仅下载/解包到本次目录，通过临时 FONTCONFIG_FILE 提供中文字体。摘要 `7d64b985f6fe128c99eae5610d5c047338e572bdcfb2bb09736be01b824a7f6c`。r2 只证明交互通过，不能冒充中文视觉验收。随后 `browser-r3` 使用同一 r2 控制器及原业务包复跑，**1 passed, 2 warnings，84.31 秒**（含控制器安装 86.26 秒），五场景通过；实际保存/原生对话截图已人工核对中文可读，仅关闭缺字形问题，不声明完整视觉/无障碍 QA。

源码改动限于浏览器驱动与保护测试：增加绝对、普通、可执行浏览器入口检查，拒绝 symlink/目录/不可执行路径，不静默回落；启动失败留 NOT_STARTED 回执并回收部分初始化资源。驱动默认仍可使用系统 Chrome，不自动下载安装。

## 本次验证入口

```sh
node --test scripts/dsh-b0/first-purchase-kernel-artifacts.test.mjs scripts/dsh-b0/first-purchase-runtime-artifacts.test.mjs scripts/dsh-b0/pinned-host-acceptance.test.mjs
```

Node 24.19.0：**47 PASS、4 SKIP、0 FAIL**。4 个 skipped 为要求显式 query/save receipt、Python 和 wheelhouse 的本地 cold-install 条件用例，不算通过；目标 WSL 的离线安装是另一层实际证据。日志 `host-guards-final.log`。原 311 项 release suite 属于上一阶段，本轮不重复运行或重新声明通过。

目标使用同一 `backend/tests/test_analytics_first_purchase_official_host.py`，设置 v5 artifact manifest、独立服务 Python/wheelhouse 和 `B0_NATIVE_CRM_BROWSER_MODULE` / `B0_NATIVE_CRM_BROWSER_EXECUTABLE`；最终实际命令及白名单环境见 `remote-browser-run-r3.py`。Python 以 `-I -B`、pytest `--noconftest -q --tb=short -p no:cacheprovider` 执行，未加载本机或生产配置。固定依赖的 Starlette/httpx、AnyIO 弃用警告保留，不为消除警告升级业务包。

## 证据与回收

- 最终 `verified-r3.json` 校验了 **73 个证据文件**（加 inventory 本身共 74 文件）；`evidence-r3.tar.gz` 为 618638 B，SHA256 `fcb545d01cb2dca3d4d7fd043d8c21f753d35729f66792bb52e004c47e908fff`。此前 r1/r2 archive 和失败日志保留，不覆盖。
- 原始 502 个密封输入、r2 控制器 143 文件、6 个字体/配置/launcher 输入及 runtime 摘要均保持一致；15 个本机候选输入和原 journal 的大小/摘要/mtime 保留。journal seq 5 摘要 `2882e6987396fc3416ab5068c54f0be3b112d5545fc7f3f4dac013f285c983b7`，没有追加 browser PASS 事件。
- 控制器 seal SHA256 `a62f56733b1ccf97a34364b1cb0243d9d1c9c32a908e44cfd5baaab600b08ea3`；Chrome 下载摘要 `ae8736ac28bc69278551500f219fc749575648263c43ec5990749eff43b9fcf8`。字体与库独立回执记录固定版本、实际摘要及 download-and-extract-only，不把这些本地观测称为供应链签名。
- `retrieved-r3/browser-r3/tests/test_official_host_crm_query_s0/official-host/` 保存最终 browser observations、HTTP/包完整性观察、`browser-saved.png` 和 `browser-native.png`；同级 `source-boundary.json` 记录一条分析、一个 worker、独立来源 HTTP。`retrieved-r3/browser-r3/pytest.stdout` 保留完整 pytest 结果和两条警告。
- 证据取回并逐项校验后，仅删除本轮 `/tmp/owned-fp-browser-u9c1z1ae`。清理前确认没有 cwd/exe 属于该目录的残留进程，4335–4337 均无监听；清理前后 6677/18090/18092/18093/18094 的监听/PID 快照一致，见 `remote-cleanup.json`。没有删除旧 runtime、release 或生产数据。
- 本轮 8 个变更文件的差异/语法、新增相对链接、secret scan 和输入不变校验见 `checks.json`；自查见 `review-summary.json`，不冒称外部 OCR 或独立 reviewer 已执行。未再次 commit。

## 剩余边界

- 该现场阶段 browser observation 尚未接入，原 journal 保持 seq 5；后续已通过独立 browser schema 接入 seq 6，见[接线记录](./dsh-g0-first-purchase-browser-gate-20261007.md)，不把新回执当作旧 HTTP-only 门禁输入。
- headed、移动端、键盘/读屏完整无障碍验收 NOT_RUN；在途崩溃/torn-frame、rc1→rc2 目标恢复 NOT_RUN。
- 真实身份、真实模型/业务 UAT、供应链签名/SBOM/来源信任、生产 activation 和物理分仓仍开放。JSON 与本地摘要核对不是发布者签名。
- 本轮不读取真实 DuckDB、不登录真实 CRM、不启用生产保存，不修改 6677、18090、18092、18093、18094 服务。
