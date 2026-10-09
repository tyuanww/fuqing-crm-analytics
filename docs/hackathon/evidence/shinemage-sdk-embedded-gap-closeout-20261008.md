# SDK 嵌入原子缺口映射收尾（2026-10-08）

本轮只读比对已有官方 map、已完成构建产物与固定 store 文件。两份 map 原始字节复现、15 个编译 lib 的源内容映射，以及旧 store 桶中可直接对齐的源内容已落原始 JSON。没有重新构建、下载、执行 native 或重查公告；原历史阶段不改写，顶层状态不变：EMBED-INLINE-BYTES 仍 PARTIAL，产品默认两个字段仍 NOT_VERIFIED，SDK 分发 BLOCKED、release_ready=false。

## 本轮实际关闭的原子项

1. 已成功构建生成的 `pnpm.mjs.map` 与官方 release map 原始字节相等：27,140,211 字节，SHA-256 `4865d30c95de064d49e60dae5599de0a657d7f59c16856462fa43d4b44fd2a07`。`worker.js.map` 同样相等：1,220,912 字节，SHA-256 `1384a64fa469e5f5d4b41aa77a4208eed9e88e3b6b6795e679e7a288d66aa55d`。不做 JSON 规范化或字段拼接。
2. 旧 `git_exceptions` 中15个 `lib/*.js`，官方 map 的 sourcesContent 均与现有固定配方编译出的普通文件逐字节相等。关闭的是“没有对应编译产物字节”这一子项；它们仍不是源码 commit 树中的原始 blob。逐项证据 `/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-embedded-gap-map-20261008/compiled-lib-15.json`。
3. store 按原历史桶接续，结果如下。表中42/2483/68/1属于旧2594个去重内容条目，不与15/86相加，也不作为测试数。

| 旧历史桶 | 本轮直接物理文件相等 | 包内外部 map 内容相等 | 包内 data-map 内容相等 |
|---|---:|---:|---:|
| 旧28包之外、未比较2483项 | 2404 | 69 | 10 |
| 旧对应tar内路径缺失42项 | 0 | 42 | 0 |
| 旧已相等68项 | 68（保持） | 0 | 0 |
| graceful-fs旧原文差异1项 | 1（固定安装应用原补丁后的文件） | 0 | 0 |

合计2594个有内容的唯一store条目：2473个物理文件；111个来源为依赖自身外部map的sourcesContent；10个来源为`@pnpm/patch-package@0.0.1`已安装JS中的内联base64 map。后两类只证明包内map携带的源内容，不能改称这些TS路径物理存在，不能等同重新审计完整registry包。所有来源保留精确路径、索引、大小及摘要，匹配采用实际字节比较。

421个相关包名/版本都可关联原锁SRI和已存在的原管理器store索引；这是此前固定配方材料的关联，不是本轮重新下载tar或新的完整包身份审计。完整映射：`/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-embedded-gap-map-20261008/mapping-final.json`。

## 仍不能关闭

86个null路径在两份原始/复现map中继续为null，物理源文件均不存在；全部已追到依赖自身map中的null记录，因此不能从bundle可重现反推这些原始TS字节已取得。按包的精确分布如下：

| 固定包 | null路径数 |
|---|---:|
| `smart-buffer@4.2.0` | 2 |
| `socks@2.8.10` | 6 |
| `safe-execa@0.3.0` | 1 |
| `table@6.9.0` | 33 |
| `render-help@2.0.0` | 1 |
| `semver-range-intersect@0.3.1` | 4 |
| `@zkochan/table@2.0.1` | 33 |
| `agent-base@7.1.4` | 2 |
| `http-proxy-agent@7.0.2` | 1 |
| `https-proxy-agent@7.0.6` | 2 |
| `socks-proxy-agent@8.0.5` | 1 |

所需材料是上述精确版本的原始源文件及可核验commit/归档身份，并关联到当前发布JS/map。不能用别的版本、从JS猜回TS或空字符串补洞。逐路径及来源map见 `/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-embedded-gap-map-20261008/null-source-open.json`。其他完整包身份、资源解析、签名/撤销、native与干净主机等父门禁没有由此关闭。

## 验证与交付

三个只读控制器 `map-gaps.py`、`map-secondary.py`、`close-inline.py` 均exit0。既有8027源码审计、双bundle构建成功沿用上轮记录，本轮未重跑。末尾重新核对本轮读取并列摘要的 2895 个输入文件，0变化；记录 `/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-embedded-gap-map-20261008/protected-after.json`。没有产品源码或校验器修改，不写集成树/旧任务树/live store，不提交。新增仅本MD、配套validation JSON及专属.context证据。

机器摘要为同目录 `shinemage-sdk-embedded-gap-closeout-validation-20261008.json`，原始摘要 `/Users/hutou/.codex/worktrees/shinemage-sdk-evidence/fuqing-crm-analytics/.context/checks/sdk-embedded-gap-map-20261008/summary.json`，与交接JSON逐字节一致。
