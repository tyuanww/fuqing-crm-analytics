# M2-05 standalone 页面包 preflight（2026-10-13）

本轮只核对真实 `COCKPIT_EXAMPLE_PACKAGE` 输入是否存在，不生成替代页面、不运行 synthetic fixture、不启动服务，也不读取真实业务数据。

## 输入核对

在仓库根目录执行：

```sh
if [ -n "${COCKPIT_EXAMPLE_PACKAGE:-}" ]; then
  printf 'COCKPIT_EXAMPLE_PACKAGE=SET\n'
else
  printf 'COCKPIT_EXAMPLE_PACKAGE=UNSET\n'
fi
if [ -e "${COCKPIT_EXAMPLE_PACKAGE:-/nonexistent}" ]; then
  printf 'package_path=EXISTS\n'
else
  printf 'package_path=ABSENT\n'
fi
```

实际输出：

```text
COCKPIT_EXAMPLE_PACKAGE=UNSET
package_path=ABSENT
```

随后对受控源码、文档和脚本入口做定向检索。结果只有 contract、test fixture、历史说明和使用说明，没有可供真实 standalone 验收的页面包。现有 synthetic/历史 fixture 不能替代正式 `COCKPIT_EXAMPLE_PACKAGE`，也不能证明真实页面、读屏、键盘焦点或高对比度通过。

## 结论

- `COCKPIT_EXAMPLE_PACKAGE`：`MISSING_INPUT`；
- standalone 页面：`NOT_RUN_REAL_COCKPIT_EXAMPLE_PACKAGE`；
- 本轮没有伪造、下载、生成或修改页面包；
- M2-05 仍为 `PARTIAL_LIVE_BROWSER_PASS / CANDIDATE_BROWSER_STANDALONE_NOT_RUN`；
- 下一步需要用户提供可验收的真实页面包及其来源身份，再在 candidate-bound 目标上执行 standalone、读屏、完整键盘焦点和高对比度验收。
