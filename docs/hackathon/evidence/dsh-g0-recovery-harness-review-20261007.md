# 恢复演练增量审核（2026-10-07）

范围为 `b6cecdb6` 后的 14 个未提交文件：3 个修改的测试/入口、5 个新增恢复工具/测试、6 个状态/证据文档。OCR delegate preview 选中 7 个 JavaScript 文件；另对被默认过滤的 Python 测试及 6 个文档手工补审。**14/14 已审、0 跳过、覆盖率 100%；本批未发现新的提交阻塞。** 本页属于审核记录，不计入原始范围。

审核核对故障 opt-in、进程所有权、固定包复用、只在新建目录生成合成会话、输出拒绝覆盖、读写模块版本、子进程失败记账、代理连接回收、UNKNOWN 证据边界及文档引用。没有将会话不重复执行等同于业务终态恢复；已确认的 nativeJournal P1 独立跟踪，未在本批修复。

本次重新运行：

- `B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" node --test scripts/dsh-b0/recovery-model-gate.test.mjs scripts/dsh-b0/session-recovery.test.mjs scripts/dsh-b0/mock-provider.test.mjs`：8 PASS / 0 SKIP。
- `python3.14 -m ruff check backend/tests/test_analytics_first_purchase_official_host.py`：PASS。
- 固定 `B0_BUILD_UPSTREAM` 的 `pinned-host-acceptance.test.mjs`、`first-purchase-kernel-artifacts.test.mjs`、`first-purchase-runtime-artifacts.test.mjs`：47 PASS / 4 SKIP；4 项需要显式独立服务包/Python/wheelhouse，不计为通过。
- 原 14 文件逐文件 secret scan：0 findings；`git diff --check`：PASS。
- 本次未重新运行杭州或真实模型。上一轮 WSL 观测保持其[原始范围](dsh-g0-first-purchase-recovery-wsl-20261007.md)，未生成新的生产验收结论。

这批可以独立提交为恢复测试与缺陷证据；不需要把尚未实现的业务修复混入同一个 commit。后续单独修复官方历史投影，再对新源码/新候选做终态释放验收。生产激活与物理分仓仍未完成。
