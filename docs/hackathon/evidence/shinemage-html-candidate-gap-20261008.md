# HTML 新旧包与最小剩余验收核对（2026-10-08）

**没有新增 UI 功能差异。** 本次直接读取旧包 `ecaa86ddd41a88e563ae411be08897aeadb3a2ef408c00377f2b905dfaecae42` 与当前 candidate 包 `b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b`：两包均为8个普通成员，5个运行JS、依赖清单、Cordis配置共7项逐字节及mode相同；唯一差异是 package.json 删除 build、test、test:html-edit、test:built 四个开发脚本，其余解析字段相同。

当前 candidate `993daf31…` 的正式链仍须自己的 receipt。旧 headed 25/25 **只能作为同运行代码的历史参考，不能直接继承 PASS**。不因身份关联缺口新增功能、改变验收合同或重跑原包。产品仍 PARTIAL、release_ready=false。

## 旧25项可参考到哪里

已读取原始 results.json 和 execution-inputs.json，而非只读摘要。其runner `de75f75c…`、6份探针/夹具文件、4份登记的后端HTML夹具代码与当前集成树相同。

| 旧观察范围 | 可引用范围及边界 |
| --- | --- |
| 打开HTML、键盘进入编辑/嵌套选择、编辑阻断、取消/保存回读、回退v3、焦点/Tab/Escape、切页草稿隔离、绑定HTML/CSS限制、窄屏尺寸/非颜色状态 | 相同运行字节的行为参考；当前包每一行结果仍NOT_RUN。没有代码差异要求另造新用例 |
| immutable receive/peer link、headed启动、无未处理错误及清理 | 绑定包与执行会话；声明新candidate通过前须有其自身实际记录 |
| zoom-200、forced-colors | 原记录是CDP/Playwright模拟，不能替代原生菜单缩放或Windows高对比度 |
| 原包另一次原生200%重排 | 仅属ecaa86包；不包含View菜单点击、200%下Tab焦点或真实读屏 |

完整25行逐项分类见机器记录；没有把任何旧PASS写成当前候选PASS。现有完整headed入口若后续用于新候选，继续使用原runner；不用新造缩减探针来凑通过。该HTML夹具观察也不能代替正式first-purchase服务组合或journal链。

## 输入差异与原定剩余事项

旧author/source清单574项仍与原镜像一致；当前清单576项，其中558同字节、16变化、2新增。唯一src改动是fixture-loader登记两个合成预期结果摘要，其余为测试夹具/适配/来源记录；均不进入上述运行包。逐路径旧/新hash列于JSON。旧input的head、包、源码与author镜像不能只改一个摘要后重用；需要新建真实对应当前576项的author/input，保留旧input。

| 原定剩余项 | 精确输入与当前限制 |
| --- | --- |
| 当前候选headed/正式身份 | b75包、candidate993daf、现有de75 runner、Node24.19.0/Python3.14.4、固定官方rc2/477b4f42；新author/input尚未准备。新回执不得沿用旧25项事件 |
| View菜单 + 原生200% Tab焦点 | 可精确路由的owned隔离窗口；现有CUA路由缺口仍在，不重复启动/试错，不用JS focus或Emulation替代 |
| 真实读屏、真机触控/移动、Windows高对比度 | 各自实际隔离环境/设备仍未提供；模拟记录不抵扣 |
| standalone原测试 | 用户提供绝对COCKPIT_EXAMPLE_PACKAGE；页面已有RevenueReview.setScope/state、#kpiGrid/#chartBars。只用html-rendered-text.test.mjs的原named test；不重新搜索或制作替代页 |
| probe外审 | 已有两次timeout，未关闭；不第三次续跑，人工/delegate不抵扣 |
| D15正式目标链 | 沿A线既有first-purchase-source-http-local、f9726f68服务、993daf/b75输入；真实source HTTP成功后生成新v5，再走原目标terminal/browser。已通过的本机terminal不重复，不当成目标/正式CI通过 |

原业务切片仍是原生DSH会话→first-purchase问题→绑定worker→权限/来源结果→成功或取消/UNKNOWN→按服务准入明确保存；cockpit仅为同候选后续断言。原三类输入为受支持首购问题、拒绝导出手机号/发短信、缺范围需澄清。HTML旧25项不是这条业务链的替代物。计划页首快照政策已替代旧年龄失效条款，本次不重新提出freshness时限或新功能。

实际包路径、5份运行JS摘要、candidate/profile/service身份、解释器/runner路径、25行分类和源码18项差异见 [shinemage-html-candidate-gap-20261008-validation.json](shinemage-html-candidate-gap-20261008-validation.json)。原始比较：[comparison.json](/Users/hutou/.codex/worktrees/shinemage-html-remaining/fuqing-crm-analytics/.context/checks/html-candidate-gap-20261008/comparison.json)。本次只读比较并写本树证据；没有启动浏览器、DSH、服务或测试，没有重试CUA/OCR，没有访问真实模型/业务/生产，也没有修改产品、candidate或journal。
