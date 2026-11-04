# 标题、交付入口与知识库收尾

本轮继续处理 H1 真实验收后的开放项，不重跑已通过的七来源诊断。产品仍为 PARTIAL，release_ready=false，未合并 PR、未切杭州公网。

## 代码和验证

Workbench `f7a39d3` 补齐已有 HTML marker 的编辑映射，显式映射优先，绑定事实保持只读。`b72487a` 让聊天卡接收候选后直接进入持有草稿的驾驶舱；实际离开和覆盖已有候选仍受保护。两项回归先复现失败，再修复。106 项定向测试及完整类型检查、构建通过。

真实新页接收复验又确认，保存回执的 acceptSpec 与重开的 hydrateSpec 处理不同。`d913bb6` 在保存回执复用同一映射补全，覆盖刚保存和重开。独立复核发现重开测试的空 overlay 回执未实现、导致沿用旧对象的假绿，已补明确回执及返回值、新对象断言。复核确认该 P2 关闭。

新页确认保存后还曾被默认打开逻辑切回旧页。最终 `e20a0fea` 让默认打开遵守当前选择、候选、草稿和正在进行的读取；初始缓存仍可打开，失败读取不自动重复。四类场景的行为回归及完整 library-workspace 94 项通过。

远程作者 CI 首次失败于测试分层和旧源码断言。`4238546` 将 Chrome 事实验收纳入已有显式 browser 阶段，由 runner 创建独立证据目录；事实纯逻辑测试仍在 core。`51d96e6` 删除强制错误进入保护的源码字符串断言，编译客户端的行为回归保留。最终作者 core 为 1386 passed、0 failed、0 skipped，类型检查、构建和严格包读取通过。browser 和 standalone 阶段未由 core 命令执行。固定输入 CI `40569491900`（PR #12）及 `40572186294`（PR #13、e20）均成功。

以上审核均为本机 Codex CLI 的同模型独立只读审查，不能称跨模型审核。当前两份草稿 PR 分别为 [宿主事实区 #12](https://github.com/tyuanww/dsh-analytics-workbench/pull/12) 和 [编辑与接收 #13](https://github.com/tyuanww/dsh-analytics-workbench/pull/13)，依赖顺序为 #11 → #12 → #13；主仓 facts 接口须先于新事实面板部署。

## 隔离知识库

现有 WeKnora 18092 健康正常。隔离准备脚本此前明确移除了 query preset 的 weknora-retrieval，因此会话只有 CRM 与页面工具。此次仅为原问数 preset 加回固定 release 路径的受限检索模块，原 persona 和其他插件保持。没有复制凭据或使用 current 浮动路径，没有改公网模块。

固定模块和 scope 文件摘要与 config/weknora-production-overlay.v1.json 一致。只开放项目知识库的搜索和文档读取；不列租户知识库，不做租户级文件名查找。21 项本地 scope 回归通过。模块预检返回两条命中并读原文，随后真实 DSH 会话实际调用 crm_service_health、weknora_search 和 weknora_read_document，返回八段检索结果并完整读取一份文档的 11 段原文。健康工具确认 LOGIN_BOUND、knowledge_base AVAILABLE/provider weknora。

knowledge_explanation 对应独立合成解释模块，在此会话仍未配置；它不表示 WeKnora 不可用。模型回答把二者视为不一致的文字不能替代工具合同。教材建议不能当作真实经营数字。

本次配置仍是 owner-operated 隔离接入，依赖已有固定模块和运行凭据配置，不是包含九插件的独立正式发布闭包。后续运行包必须显式保留这一运行依赖和项目权限边界。

## 当前真实 UI 结果

两文件批次只更新隔离 client.js 与问数配置并重启 19327 Web。page、source、CRM 和四项公网服务 PID 均保持。用户自行重连后，知识库真实调用通过。最后两次客户端更新使用官方 HMR，没有再重启服务；八项隔离与公网服务 PID 均保持，CRM 授权仍有效。

最终 e20 客户端在同一原问数聊天重新读取当前授权的 purchases H1 快照，生成小型回归页。点击真实工具卡后直接进入驾驶舱候选预览，无离开弹框；宿主读取五项真实事实，确认保存 v1 后标题立即可选。人工改标题保存 v2；原生 AI 对话改标题，经收取、预览、确认保存 v3，再切换产物、从列表重开 v3，均通过。

新页为 `page_cdab457ecac244e6b8a44fa8037d1161`。五项值与单位逐项匹配当前 ref 对应的持久化聚合快照。人工版本只在 h1 插入复核文案并补 copy-title 映射；AI 版本的 html、css、js、resources、node_map 均未改变，文案保存在展示 overlay。来源绑定清单全程不变。原七来源 H1 页保持 v3。

主仓正常 pre-push 的默认后端选集为 4072 passed、81 skipped、0 failed；前端构建和 236 项测试通过。服务包检查最初因验证解释器与 requirements-lock.txt 不同而失败，改用本轮完整锁定的独立环境后通过，未改全局环境。B0 先后拦住固定输入缺失、canonical_sources 漏带 page_facts.py、OpenAPI 夹具未同步和旧 B0 解释器依赖漂移。补齐来源及夹具、新建精确 25 项锁的独立 B0 环境后，`335bacbd` 完整 B0 通过；随后四分支正常推送在 `f723c9ca` 再次通过后端、前端与完整 B0。该次读取旧已版本化 Workbench 包，只证明接口兼容。

## 仍开放

重新登录后，旧 H1 v3 的七个来源返回 NOT_FOUND。CRM Host 清理旧 captures/refs，新登录创建新的 connection_generation；来源服务也校验代次。这是当前防重放与撤销边界，不能通过删除代次校验恢复旧引用。

目前没有旧看板来源的显式重新授权/刷新绑定流程。当前授权的新查询可以生成和保存新页，但不能据此说旧页跨重登可续编。后续应在保留当前账号、会话、来源摘要与撤销校验的前提下，设计重新授权并由用户确认保存，不能静默读取或换绑。

最终组合的远程运输 CI 已通过，真实归档 20 个成员逐字节回读并严格接收。新 e20 组合的 B0、主仓完整运行候选包与主仓远程 CI 仍待完成，见[组合接收记录](dsh-host-facts-composition-20261028.md)。作者 CI 成功不替代组合或完整运行包门禁。缓存全筛选与现役预热本轮未复验，不得以本轮 core 测试或小页验证替代任意筛选、跨重登或全项目验收。

原始证据保留在 /private/tmp/dsh-fact-mapping-20261028/ui-closeout/，含红绿回归、CLI 审核、严格构建、隔离安装回执、真实知识工具记录、历史来源失效与接收预览 AX。真实聚合数据、浏览器截图和凭据不写入公共源码。
