# 页面 HTTP 子进程生命周期

`scripts/dsh-dev/page-http.mjs` 的 `startPageHttp()` 拥有本次创建的单个 Python 子进程。调用方接口保持 `{ base, token, child, stop }`，本轮不改变 Python 页面服务的身份、数据绑定或端口限制。

## 停止语义

启动失败、取消和显式 `stop()` 使用同一个停止 Promise。重复调用不会创建第二个清理流程。

停止先发 TERM。宽限期结束后，若进程仍未退出，则向同一个子进程发 KILL。清理等待该 ChildProcess 的 `close` 事件，再完成 Promise；`error` 或“已发出 KILL”都不是关闭证明。提前关闭会撤销升级定时器。

传入的信号已取消时，不创建子进程。目录创建后再次检查取消，启动等待和成功返回前也检查取消。成功返回后，取消信号仍会触发同一停止流程。

## 修复与回归

旧启动失败路径只发 TERM 并最多等待两秒。若进程忽略 TERM，启动函数会抛错，但进程仍在运行，调用方又拿不到服务句柄。旧正常停止路径发出 KILL 后也未等待关闭。预取消则仍可返回已启动服务。

新增实际子进程回归先得到三项预期失败，再修复源实现。另补服务就绪后的取消和执行器启动失败覆盖，不用复制实现或模拟 kill 返回值代替进程检查。

本地固定 Node 24、Python 3.14 环境的三文件回归为 21 PASS、0 FAIL、0 SKIP：

```sh
DSH_DEV_PAGE_PYTHON=/absolute/python3.14 node --test --test-concurrency=1 \
  scripts/dsh-dev/page-http.test.mjs \
  scripts/dsh-dev/start-installed-profile-core.test.mjs \
  scripts/dsh-dev/supervisor.test.mjs
```

新增反例使用临时可执行夹具和自有 loopback 端口。夹具忽略 TERM，分别提供未就绪 503 和已就绪 200；测试检查 PID 消失及可观察的 `close`。测试仅截获真实 spawn 返回的句柄来确保兜底清理仍有 owner，不伪造进程退出或 HTTP 结果，不按已回收的裸 PID 强杀。原 Python 测试仍验证未认证 401、页面创建、保存和回读，不把空绑定的 `UNBOUND_SAMPLE` 当作真实业务验收。

## 能力边界

只管理当前 launcher 持有的直接子进程，不按端口或全局进程名清理，不改变其他 launcher 的关闭语义。不承诺回收任意后代进程树。严格等待 close 可能在操作系统拒绝终止或后代持有管道时持续等待，不把超时静默当成已关闭。

本轮没有启动杭州实例、合并 PR 或切换现役。可信 CRM 身份、真实结果 resolver、完整聊天和看板编辑链路仍需单独验收。
