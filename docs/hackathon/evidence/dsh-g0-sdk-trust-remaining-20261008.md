# T5/T19/T15：固定 SDK 组成与管理器 provenance 补证（2026-10-08）

## 本次结论

在 `codex/plugin-boundary-review / 5bf2bc77` 上并行继续供应链开放项，目标为封存的 Mac `received-r3` 开发 SDK，closure SHA-256 为 `37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4`。本次实际补齐全部保留文件的归属和清单依赖边，并验证 **pnpm 11.28.2 这一管理器**的来源/构建身份及发布 attestation。**SDK 分发仍 BLOCKED，产品仍 PARTIAL，`release_ready=false`**。

证据只写新自有目录 `.context/checks/sdk-trust-remaining-20261008-r1/`；以下文件名相对该目录。没有重新准备 SDK、修改官方源码/锁/pin/原 SDK，没有进行 Git、杭州、真实数据或生产动作。先前六份未提交文档保留；其他并行任务的改动不属于本报告。

## 保留内容组成与依赖

先调用现有 `sdk-content-audit.mjs` 和 `sdk-supply-chain.mjs`，禁网且 SDK 禁写。当前源码真实读取固定产物：**26,195 文件完整摘要、0 模式命中、17 不透明覆盖项，PARTIAL / exit 2**；库存仍有 **360 个有版本包实例、222 个可查询 npm 名称/版本、33 个模块 scope marker 和 1 个无版本清单**。本次不再次查询 OSV，也不把模式检查当作供应链放行。

新的离线 `analyze-composition.py` 读取真实清单、原文件摘要和 closure 内闭合链接，未导入待审包。`composition.json` 覆盖所有 **26,195/26,195** 保留文件的最近包归属，记录 **5,216 条 dependency/peer/optional/dev 声明**：2,050 条可在保留树内解析，3,166 条未保留，所有声明、原范围、候选查找路径和 optional peer 标记均留下证据。无版本项精确定位到私有的 `build-tools/package.json`；没有为它编造 npm 版本。解析到包路径不是 SemVer 满足或动态调用兼容证明；typing/dev/可选省略也没有被改称运行缺陷。

另记录 **1,996 个脚本声明、137 个生命周期脚本声明**，本次没有执行这些脚本。`composition.bom.json` 将 360 个包实例和 1 个本地构建配置列为 **361 个 component、362 条 dependency record、1,550 个去重保留包边**，保持 CycloneDX 的 `aggregate=incomplete`。包摘要只用属性描述真实文件索引，不伪装成 npm 压缩包摘要。现有 Ajv 8.20.0 在禁网/只读输入下验证保留的官方 CycloneDX 1.6 schemas；schema、bom-ref 边一致性通过，错误格式、悬空依赖和删除组件三项负测拒绝，format 校验仍为 `NOT_VALIDATED`。

完整 SBOM **尚未关闭**：管理器的 `dist/pnpm.mjs`（15,457,230 bytes）和 `dist/worker.js` 分别有 2,535/135 个去重 `node_modules` 文本路径标记。标记没有独立证明嵌入组件版本、完整性或 build lock 来源。本次把此前的“未解析图”收敛为实际保留声明图和精确嵌入缺口，未将它声明为完整供应链 SBOM。

## 一个固定管理器的身份与 attestation

精确公开请求从 **2026-10-08 03:41:29 +08:00** 开始，只读取 `pnpm@11.28.2` 元数据、其声明的 attestation 与 npm 公钥。TLS 校验保留，禁重定向、无凭据/代理发现，每个请求 20 秒/4 MiB 上限，3/3 完成；原始响应、URL、时间与摘要见 `provenance-requests.json`。这是新增补证，不重复前轮官方 release/全版本查询。

原 pnpm tar 的 SHA-256 为 `30d4099fa03b9ba1124d81527808b1e4d8e719aeb0ddfe169426df3c4a038a5f`，签名 subject 为 `pkg:npm/pnpm@11.28.2`，SHA-512 为 `755ce2fe3c05bfd7bb412b42aff3c5c55cd38c529c6eca810475497ae36746c571e4b6e1814e6e7e4b97d7ee864b8a0e44673c3b297a50e0ac28771c5ce15d27`。本次重新计算原字节，与本次 npm integrity 和原 SDK `.corepack` 固定 hash 一致。

调用本机已安装的 npm 11.17.0 / Sigstore **4.1.1**，没有导入新下载代码。实际验证 npm 发布 attestation 和 SLSA provenance 的签名/信任链、透明日志以及证书身份：

| 身份项 | 实际绑定 |
|---|---|
| OIDC issuer | `https://token.actions.githubusercontent.com` |
| workflow identity | `https://github.com/pnpm/pnpm/.github/workflows/release.yml@refs/tags/v11.28.2` |
| source repository / ref | `https://github.com/pnpm/pnpm` / `refs/tags/v11.28.2` |
| source commit | `57e7b9b76ac3a5ef67461093071b2264335a1a01` |
| builder | `https://github.com/actions/runner/github-hosted` |
| invocation | `https://github.com/pnpm/pnpm/actions/runs/36451958183/attempts/1` |
| provenance / publish tlog index | `2984787393` / `2985329684` |

首次 TUF 验证拒绝，诊断复现定位为精确请求 `https://tuf-repo-cdn.sigstore.dev/15.root.json` 缺少本地 issuer CA，分别保存 `pnpm-provenance-first-attempt.json` 与 `pnpm-provenance-diagnosis.json`。恢复仅为该命令显式添加公开系统 CA `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem`，没有关闭 TLS 或改用户全局配置。实际 TUF refresh 使用官方 `https://tuf-repo-cdn.sigstore.dev`；验证后的缓存 metadata 留存：root 15、timestamp 802、snapshot 166、targets 14，root/timestamp 到期分别为 `2026-11-20` / `2026-10-14`，没有以过期 seed 代替本次验证。

恢复通过后，禁网使用本次已验证的 TUF 材料再验也通过。**六项负测均拒绝**：payload 篡改、错误 workflow identity、错误 OIDC issuer、错误版本 subject、移除透明日志材料、registry 签名消息篡改。结果见 `pnpm-provenance-ca-fixed.json`、`pnpm-provenance-offline.json`，验证器/seed/controller 的版本和摘要均记录。npm 官方说明 provenance 将包关联到来源/构建过程，但不保证代码没有恶意内容；本次也没有重跑 pnpm 构建或把它当作整套 DSH/最终 SDK 的发布者证明。[npm provenance 合同](https://docs.npmjs.com/generating-provenance-statements/)

## 17 项不透明内容的有限检查

`audit-opaque.py` 对当前 17 个成员重新计算摘要，与前轮固定公开来源字节证据逐项匹配：**6 个图片、3 个 WOFF2 字体、4 个 Mach-O、4 个 PE**。没有执行或动态加载八个 native 文件。

- 六个 PNG/GIF 在本机已安装 Pillow 12.2.0 下有界完整解码通过，六份截断输入均拒绝；三份 WOFF2 header 长度/表数量核对，并使用本机 FreeType 2.14.3 读取字体与有限字符均通过。
- Mach-O 用系统 `file/otool/codesign` 留存格式、加载命令、链接库和签名属性。三个文件只有 ad-hoc 签名完整性检查通过，`reflink.darwin-x64.node` 无 code signature 且检查退出 1；这些都没有证明开发者身份。
- 四个 PE 仅检查真实格式、架构、section/header 边界；AuthentiCode、目标平台行为和利用条件没有验证。字体浏览器解析、恶意行为和内存安全也未证明。

**来源字节一致、格式/静态属性检查与完整内容安全是三条不同结论。** 原模式扫描仍是 17 项覆盖缺口，二进制/解析器安全整体仍 `NOT_COMPLETE`，不因图片或字体能解码而清空开放门禁。实际工具输出和每项属性在 `opaque-static-review.json` 及 `opaque-*.log`。

## 仍开放的门禁和后续动作

`remaining-gates.json` 将开放项压为八条精确 owner/scope/下一步记录：上游受影响依赖、管理器嵌入组成、其他包及 DSH/最终 SDK 来源/完整性、撤销治理、native 执行安全、目标资产解析、完整准备/干净主机、最终分发签名。上游仍引用同日[官方升级候选](dsh-g0-sdk-upgrade-candidate-20261008.md)已执行的 **7 个受影响版本 / 29 条公告**；本次没有再查询或降低门槛。本仓可继续补证，不修改既有固定官方版本以伪装上游修复。

下一次管理器嵌入审查应以本次已验证的 `57e7b9b7…` 来源为入口，绑定实际 bundle recipe、完整 resolved build lock 和每个保留嵌入组件；DSH 官方升级另走固定新候选的来源、依赖及兼容路径。最终签名/撤销及发布动作仍未执行；SDK 维护审计不加入每次独立业务插件更新。

## 实际入口、保护与证据摘要

```sh
# 前两条实际使用 sandbox-exec，禁网并拒绝写入 received-r3；退出 2 是范围未关闭。
node scripts/release/sdk-content-audit.mjs --root /abs/received-r3 --closure-sha256 37ce5d66... --output /abs/current-content.json
node scripts/release/sdk-supply-chain.mjs --root /abs/received-r3 --closure-sha256 37ce5d66... --output /abs/current-inventory.json
python3.14 -I -B .context/checks/sdk-trust-remaining-20261008-r1/analyze-composition.py
python3.14 -I -B .context/checks/sdk-trust-remaining-20261008-r1/fetch-provenance.py
NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem node .context/checks/sdk-trust-remaining-20261008-r1/verify-pnpm-provenance.mjs --attempt=ca-fixed
# --offline、opaque、BOM 和最终完整保护复核在禁网 sandbox 中执行。
node .context/checks/sdk-trust-remaining-20261008-r1/verify-pnpm-provenance.mjs --offline
python3.14 -I -B .context/checks/sdk-trust-remaining-20261008-r1/audit-opaque.py
python3.14 -I -B .context/checks/sdk-trust-remaining-20261008-r1/make-composition-bom.py
node .context/checks/sdk-trust-remaining-20261008-r1/validate-composition-bom.mjs
python3.14 -I -B .context/checks/sdk-trust-remaining-20261008-r1/finalize.py
```

Node 实际为固定 `/Users/hutou/homebrew/opt/node@24/bin/node`；Python 为 `/Users/hutou/homebrew/opt/python@3.14/bin/python3.14`，没有修改工具链。`existing-audit-command-results.json` 保留首两条完整绝对命令；其余自有脚本从 `__file__` 推导输入/输出，不读取环境秘密。入口示例中的 `/abs` 与短 SHA 只用于展示，实际命令/输入使用完整值。

最终逐项重算 **30,546 条 SDK 目录/链接/文件记录完全不变**，无额外成员，10 项保护输入（旧 candidate/journal、领域包、pin、审计器等）原字节不变，见 `input-protection.json`。67 项本轮证据逐项摘要见 `evidence-index.json`。

| 文件 | SHA-256 |
|---|---|
| attestation 原始响应 | `45a80d792e8339fbeaf90d3a0be9293c335a2ad2af17ea9a1783eff333c01fa0` |
| 组成 BOM | `cd869603f356afeb0360e95a7e8a9cc020c2346841f6a549ac43a28b2f235ee9` |
| CA 恢复后 provenance | `33c97f2307899155e0ea0d3b2307bcfbc744850e90252c8a9f0e8cf35ada2db7` |
| 禁网 provenance 复验 | `b25c14d04c0c703c7240b12081726f5d1a26de388b628b301e26d91b34b57763` |
| 不透明属性审查 | `a39813d55f156640b8bdf66fef8618985958c8feeb8d53150d28f3b41b2845e2` |
| 本轮摘要 | `963d30bc1d0b04b5e5374f360f0a94760d76f27f0c7fb626e36a056dae0af8fa` |
| 证据索引 | `af980ee844dd47ff629332b935f5ab724d5e39e9b60b234448be674c669328f5` |

**NOT_RUN：新官方候选安装/编译、完整 SDK prepare、native 行为与 PE 签名、真实浏览器/模型/业务 UAT、远端 CI、发布和部署。**
