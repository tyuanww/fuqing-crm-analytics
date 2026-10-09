# shine-brand 独立远程仓、clone 与 CI（2026-10-08）

在用户明确授权私有建仓、push、PR 和 CI 后，创建 [tyuanww/dsh-shine-brand](https://github.com/tyuanww/dsh-shine-brand)，默认 main 为已审查根提交 `506b1a3e18ffd6dfb1e10f9826608f5b27449223`。独立分支 `codex/shine-brand-independent` 已推送，形成 [PR #1](https://github.com/tyuanww/dsh-shine-brand/pull/1)。PR 仍 OPEN，未合并、发布或部署。

## 按事件提交

| 提交 | 事件 |
|---|---|
| 506b1a3 | feat：建立独立品牌插件仓；作为新远程 main 初始基线 |
| 981c270 | chore(ci)：最初固定输入的工作流 |
| d695266 | feat(build)：精确公开编译器路径，解除该插件构建对上游 checkout/build-tools 的依赖；保留旧入口 |
| 2d7c17c | test(pack)：逐成员校验/摘要，区分跨平台成员字节与归档字节；同步仓库状态入口 |

最新完整 SHA：`2d7c17c2afa8050fc2d6b5def6af34fcaf821667`。独立仓干净，分支与远程一致；main 主集成工作树仍 f8db3949，未提交其继承增量。

## 真实远程 CI

| 输入 | 结果 |
|---|---|
| d695266 初次 push / PR | 两次 SUCCESS，仅证明该 SHA 的公开编译路径 |
| 2d7c17c 最新 push | [37802167524](https://github.com/tyuanww/dsh-shine-brand/actions/runs/37802167524)，SUCCESS |
| 2d7c17c 最新 PR | [37802176213](https://github.com/tyuanww/dsh-shine-brand/actions/runs/37802176213)，SUCCESS |

Ubuntu 24.04 实际选定 Node 24.19.0 / npm 11.17.0；安装公开锁依赖、编译本插件、每次 32 PASS / 0 FAIL / 0 SKIP、内容打包通过。不同轮次和 push/PR 不累加。Actions 仅构建/测试/内容检查，不包含正式候选或发布步骤。旧全项目 B0、正式 release pipeline 和真实业务状态不能因本仓 CI 变绿而改写。

## 真正从 GitHub clone

从远程分支 clone `d695266` 到 `/Users/hutou/.codex/tasks/shinemage-shine-brand-remote-clone-20261008/dsh-shine-brand`。初始没有 node_modules/lib；后续 sandbox 拒绝主仓、原品牌仓、旧 clone、上游/build-tools 与先前验证副本。全部后续命令禁网，npm ci --offline 使用此前公开包缓存，不声称冷缓存联网安装。安装、边界、构建、32 项测试、内容打包均 exit 0，结束工作区干净。后续 2d7c17c 仅增加打包检查/文档，由远端新一轮 CI 验证；不把旧 clone 写成新 HEAD 重跑。

## 跨平台包身份

新增检查确认 5 个成员在 Linux 与 macOS 全部相同：README、cordis patch、index.js、client.js、package.json。两个 JS 继续是 `8b1f89bd…` 与 `03ed4e2a…`；manifest 唯一归一化为 pnpm 去掉 packageManager，双方结果相同。

压缩归档本身不同：

- macOS：2676 字节，`9ccaa2ead44a0c9b8a5a3917ec7b78928a60921009d113c62c847eeed63dec7b`。
- Linux：2742 字节，`513b1c1867ac11bc4a45060cb75ef373e343f1069aadb98420e5e5fd718e152d`。

已将差异限定在归档/压缩层，未进一步区分具体 header 或压缩器原因；不能将它们登记为同一个 package digest。两者都是内容检查包，未调用 formal packPlugin，未生成/替换正式 candidate，不需要以统一归档格式扩大本轮范围。

## 审查、原始材料与剩余

公开编译实现经父审查及独立 native 审查，无待修复 P1/P2；逐成员检查增量另做代码/文档审查和本地实跑。全部使用正常 commit/push，没有跳 hooks。原始目录 `.context/checks/shine-brand-public-build-20261008/` 保存源码清单、锁、实际命令和审查；`remote/` 保存 CI 原始日志/API 回执、clone 输入/输出和授权范围。GitHub 读取曾发生 TLS handshake timeout，保留失败，不写成 CI 失败或改证书检查。机器记录见 [validation](shinemage-shine-brand-remote-20261008-validation.json)。

**已关闭：shine-brand 的独立本地仓、公开依赖编译、独立远程仓、真实远程 clone 和本仓 CI 子项。** 其严格 SDK 类型检查、宿主兼容、正式候选/发布分别开放；SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false。其余插件分仓与真实 CRM/完整看板/WeKnora 验收不继承本项；下一项继续按各插件实际代码边界推进，不能把 shine-board 标记壳当成完整看板。
