# rc1 unified history/board restart recovery

本回执覆盖统一 rc1 owner candidate `rc1-unified-owner-20261017-r1`。它只记录个人 owner-operated 目标复验，不改变主仓 rc2 pin，也不切换杭州公网。

## 结论

- 同一 runtime `/tmp/shinemage-owner-rc1-unified-20261017-r1/runtime-browser-unified-r2` 已由本次 runner 停止并重新启动。
- web 端口保持 `14327`，page HTTP 保持 `18152`。live `4328` 和旧 candidate `4329` 未触碰。
- 同一 board `rc1_unified_board` 在重启后列表、详情、preview、confirm 均为 HTTP `200`。
- 同一 history session 可通过官方 `session/list` 和 `session/follow` 读回。
- candidate fixture 注入口在重启后返回 `404 session missing`。
- 新 headed browser 页面出现稳定的 session restore 失败：`tool "subagent" is already registered`。
- 因此本回执是部分结果，不是 headed browser recovery PASS。

## 绑定输入

| 项目 | 值 |
| --- | --- |
| source SHA | `85a92e05880d1b37b6d01491b7713d3cb23bf770` |
| upstream SHA | `1600d8a1e140dcde43a1a0941940a0480712c011` |
| runtime | `runtime-browser-unified-r2` |
| history session | `session-2360bbc7-fb0b-4c93-9e5e-92792306e1c5` |
| history content SHA | `7489f35e529a0fd117378419c46d1014c2717434b259f4c02f92b28bc5d719bf` |
| board record SHA | `ef28de86f9e6ae27fb1a20b8659d8f1c3b6a4687a4dcbf253b927234dc6676ac` |

## 重启前后

| 项目 | 重启前 | 重启后 |
| --- | ---: | ---: |
| supervisor PID | `1131698` | `1135009` |
| child PID | `1131973` | `1135265` |
| web | `14327` | `14327` |
| page HTTP | `18152` | `18152` |
| board fixture | `18155` | `18155` |

重启后 native history follow 返回相同标题、相同 session ID 和完整记录。session log 的压缩文件 SHA 为 `7f1af98b22910989b776360efedaef6813a678948d7d1140f2cf228c9300ed0b`。

## 失败边界

`session/list` 证明持久 session 存在，`session/follow` 证明 session log 可读。它们不能替代 headed browser 的用户可见 history 回读。fixture 依赖候选进程内存中的 `ctx.sessions`，重启后没有重新绑定恢复 session，因此返回 `404 session missing`。页面还连续报告 `tool "subagent" is already registered`，导致 workspace restore 失败。

board 的 native HTTP 读回通过，但没有把它写成 headed canvas PASS。

## 正式状态

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```

完整机器回执：`unified-history-board-recovery-20261017.json`。
