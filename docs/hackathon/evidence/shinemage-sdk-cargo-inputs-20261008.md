# SDK 配方 Cargo 输入与 hook / alias 证据（2026-10-08）

本页仅汇总 C 专属树已经完成的缓存准备和静态审查，不重跑检查。工作树为 `/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics`，HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09`。固定配方源为 `57e7b9b76ac3a5ef67461093071b2264335a1a01`。

**结果：固定 Cargo 输入与 C 独占缓存可离线使用；官方双 JS bundle 配方构建仍不由本页宣告通过。** SDK 分发保持 BLOCKED，EMBED-INLINE-BYTES 保持 PARTIAL，`release_ready=false`；八条顶层门禁未改为通过。

## 已有实测结果

| 层级 | 本轮已有证据 |
| --- | --- |
| 固定工具 | 官方 Rust 1.97.0 manifest 与 cargo darwin-arm64 归档摘要一致；cargo --version 为 1.97.0，exit 0 |
| 真实固定源 metadata | 源码只读、sandbox 禁网；cargo metadata --no-deps --offline 返回 111 个 workspace，exit 0；不需要 rustc/std |
| C 原生缓存预热 | pnpm 12.7.0 读取原 Cargo.lock，准备 774 个 registry 包和 1 个固定 Git 依赖；47.4 秒，exit 0 |
| 新 fixture 离线消费 | 起始无 .pnpm/node_modules，sandbox deny network* + --offline；2.62 秒，exit 0，downloaded 0 |
| C 自身原始材料核对 | 774 个 registry package checksum 对原锁；1 个 Git 包按固定 commit 槽及原生文件清单核对；合计 39,201 个文件 hash，0 差异 |

39,201 的统计直接来自已保存的 [materialized-integrity.json](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/sdk-cargo-inputs-20261008/materialized-integrity.json)，本次文档归档没有重新运行文件核对。Git 包的 `package_checksum=null`，不能把它当作 registry 归档 checksum。唯一 Git 来源为公开 `https://github.com/pnpm/node-semver-rs`，固定 commit `3d74d6b7f4de1de2006cf2f7663aac09de65b1f6`。

原源、预热 fixture 和离线 fixture 的 Cargo.lock 均保持 SHA-256 `dba6b09b5493311ba314259cb690fee97b72adcf5fb08eb700eeae5535ddd9d1`。使用独占 HOME、CARGO_HOME、RUSTUP_HOME、store/cache/state；没有执行 Rust/native 编译、生命周期或发布。合成 Cargo fixture 只触发原生缓存准备，不是官方 recipe 验收。

## 固定 hook / alias 审查结论

- `--ignore-scripts` 不会关闭 `.pnpmfile.cjs`。固定钩子只修改 manifest；保留钩子和锁定的 graceful-fs / normalize-registry-url 两份补丁。
- 固定 workspace 开启 Cargo；npm filter 与 ignore-scripts 不会屏蔽 Cargo 依赖准备。子目录没有独立 workspace/lock；ignore-workspace 会丢失共享锁、workspace 依赖及 catalog/patch，不能用来冒充等价配方。本次沿原生物化入口准备输入，没有修改官方配置来关闭 Cargo。
- esbuild 与 TypeScript native-preview 可使用精确平台包，未执行下载型安装脚本。run build 的 `pn/pnx` 不会自动生成；官方 wrapper 中 pn/pnx/pnpx 与固定源逐字节一致，可在隔离工具目录使用原脚本并绑定精确 native 管理器，保留配方命令文本。
- filtered install 的实现会把 workspace 根项目加入物化范围，不能漏算 root devDependencies。

早期静态报告中“默认 Cargo registry 也需要 config.json 缓存”的泛化已在当前交接补正：pnpm 对默认 crates.io 内建下载 URL；只有非默认 registry 分支需要该缓存。早期报告保留。

## 失败、迁移与未关闭范围

`prewarm-r1` 保留：不支持的裸 `--fetch-retries 0` 被参数归一化为 add，exit 2，在安装前拒绝；r2 使用固定源码已实现的 `PNPM_CONFIG_FETCH_RETRIES=0` 后成功。没有覆盖失败记录。

C 缓存路径不可与 A/B 的 SQLite 索引拼接，不改写绝对槽路径。已交给 B 六个 fixture 输入和原生命令，由 B 在其独占统一 store 内重新预热；本页不宣称 B 的后续执行结果。没有写入共享 live store、集成树或产品源码。

本页不关闭正式 recipe 输出字节比较、SDK 分发、native 信任、签名/撤销、真实模型/业务/生产验收。没有重查公告，没有重跑 B0、headed 或服务验收。

原始材料：[Cargo handoff](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/sdk-cargo-inputs-20261008/handoff.md)、[Cargo summary](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/sdk-cargo-inputs-20261008/summary.json)、[hook review-r2](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/sdk-recipe-hook-review-20261008/review-r2.md)、[hook review-r2 JSON](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/sdk-recipe-hook-review-20261008/review-r2.json)、[alias-routing](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/sdk-recipe-hook-review-20261008/alias-routing.json)。路径保留原始执行树位置，便于区分来源；全部 SHA-256 与字节数见同目录 [shinemage-sdk-cargo-inputs-20261008-validation.json](shinemage-sdk-cargo-inputs-20261008-validation.json)。
