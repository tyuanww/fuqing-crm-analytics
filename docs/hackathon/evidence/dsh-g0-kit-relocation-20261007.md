# kit 开发输入迁移验证（2026-10-07）

前一批已按用户要求完成 OCR delegate 审修，通过正常 hooks 本地提交 `90d5012d595e90f7ff4ce8614d854229b5262cd7`，64 个文件。提交后工作树为空，再执行本子项。两项修复和提交前验证见[审核记录](dsh-g0-kit-review-20261007.md)。未 push、发布或操作杭州。

本子项属于 T15：验证固定开发 SDK/工具迁移到另一个目录后，kit 的公开安装/构建路径是否仍可用。只关闭 **同一 Mac / darwin-arm64 的本地目录迁移**；整体仍 **PARTIAL / release_ready=false**。

## 实际输入与隔离

- 来源是[此前全新准备的 SDK](dsh-g0-kit-bootstrap-20261007.md)，固定 DSH `0.1.7-rc.2` / SHA `477b4f420553e8a52c2fbccc464d7561b239c443`。复用已构建 SDK，没有重跑上游构建或改写上游源码。
- 只复制该自有准备目录中的 `upstream`、`build-tools`、`corepack`，未复制原 HOME/store。新目录有独立 HOME、临时文件目录和 ownership 标记；Node 使用已有 `24.19.0`，Corepack 缓存中的 pnpm 为 `11.7.0`。
- `cp -cRp` 创建 APFS 本地副本，原输入保留。**124,231** 个普通文件/符号链接记录逐一核对内容 SHA-256、权限或链接目标；总逻辑字节 **2,195,873,252**，无绝对、逃逸或断开的符号链接，迁移记录全部一致。约 57 秒包括前后 inventory，不能当作网络传输时间或压缩包体积。
- macOS `sandbox-exec` 禁止读取/写入原 SDK、仓库旧 `.context/dsh-b0` 和旧 public checkout；禁止外部网络，允许测试所需 loopback；迁移后的 upstream/build-tools 只读。实际探针证明原目录读取和外网连接均被拒绝、loopback 可用。最初规则连 loopback listen 也拒绝，补上精确本机 inbound 规则后再运行正式测试，失败记录保留。
- 所有测试子进程继承该 sandbox；包管理器同时设置 `COREPACK_ENABLE_NETWORK=0`，消费者使用 fresh store、`pnpm install --offline --ignore-scripts`。允许本机 Node/Git/Python 等已有系统工具，不宣称整台新机器验收。

## 真实验证

完整环境和命令保存在 `.context/checks/kit-relocation-20261007/test-command.json`；正式入口为：

```sh
python3 .context/checks/kit-relocation-20261007/run-relocation.py
# 内部在上述 sandbox 和迁移后的 B0_BUILD_UPSTREAM/B0_BUILD_TOOLS 下执行：
node --test scripts/dsh-b0/plugin-kit.test.mjs
```

结果：**15 PASS / 0 FAIL / 0 SKIP，27.64 秒**。其中全部 **10/10** 消费者逐一复制到无相邻插件/kit 源码的临时位置，真实安装当前源码 kit tarball，再构建并执行原有测试文件：board-components、shine-brand、shine-query、shine-board、shine-crowd-action、shine-funnel、shine-waterfall、crm-knowledge、knowledge、analytics-workbench。领域包摘要继续匹配现有 lock；实际 pnpm symlink CLI help、已有目录拒绝和 kit 版本错误拒绝也通过。

原 SDK 和迁移副本在测试后重新计算同一 inventory；两边各 **124,231** 条保持。原候选 `a490457c…` 文件及 journal seq 6 摘要保持，不创建候选或写入验收事件。详见 `integrity.json`。

## 可得结论与剩余边界

kit 支持的插件构建路径在这组固定输入上不依赖旧目录或外部网络，多个插件可以复用相同 SDK 钉。此次没有发现需要追加修改产品代码的失败。

pnpm 生成的 `.bin/tsc` 包装器和 `.modules.yaml` 仍包含安装时绝对路径。它们来自安装产物；本次只证明 kit 通过解析器加载编译器的支持路径，不保证任意上游 pnpm 脚本或重新安装行为都可迁移。没有改写这些第三方产物来制造通过。

本地目录副本不是可发布 SDK 包。后续仍须处理按 OS/arch 区分的最小闭包、可校验归档及安全接收、来源/签名/SBOM/CVE/撤销，并在全新环境和 WSL 验证对应平台输入。当前 Mac 的原生依赖不能作为 WSL 开发闭包直接发布。生产只接收插件与其运行时需要的固定产物，开发 SDK 不应装入杭州运行服务。

保留原始证据于 `.context/checks/kit-relocation-20261007/`：`inputs.json`、`clone-inputs.py`、`source-inventory.json`、`source-summary.json`、`relocated-summary.json`、`relocation.sb`、`sandbox-probe*.log`、`run-relocation.py`、`test-command.json`、`relocation-test.log`、`result.json`、`verify-inputs.py`、`integrity.json`。自有副本保留供后续分发验证；没有清理旧证据、访问真实 DuckDB、运行生产服务或现场安装。
