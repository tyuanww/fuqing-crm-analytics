# 插件合成合同夹具

这些是共享协调合同及已发布Page API合同的原字节副本，仅随插件源码供测试使用，不进入运行时tarball。owner、合同版本、源路径、源提交及精确SHA见provenance.json；src/free-page/fixture-loader.mjs再次校验固定摘要，缺失/漂移硬失败，不搜索相邻仓库或AGENTS。

独立包的OpenAPI测试是对固定服务合同的conformance，不能证明当前backend生成一致性。主仓scripts/dsh-b0/package-inputs.test.mjs会逐字节比较受追踪的来源与本包副本，防止单侧更新静默过期；现有离线page-contract生成检查仍负责backend生成一致性。

更新合同须审查来源、本包副本、provenance与loader精确摘要，并运行resource/bridge/schema/source-index及仓库侧drift测试。不得改写夹具数据使测试通过；独立源码分发须包含此目录。
