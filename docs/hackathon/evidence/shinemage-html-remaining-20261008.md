# HTML 既有剩余验收接续（2026-10-08）

本轮在独立任务树 `shinemage-html-remaining/fuqing-crm-analytics`、detached HEAD `8aabaaeb8d0e22a351088e1daefc164a5c0a2d09` 上接续。源码没有修改，没有 commit、push、PR、合并、发布或部署。

结论：新包的隔离 synthetic 宿主已启动至 READY；**原生 View 菜单点击、200% 下 Tab 焦点观察仍 NOT_RUN**。阻塞来自原生控制工具无法定位本轮隔离 Chrome 实例，不能操作用户个人窗口来代替。没有新增验收通过项。

## 固定对象

- candidate：`993daf31daa79137c22ce8d16c84b61892117386a9b7b8c5119fa0be62abefb0`。
- candidate 源码：`bd647352d02402c679b04172855e40ec8f2d96a5`。
- 新 tarball：`b75d90e98167fea507e8ab3304beda98c6706d7130eb8eb4e6359209ad0fff1b`，438,511 字节。运行前后摘要一致，8 个成员摘要在 JSON 中。
- 固定上游：DSH `0.1.7-rc.2` / `477b4f420553e8a52c2fbccc464d7561b239c443`，只读复用原 built CLI。
- Node `24.19.0`、Python `3.14.4`、隔离 Chrome `154.0.8037.98`。

沿用原 HTML 观察的 synthetic HTTP/宿主 fixture 与模型 stub，仅把新 tarball 安全解到本任务自有目录。这个 fixture 不是正式 `first-purchase-source-http-local` 服务组合，也不是缺失的 standalone 页面包。没有读取真实业务库，没启动任何现役服务。

## 两轮实际记录

原始目录：本任务树 `.context/checks/html-remaining-20261008/`。

1. `controller.mjs` / `run-r1/result.json`：拟用 19348/19349，在启动前被现有 `assertFree` 端口白名单拒绝。无进程启动。这是观察控制器输入不合规，不是产品失败；没有放宽 guard。
2. `controller-r2.mjs` / `controller-r2.log` / `run-r2/ready.json`：先核验允许端口 4328/4329 空闲，再启动自有 HTTP fixture、宿主和隔离 Chrome；结果 `OWNED_HOST_READY`。隔离 profile 从 100% 开始，拟通过原生菜单操作到 200%，实际尚未进入菜单步骤。
3. 原生 CUA 的 `getApp("Google Chrome")`、完整应用路径、`listApps` 和 `getState` 均只暴露用户预先存在的 Chrome 与其 extension tabs，未暴露隔离实例。没有向该个人窗口发送点击或按键，也没有归档其页面内容。
4. 尝试只读采样本轮隔离页；未得到结果，后续本轮调试端口 `/json/list` 返回空列表。没有获得新截图或页面尺寸，因此截图清单为空，不能以旧图替代。
5. 控制器停在只读快照等待后，按 PID 与命令路径核验归属，仅终止本轮 fixture 5202、宿主 5227、Chrome 5270 和控制器 5161。`run-r2/cleanup-manual.json` 保存操作；最终这些 PID 均退出，4328/4329 无监听。

本轮 UI 输入动作数为 0；没有 JS `focus()`、样式注入、CDP `Emulation.*`，没有把自动化未执行写为人工键盘通过。未修改产品探针的 `browser_zoom_ui` 字段、candidate 或 journal。

## 保持开放的项

原生菜单点击和 200% Tab 焦点观察需要一个能精确绑定隔离 Chrome 窗口的受支持输入接口，或在该隔离窗口中的实际人工操作；两项继续 `NOT_RUN`。不需要因此修改产品源码。

真实读屏、真机触控/移动设备、Windows 真实高对比度、standalone 页面包、真实模型和生产验收仍未执行，没有重新搜索或构造替代页面。HTML probe 外审没有第三次续跑；五项已完成外审仍按原记录有效。

原 `ecaa86…` 包 headed 25/25 仍归原对象，本轮没有重跑、继承或改写。新 `b75d90…` 候选 headed 验收仍 `NOT_RUN`，`release_ready=false`。完整 B0、服务专项、shell/tool、查询冷安装和十场更新均未重跑。

[机器核验与原始摘要](shinemage-html-remaining-20261008.json)记录当前输入、控制器日志、失败、清理结果和引用文件摘要。
