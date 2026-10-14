# M2-07 compact closure 原生 ABI 静态复核（2026-10-14）

本轮对 compact closure 中 9 个 Mach-O/PE 原生对象执行只读格式头和动态依赖检查：Mach-O 使用 `otool -L`，PE 使用 `objdump -f`。没有执行任何二进制，没有加载动态库，也没有改变 closure 字节。

## 结果

- 对象：`9`
- 格式头命令成功：`9/9`
- Darwin arm64 目标匹配：`4` 个当前架构对象；其余为明确的 Darwin x64、Windows arm64/x64 和 Win32 变体
- Mach-O 动态依赖：仅记录系统库和已声明的 `@rpath` 项
- 报告：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-native-abi-20261014.json`
- 报告 SHA-256：`5b9ca48177a6c6335f60fdc4cc0bbc3f6f5bb3240d1769bc5e2c0956ea257af9`

## 门禁边界

这关闭了原生文件的格式头可读性和架构归类子项。它不等价于执行安全、ABI 兼容矩阵、代码签名、发布者身份、撤销验证或二进制语义审计；Windows/Darwin 非当前目标变体仍只作为归档内容保留。M2-07 继续保持 `BLOCKED`，`release_ready=false`。
