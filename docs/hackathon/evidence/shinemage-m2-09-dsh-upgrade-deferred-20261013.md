# M2-09 DSH 升级候选延后复核（2026-10-13）

本轮只核对当前 DSH pin 与运行现场，不创建升级 candidate、不安装新版本、不修改上游源码、不修改锁文件、不切换 live/current。

## 当前基线

本地 `dsh-plugins/plugin-kit/toolchain.json` 实际读取为：

```json
{
  "sdk_version": "0.1.7-rc.2",
  "upstream_sha": "477b4f420553e8a52c2fbccc464d7561b239c443"
}
```

该文件 SHA-256 为：

```text
8f1eaf0b2b7ea1392cd45674bfbdd7498b2df6bb642db63f75d002df776511fe
```

`git diff -- dsh-plugins/plugin-kit/toolchain.json` 为空。固定 pin 没有被本轮改写。

杭州目标只读现场核对：

```text
current=/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3
candidate-runtime-present
upstream-dirs=upstream-0.1.7-rc.2-477b4f42
```

candidate 与 live 均继续使用 rc2 上游；没有发现新的隔离升级 runtime。历史盘查中的公开研究候选仍不能直接替换当前 pin，因为插件 peer、profile、lock、SDK closure、浏览器、恢复和真实业务兼容矩阵尚未重跑。

## 结论

M2-09 保持 `DEFERRED`。后续只有在取得新的官方 DSH 版本/commit、准备隔离 runtime、完成新旧兼容矩阵与恢复矩阵，并取得切换授权后，才能生成独立升级 candidate；升级不混入当前九包发布 candidate。当前没有代码、配置、上游或运行时切换。
