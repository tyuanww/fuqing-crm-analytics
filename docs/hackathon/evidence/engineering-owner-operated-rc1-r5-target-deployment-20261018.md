# rc1 owner-operated r5 杭州旁路回执（2026-10-18）

这份回执记录个人 owner-operated candidate。它不是正式发布，也没有切换杭州 `current` 或公网入口。

## 结果

- 目标：`root@100.93.46.46`，Linux x86_64 / WSL2。
- candidate：DeepSeek Harness `0.2.1-rc.1`，upstream `1600d8a1e140dcde43a1a0941940a0480712c011`。
- 使用既有 r4 owner bundle。bundle SHA-256 为 `bcd6345bd4e0e5c306f2a60fedd7e8a058b902f15636234d9a186dd34977e6f5`。
- source bundle SHA-256 为 `4c2fc183e7e60fc492c13b47cce98c7d9aa2e8885cd25259da1a293011de1789`。
- runtime bundle SHA-256 为 `8a7fb15404bcb8a63824df9a43c1bf75e0bc45e002d3406349607ee202bd28df`。
- candidate web 为 `127.0.0.1:14327`。
- page HTTP 为 `127.0.0.1:18151`。
- 目标 Node 为 `v24.21.0`。
- 目标 Python 为 `3.14.4`。
- 未认证 web GET 返回 `401`。
- page HTTP 根路径返回 `404`，监听正常。

## stop/start 与 headed browser

1. 只停止候选 supervisor `1217270`。候选端口释放后重新执行同一 `candidate-command.sh`。
2. 新 supervisor 为 `1219373`。新 web PID 为 `1219611`。新 page HTTP PID 为 `1219609`。
3. `14327` 和 `18151` 在重启后重新监听。`4328`、`4329` 和 `18150` 仍在监听。
4. Chrome headed browser 通过 SSH loopback tunnel 打开候选入口。
5. 页面可见 `workspace`、`插件`、`驾驶舱`、`数据员工` 和 `未登录`。
6. 插件页显示 6 个已安装并启用的 Shine Mage 插件。
7. 驾驶舱页显示 `项目驾驶舱`、`历史交付 · 文件 · 预览与编辑`，当前候选 workspace 没有历史产物。
8. 当前 tab 的控制台错误数为 `0`。未配置 DeepSeek 账号或 API Key，因此没有模型调用。
9. 本轮使用 gstack `1.91.125.0` 的 `land-and-deploy` 工作流，按 solo owner-operated 模式执行旁路部署。

实验性 upstream 插件仍在 UI 中显示 `locale/._en.json` 元数据警告。该警告来自候选 runtime 的实验性插件，不是本轮部署生成的 Shine Mage pack；本轮没有修改 DSH upstream，也没有把它写成正式 release PASS。

## 边界

- 本轮完成的是杭州 WSL owner-operated side-by-side 部署和 UI shell 回读。
- rc2 web rollback 的 synthetic history/board 回读已经在独立 disposable 回执中完成；本轮杭州 r5 没有伪造 target history/board fixture，因此 `history_board_fixture=NOT_RUN_ON_TARGET_CANDIDATE`。
- 没有重启 systemd。
- 没有修改 `/srv/shinemage/dsh/current`。
- 没有切换 `4328`、Cloudflare 或 `app.tyuan.chat`。
- 没有读取真实业务数据，没有使用真实凭据，没有执行模型调用。

## 正式状态

```text
M2-07=BLOCKED
M2-08=NOT_RUN
M2-09=NOT_RUN
release_ready=false
```

机器可读回执见 [r5 JSON](engineering-owner-operated-rc1-r5-target-deployment-20261018.json)。
