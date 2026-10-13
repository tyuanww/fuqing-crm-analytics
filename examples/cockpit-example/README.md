# Revenue Review standalone 页面包

这是仓库内维护的 `free-page/v1` standalone 页面包，用于 M2-05 的真实页面与浏览器验收。它是可运行的 source-owned 页面工件，页面内明确标注“示例数据、未绑定经营数据”，不代表 CRM、模型或 WeKnora 的真实业务结果。

页面包路径：

```text
examples/cockpit-example/revenue-review.package.json
```

使用方式：

```sh
export COCKPIT_EXAMPLE_PACKAGE="$PWD/examples/cockpit-example/revenue-review.package.json"
```

来源身份以 Git 中该文件的提交和 SHA-256 为准：

```sh
git log -1 --format='%H' -- examples/cockpit-example/revenue-review.package.json
sha256sum examples/cockpit-example/revenue-review.package.json
```

页面提供 `window.RevenueReview.setScope('all'|'weekend')`，用于验证动态重绘后编辑文案仍能保留；所有数据是页面内部示例值，没有 CRM 查询、网络请求、凭据读取或写入操作。
