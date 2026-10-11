# Workbench 私有几何组合验证归属提案（2026-10-11）

当前可审查成果是独立作者仓提案与主仓侧待接入补丁，均未应用原仓，也未提交。主仓 `5390667c` / `codex/shinemage-abc-local-candidate` 仍执行原 `geometry-composition.test.mjs`。原 Workbench 作者仓 `d038f357` 保持干净，原固定 CI 和正式包身份不改。

提案目录：`/Users/hutou/.codex/tasks/shinemage-workbench-geometry-owner-proposal-20261011-4zvnzwh6`。精确路径、前后摘要见该目录 `author-product-delta-files-r1.json` 和 `main-proposal-files-r1.json`；机器结果见[同轮验证记录](shinemage-workbench-geometry-owner-proposal-20261011-validation.json)。

## 归属与输入

原十四项私有断言属于 Workbench 的 props 解析和投影实现：十二项既有瀑布图数据案例、漏斗禁止引入事实/单位/可执行内容、瀑布图只允许展示修改。它们不能由较窄的公开几何测试替代。新作者测试保留原断言，仅改变三处 import/输入路径，读取作者仓私有实现和冻结 JSON。

冻结 `waterfall-cases.json` 与主仓当前 HEAD 文件逐字节相同：SHA-256 `660951cac597064a367c9f5cec8127c4da0204842bdee04f81beceeabb488c1c`，2355 字节。输入锁从十五份增加至十六份。作者增量共五个路径：新测试、新 JSON、锁和两份说明；没有运行源码、peer、manifest、版本或工作流改动。

## 实际验证

- 真实 `git clone --no-local` 精确 `d038f357`，没有 alternates。离线冻结安装、输入核对、host/client 严格类型检查与构建分别 exit 0。
- 几何专项十四项 PASS；完整 core 在新输出目录实际为 **155 文件、1086 PASS / 0 FAIL / 0 SKIP**。专项已经包括在 core 中，数字不相加。
- 沙箱禁止主仓内容及九个原作者仓读取，固定上游和 build-tools 只读放行，允许合成 localhost HTTP；21 项负对照为 EPERM。这不是整机 deny-default，也不是 SDK/业务源码全部不可读。
- 内容打包 exit 0，八个成员与当前 CI 内容包逐字节相同；本地压缩归档 `901a2206e1dda375ca5972e8e64e419b1a3a2a16eaede30b093f62b24c6674ab`，438806 字节，与现有归档身份不同。formal pack、candidate、宿主/目标/browser 和 journal 本轮均 NOT_RUN。
- 主仓侧三路径提案从已校验 CI plan 暴露文件清单，几何阶段要求该清单包含新作者测试。读者守卫 13 PASS / 0 FAIL / 0 SKIP；当前旧 CI archive 被正确拒绝，exit 1 / `WORKBENCH_GEOMETRY_AUTHOR_COVERAGE_REQUIRED`。不能把这项预期负测写成几何准入通过。
- 两份补丁 `git apply --check` 均 exit 0；主 Agent 本地审查未发现未解决问题，外部 OCR 本轮 NOT_RUN。

首轮 core 命令漏传 `FQ_CRM_PYTHON`，退出 1；原包装输出仅65536字节且截断，不能据此统计全量结果。保留首轮文件，补齐固定 Python 3.14.4 后只重跑失败阶段和未执行的打包；第二轮完整 stdout 为117234字节，plan/result 与末尾计数一致。预备主仓负测曾因归档定位路径写错在测试前停止，随后核对真实路径及摘要再执行，没有重写 CI 输入。

## 接入顺序与边界

1. 用户授权后，仅把五路径作者提案应用到原作者仓并形成一笔 `test(workbench): own private geometry composition assertions` 本地提交。
2. 另按实际 push 授权更新现有 PR #1，取得该新提交的实际完整 CI、plan/result 和内容包。
3. 由干净新来源生成正式 pack 并核对包、来源和作者证据锁后，再应用主仓侧补丁。pipeline 仍须把作者证据绑定到同一正式包。
4. 只对新集成字节补必要检查。原主仓十四项断言在上述前置条件具备前继续执行，旧副本和失败证据不删除。

当前新 Git/CI/正式组合未执行。主仓其余领域生产者、源码合同与业务断言仍各自维护；SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION 保持0.20.0.0。
