# 当前正式插件包 CI 收口（2026-10-12）

本页记录三个独立作者仓在新增正式打包入口后的真实 Ubuntu PR CI。三份产物都是 `dsh-plugin-pack/v1`，来源 SHA、manifest 摘要和 tarball 摘要均已下载后用主仓 `scripts/release/plugin-pack.mjs` 的 `readPluginPack` 复核。普通 content pack 与正式 plugin pack 分开记账；本页不生成 candidate、journal，也不代表宿主、目标平台、真实业务或发布通过。

| 作者仓 | 提交 | CI run | formal artifact | source SHA | tarball SHA-256 |
|---|---|---:|---|---|---|
| `tyuanww/dsh-analytics-workbench` | `3030e3f21263f6ec65cb01c7aeacd4c80e2eb711` | `38204944592` | `workbench-formal-pack-38204944592-1` | `3030e3f21263f6ec65cb01c7aeacd4c80e2eb711` | `b75a5c900b94b333a2749a8b35d5ea106f5aea158667a6e338baa240b886b088` |
| `tyuanww/dsh-crm-knowledge` | `dac0539bbbe076f62ae592c35e74efcca987e568` | `38204944092` | `crm-knowledge-formal-pack-38204944092-1` | `dac0539bbbe076f62ae592c35e74efcca987e568` | `89e6f69cd9806b2b1b623e3060ff65942268fe848f7020a65964177f92af2136` |
| `tyuanww/dsh-knowledge` | `f623c220fde8d511b694e7c4271e092cd3d4692b` | `38205510926` | `knowledge-formal-pack-38205510926-1` | `f623c220fde8d511b694e7c4271e092cd3d4692b` | `73641493765950fd3d04fa20df448951e9beb3909236600858cae2544c8602c7` |

三个 CI 均通过完整固定输入链，formal pack 步骤和独立 artifact 上传均为 SUCCESS。Workbench 的完整作者测试回执为 155 files、1086 PASS、0 FAIL、0 SKIP；作者 evidence artifact 为 `11727111491`，ZIP SHA-256 为 `ccea4987d61b47afe77e6c067f0a3805d4cabc13cd9bfa5fad5f0ddba9e77d13`，546719 bytes。作者测试的 browser、standalone 仍由其自身回执标记 `NOT_RUN_BY_THIS_COMMAND`。

本次还修复了 Knowledge workflow 的 checkout：它现在显式使用 `github.event.pull_request.head.sha || github.sha`。修复前的 run `38204944846` 虽然通过，但回执来源为旧 SHA `7037e0af…`，没有作为当前正式包输入使用。

主仓已同步：

- `config/shinemage-composition-packs.lock.json` 的 Workbench、CRM、Knowledge 三行已绑定上述 source SHA 和正式 manifest SHA。
- `config/workbench-author-evidence.lock.json` 已绑定 Workbench 当前 run、artifact、formal manifest 和 tarball。
- 锁文件提交为 `865cda89`（`chore(composition): bind current formal plugin CI artifacts`）。

剩余边界保持原状：当前 profile 仍未提供新的 `service_binding`，正式 candidate/journal、service/target/terminal/browser/recovery、真实模型/CRM/WeKnora、standalone 页面包、SDK 分发和 DSH 升级仍未关闭；`release_ready=false`。
