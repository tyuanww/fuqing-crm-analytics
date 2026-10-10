# T15：SDK 包清单、漏洞查询与来源核对（2026-10-07）

> 本页保留实施阶段证据；后续已完成提交前审修并随同一批本地提交收录。当前结果、修复候选与剩余任务以[本批审修记录](dsh-g0-kit-sdk-supply-review-20261007.md)为准，以下“未提交/没有新 commit”为当时状态。

从 `codex/plugin-boundary-review@d9770b9c` 延续上一批未提交的缩减 SDK 归档工作。本轮完成检查入口和实际盘查，**SDK 分发审查 BLOCKED，产品仍 PARTIAL / release_ready=false**。没有改上游/pin/锁/SDK，没有新 commit、push、发布、杭州操作或真实数据访问。

## 输入和实现

- 只读目标：`.context/checks/kit-sdk-compact-transport-20261007/received-r2/`。
- closure：`7fa86cc9cc190f64735378e5a5bc2b1b74aece33aaa0f2b6b816c91492bcfdc6`；来源完整归档 `9ceeb884c014fa374a65c593b0e402396b9d06c509aceeed44f42b32b38056d5`，上游 `477b4f420553e8a52c2fbccc464d7561b239c443`。
- 新增 `scripts/release/sdk-supply-chain.mjs`：先验证固定 closure、平台、所有文件/链接与锁，再读取带摘要的 package.json；输出独立 inventory 和 CycloneDX 1.6 `bom`。默认不联网；显式 `--osv` 才向固定 OSV endpoint 发送去重名称/版本，排除 workspace/private:true 声明，不读取 npm 凭据配置。
- 一次 50 个查询，逐结果跟进分页；20 秒请求超时、4 MiB 响应/32 MiB 总量、10 页/80 请求上限。HTTP/TLS/超时/格式/分页失败为 UNKNOWN，保留已有响应和部分命中，不能转为无公告。报告拒绝 SDK 内路径/别名和已有文件，错误不打印原始异常。
- `package.json` 摘要只标识清单；许可证是自述，不能当作整包许可证审定。SBOM 标记 `incomplete`，不捏造依赖边或包内被合并的组件；不会给生产 receiver/journal 写放行记录。
- 新增 synthetic 测试已进入 B0 清单，release suite 自动发现。真实网络审计不会加入每次业务插件 build/test。

## 本轮实测

证据目录：`.context/checks/kit-sdk-supply-chain-20261007/`。下列结果均为本轮实际运行，不复用上轮测试数。

| 验证 | 结果与证据 |
|---|---|
| 新检查/内容审计/closure/边界/clean-build | **50 PASS / 0 SKIP**，`targeted-tests-r2.log` |
| 最终代码，网络禁止沙箱内离线 inventory | **PARTIAL / advisories NOT_RUN，退出 2**；`inventory-offline-r4.json/.log`。360 个包实例、33 份 module-scope 声明、1 份无版本私有构建清单 |
| 最终代码，实际 OSV 查询 | **BLOCKED / ADVISORIES_FOUND，退出 2**；`inventory-osv-r4.json/.log`，222 个不同名称/版本、5 次 batch 请求 |
| CycloneDX 官方 1.6 schema | 正例通过、错误 bomFormat 负例拒绝；`cyclonedx-validation.json`。使用现有固定 SDK 的 ajv，校验结构，`format` 校验未开启；r4 的组件与已验 r3 相同 |
| 公告详情与修复候选 | 拉取 42 份 OSV 公告原文并保存摘要/路径/评级/受影响范围；`advisory-triage-r1.json`、`GHSA-*.json`。9 个建议修复版本另查 OSV 无命中，`remediation-advisories.json`；未安装、未声明兼容通过 |
| 不透明内容来源 | 17/17 字节匹配，`opaque-provenance-r1.json`；14 项对应 5 个精确 npm tarball，3 项字体对应固定上游源码。没有执行下载依赖或解包到 SDK |
| npm tarball SRI / 签名 | 5/5 摘要匹配 pin/锁/Corepack 记录；5/5 密码学验签通过，5/5 篡改消息拒绝。4 包当前密钥被观察到，1 包密钥已过期需审查；`registry-r3/registry-verification-r4.json` |
| 输入与状态保护 | r4 两次检查复核同一 closure 内容；candidate/journal 摘要保持，代码摘要与回执一致，42 公告集合与详情一致；`final-binding.json` |

定向测试命令：

```sh
/Users/hutou/homebrew/opt/node@24/bin/node --test \
  scripts/release/sdk-supply-chain.test.mjs scripts/release/sdk-content-audit.test.mjs \
  scripts/release/sdk-closure.test.mjs scripts/release/plugin-boundary.test.mjs \
  scripts/dsh-b0/clean-build.test.mjs
```

实际命令模式（从仓库根目录执行；只允许全新 output，已有证据禁止覆盖）：

```sh
sandbox-exec -p '(version 1)(allow default)(deny network*)' \
  /Users/hutou/homebrew/opt/node@24/bin/node scripts/release/sdk-supply-chain.mjs \
  --root "$PWD/.context/checks/kit-sdk-compact-transport-20261007/received-r2" \
  --closure-sha256 7fa86cc9cc190f64735378e5a5bc2b1b74aece33aaa0f2b6b816c91492bcfdc6 \
  --output /absolute/new-evidence/inventory.json

NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem \
  /Users/hutou/homebrew/opt/node@24/bin/node scripts/release/sdk-supply-chain.mjs \
  --root "$PWD/.context/checks/kit-sdk-compact-transport-20261007/received-r2" \
  --closure-sha256 7fa86cc9cc190f64735378e5a5bc2b1b74aece33aaa0f2b6b816c91492bcfdc6 \
  --output /absolute/new-evidence/advisories.json --osv
```

实际环境 Node 24.19.0 / Python 3.14.4。最初 Node 默认信任及 `--use-system-ca` 都出现 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`；curl 同地址可达，显式系统公共 CA 后通过。`inventory-osv-r1` 保留 UNKNOWN，不关闭 TLS 或覆盖旧失败；最终入口给出稳定 `SDK_SUPPLY_OSV_TLS_TRUST`。

## 发现的依赖问题与下一顺序

OSV 实查命中 **10 个版本、42 条不同公告**。按公告评级去重为 1 CRITICAL、22 HIGH、13 MODERATE、6 LOW；这是依赖版本筛查，**不等于 42 个已复现攻击路径，也不是杭州生产运行时的清单或漏洞验收**。

| Owner | 当前版本 | 公告建议修复候选，尚未安装/验兼容 |
|---|---|---|
| pnpm / SDK 工具链 | pnpm 11.7.0 | 11.11.0 |
| pnpm 自带文件 | tar 7.5.16、undici 6.26.0 | tar 7.5.21、undici 6.28.1；须随完整 pnpm 候选核验，不能现场替换其内部文件 |
| 固定 DSH 上游 | fast-uri 3.1.3 | 3.1.8 |
| 固定 DSH 上游 | js-yaml 4.2.0 / 4.3.1 | 4.3.2 |
| 固定 DSH 上游 | katex 0.16.47 | 0.18.2；跨 minor，不能假定现有插件/宿主兼容 |
| 固定 DSH 上游 | source-map-js 1.2.1 | 1.2.2 |
| 固定 DSH 上游 | undici 7.28.0 / 8.10.0 | 分别 7.29.1 / 8.10.2 |

这 9 个候选名称/版本的单独 OSV 查询无已知公告；它不能证明升级后的完整传递依赖闭包、安全性或兼容性。`upstream-lock-parents.json` 已记录固定上游锁内的直接父依赖，例如 fast-uri ← ajv、js-yaml ← app-boot/CLI/config-editor、undici ← jsdom/http-proxy/web-fetch-http。锁关系也不等于当前插件真实执行可达性。

实际公告包括 [pnpm 虚拟存储路径穿越](https://github.com/advisories/GHSA-c59q-g84q-2gj5)、[pnpm 环境变量经代理设置外泄](https://github.com/advisories/GHSA-vx52-2968-3vc6)、[tar 无界解析/解压拒绝服务](https://github.com/advisories/GHSA-23hp-3jrh-7fpw) 和 [KaTeX trust 绕过条件](https://github.com/advisories/GHSA-238p-pmpm-9mq7)。本轮没有运行攻击载荷或接触生产数据。

按归属收口：先以完整 pnpm 工具候选和官方 DSH 升级差异处理上述依赖，重新冻结版本/锁/闭包并验证 10 个消费者；保留 rc2 与旧 SDK 可用。不能在 `477b4f42` 固定上游里偷换依赖后继续使用旧摘要或宣称同一原生版本。随后处理签名/完整内容与目标平台验证，再进入物理分仓 stop/go。业务插件开发不承担每次重新审计整套 SDK 的成本。

## 来源核对的边界与失败保留

- 原 17 文件：6 图片、8 原生文件、3 字体。前 14 项匹配固定 npm tarball 的精确成员，tar 仅限额解压并读取成员，不落地解包、不执行程序；3 字体匹配上游 commit 的 `src/styles` Git 对象，已核对源码与 `lib` 字节。
- npm 的 SRI 和签名按照[官方签名合同](https://docs.npmjs.com/about-registry-signatures/)验证名称/版本/integrity；公共 key 通过 TLS 获取并记录摘要。`rc-tree-select@5.27.0` 使用过期密钥，**密码学正确不代表当前信任通过**。发布者身份、历史签名时间和撤销尚未验证，不能将 Registry 签名等同 GitHub Release attestation。
- 第一轮辅助脚本误把 npm keyid 当成 DER 摘要；核对后改为 SSH wire-format 指纹，与两个官方 keyid 均吻合。原 `verify-registry.log` 和脚本保留；第二轮在过期 key 拒绝后保留失败；第三轮完成五包下载后，在 GitHub 字体获取时 ECONNRESET。最终 r4 从已保存的同一 tarball/metadata 重新验摘要和签名，不重复下载或覆盖它们。独立 GitHub 字体下载仍失败，未记 PASS。
- 字体 `Montserrat-OFL.txt` 明确 **SIL OFL 1.1**，已存内容和 SHA。不能把 ui-theme 的 MIT 自述套用于字体。其余包 license 仍是声明，未做完整许可证或二进制安全审定。
- SBOM 的 33 份匿名清单均是 module/commonjs 作用域配置，不另造包名；剩余 1 份是本地私有 `build-tools/package.json` 无 version，保留缺项。包内无清单的组件、完整依赖边和 17 项内容安全仍未关闭。

最终在线报告 SHA：`275ac39af4eaa2cc4dc7d1c351244ee470aa990ebe942448f595eed47d64cb31`；离线报告 SHA：`41d44f58d050ff0cf9716c758baccc8b67e4aa0025f84e3e66250aa8ad9108e0`；17 文件来源报告 SHA：`ec3a77a315e25c935bbcbf8c6776f2ab7e0ccf560dd24a6f125a47322bef63d0`。

完整 pipeline、依赖升级/重新构建、WSL 新 SDK、真实浏览器/模型/业务 UAT、远端 CI 和生产激活/回退本轮均 **NOT_RUN**。不以清单生成、来源匹配或单元测试数替代这些门禁。
