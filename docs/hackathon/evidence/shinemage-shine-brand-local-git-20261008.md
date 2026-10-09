# shine-brand 本地提交与独立 clone（2026-10-08）

本轮授权仅用于 shine-brand 独立样本的本地提交和 clone 验收。主集成树保持 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d`；原有 90 份未提交文件在文档更新前逐字节核对一致。主树未提交，未创建远程仓、push、PR、合并、发布或部署。

## 两个独立事件

| 提交 | 内容 |
|---|---|
| `506b1a3e18ffd6dfb1e10f9826608f5b27449223` | `feat(shine-brand): establish standalone plugin repository`：25 文件，插件实现、合同、固定开发依赖、独立入口、必要测试与使用说明 |
| `981c27015a93ce8fe20db594eb887914c766379a` | `chore(ci): add pinned standalone plugin checks`：工作流与 CI 材料要求，共 2 文件 |

仓库 `/Users/hutou/.codex/tasks/shinemage-shine-brand-independent-20261008/dsh-shine-brand`，分支 `codex/shine-brand-independent`。正常 git commit 完成，无绕过 hooks；仓库无活动 hooks，也未配置 hooksPath。源码仓无 remote，工作区干净。未强行将同一功能的测试拆为单独提交。

## 审查与修正

提交前按 `/review` 清单执行父审查及独立只读源码审查。native 发现 0 P1 / 1 P2：README 承诺卸载即恢复标题，但 cleanup 只停止观察，不回滚既有 DOM；内存 probe 已复现。修正说明为重新加载无覆盖页面才能完整恢复原生外观，没有修改运行时代码或新增 DOM 回滚行为。另去掉打包结果固定“无 commit”的过时原因。

初始仓库没有 HEAD，gstack review logger 返回 `cannot capture a diff review without a working-tree fingerprint`，未生成自动审查绑定。保存 26 文件审查摘要、实际发现和修复记录；不声称自动记录器或外部审查通过。审查报告见 `.context/checks/shine-brand-local-git-20261008/native-review.md`；这不是正式外审或真实浏览器验收。

## 独立 clone 实测

通过 `git clone --no-local` 从上述已提交本地仓创建 `/Users/hutou/.codex/tasks/shinemage-shine-brand-clone-20261008/dsh-shine-brand`，HEAD 为 `981c27015a93ce8fe20db594eb887914c766379a`，初始无 node_modules、无 lib。clone 的 origin 是本地源路径，不是远程仓。

隔离策略拒绝网络、整个 worktrees 业务源码和原独立样本仓；实际读取三处 package.json 均被 EPERM 拒绝。只读允许固定上游 `477b4f42…` 与已有 build-tools，仍不满足“上游 checkout 不可见”的最终作者路径。Node 24.19.0 / pnpm 11.28.2 精确校验；使用 clone 独立 HOME/store，离线安装 vendor kit，downloaded 0。没有下载、重建 DSH 或重新审计 SDK。

| 阶段 | 实际结果 |
|---|---|
| 禁止读取边界 / 固定 pnpm | 均 exit 0 |
| 输入与命令检查 | 20 PASS / 0 FAIL / 0 SKIP |
| 离线冻结安装 / 只读 SDK 输入检查 / 构建 | 均 exit 0 |
| 品牌行为 | 7 PASS / 0 FAIL / 0 SKIP |
| 内容打包 | exit 0；5 成员，2676 字节 |

新内容包 SHA-256：`9ccaa2ead44a0c9b8a5a3917ec7b78928a60921009d113c62c847eeed63dec7b`。README 修正使包字节变化；旧 `e9e05344…` 仅属前轮。两个运行 JS 与原样本逐字节一致；32 个依赖链接均落在 clone、固定上游或 build-tools 内。源仓与 clone 结束时干净，上游干净。主仓 formal packPlugin 未执行；不继承正式 candidate/headed/WSL 验收。

原始命令、环境、stdout/stderr 摘要与退出码见 `.context/checks/shine-brand-local-git-20261008/run-r1/`；机器记录为 [validation](shinemage-shine-brand-local-git-20261008-validation.json)。首次编排脚本因变量未定义在所有验收命令之前退出 1，保存 `run-clone-setup-failed.py` 和 `setup-failure.txt`；修复仅限证据 runner，成功轮不覆盖失败记录。

## 未关闭与下一步

本地样本的提交与限定输入 clone 子项已完成。远程建仓、push、PR、GitHub Actions、发布仍未执行；workflow 只是已提交，runner 缺固定解释器及上游/build-tools 输入。后续按授权及实际仓库目标推进远程，不将本地 PASS 记成远程 CI PASS。

其余插件逐个独立仓、可分发开发依赖方案、完整看板/CRM/真实 WeKnora 接口验收、独立 DSH 升级仍按既有任务推进。SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false；T15/T19/T21 不整体勾完。主树旧 candidate/journal 不改。
