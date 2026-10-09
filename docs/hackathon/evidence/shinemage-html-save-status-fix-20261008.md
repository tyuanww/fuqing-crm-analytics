# HTML 保存状态提示修复（2026-10-08）

上轮当前 b75 包 headed 截图显示，版本和正文已保存，但界面仍显示“有未保存修改”和“退出编辑未保存”。本轮限定修复这处既有编辑流程错误，不增加功能、不改 DSH 上游、服务或数据库。

## 修改与验证

- `cockpit-workspace.tsx` 不再把 LeavePrompt 的暂态未保存提醒复制到长期 notice。原 LeavePrompt 保持三项选择和失败提示，处理结束后随协调器关闭。
- `free-html-library/store.mjs` 的干净退出改为中性“浏览中。已结束编辑”。busy/dirty 拒绝逻辑保持；退出本身不声称保存或丢失了修改。
- 新增三条行为回归：干净退出不虚报保存；停留后保存不残留旧提示；放弃后重新编辑保存不残留旧提示。React 用例核对原离开保护出现、停留/放弃未新增版本、最终保存仅新增一版并回读正文。

固定 Node 24.19.0，读取既有固定 rc2 工具链。新增三用例在修前 **0 PASS / 3 FAIL**，准确命中两处错误文案；原失败日志保留。修后完整相关四文件专项 **103 PASS / 0 FAIL / 0 SKIP**，退出 0，包括 React 交互、store、保存失败/409/503/网络丢失和离开协调器。它是编译后的 React/JSDOM 与状态单元验证，不是新的 headed、真实读屏、正式 B0 或远端 CI 通过。未重跑已有全量构建或 SDK 审计。

原始日志位于集成树 `.context/checks/html-save-status-fix-20261008/{before-tests,after-tests}.log`；机器摘要见[本次回执](shinemage-html-save-status-fix-validation-20261008.json)。

## 候选与目标边界

这是未提交源码修复。当前封存 candidate `993daf31…`、包 `b75d90e9…` 和 seq 3 journal 原字节保持；b75 的 25 项 headed 继续只属于旧封存包，不能当作本次修后源码的包验收。未重打包、生成候选或写 journal。后续提交/重建候选时需显式绑定新源码及其新包，不能修改旧证据。

用户新提供的 Tailscale 地址 `100.114.157.0` 经本机 daemon 精确匹配为 Self/macOS/MacBook Air。单次严格 SSH 在未知主机密钥处退出 255，远端命令未执行，known_hosts 未改。该地址不能满足 WSL2 validator；见[单目标核验](shinemage-target-address-check-20261008.md)。当前真实 WSL2 source/terminal/browser 仍 NOT_RUN，等待实际 Windows/WSL2 设备地址，不在当前 Mac 上继续重试。

SDK 既有 78 条变换证据保持，剩余 6 包/8 路径本轮未重查。SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false；未 commit/push/PR/合并/发布/部署。

独立四文件代码审核无待修问题；确认原本地与宿主 LeavePrompt 均保留，失败/dirty/unknown 保护未弱化。源码差异、失败及成功日志、审核和首次目标连接证据已归档至 `.context/archives/html-save-status-fix-20261008/`，20 个成员摘要全部核对一致。用户随后提供新地址 `100.93.46.46`，另行只读核验，不覆盖第一次地址识别记录。

第二目标单次连接已结束：在线 Linux 节点 `100.93.46.46` 拒绝现有 hutou 公钥登录，未执行远端命令。具体结果和下一输入见[SSH 预检](shinemage-target-ssh-auth-20261008.md)。
