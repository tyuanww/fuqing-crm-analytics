# shine-brand 公开编译路径与远程交付准备（2026-10-08）

## 实际完成

独立仓分支 `codex/shine-brand-independent` 正常本地提交 `d695266affb438a6978414a362a6ab6f6fa19417`：`feat(build): build shine-brand with locked public tools`。这一个事件包含编译入口、必要测试、CI 与开发说明。源仓干净。主集成树仍为 detached f8db3949，没有提交其继承成果或生成新候选。

旧 CI 要求托管 runner 上存在本机上游/build-tools 绝对目录，实际无法直接运行。本次针对 shine-brand 的真实源码确认：三个宿主 SDK 引用均为 type-only，运行代码没有包级外部 import。增加 `npm-author/` 独立锁，只需精确 esbuild 0.25.12、pnpm 11.28.2 及 esbuild 当前平台二进制；不修改 plugin-kit，不制造 SDK binding，不分发封存 SDK。

旧入口与公开入口共用 `plugin/build-options.mjs`；旧 SDK 的固定输入检查保留。公开入口检查 Node/esbuild 精确版本、拒绝自定义编译器路径，构建后核对 metafile 的输入/运行依赖边界，通过后才写 lib。metafile **不是文件读取沙箱**，本次实际隔离由 sandbox-exec 提供。

## 输入与验证

初始输入是独立仓 981c270 加本次白名单增量；没有复制 node_modules/lib。隔离副本位于 `/Users/hutou/.codex/tasks/shinemage-shine-brand-public-build-20261008/checkout`。成功验证后提交，逐项确认实现/锁/测试与提交内容相同；README/DEVELOPMENT 的结果说明在运行后更新。此副本不是新提交的独立 clone，更不是远程 clone。

- Node 24.19.0 / npm 11.17.0，经官方 Node release index 复核配对；锁中所有公开包有 HTTPS registry URL 和 sha512，实际安装 3 个包。
- 安装阶段使用新 HOME/cache，联网拉取锁定公开包、禁用生命周期脚本，TLS 保持校验；不是离线冷安装。
- 安装及后续均拒绝整个 worktrees、原品牌仓/旧 clone 与主桌面仓；不再放行上游/build-tools。后续构建、测试、打包另外禁网。实际读上游、工具目录与原品牌 manifest 的边界探针均被 EPERM 拒绝。
- install、boundary probe、public build、tests、pack 均 exit 0。**32 PASS / 0 FAIL / 0 SKIP**：原输入 11、pnpm 9、新编译边界 5、品牌行为 7。只记本次同一测试集，不和旧轮相加。
- 旧 SDK 入口在原隔离规则下补一次正向构建，exit 0；两个入口产物相同。两个 JS 继续为 index `8b1f89bd…`、client `03ed4e2a…`。
- 内容包 5 成员、2676 字节，SHA-256 `9ccaa2ead44a0c9b8a5a3917ec7b78928a60921009d113c62c847eeed63dec7b`，与上轮相同；formal packPlugin/candidate NOT_RUN。
- workflow YAML 解析和 git diff --check 通过。Actions 的固定 SHA 通过官方 git ls-remote 核验；Linux x64 二进制存在于锁，但 Linux/GitHub Actions 尚未实跑。

实际命令/环境/原始 stdout/stderr/退出位于 `.context/checks/shine-brand-public-build-20261008/run-r1/`；旧入口 `legacy-build.*`、锁核对 `dependency-lock-review.json`、最终提交文件 `committed-files.json`。机器汇总见 [validation](shinemage-shine-brand-public-build-20261008-validation.json)。查询 Node index 首次遇本机 Python CA 缺失，已保留失败说明；明确加载现有 CA 后成功，没有关闭 TLS。

## 审查与范围

父审查及独立 native 审查没有待修复 P1/P2。新增测试实际构建隔离夹具，覆盖不同 cwd、错误编译器版本、新外部运行 import、越界源码、自定义二进制；不向用户源码注入负例。报告见原始目录的 `parent-review.md` 与 `run-r1/native-review.md`。

**仅 shine-brand 的公开编译/打包路径通过。** esbuild 转换 TypeScript 不等于严格 SDK tsc，缺失的公开类型未补造；不继承正式宿主/浏览器/candidate/生产验收。不泛化到其他插件或整个 SDK。SDK 分发仍 BLOCKED、产品 PARTIAL、release_ready=false。

## 远程下一步

当前账号为 tyuanww，未找到可访问的 `tyuanww/dsh-shine-brand`。建议私有仓，以已审查根提交 506b1a3 作为 main 初始基线，再把本分支的 CI 与公开编译器变更开 PR；具体命令顺序和 PR 正文已分别准备为 `remote-actions.md`、`pr-body.md`。等待对应远程授权；未建仓、push、PR、merge、发布或部署。CI 本身不再要求旧机器目录变量，但实际通过仍要等远端结果。
