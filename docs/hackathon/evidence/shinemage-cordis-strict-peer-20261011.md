# CRM/Knowledge 精确 Cordis peer 与严格解析核对（2026-10-11）

本轮沿用主仓 HEAD `5390667cc990fa558b0445aa455b086d325a6c77` 和现有 CRM/Knowledge 正式包，只核对官方 npm 依赖声明与普通严格依赖解析。未改作者仓、插件 peer、DSH pin、封存包、candidate 或 journal。机器记录见[validation JSON](shinemage-cordis-strict-peer-20261011-validation.json)，此前 linked 官方安装/宿主初始化结果保留在[上一层证据](shinemage-crm-knowledge-host-compat-20261011.md)。

## 固定声明与实际输入

| 对象 | 本次官方或封存声明 |
|---|---|
| 官方 `@deepseek-ai/dsh@0.1.7-rc.2` | runtime dependency `@deepseek-ai/cordis: ~4.0.4` |
| 官方 `@deepseek-ai/dsh-tools@0.1.7-rc.2` | peer `@deepseek-ai/cordis: ~4.0.4` |
| CRM 正式包，来源 `5a839fa86de2240cf661a9034c58e0ead2d4b4ef` | peer 精确 `4.0.2`；归档 SHA-256 `0da9f8edd40b17a92377aa4b35d219229c8461b942060a7dd0e12265343500fd` |
| Knowledge 正式包，来源 `94ef29fa6c39d3dc506fbc5ef734f0a7ea9eb2b0` | peer 精确 `4.0.2`；归档 SHA-256 `ed7888204d5cefe7d383632a75319d3427fec9a735863f4e123b8ea17387ef67` |

以上官方声明由本次精确版本的 [DSH registry 元数据](https://registry.npmjs.org/@deepseek-ai%2fdsh/0.1.7-rc.2)和 [dsh-tools registry 元数据](https://registry.npmjs.org/@deepseek-ai%2fdsh-tools/0.1.7-rc.2)取得，不从工作区 `workspace:~` 推断已发布版本。Cordis `4.0.2` 和 `4.0.4` 两份精确元数据也已保存。`4.0.2` 归档仅解包，SHA-512 与 registry integrity 一致，SHA-256 `686ca44fc6e8d217804de9062b716b7c72755dde09c2a433dd07045eea3c6a97`，55,443 字节、32 成员，未执行包代码；没有重编 DSH 或安装新运行时。

## 实际严格解析

Node `24.19.0`，npm `11.17.0`，独占任务目录，每个案例使用自己的根 manifest。命令是 `npm install --package-lock-only --ignore-scripts --strict-peer-deps --strict-ssl=true --no-audit --no-fund`，显式官方 registry、空 user/global npm 配置和任务 cache。它只解析锁，不执行 lifecycle、不生成 node_modules、不启动宿主。

| r2 案例 | npm 实际退出 | 核对的拒绝原因 |
|---|---|---|
| 精确 Cordis `4.0.2` + 固定 dsh-tools | 1，`ERESOLVE` | 实际 Found 为 `4.0.2`，dsh-tools 要求 `~4.0.4` |
| 精确 Cordis `4.0.4` + CRM 正式包 | 1，`ERESOLVE` | 实际 Found 为 `4.0.4`，CRM 要求精确 `4.0.2` |
| 精确 Cordis `4.0.4` + Knowledge 正式包 | 1，`ERESOLVE` | 实际 Found 为 `4.0.4`，Knowledge 要求精确 `4.0.2` |

三次拒绝不是兼容 PASS，而是普通严格安装链存在声明冲突的直接证据：同一个 Cordis 实例不能同时满足精确 `4.0.2` 和 `~4.0.4`。此前 linked/profile resolver 在实际 `4.0.4` 下安装、导入与宿主初始化成功的事实不变，但不能用于证明当前包的严格 file/registry 解析成功；本轮也不推断全部 runtime API 不兼容。

r1 两次 npm 命令退出 1，但 debug 日志有 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`，Found 为 undefined，因此明确判为 `INCONCLUSIVE_TLS_METADATA_MISSING`，不能当 peer 冲突证据。原始日志和错误分类未覆盖。随后 Node 使用 `--use-system-ca` 与既有 `/etc/ssl/cert.pem` 的额外 CA，HTTPS 预检实际 200、TLS authorized；系统信任和全局配置未改，未关闭 TLS，也未使用 force/legacy-peer-deps。

r2 包装脚本整体仍退出 1：declared 的结果判定误扫描同一 cache 里的 r1 历史 TLS 日志。`strict-readback-r2.py` 只读取本次 stderr 指向的 debug 文件、核对摘要、GET 200、实际 Found 和具体 peer owner，exit 0，确认上述三次依赖拒绝。没有为修正日志分类重跑 npm，没有删除或覆盖失败证据。

## 对收尾的影响

当前严格普通包解析记为 `REJECTED`，总体运行兼容仍为此前有限层级的 `PARTIAL`。下一步需要按插件 owner 的合同修订流程校准精确 peer，再从干净固定提交生成新包并验收；不能通过放宽范围、强制安装或修改旧回执关闭。既有交接要求保持精确 `4.0.2`，本轮没有自动改声明。

主仓当前说明已加入这条新证据；更新指南的 shine-brand clone 示例同时同步到本次只读核验的远端产品 HEAD `57ebcf38278068394a4feb42125c30c195fd912a` 和成功 CI，旧产品 SHA 仅保留在历史记录。此前示例对已前移分支会停止，本轮修正文档，不操作分支。

原始目录：`/Users/hutou/.codex/tasks/shinemage-cordis-peer-compat-20261011-56yp2373`。本轮无实际安装、宿主/服务/浏览器、真实模型/CRM/WeKnora/UAT、candidate 事件、SDK 全量查询、commit/push/PR/merge/release/deploy、远端配置或删除。作者九仓及受保护 46 个输入均维持起始字节；产品 PARTIAL、SDK 分发 BLOCKED、release_ready=false，VERSION 0.20.0.0。
