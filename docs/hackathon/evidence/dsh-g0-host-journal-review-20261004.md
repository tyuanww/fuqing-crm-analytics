# G0 宿主与 journal 增量：OCR 审查和修复

2026-10-04，`codex/plugin-boundary-review`，审查起点 `1737adc3`。用户授权本轮审核、修复、无已确认问题后本地提交；没有 push、发布、生产或数据迁移操作。

## 覆盖与发现

使用 `open-code-review-delegate`：OCR 负责文件选择和规则解析，当前 Agent 完成逐文件审查。原始范围 **30/30 已审、0 跳过、覆盖率 100%**：14 个 OCR reviewable 文件，另补审 15 份 Markdown 与 1 个 Python 测试；本页为修复后的新增证据。原始预览、规则、逐路径清单、结构化发现位于 `.context/checks/ocr-host-journal-20261004/`。

| 严重程度 | 缺陷 | 修复与复现 |
|---|---|---|
| Medium | `boundedFile()` 打开 FIFO 时先阻塞，尚未执行 regular-file 校验 | 加入非阻塞打开、同描述符类型检查和有界读取；真实 CLI 负测原先被 3 秒超时杀死，修复后退出 2，journal 不变 |
| Medium | 安装文件只与自身 manifest 比较，缺少与 tarball 内容的直接比对 | 复用现有安全解包器，在自有临时目录逐文件核对完整包内容；对不同入口构建、非入口资源变化及额外文件拒绝。SDK peer link 单列，不把它当作包自身文件 |

两项负测在修复前均失败，见 `regressions-before.tap`。修复后没有剩余已确认的本轮代码审查问题；这不关闭计划中尚未实施的门禁。

## 本次验证

工具链：Node **24.19.0**、pnpm **11.7.0**、backend Python **3.14.4**。全部为本次重新执行，未以历史结果代替。

- `pnpm dsh test`：**146 PASS / 0 SKIP**，`release-suite.tap`。
- 固定 `B0_BUILD_UPSTREAM` 下 `node --test scripts/dsh-b0/pinned-host-acceptance.test.mjs dsh-plugins/crm-knowledge/test/profile.test.mjs`：**9 PASS / 0 SKIP**，`guards-profile.tap`。
- `python -m pytest -q backend/tests/test_analytics_first_purchase_save_recovery.py backend/tests/test_analytics_first_purchase_analysis.py backend/tests/test_analytics_first_purchase_native.py`：**31 PASS**，2 条既有框架弃用提示，`save-tests.log`。
- `pinned-host-acceptance.mjs --upstream <固定已构建 rc2> --output <本轮新目录>/host --packages-from <前轮同包证据>/host`：官方 Web CLI **10/10 PASS**。仅模型响应和会话内容为 synthetic；未访问业务数据、现役服务或真实模型。
- 实际 `plugin verify-host` 两次：**PASS**，向本次 journal 副本追加第 **4** 条 `CANDIDATE_HOST_VERIFIED`，第二次不新增；原 candidate 字节不变。`integration-result.json` / `host-verification-receipt.json` 记录结果。
- 本轮宿主证据 SHA-256：`5ca634e05b60297e8575d6e36e7112e9478378fd9fef44f85fd83e23fc23a119`。CRM/知识 tarball 沿用 `1737adc3` 的已核对包，验收脚本另以当前源码摘要绑定。
- 本轮 5 个自有宿主 PID 已回收；固定上游 tracked source 干净。没有完整 B0、浏览器、Windows/WSL、真实模型或远端 CI 通过声明。

## 下一步与保留边界

T3/T7 继续补 D15 的 candidate、correlation、幂等键和 durable state key 绑定，以及丢失响应后的 UNKNOWN 查询/回放。当前仅证明 v1 同版本 SQLite 恢复，不能把 profile 回退当作数据回滚；保存能力仍 `NOT_AVAILABLE`。

目标平台 runtime、供应链、生产 activation/reconcile、现场 canary 和物理分仓依然按原计划推进。`LOCAL_HOST_VERIFIED` 始终为 `release_ready: false`。
