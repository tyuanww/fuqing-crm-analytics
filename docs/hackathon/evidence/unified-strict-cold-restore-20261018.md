# rc1 unified strict cold restore receipt

本回执证明 disposable rc1 candidate 在同一 runtime、同一 session 上完成严格 cold restore。数据只来自 synthetic fixture。结果不改变正式 M2 状态。

## 结论

1. 首次 seed 在 restart 前返回 HTTP `200`，`restored=false`。这表示 session 当时已经在线。
2. owned stop 返回 HTTP `200`。没有使用 `--fresh`。
3. 同一 runtime `runtime-browser-unified-r5` 重启后，首次 seed 返回 HTTP `200` 和 `restored=true`。
4. post restart 的 session list 显示相同 session `agentAvailable=true`、`blank=false`、`asOfSeq=12`。
5. history derived messages 保留 `assistant` 和 `tool`，tool 名为 `competition_board_generate`。
6. 当前结果只证明 synthetic lifecycle。它不证明正式 release gate、真实用户任务或真实业务数据。

## 固定输入

| 项目 | 值 |
| --- | --- |
| candidate | `rc1-unified-owner-20261017-r1` |
| runtime | `runtime-browser-unified-r5` |
| web port | `14327` |
| page HTTP port | `18159` |
| source SHA | `85a92e05880d1b37b6d01491b7713d3cb23bf770` |
| upstream SHA | `1600d8a1e140dcde43a1a0941940a0480712c011` |
| session | `session-115d906d-8104-48b5-9d8f-e4ad20a3ae78` |
| workspace | `b81f3891-5b9c-49ce-a77a-d4c0efc2fecf` |
| history fixture SHA | `a01f0eb85590699c70fb6bb5b0b70b138f0ca4f2aae1fe29511d40776c6f6b6c` |
| resume patch SHA | `6578f4bc6599e3f0149bc0ffa96deedb0b319ed1f94d61ef282a17b13378311` |
| history content SHA | `7489f35e529a0fd117378419c46d1014c2717434b259f4c02f92b28bc5d719bf` |

## Process evidence

| 阶段 | supervisor | child | 结果 |
| --- | ---: | ---: | --- |
| restart 前 | `1174612` | `1174936` | seed `200`, `restored=false` |
| restart 后 | `1175791` | `1176029` | first seed `200`, `restored=true` |

raw evidence 文件见 [unified-strict-cold-20261018](unified-strict-cold-20261018/)。原始 `ps` 文件也包含未修改的 live 4328/4329 行。所有 ownership 和 restart 判断只使用本候选 PID：`1174612`、`1174936`、`1175791`、`1176029`。

- `post-seed.json` 保存首次 post restart fixture 输出。
- `post-session-list.json` 保存 session list 输出。
- `pre-process.txt` 和 `post-process.txt` 保存 owned process 输入。

## 清理

owned web `14327` 和 page HTTP `18159` 已停止。杭州现役 `4328` 和旧 candidate `4329` 保持运行，没有被本轮操作触碰。

## 正式状态

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```
