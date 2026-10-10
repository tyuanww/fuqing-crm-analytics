# DSH 官方升级兼容性盘查（只读）

- 观察时间：2026-10-10T22:00:00+08:00
- 当前基线：DSH `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，锁 SHA-256 `5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa`。
- 证据：`STATUS.md`、`dsh-plugins/plugin-kit/toolchain.json`、`docs/hackathon/evidence/dsh-g0-sdk-upgrade-candidate-20261008.md`。
- 范围：公开 GitHub Releases/API 与 npm registry 只读查询；未安装、未启动、未修改主仓或 DSH 上游。

## 公开候选与身份

|候选|commit|发布时间|发布身份|Git commit 签名|
|---|---|---|---|---|
|`0.2.1-alpha.2`|`d743267388641bc76f17c45ce8b4c231aed1d32c`|2026-10-09T11:09:26Z|07akioni|verified=False (unsigned)|
|`0.2.1-alpha.1`|`5badb15009ae1756c3afe0ae0cef1faafc290ccc`|2026-10-03T06:42:19Z|tianyicui|verified=False (unsigned)|
|`0.2.0-rc.2`|`639ed015397290b3745d163aafe02ffee4aa3f84`|2026-09-29T09:42:36Z|imccyu|verified=False (unsigned)|

GitHub 当前最新公开 prerelease 是 `0.2.1-alpha.2`（2026-10-09）。npm `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-tools` 均有 `0.2.1-alpha.2`；两者 `alpha` 指向该版本，`latest/next` 为 `0.2.0-rc.2`。npm maintainer 为 `imccyu`、`tianyicui-deepseek`，包带 npm integrity/signatures；这不等于 Git 作者或构建来源证明。

## 与 0.1.7-rc.2 的差异

**from_baseline_to_0.2.0-rc.2**
- minor release line; prior static scan SUPPORTED only
- not drop-in: profile pin, exact plugin peers, lock and SDK closure remain 0.1.7-rc.2
- existing evidence reports no runtime host/session/WAL/browser acceptance
**from_baseline_to_0.2.1-alpha.1**
- breaking: remove runtime invariant plugins and ./invariant exports
- composer stats split from stats row into activity and usage
- subpath plugin display manifest behavior changed
- cordis/bindings and lock versions require fresh SDK closure
**from_baseline_to_0.2.1-alpha.2**
- adds experimental session state-record APIs, working_directory tool and SDK APIs
- changes Agent Team delivery (direct Inbox; outbox/retry/dedupe removed)
- Python PTC requires session filesystem sandbox services
- removes mixed tool-presentation mode; custom configs need migration
- updates runtime/MCP/image/client dependencies; still prerelease and unsigned Git commits
**from_prior_20261008_evidence**
- new public candidate 0.2.1-alpha.2 published 2026-10-09; prior report stopped at alpha.1
- alpha npm dist-tags now alpha=0.2.1-alpha.2; latest/next remain 0.2.0-rc.2
- prior report author/build identity conditions remain open; npm signatures are package integrity signatures, not author attestation

## 插件兼容矩阵

|插件|DSH tools peer|Cordis peer|结论|
|---|---|---|---|
|`@shine-mage/dsh-analytics-workbench-b0` (0.0.0-b0)|`0.1.7-rc.2`|`—`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/board-components` (0.1.0)|`—`|`—`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/dsh-crm-knowledge` (0.0.0-crm.1)|`0.1.7-rc.2`|`4.0.2`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/dsh-knowledge` (0.0.0-candidate.1)|`0.1.7-rc.2`|`4.0.2`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/dsh-plugin-kit` (0.1.0)|`—`|`—`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/dsh-shine-board` (0.0.0-b0)|`0.1.7-rc.2`|`—`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/dsh-shine-brand` (0.0.0-b0)|`0.1.7-rc.2`|`—`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/dsh-shine-crowd-action` (0.0.0-b0)|`0.1.7-rc.2`|`—`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/dsh-shine-funnel` (0.0.0-b0)|`0.1.7-rc.2`|`—`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/dsh-shine-query` (0.0.0-b0)|`0.1.7-rc.2`|`—`|BLOCKED until candidate SDK/build/host tests|
|`@shine-mage/dsh-shine-waterfall` (0.0.0-b0)|`0.1.7-rc.2`|`—`|BLOCKED until candidate SDK/build/host tests|

## 检查矩阵

|检查|结果|
|---|---|
|static_source_and_lock|NOT_RUN for alpha.2; only prior alpha.1 static matrix exists|
|plugin_peer_range|FAIL/blocked: all 9 peer declarations pin 0.1.7-rc.2; crm/knowledge also cordis 4.0.2|
|profile_pin|EXPECTED_FAIL if alpha.2 substituted: existing validator enforces exact DSH pin|
|sdk_bindings|NOT_RUN for alpha.2; prior alpha.1 covered 26/26 paths but semantics not proven|
|slots_lifecycle|NOT_RUN for alpha.2; prior evidence had 12 slot names static only|
|build_install|NOT_RUN; no registry install, no floating latest, no candidate checkout|
|host_browser_session_wal|NOT_RUN|
|supply_chain_identity|OPEN: alpha.2 commit GitHub API says unsigned; npm package signatures present, author/build provenance not closed|

## 缺失输入与结论

- fixed full commit and original lock digest recorded for alpha.2 (lock was not downloaded into this read-only audit)
- fresh owned candidate workspace with Node24/Corepack and candidate-specific SDK/build-tools
- candidate SDK closure plus npm/source manifest and provenance/signature evidence
- updated plugin peer declarations or documented compatibility ranges for all 9 plugins
- compiled consumer results for 26 bindings and generated types/contracts
- runtime checks for slots, lifecycle, cancellation/timeouts, session/WAL recovery, plugin unload and profile loading
- browser/host/WSL target evidence and manual/UAT authorization
- security/OSV scan against complete candidate lock; release/activation authorization

**结论：** `0.2.1-alpha.2` 是最新公开候选，只能作为隔离研究输入。继续保持 `0.1.7-rc.2`，不改 pin、不安装、不激活；待缺失输入和门禁完成后再另行评审。

原始公开响应快照已在本次只读盘查的临时目录保留；本文件记录其摘要，不把临时路径作为仓库入口。
