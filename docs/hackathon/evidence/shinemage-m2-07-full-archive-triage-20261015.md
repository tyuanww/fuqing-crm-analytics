# M2-07 完整 development archive 命中与 coverage gap disposition（2026-10-15）

本记录对已有 alpha2 development archive 的完整内容审计结果做只读分类，目的是把 70 个 secret-pattern 命中和 827 个 coverage gaps 转换成后续处理队列。该 archive 属于历史 alpha2 开发输入，不是当前 rc2 正式 SDK artifact；本记录不提升 `release_ready`，不生成签名、attestation 或 release。

## 输入与完整性

```text
archive_sha256=969de1d098a07971a34635cd20d93b30051efdad7eac6d125e2f57847c3559bf
raw_report_sha256=9bccf6a50ed67dbe6459cf745b6866dc92d7bd1469b63a67c04b288ea5cf4a0a
triage_sha256=145ac724ed7804d78cffd6e7565d857b413423867403aa5d573ca0b8ae894245
derived_summary_sha256=26e0d824707f907982111ad127ac179c3a6a5f2cfaceab10d382465a4021c3f6
findings=70
coverage_gaps=827
status=BLOCKED
release_ready=false
```

原始报告和 triage 文件位于：

```text
.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-full-content-audit-20261014/report.json
.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-full-content-audit-20261014/triage.json
```

分类只使用路径、审计类别、模式类别、文件摘要和 coverage reason，不输出或保存任何匹配值。

## 70 个命中的分类

| 分类 | 数量 | 路径性质 | 处理决定 |
|---|---:|---|---|
| `assignment-non-synthetic` | 51 | 24 个测试/fixture，22 个已安装第三方内容，4 个 experimental/build，1 个 runtime source/script | 不能统一豁免；测试和不需要的开发内容从正式 artifact 排除，第三方内容保留时必须绑定最终 closure 和内容来源，runtime source/script 必须由 owner 复核 |
| `synthetic-assignment` | 7 | 全部位于测试/fixture 或 snapshot 路径 | 只能作为分类线索；当前完整审计规则仍 fail-closed，不能直接标记为安全 |
| `direct-secret-pattern` | 12 | 10 个已安装第三方内容，2 个测试/fixture | 必须逐项确认是否为公开协议/证书/测试样例；在 owner review 完成前保持阻断 |

直接模式命中细分为：

```text
private-key=8
aws-access-key=2
openai-style=2
```

路径性质的总量为：

```text
development-test-fixture=33
installed-third-party=32
experimental-source-or-build=4
runtime-source-or-script=1
```

assignment key 只用于审计分类，不代表发现值本身：`token=34`、`api_key=18`、`cookie=17`、`secret=14`、`apikey=9`、`authorization=4`、`password=3`。

## 827 个 coverage gaps

| reason | 数量 | 处理决定 |
|---|---:|---|
| `binary-or-nontext` | 728 | 以最终 artifact manifest、文件 SHA 和来源绑定为准；未绑定前不能进入正式分发 |
| `native-or-wasm` | 86 | 补充 owner、平台/架构矩阵、构建来源和最终文件摘要；跨平台执行未完成前保持阻断 |
| `file-size-limit` | 11 | 在正式 artifact 上使用有界分块审计或保留完整摘要，不能因超出文本限制而视为通过 |
| `git-object` | 1 | 开发 archive 内容；正式 artifact 应排除 Git object，或给出明确保留理由和来源绑定 |
| `nested-archive` | 1 | 需要展开后的来源和内容审计；未审计前不能进入正式分发 |

这些 gap 的根目录分布为 `upstream=809`、`corepack=12`、`build-tools=6`。它们是开发 archive 的覆盖结果，不等同于当前 rc2 closure 的 17 个 gaps；两套输入继续分开记账。

## 当前 disposition

1. 33 个测试/fixture 命中：作为正式 SDK 的默认排除候选，最终 artifact 生成时必须由 manifest 证明已排除；若有运行时依赖则转 owner review。
2. 32 个第三方内容命中：不能凭路径名自动豁免；保留在最终 closure 时必须有 package/source/SHA 绑定和内容审计结果。
3. 4 个 experimental/build 命中：默认不进入正式分发，除非最终 runtime manifest 明确声明用途并完成审计。
4. 1 个 runtime source/script 命中：需要 source owner 逐项确认，不能由本地分类自动关闭。
5. 12 个 direct-secret-pattern 命中：在确认是公开测试/协议材料并完成独立复核前，保持 `BLOCKED`。
6. 827 个 coverage gaps：在最终 artifact scope、provenance 和补充审计完成前，保持 `BLOCKED`。

## 结论

本轮完成了完整 archive 结果的逐类 disposition，避免把 70 个命中或 827 个 gap 统一降级成 synthetic 或忽略项。该工作关闭了“缺少分类”的本地证据缺口，但没有关闭正式 SDK 供应链门禁。M2-07 继续为：

```text
BLOCKED / FULL_ARCHIVE_SECRET_SCAN_BLOCKED / release_ready=false
```

下一步是对最终 rc2 artifact 重新生成正式 SBOM、内容审计和 provenance；alpha2 development archive 的分类不能替代当前 rc2 的正式签名、撤销、attestation 和干净机器回退。
