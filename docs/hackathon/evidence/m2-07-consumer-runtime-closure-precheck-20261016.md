# M2-07 alpha4 consumer runtime closure 预检查（2026-10-16）

## 结论

当前 CRM plugin tarball 的发布 manifest 已把 `katex` 放在 `dependencies`。这支持“由最终消费者提供 runtime dependency”的方向，但还不能替代公司环境的 production-only install 和完整 dependency graph。

```text
status=LOCAL_CONSUMER_MANIFEST_PRECHECK_PASS
release_ready=false
```

## 输入

```text
package=@shine-mage/dsh-crm-knowledge@0.0.0-crm.1
tarball=.context/checks/dsh-upgrade-0.2.1-alpha.4-20261016/formal-packs-r2/shine-mage-dsh-crm-knowledge-0.0.0-crm.1.tgz
tarball_sha256=0954f1c9b66ff46151a20500132a370760c2383755a9c7faaacafc9bca474e06
```

## 发布 manifest 检查

从 tarball 的 `package/package.json` 读取到：

```json
{
  "dependencies": {
    "katex": "^0.18.7"
  },
  "devDependencies": {
    "@shine-mage/dsh-plugin-kit": "0.1.0"
  },
  "peerDependencies": {
    "@deepseek-ai/dsh-tools": "0.2.1-alpha.4",
    "@deepseek-ai/cordis": "4.0.2"
  }
}
```

检查结果：

```text
dependencies.katex=^0.18.7
devDependencies.katex=absent
manifest_check=PASS
```

## 公司环境必须补做

1. 使用正式 plugin tarball 执行 production-only install。
2. 提供正式 peer packages 或公司批准的 packed inputs。
3. 验证 `katex` 和 `katex/dist/katex.min.css` 可以解析。
4. 生成完整 dependency graph 和 SBOM。
5. 将结果绑定到最终 SDK artifact SHA。

本预检查不证明官方 `ui-primitives` 独立包 closure 已通过，也不生成正式发布材料。
