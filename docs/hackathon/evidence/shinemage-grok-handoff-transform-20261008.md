# Grok 交接与五包变换收尾（2026-10-08）

本轮从 detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09` 接续，保留起始 38 项未提交文档/证据。只推进用户交回的固定输入变换和证据集成，没有产品源码变更、候选重打包或新提交。机器结果见[本轮汇总](shinemage-grok-handoff-transform-validation-20261008.json)。

## 实际完成

| 固定包 | 实际原配方 | 与发布 JS 原始字节比较 | 对应原 null-source 路径 |
|---|---|---:|---:|
| smart-buffer 4.2.0 | TypeScript 3.5.3 | 2/2 相等 | 2 |
| socks 2.8.10 | Prettier 3.9.6 + TypeScript 5.9.3 | 6/6 相等 | 6 |
| semver-range-intersect 0.3.1 | TypeScript 3.5.3 | 4/4 相等 | 4 |
| table 6.9.0 | 原 schema 生成 + TypeScript 4.5.2；ajv 8.8.1 | 35/35 相等 | 33 |
| @zkochan/table 2.0.1 | 原 schema 生成 + TypeScript 4.5.2；ajv 8.12.0 | 35/35 相等 | 33 |

五个原 build 均 exit 0；实际 Node 24.19.0，依赖按各自固定锁的 integrity 校验，编译阶段使用操作系统禁网沙箱。总计 **82 个发布 JS 字节相等**，主 Agent 重新读取每一对产物独立复算；覆盖 **78 条 null-source 路径的变换子项**，不是 82 个测试，也不是完整包通过。76 份原始源码已由主 Agent 与五个固定 commit 归档重新比对；另外两条 validators 由原 schema 命令生成，比较的是其最终发布 JS，并未取得历史发布时原始 generated source。官方 map 的 86 个 sourcesContent 仍为 null，未回填或修改。

两 table 构建的 97 个唯一依赖归档按原锁核验，其中 79 个 SHA-512、18 个 SHA-1，不写成全部 SHA-512。table@6.9.0 的 registry gitHead 归档中 package.json 自报版本 1.0.0；这一差异保留，未改 manifest 来凑版本。实际关闭的是该固定输入到所列发布 JS 的变换比较，不是完整发布身份。

原始输入及构建详见[源码取得与关联](shinemage-sdk-null-source-binding-20261008.md)、[三包复现](shinemage-sdk-three-package-transform-20261008.md)、[两包生成与编译](shinemage-sdk-table-transform-20261008.md)。registry 的 gitHead 是精确版本元数据声明的 commit 关联；字节复现增加变换证据，不等同已验证的签名 provenance，也不证明唯一源码身份或完整 tarball 可重复。

socks 原发布脚本先运行 Prettier，在隔离副本改变一处 helpers.ts 排版。其四份声明文件也有差异，包含 Buffer 类型/引用变化，本轮不声称声明文件或整个 API 类型等价。两 table 首次构建因隔离装配未给 bin 目标执行位而失败；仅修复私有 node_modules 的执行权限后执行原配方，脚本、锁、schema 与源码字节没有手改。网络超时、辅助控制器失败、首轮 Permission denied 均保留，不覆盖为成功。

## 当前 HTML 包证据收录

候选 `993daf31…` / 包 `b75d90e9…` 的原始 headed 结果 **25 PASS / 0 FAIL** 已核对，576 源码、8 个加载成员、原 runner 和 12 张截图对应。此次仅收录 Grok 已执行结果，没有再跑浏览器；旧 ecaa86 的结果仍只属于旧包。见[原执行交接](shinemage-html-candidate-headed-20261008.md)、[独立核对](shinemage-html-candidate-headed-review-20261008.md)。

原结果支持 owned 进程退出和端口 4328 释放；顶层 exit 0、额外端口扫描来自 Grok/用户交接，缺独立原始退出日志，不包装成主 Agent 实跑。200% 为 CDP 模拟，forced-colors 为 Chrome 模拟，不关闭原生菜单、人工焦点、真实读屏/触控/移动设备或 Windows 高对比度。

截图保存后有旧 notice 残留与 exitEdit 固定“退出编辑未保存”文案，旧包同样存在；版本与正文回读通过不等于提示准确性通过。原 25 项未覆盖此文案，观察另存，未改运行包以免改变本次候选对象。

## 保持开放及停止重复的边界

- 原 null-source 余下 **6 包/8 路径**：safe-execa 0.3.0、render-help 2.0.0、agent-base 7.1.4、http-proxy-agent 7.0.2、https-proxy-agent 7.0.6、socks-proxy-agent 8.0.5。缺固定源码关联，既有 gitHead 缺失/attestation 404 保留；无新增可核验材料时不再重复查询、猜 main/tag 或编译。
- SDK 分发 BLOCKED，EMBED-INLINE-BYTES / 嵌入组成账本 PARTIAL；产品默认字段仍 NOT_VERIFIED，八条顶层门禁无新增 PASS，release_ready=false。完整包身份、撤销、native、资源解析、干净主机、最终签名及上游公告分别沿用原门禁，不由本次变换冒领关闭。7 版本/29 公告没有重查。
- 当前组合缺真实、授权的 WSL2 目标、访问入口和独占目录，正式 source/terminal/browser 为 NOT_RUN，未生成 input-v5/platform receipt。Docker aarch64 不能代替原 validator 合同。正式 journal 仍 seq 3 / CANDIDATE_SERVICE_ARTIFACTS_VERIFIED；本地 headed 不是正式目标 browser 事件。
- 正式 CI、真实模型/业务/生产、standalone 页面包、probe 外审以及原 stop/go 输入仍未关闭；没有第三次外审、旧全量 B0/服务/shell/查询/更新/bundle 重跑。物理分仓、各仓发布、DSH 升级保持原 stop/go。

本轮并行边界为 A 三包、B 两包、C HTML 证据及 A 交叉审核，主 Agent 集成和逐字节复算；A 另对 B 进行只读审核。只对具体执行和证据范围给出结论，不将独立审核当成新增外部 OCR 通过。原始材料按显式清单在主树新增归档，未清理旧失败、运行缓存或业务数据。

## 归档与最终保护核对

本轮新增主树归档 `.context/archives/shinemage-grok-transform-20261008/evidence.tar.gz`，977 个明确文件、45,342,236 字节原始材料，压缩后 39,879,710 字节；SHA-256 `0d6c633a7ff27d67e2eb1d1c028dfd05a73b9b627f5127fef6244369a8919ec4`。归档后逐成员重新读取并校验摘要，全部一致。包含原固定源码/工具 tar、生成及编译输出、原失败/成功日志、12 张截图和独立审核；不递归复制运行会话、真实数据、全 store 或展开 node_modules。

A 审核 B、C 审核 A 均无身份/范围矛盾，主 Agent 独立复算 82 个 JS；交叉审核明确排除整包/声明等价/签名 provenance 的过度结论。报告及原始审核 JSON 均已归档。六棵受保护树的 HEAD/status 和 105 份原未提交文件保持；主树起始 34 份未跟踪证据未改，四个既有共享入口按本次实际结果更新。candidate.json、插件 tar、journal、固定 DSH 上游 HEAD/index/锁/status 全部保持。
