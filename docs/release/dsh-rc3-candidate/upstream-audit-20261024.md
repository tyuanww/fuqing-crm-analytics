# DSH rc3 上游盘查与本地候选记录

日期：2026-10-24

## 结论

本地主仓的活动候选已统一到 DSH `0.2.1-rc.3` 和 Cordis `4.0.5`。官方上游 tag、commit、lockfile 摘要和 npm peer 合同均已固定；rc3 上游干净 checkout 已完成依赖安装与 host/client 构建，plugin-kit 输入预检为 `READY`。

这只是本地候选输入。杭州 `current` 仍为 DSH `0.2.1-rc.1` side-load；本轮没有推送、合并、部署或改写线上 marker，`release_ready=false` 继续有效。

## 固定输入

| 项目 | 值 |
| --- | --- |
| 上游仓库 | `https://github.com/deepseek-ai/deepseek-harness.git` |
| 上游 tag | `dsh-v0.2.1-rc.3` |
| 上游 commit | `1f81c047fc48fa190a683e469daa699857e9afe8` |
| 上游 `pnpm-lock.yaml` SHA-256 | `911b049924e8256d8d6e684235cf935ca75b28fd0dd46f0c3b316a51c2cf5dc1` |
| 上游 pnpm | `11.28.5` |
| 插件 pnpm | `11.28.2` |
| Node | `v24.19.0` / Node major 24 |
| TypeScript | `6.0.3` |
| esbuild | `0.25.12` |
| React | `18.3.1` |
| Cordis | `4.0.5` |

`@deepseek-ai/dsh@0.2.1-rc.3`、`@deepseek-ai/dsh-tools@0.2.1-rc.3` 均已在 npm 可解析；rc3 的 peer 合同要求 Cordis `~4.0.5`。Cordis 最新稳定版盘查为 `4.0.5`，与该合同一致。

## rc2 → rc3 兼容性盘查

官方差异包含导航入口定制、导航 pin 独立、导航/预设分析事件和官方 `/models` 列表修复。主仓插件依赖的 Host/Client 注入入口仍存在；Workbench、CRM、Knowledge 的业务工具合同没有直接依赖新增导航 API。本候选仍需在作者 CI 和真实 DSH 宿主中分别验证，不把“入口仍存在”当作完整兼容通过。

## 已更新范围

- 主仓 `dsh-plugins/*/package.json` 的 DSH peer，以及 CRM/Knowledge 的 Cordis peer。
- `dsh-plugins/plugin-kit/toolchain.json`、rc3 release lane、page/CRM rc3 profiles、组合 manifest/lock、IM runtime contract。
- 默认 profile、组合输入、profile preparation、release toolchain 和 lane 校验器。
- Workbench rc3 lock；三份作者仓的 peer、lock、plugin-kit tarball 和 `KIT-SHA256`。
- 当前 README、STATUS、CHANGELOG、作者 quickstart 和 WSL 模板。

rc1/rc2 文件名明确的历史证据保持原样，不把历史回执改写成 rc3 结果。

## 当前仍未关闭

- 新 rc3 插件 pack、组合 artifact、远端 CI 和 PR 尚未推送/合并。
- 杭州现役仍为 rc1，尚未执行旁路接收、启动、浏览器回归、回退和 canary。
- M2-07/M2-08/M2-09 与公司级发布身份、签名、独立核验和最终 attestation 仍未完成。
