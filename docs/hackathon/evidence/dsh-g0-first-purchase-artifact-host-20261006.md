# 固定插件包的 CRM / 首购宿主与浏览器验收

2026-10-06，`codex/plugin-boundary-review` 从 clean `d3fe7f94` 继续。沿用[原生命令候选](./dsh-g0-native-command-candidate-20261006.md)，给现有 opt-in 宿主测试增加显式 artifact 模式；没有修改业务插件代码或 DSH 上游。当前仍 PARTIAL、`release_ready=false`。

## 本次固定对象

| 对象 | 来源与摘要 |
|---|---|
| workbench | 来源 `9611589ca39428d8c0e70d63c5ff202d6bd5293f`；435294 B；`b3571f04618f44cdc7e0772d99980a4087a2f5a6a3a71e6cbbde778c85a86001`，直接复用旧候选 tarball |
| CRM | 从 clean `d3fe7f949403627f69e87eae898d4930a2da5add` 正式构建/打包；234926 B；`d682081d8754d68cb34acff59fb7655d84dd7e4b0dd65caaed1499f5a76aafe7` |
| candidate | `ca79774b3bed3f733e3ab0ddfebc5f4f89586577dc8c2b06a886b9dab2a0e72c`；已核对两份最终 HTTP/Chrome 回执，保存策略显式使用此值 |
| DSH | `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，已有固定官方 Web CLI |
| 演练输入 manifest | `5a992072a97f0b874fc607e878edb62acf29b80c571bc102d48a9394b26acb58` |
| 最终 HTTP 观测 | `9aecd76df8ff7321fef02b4712b5d475fefe2546c4813974737ce5d9d6f259ee` |
| 最终浏览器模式宿主观测 | `b473f8d8439f58df34ccc0e5bc497008953543e24f4517149234cb404feeb408` |

新增 helper 复用现有 bounded file reader、profile/service 校验、安全解包、secret scan 和生产接收器的 peer link helper。先核对指定文件摘要、包身份、固定 DSH、profile 与 service binding，再将已哈希的字节解包到本次私有目录。Host 加载解包后的 `lib`，结束时检查安装内容和 SDK 链接未变化。只创建新目录；`guards-reviewed.log` 已验证重复目标以 EEXIST 拒绝，不覆盖旧证据。此入口不写候选 journal、不做生产激活。

**证据范围是本机两个插件包的组合。** 查询内核、CRM mock、保存 HTTP 服务仍由源码测试夹具启动；驱动器的 save controller 也来自测试源码。记录明确为 `service_runtime=workspace-synthetic-service`，不能声称整个服务 archive/runtime 部署组合已通过。原 workbench profile 未被改成 CRM 组合 profile；新输入 manifest 仅服务于隔离验收。

## 实际验证与失败调查

证据根 `OUT=.context/checks/first-purchase-artifact-host-20261006`，相对于当前工作树。Node 24.19.0、Python 3.14.4、已安装 Chrome/Playwright；合成 CRM/model/JSON、小型隔离 SQLite。

| 入口 | 最终结果 | 原始日志 |
|---|---|---|
| `node dsh-plugins/crm-knowledge/build.mjs` 和现有 `plugin-pack.mjs` | 固定构建、pack PASS | `crm-build.log`、`crm-pack.log` |
| `node --test scripts/dsh-b0/pinned-host-acceptance.test.mjs scripts/dsh-b0/mock-provider.test.mjs`，显式固定 upstream | **21 PASS / 0 SKIP** | `guards-reviewed.log` |
| `pytest --noconftest -q -W error::ResourceWarning`，save_ui + native_crm_http 两文件 | **3 PASS** | `http-fixtures.log` |
| 同一 official_host.py 的 artifact HTTP 模式 | **1 PASS** | `http-reviewed.log` |
| 紧接上一进程的 artifact Chrome 模式 | **1 PASS / 5 项观测**，page errors 为空 | `browser-reviewed.log` |
| Ruff、diff、输入与候选保留核对 | PASS | `ruff-final.log`、`final-integrity.json` |

Python 三份成功日志各有一条既有 warning；没有标成零告警。21 项包括篡改包、profile 漂移、dirty CRM、符号链接/FIFO、重复目录、运行后文件/SDK 链接变化拒绝，以及父进程失败后驱动器退出。

本轮两类失败均保留：

- `http-1.log`：复用了旧演练的 CLI 直接依赖链接，workbench 缺 `dsh-client-connection`，身份链得到 503。没有改包或把 503 放宽为通过；改为现有 `materializePluginPeerLinks` 的完整固定 peer closure，并在服务启动前实际 import 两个 Host 入口。修复后 `http-2` 与首次 `browser-1` 通过。
- `browser-final.log`：紧接 HTTP 运行时固定端口仍处于 TIME_WAIT，Python 夹具 bind 失败；随后子进程 EOF 的 JSON 错误掩盖原原因。自有 socket 在 POSIX 使用 SO_REUSEADDR、Windows 使用独占地址，保持禁用 SO_REUSEPORT；新增三次连续关闭/重启且不能抢占 live listener 的真实 HTTP 回归。驱动器在父初始化失败、尚未启动 Host/model 时正常结束。最终 `http-reviewed → browser-reviewed` 连续通过。

另有 `guards-1.log` 的 macOS tar AppleDouble 夹具失败；只在生成测试 tar 时设置 COPYFILE_DISABLE，保持实际解包文件集合严格检查。失败证据未删除。

HTTP 验证真实官方 Cookie/Origin/CSRF、原生命令准入、worker、同账号保存 ACK 丢失核对、精确取消、宿主正常重启与重新登录、session journal 前缀保留。浏览器验证登录前拒绝、CRM slot 登录、原生 composer 查询与显式保存、刷新同一回执、无 CRM 登录的普通原生对话。数据库断言仍是一条分析、一个 worker。Chrome 截图已查看；旧拒绝 toast 的短暂残留不作为新的保存失败，完整视觉/无障碍仍待验收。

## 重现与后续

在已固定 Node24/B0 Python 的环境，使用已有绝对 upstream 与新 `--basetemp`，两种模式必须顺序运行：

```sh
export B0_NATIVE_CRM_HOST_UPSTREAM=/absolute/unchanged-built-dsh-0.1.7-rc.2
export B0_NATIVE_CRM_ARTIFACT_MANIFEST=/absolute/owned/input.json
python -m pytest --noconftest -q -W error::ResourceWarning \
  --basetemp=/absolute/new-http-evidence backend/tests/test_analytics_first_purchase_official_host.py
B0_NATIVE_CRM_BROWSER_MODULE=/absolute/existing/playwright/index.mjs \
  python -m pytest --noconftest -q -W error::ResourceWarning \
  --basetemp=/absolute/new-browser-evidence backend/tests/test_analytics_first_purchase_official_host.py
```

manifest 使用 `dsh-first-purchase-host-artifacts/v1`，必须包含绝对 `candidate_path`、该 JSON 文件的 `candidate_sha256`（区别于内部 candidate digest）、绝对 `crm_pack_path` 和该 pack 回执文件的 `crm_pack_sha256`。未知键拒绝。pytest 自己分配 `B0_NATIVE_CRM_ARTIFACT_OUTPUT`；不设置 artifact manifest 时保留原来的 workspace 模式。此入口不安装依赖或升级工具链。

两份最终回执均为 `cleanup_ok=true` / `package_integrity=PASS`。Host PID 36637/36652/36713 已退出，4335/4336/4337 无监听；包、截图和合成状态保留在本次证据目录。旧候选目录 **83** 个文件的内容、大小与 mtime 均未变化，journal 仍 seq 3。本次回执尚未接入生产 verifier，未绕过原 `verify-host` 的 CRM + knowledge 范围。

下一步沿用 T3/T7/T13/T17/T21：将独立服务 archive 接入同一组合验收，补目标 WSL/runtime/恢复与回执门禁；供应链、真实模型/生产 UAT、headed/移动端/读屏和生产激活仍开放。G0/stop-go 后再物理分仓。本轮没有连接杭州、访问真实 DuckDB、push 或发布。

## 提交前审核

沿用 OCR delegate 的确定性 preview/rule，由当前 Agent 审查全部 **11/11** 文件（含默认排除的 2 份 Python 和 6 份 Markdown），**0 skipped、100%**。本轮发现的 SDK 链接、端口复用与父失败归因问题已修复并实际复验，另补运行前 Node 检查和运行后包/SDK 链接完整性负测；本轮无未关闭代码发现。review 清单保存为 `review-summary-final.json`，新增文档链接、回执摘要和最终源码一致性核对保存为 `document-links-final.json`。首次提交的文档声明检查要求近行证据，已对照上述实际回执与 EEXIST 测试补明出处，未跳过 hook。此结论不关闭上节的集成与生产开放项，也不是独立外部 reviewer 的背书。
