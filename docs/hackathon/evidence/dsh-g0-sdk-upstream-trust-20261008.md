# T15：固定 SDK 依赖路径与来源信任复核（2026-10-08）

## 结论与范围

在 `codex/plugin-boundary-review` 上继续已提交 `d78c7cd5` 的 SDK 分发工作。目标是 2026-10-07 的 Mac `received-r3`，closure SHA-256 为 `37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4`。固定官方 DSH 仍为 `0.1.7-rc.2 / 477b4f420553e8a52c2fbccc464d7561b239c443`，没有修改上游源码、锁、pin 或 SDK 字节。

本轮关闭历史签名密钥日期判断和 17 项来源字节疑点；**7 个受影响版本 / 29 条不同公告仍存在，SDK 分发 BLOCKED，产品 PARTIAL**。来源验证与漏洞利用条件、安全放行分开。公开查询只涉及精确公开包/版本、已知公告、官方公钥和固定源码；没有发送业务数据或凭据，没有执行下载包。

原始报告、请求结果、逐包路径与证据索引保存在 `.context/checks/sdk-upstream-trust-20261008/`。`evidence-index.json` 记录 72 份文件摘要；以下相对路径均指该目录。已核对原 SDK 全部 **30,546** 条记录不变，见 `input-protection.json`。

## 七个版本的具体归属

| 包 / 版本 | 本包实际内容和依赖入口 | 处置边界 |
|---|---|---|
| fast-uri 3.1.3 | 20 个 JS 文件；SDK session-controller → agent-preset-registry → app-boot → ajv → fast-uri，含 peer 边；上游 projector 实际构造 Ajv2020 | 属于运行依赖闭包；不按开发依赖豁免。输入可利用性尚未动态验证。 |
| js-yaml 4.2.0 | 30 个 JS 文件；cordis → cordis-plugin-include → js-yaml；app-boot/CLI 另有 YAML 调用 | 运行依赖，保留三条公告。 |
| js-yaml 4.3.1 | 30 个 JS 文件；session-controller → agent-preset-registry → js-yaml，config-editor 也是运行入口 | 运行依赖，保留一条公告。 |
| katex 0.16.47 | 此子树仅四份声明/清单/许可文件、0 JS；但 ui-primitives 编译入口仍外部导入 katex/CSS，宿主源码调用 renderToString | 仅能确认当前 SDK 子树没有其实现 JS；宿主风险仍待验证，不能整体豁免。 |
| source-map-js 1.2.1 | 11 个 JS 文件；此缩减 SDK 仅由显式测试根 jsdom → css-tree 带入 | 开发测试进程仍可执行，保留分发公告；不冒充生产运行漏洞已证实。 |
| undici 7.28.0 | 114 个 JS 文件；此缩减 SDK 仅由显式 jsdom 测试根带入 | 开发测试网络输入风险仍保留。 |
| undici 8.10.0 | 112 个 JS 文件；session-controller → subagent → permission-presets → shell → subprocess → http-proxy，另有 web-fetch-http | 上游存在动态导入及运行依赖，不按顶层 import type 忽略。 |

依据：`dependency-paths.json` 的真实 symlink/清单边/锁 importer、`source-evidence.json` 的源码与摘要，及 `advisory-matrix.json` 的 40 个版本/公告对（去重 29 条）。没有运行漏洞载荷，也没有把静态到达等同于当前业务可利用。

## 签名与不透明内容

五个保留的精确 tarball 重新计算 SHA-512，与本次 npm metadata 和固定锁/Corepack identity 绑定，再使用新取得的 npm 公钥核验名称、版本与 integrity 签名：**5/5 SRI、5/5 签名通过，5/5 篡改负测拒绝**，见 `registry-trust.json`。

`rc-tree-select@5.27.0` 发布时间是 `2025-01-07T03:27:39.864Z`，签名 key 到期时间为 `2025-01-29T00:00:00.000Z`；当前官方 keys 仍列出该 key。[npm 的签名合同](https://docs.npmjs.com/about-registry-signatures/)与 [pacote 21.5.1 实现](https://github.com/npm/pacote/blob/v21.5.1/lib/registry.js#L176)按包发布时间判断有效期。本轮在禁网沙箱调用本机已有 npm 11.17.0/pacote 21.5.1 的真实 RegistryFetcher：原始元数据通过，合成的到期后发布时间、无公钥、篡改 integrity 三项负测分别拒绝。

因此该条从 `EXPIRED_KEY_REVIEW_REQUIRED` 收敛为 `VALID_AT_PUBLISH_TIME_BY_NPM_POLICY`。发布时间来自 TLS 注册表元数据，签名本身没有可信时间戳；发布者/构建者身份、独立撤销、最终分发签名仍开放，不能把这一结果当作整条供应链放行。

17 项不透明内容中，14 项逐成员匹配上述五个精确 tarball，三份 Montserrat 字体本轮从固定官方 commit 独立读取并匹配；OFL 1.1 声明摘要一致。**17/17 来源字节通过**，见 `opaque-source-recheck.json`。这补齐来源证据，二进制执行安全、字体解析安全和完整组成审查仍未完成；既有内容扫描仍按 **0 模式命中 / 17 不透明覆盖项** 记录，不能改成全覆盖。

## 官方升级候选与下一步

公开重读官方 `dsh-v0.2.0-rc.2` 的固定 commit `639ed015397290b3745d163aafe02ffee4aa3f84`：package.json 和 pnpm-lock.yaml 的 SHA-256、Git blob 与历史一致，仍声明 pnpm 11.7.0。历史选取九个版本重查后，八个命中、去重 29 条公告；**该版本不能直接作为这些依赖的修复**。首次误用展示版本名请求失败和后续真实 tag 请求均保留，见 `public-fetch*.json`、`upstream-020-recheck.json`。未运行 0.2 宿主，不认证其兼容性，也未检索所有官方版本。

本轮实际核实以下精确公开修复候选：fast-uri **3.1.8**、js-yaml **4.3.2**、source-map-js **1.2.2**、undici **7.29.1 / 8.10.2**、KaTeX **0.18.2**；历史 0.2 的 undici 6.x 对应 **6.28.1**。16/16 查询完成，这七个候选版本当次无公告，npm metadata 证明版本实际存在。见 `remediation-osv.json`、`remediation-metadata.json`。无公告是查询时点结果，不是安全保证；没有安装或构建这些候选。

继续保持“官方底座独立、业务插件独立”的边界：在单独的官方升级候选中验证依赖修复及 YAML/Ajv/HTTP/Markdown 行为、SDK/插件和目标平台兼容，不在旧 SHA 对应源码中暗改依赖，不把全量 SDK 审计加入每次插件修改。KaTeX 跨次版本需单独检查渲染、类型与样式。完整 SBOM、发布者身份/撤销、最终签名仍作为 SDK 分发开放项。

## 本轮命令和未运行范围

```sh
python3 .context/checks/sdk-upstream-trust-20261008/fetch-public.py
python3 .context/checks/sdk-upstream-trust-20261008/analyze-local.py
python3 .context/checks/sdk-upstream-trust-20261008/fetch-followup.py
sandbox-exec -p '(version 1)(allow default)(deny network*)' /Users/hutou/homebrew/opt/node@24/bin/node .context/checks/sdk-upstream-trust-20261008/verify-trust.mjs
python3 .context/checks/sdk-upstream-trust-20261008/query-remediation.py
python3 .context/checks/sdk-upstream-trust-20261008/closeout.py
```

未执行候选安装、真实漏洞触发、完整 release pipeline、真实模型/业务 UAT、远端 CI、发布或部署。WSL 验收由另一个独立任务留证；本文不借用其结果。前述日期与数量都是本轮实际证据，旧报告保留历史状态。
