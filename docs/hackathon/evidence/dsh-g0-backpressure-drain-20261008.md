# 并发验证失败与请求回收（2026-10-08）

本次沿用 `codex/plugin-boundary-review`，基线为 `5bf2bc77bde1e00ae82832a8b5aa2d6726563e38`，保留已有六项文档修改。用户授权并行推进剩余实施；本页记录主 Agent 对并发验证器的实际修复，不将其计作生产容量、SLI 或十次插件更新演练。

## 缺陷与修复

`scripts/release/backpressure.mjs` 原实现把任务失败立即传给外层 promise，但每个任务的 `finally` 仍调用派发器：首个失败后继续启动排队任务，其他已启动请求未结束时调用方已经得到失败。`local-verify` 等调用方随后清理自己的 HTTP 服务，会与这些请求产生竞态。

现在锁定首个失败、停止后续派发，等待所有已启动任务结束后再返回该失败。成功结果仍按输入顺序返回，原 scope/status/发布门禁保持。`undefined` rejection 也按失败处理，不能通过真假值检查重新打开派发。

任务本身仍须有界；验证器不承诺取消任意挂死 callback，也没有以等待回收代替生产请求超时策略。HTTP 回归使用独有 loopback 服务和 4 秒请求时限，`local-verify.mjs` 的真实调用也加5秒请求时限并读完响应；这些时限只属于本地验证夹具。清理仅关闭该测试拥有的连接与服务。

## 当前验证

使用已有 Node 24：`/Users/hutou/homebrew/opt/node@24/bin/node`。

```bash
node --test --test-reporter=spec scripts/release/backpressure.test.mjs
node --test --test-reporter=spec scripts/release/backpressure.test.mjs \
  scripts/release/operator-gate.test.mjs scripts/release/local-verify.test.mjs \
  scripts/release/cli.test.mjs
node --check scripts/dsh-b0/pipeline.mjs
```

- 修改前前四项回归实际为 **1 PASS / 3 FAIL**：继续派发、未等待在途任务、空 rejection 后继续派发。原日志和 Git 原字节保留。
- 修后增加真实 HTTP socket 失败场景，真实调用有界后重新执行最终相关套件 **21 PASS / 0 FAIL / 0 SKIP**，其中新回归五项。验证首次同步失败、多个异步失败、空 rejection、乱序成功及 HTTP 在途请求回收；CLI 的 local/release scope 与 operator 门禁均保持。
- 新回归已加入现有 B0 pipeline 的显式清单；`pnpm dsh test` 的 release 测试发现机制也会收取此文件。pipeline 语法检查通过，**完整 B0/release pipeline 未在本项重跑**。

## 原始证据与来源

目录：`.context/checks/parallel-next-20261008-r1/`。

| 证据 | SHA-256 / 说明 |
|---|---|
| `backpressure-original-source.mjs` | `d68d5d48f9cbccc276a5d3864d31462140450a2ea9e25a6f35e00ff0236fbdde`；从本次 Git HEAD 读取的修前源码 |
| `backpressure-original.log` | `d5ed3baf8dadb9967a8a3de72e8af166a900f07eb07bde566c6d9aba6845c40c`；实际原失败 |
| `backpressure-http-repaired.log` | `a12069709a1d714423e11ecd45796cf70d326dc41d5a1fbb4573536cd70d9f9f`；修后首轮21项结果 |
| `backpressure-local-bounded.log` | `b080db397f7bf063dddedd15670a2e754a5ad2fec4cfeec52d9804d170429e03`；HTTP调用有界后的当前21项结果 |
| 当前 `backpressure.mjs` | `188d9c672dcab57660fbe7c35ec674b8ab22cbf7483e96ad87860ef55313c7df` |
| 当前 `backpressure.test.mjs` | `cdae6ce5c54050d1873461c95db1d1229101b1da784732849b9f21015423d030` |
| `backpressure-result.json` | 源码/日志摘要、范围、失败与通过计数；pipeline 最终摘要以集成复核为准 |
| `charter.json` | 本轮工作树、并行边界、原 candidate/journal/pin/领域包保护摘要 |

本项关闭调度器失败后清理竞态。**T10/T16/T18 的业务负载、15分钟 SLI、十次独立插件更新和生产容量仍 NOT_RUN/PARTIAL；产品 PARTIAL、release_ready=false。** 未更换 DSH 上游、runtime 或生产 active 指针。
