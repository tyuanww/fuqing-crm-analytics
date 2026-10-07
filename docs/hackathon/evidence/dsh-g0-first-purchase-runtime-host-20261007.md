# 固定 Linux runtime 与首购包的杭州宿主验收（2026-10-07）

本轮关闭 **T2/T3/T9/T14 的 WSL 固定 runtime + 插件 + 查询/保存服务 HTTP 组合子项**。实际运行在杭州 WSL2、Linux x86_64、Node 24.21.0、Python 3.14.4、UID 65534。没有安装到生产 release/current，没有访问真实业务数据或调用真实模型。整体仍 **PARTIAL / release_ready=false**。

## 输入与边界

工作树为 `codex/plugin-boundary-review@09080b77`，接续尚未提交的来源 HTTP 回执门禁。业务服务仍取自 `f9726f682fc0d1d4c6aef6f07e6932c2c600c3d6`，本轮没有重新打业务包。原 candidate 文件、15 个固定输入和 journal seq 4 保持不变。

| 输入 | SHA-256 / 身份 |
|---|---|
| 官方 DSH 上游 | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443` |
| 已发布的 Linux runtime，164918950 B | `a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4` |
| workbench tgz | `b3571f04618f44cdc7e0772d99980a4087a2f5a6a3a71e6cbbde778c85a86001` |
| CRM tgz | `d682081d8754d68cb34acff59fb7655d84dd7e4b0dd65caaed1499f5a76aafe7` |
| 查询 archive | `109251614197e515a34a4824206e93ef53c0185e5c09a24a7906f9f7a967b8b7` |
| 保存 archive | `ee4908c40c7c8d127cec1c25b4bfae83ec6b0997d006bc7bf9615e8ee23f0ac7` |
| 局部 candidate digest | `861d6ef1c42b23b5f2ad4427ba9a19ecb032651c61efa6414303e0729feea4d4` |
| Linux wheel 来源回执 | `607b7d942a10b337d50a58b1138cf1f31424d925561b1376011dd72d446f8f2f` |

runtime 来自既有 `dsh-0.20.0.0-r1` Release。杭州直接从 GitHub 下载约 14.39 秒，Tailscale 只传控制命令、验收夹具及结果。它与本机下载的摘要一致，包含 Linux x64 system/require-builtin/onnx/sharp 原生依赖。复用该 runtime 不代表采用该旧 Release 的业务代码，也不代表本轮已验证发布签名/attestation。

新显式输入 `dsh-first-purchase-host-artifacts/v5` 继承 v4 的 candidate、CRM、service pair 和 query receipt 字段，增加：

- `runtime_manifest_path`、`runtime_manifest_sha256`：既有 release manifest 的固定字节。
- `runtime_archive_path`：manifest 指定摘要/大小的 runtime；流式复制并核验后只解包这份私有副本。
- `platform_receipt_path`、`platform_receipt_sha256`：既有 Linux wheel 观察；校验当前平台、candidate/source、两包 archive/manifest、依赖集合、wheel 版本、文件名/ABI 和字节摘要。

v5 不接受 `B0_NATIVE_CRM_HOST_UPSTREAM`，避免与 checkout 混用。它安全解包 `lib/bin.js` 布局的官方 runtime，通过既有生产接收器逻辑连接 SDK peer；没有伪造 `.git`、修改上游或回落到源码服务。v1–v4 的 checkout 校验仍保留。原 Mac pack receipt 不变；查询回执里的 `wheels` 保留构建来源，实际 Linux 安装单列 `installed_wheels`，保存服务的新安装观察记录实际 wheel。

安装前后逐文件/链接核对 runtime：**39539 项**，逻辑文件总量 604842798 B，树摘要 `5a51d5c82fb1a60254b0915b79b2441f9d82283476857fff09aee6ee3c2c567e`。解包器的 601731636 B 计数不重复计 hardlink，两者计数定义不同。

## 实际验证与失败修复

证据根目录（相对工作树）：`.context/checks/first-purchase-runtime-host-20261007/`。下面均为本轮执行，不借用历史测试计数。

| 命令 / 场景 | 当前结果 | 证据 |
|---|---|---|
| Node24 `--test`：pinned-host-acceptance、first-purchase-kernel-artifacts、first-purchase-runtime-artifacts | **49 PASS / 0 SKIP**，含真实旧包冷安装及新 runtime 负测 | `host-guards-final.log` |
| Python 3.14 `pytest`：packed kernel/service support、source target probe | **13 PASS** | `python-guards.log` |
| Node24 `--test scripts/release/*.test.mjs` | **278 PASS / 0 SKIP** | `release-tests.log` |
| 原 v4 checkout + 固定四包，`test_analytics_first_purchase_official_host.py` | **1 PASS**，9.31 秒 | `local-v4-r2.log` |
| 同一测试在实际 WSL 使用 v5 | **1 PASS**；23 项控制器依赖及业务 15/13 项依赖离线安装、运行与完整性检查共 80.41 秒 | `remote-run-r2.log`、`retrieved/host-r2/pytest.stdout` |
| Ruff、语法、差异及新增/修改的文档文件链接检查（不含锚点） | PASS | `checks.json` |

实际目标命令及隔离环境保留在 `remote-execute-r2.py`；它以 `-I -B` 启动控制器 Python，显式关闭 pytest 自动插件和 conftest，执行上述唯一 Host 测试。原始输入、控制器来源映射及完整输出一并保留，不能只复制 PASS 文案当作验收。

本轮按 OCR delegate 更新清单与规则：29 个待提交文件中，16 个新增/变化文件完成本轮审查；13 个未变化文件逐一匹配上一轮已审摘要，复用其审查结论。OCR 选择 18 个文件，另有 11 个文档/测试文件纳入人工核对；未发现本轮新增且未修复的阻断项。29 文件凭据扫描无命中、24 处新增/修改的文档文件链接有效，详见 `review-summary.json`、`secret-scan-final.json` 和 `checks.json`。15 个固定输入的摘要/大小/mtime 与本轮 journal 字节不变，见 `immutable-inputs-final.json`；journal 仍为 seq 4，不把本次宿主观察自动写成发布通过。

两次失败均保留，未掩盖为通过：

1. **本机恢复基线采样过早**：查询已 SUCCEEDED，原生总结的模型步骤随后合法追加 `run.updated`，version/sequence 从 7 变 8；测试拿过早的快照严格比较，误判恢复失败。新增私有 observer `idle` 和驱动 `settle-query`，等待原生 turn 完成再取基线；继续严格比较重启后的完整快照，没有忽略序号或时间。原失败见 `local-v4.log`，修复后见 `local-v4-r2.log`。
2. **WSL 控制器意外加载旧 CRM 初始化**：第一轮在收集测试时缺 `backend.semantic.filters`，尚未启动 DSH。隔离控制器改用本项目已有 `service-namespace.py` 作为七个 Python package 的入口，每个原摘要与替代来源记录在 `payload-r2/namespace-inputs.json`。没有改写业务 archive 或仓库源码，也没有用控制器替代实际服务；服务/worker 的导入来源由各自 archive guard 检查。第一轮见 `remote-r1-failure.log` 与 `retrieved/host-r1/`。

固定输入包 185 文件，seal `26a8d19318c101606ab4d66f6592d6db371f180fb885d2d15a241becee3d63c9`；第二轮控制器 143 文件，seal `d43768583c586164848065f954d77b07d483220684211afb965d8d06cf4af148`。最终 30 文件证据包 SHA 为 `5652d225882ed5153a735b0ed7fe8705b9a419b501607c25229549b5110401a1`，取回后逐文件核对摘要。

## 本次关闭的行为

同一 WSL 测试通过官方 HTTP/原生命令验证：缺 Cookie、外部 Origin、缺 CSRF header 拒绝；登录前查询拒绝；登录后原生 loop 驱动实际查询 worker；显式保存、ACK 丢失后核对及同请求重放；查询离线时保存服务重启；查询进程重启后不重复派发；旧卡片不能取消新任务；DSH 正常重启后会话日志前缀与 Cookie 保留、CRM 凭据要求重新登录；断开 CRM 后可使用没有业务工具的原生会话。

缺 CSRF 的固定 rc2 carrier 实际关闭连接，属于拒绝路径，不声称收到了 HTTP 403。原生对话仍使用合成模型，查询数字来自合成 JSON 的真实计算。

最终 **1 个 worker / 1 条分析**。查询与保存各自独立状态目录，保存服务 audit 只允许打开自己的分析库。8 个记录的自有 Host/服务/worker PID 均已退出，4335/4336/4337 和临时保存端口已关闭；runtime、185 个输入和 143 个控制器文件未变。现场五个生产监听/PID 快照一致。取回证据后仅删除本次带专属标记的 `/tmp/owned-fp-runtime-me_cepcw`，见 `remote-cleanup.json`；不保留临时服务或试验数据。

## 尚未关闭

- 本次是目标官方 Host HTTP；**目标浏览器、headed/移动端/无障碍、真实模型/业务 UAT：NOT_RUN**。
- 正常重启的会话持久化已验收；DSH 在途崩溃/torn-frame、rc1→rc2/当前包跨旧版本矩阵和 profile 原子激活/回退：**NOT_RUN**。
- 当前 target Host 回执尚未接入 candidate journal；原 journal 保持 seq 4。不能拿它冒充旧 `verify-host` 十项 schema，也不把目标 wheel 的来源观察当作新 release gate。
- 真实 CRM 身份/生产形状保存策略、供应链签名/SBOM/CVE、目标 canary/activation、物理分仓：仍开放。结果年龄判断沿用用户决定暂缓。
- 本轮仅本地代码/测试/文档增量；未 commit、push、发布或切换杭州现役。
