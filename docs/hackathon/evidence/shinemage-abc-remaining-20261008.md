# 剩余五项准入与候选差异（2026-10-08）

承接 [集成接续](shinemage-abc-resume-20261008.md)。没有重跑完整 B0，没有改历史回执、旧 journal 或 DSH 上游。产品仍 **PARTIAL / release_ready=false**。

## 现场

集成树仍是 detached HEAD `e577f41b9247e3ac56052e21f84daed9dd32f163`。进入本轮时保留上一轮 24 个已跟踪修改和 4 个新文件。本地引用 `codex/shinemage-abc-integration` 仍指向该提交。没有 reset、stash、checkout、commit、push、PR、合并、发布或部署。

固定上游 `477b4f420553e8a52c2fbccc464d7561b239c443` 的 lock、index `3d26472f79fb65f14c0538148813a1ff8386f984a3a882bb43a740b64f33245a` 和 tracked status 在本轮前后一致。主成果树未提交文件数仍是 14。查询回执与归档字节也未变。

## 本轮实际执行

控制器 `.context/checks/abc-resume-remaining-20261008/run-remaining.py`。Node 24.19.0，Python 3.14.4，pip 来自既有 `abc-resume-20261008/b0-venv`。

### 固定官方 shell/tool 三项：PASS

`shell-tool-contract.test.mjs` **12 PASS / 0 FAIL / 0 SKIP**，5.884 秒。原先因缺少 `B0_BUILD_UPSTREAM` 与独占证据目录而跳过的三项都实际跑了：

- 超时回收失败回执。
- 父进程 SIGTERM 中断并清空已观察进程组。
- 固定官方模块 25 个合成场景，25 PASS / 0 FAIL。`release_ready=false`。14 个自有 PID 均已退出，`remaining_processes=0`。

证据在 `shell-tool`、`shell-tool-timeout`、`shell-tool-interrupt`。观察结果仍把 official web CLI、模型派发、会话 WAL、WSL、生产和 sandbox enforcement 标为 `not_run`。这不是 Web、模型或生产通过。

### 查询归档冷安装：FAIL，历史包未改

使用只读历史 `kernel-pack-r2/receipt.json`（SHA-256 `e30eb0d7faf877235ed62029ddb97aa80f33909c5b7cb607feb283d97c72041f`）和同目录 15 个 wheel。测试文件 2 PASS / 1 FAIL / 0 SKIP。冷安装在解包前被 `HOST_KERNEL_MANIFEST_SCHEMA` 拒绝。

历史清单的配方摘要是 `b1bc5d3b0bb845fd6287a188007f841da357ef08c086deecb02947cf7c60064e`。当前 `services/analytics-first-purchase-kernel/package.json` 是 `ddb70716f363e35661d9e1db24b25a4d18311843ce3c6c475302e7a135f1eb17`。当前配方多出 `analytics_first_purchase_source_app.py`、`analytics_first_purchase_source.py`、`crm_identity.py`、`identity.py`、`loopback_http.py`、`source_http.py`。没有重写 2026-10-07 回执，也没有为变绿重打查询包。

当前配方要完成冷安装，还缺一份绑定 `ddb70716…` 的新回执、对应 `kernel.tar.zst` / manifest，以及与该回执摘要一致的 wheelhouse。

### standalone example：NOT_RUN

`COCKPIT_EXAMPLE_PACKAGE` 未设置。仓库和已检索证据里没有定义 `window.RevenueReview` 的页面包。缺这个绝对 JSON 路径。没有用合成页面冒充该项通过。

## 正式 candidate / journal

只读复核旧 journal SHA-256 仍是 `b9ef9b1730abf2f9acfe0ba48473323e8aece9a4b8d85e79783932c9fe7f0149`，candidate 文件仍是 `cb5a24e0183a41af75cc09bdbb9dd44be4c38ae2fecd185166de83e3f4787833`。它绑定的 workbench 仍是 `c9770d…`。当前 B HTML 包仍是 `ecaa86…`。

当前 ABC candidate/journal 维持 **NOT_LINKED**。正式 CI 维持 **NOT_RUN**。没有向旧 journal 追加事件。

下一项现有入口是显式 plugin candidate：输入必须是一个已提交源码 SHA、该 SHA 打出的包、对应 profile 和服务 binding，并写入新的 journal。当前树是 detached 且有未提交修复，不能当作该 SHA。这一步需要提交授权，本轮没有做。

## 仍未关闭

SDK 分发 BLOCKED，嵌入组成 PARTIAL，内联函数体 NOT_VERIFIED。7 个版本和 29 条公告没有重查。真实模型、真实业务、生产验收和正式 CI 没有因为本轮 shell/tool 通过而改变。B 的六项外部 OCR 和 document-release 外审超时仍未完成。物理分仓和独立 DSH 升级仍停在原 stop/go 之前。

机器记录见 [shinemage-abc-remaining-validation-20261008.json](shinemage-abc-remaining-validation-20261008.json)。

## 当前配方冷安装

2026-10-08 继续的结果写在 [当前配方查询包](shinemage-abc-kernel-current-20261008.md)。新回执绑定 `e577f41…` 与配方 `ddb70716…`，冷安装 3 PASS / 0 FAIL / 0 SKIP。历史 `kernel-pack-r2` 未改。正式候选仍未关联。
