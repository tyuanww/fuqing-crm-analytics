# rc1 unified synthetic history and board readback receipt

本回执记录统一 rc1 owner candidate 的 synthetic readback 复验。数据只来自 synthetic fixture。它不改变主仓 rc2 pin，也不关闭正式 M2 门禁。

## 结论

- history fixture 已改用 `ctx.sessionController.agents.resolveAgent(sessionId)`。
- 该调用通过官方 SessionController 解析持久 Agent 和 persistence writer。
- 同一 `runtime-browser-unified-r5` 已完成 owned stop/start。
- native history seed 在重启后返回 HTTP `200`。
- board list、detail、preview 和 confirm 在重启后都返回 HTTP `200`。
- headed browser 真实显示 history HTML、board tool card 和 preview action。该结果只覆盖 synthetic UI readback。
- headed browser console error 数为 `0`。
- 严格 cold fixture rehydrate 仍为 `HOST_AUTO_RESUMED`。重启后 fixture 返回 `restored=false`，因为 workspace-attached session 已先由 headed browser 恢复。

## 修复输入

| 项目 | 值 |
| --- | --- |
| candidate | `rc1-unified-owner-20261017-r1` |
| source SHA | `85a92e05880d1b37b6d01491b7713d3cb23bf770` |
| upstream SHA | `1600d8a1e140dcde43a1a0941940a0480712c011` |
| runtime | `runtime-browser-unified-r5` |
| history session | `session-57b79737-3cfe-4978-b696-1a6179322469` |
| workspace | `ef4c1f00-25b5-47dc-be91-4da51791d357` |
| history module SHA | `a01f0eb85590699c70fb6bb5b0b70b138f0ca4f2aae1fe29511d40776c6f6b6c` |
| resume patch SHA | `6578f4bc6599e3f0149bc0ffa96deedb0b319ed1f94d61ef282a17b13378311` |
| history content SHA | `7489f35e529a0fd117378419c46d1014c2717434b259f4c02f92b28bc5d719bf` |
| board record SHA | `ef28de86f9e6ae27fb1a20b8659d8f1c3b6a4687a4dcbf253b927234dc6676ac` |

修复后的 fixture 源码见 [unified-history-fixture-resume-20261018.mjs](unified-history-fixture-resume-20261018.mjs)。补丁见 [unified-history-resume-only-patch-20261018.json](unified-history-resume-only-patch-20261018.json)。

## 重启与回读

第一轮 headed evidence 使用了同一 runtime 的 owned stop/start。supervisor PID 从 `1154955` 变为 `1159680`。child PID 从 `1155351` 变为 `1159936`。没有使用 `--fresh`。

第二轮额外 cold cycle 使用同一 runtime。supervisor PID 从 `1159680` 变为 `1160619`。child PID 从 `1159936` 变为 `1160945`。该轮的 fixture 仍返回 `restored=false`。原始进程回执见 [pre process](unified-r5-session57-cold-pre-process-20261018.json)、[post process](unified-r5-session57-cold-post-process-20261018.json) 和 [post response](unified-r5-session57-cold-post-20261018.json)。

第二轮没有把新的 headed 截图冒充为 cold proof。headed evidence 来自第一轮重启后的 session57 回读。

## headed browser 证据

[headed browser 回执](unified-headed-history-board-readback-session57-20261018.json) 的 SHA-256 是 `ae7ec8cb74e8eed53f8fe9c731d4c79eb5561368bb2683fb3b3688b07fb7c0a5`。截图见 [unified-headed-history-board-readback-session57-20261018.png](unified-headed-history-board-readback-session57-20261018.png)，SHA-256 是 `328ae77caf12ec01ce7b6f7d77a7ef1cf3450c7c66ee61d24f055e101efe2b1f`。

回执确认以下可见结果。

- history title 为 `rc1 unified history reread · synthetic · session57`。
- history HTML `rc1-unified-history.html` 可见。
- board title `rc1 unified synthetic restart board` 可见。
- `打开预览，检查后确认` 可见。
- console error 数为 `0`。
- fixture 标记为 synthetic，未调用模型，也未包含真实业务数据。

## subagent 重复注册根因

诊断回执见 [subagent duplicate diagnostic](subagent-duplicate-diagnostic-20261018.json)。该诊断在 workaround 前采集。它发现 `tool-subagent` 和 `tool-subagent-fork` 各有 4 个配置行。重复来源是 standard、cordis、ptc preset 的 delegation 配置。active profile 只链接到一个 pack 根。历史 pack 目录不在 active profile links 中。该诊断没有独立证明 loader 不扫描这些目录。

候选 runtime 在 standard、cordis、ptc 的四个重复工具条目上设置 `disabled: true`。这是 disposable candidate-only workaround。诊断 JSON 的行状态记录的是修改前状态。它没有修改 DSH upstream。preset 文件的修复后 SHA 如下。

| preset | SHA-256 |
| --- | --- |
| standard | `f23b25db87a9cc99fabb0485fbfc28e04802ca47e67d5ca4b5145e0415f1e99b` |
| cordis | `3e709fa367769836a47e09307536bb052c09ac64cbb8baa6ee8e983efdad99cd` |
| ptc | `901a0af127276dc41059e22c010f675dfc235260f082c60d59eea02998c73ac5` |

旧 r2 失败回执 [unified-history-board-recovery-20261017.json](unified-history-board-recovery-20261017.json) 保留。它记录了 fixture `404 session missing` 和重复注册错误。新回执不删除旧失败证据。

## 清理回执

本轮拥有的 web `14327` 和 board `18158`、`18156` 已停止。杭州现役 `4328` 和旧 candidate `4329` 仍在运行。实际端口回读见 [owned cleanup](unified-owned-cleanup-20261018.txt)。

## 状态边界

这次结果重新验证了统一候选的 headed synthetic history/board readback。它没有证明严格 cold fixture 返回 `restored=true`。它没有证明真实用户任务、真实业务数据、公司发布门禁或正式 Linux portable rebuild。

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```
