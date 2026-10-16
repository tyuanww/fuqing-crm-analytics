# M2-07 SDK opaque/native 内容清单（2026-10-14）

本轮对现有 alpha2 closure 中内容审计标记为 `binary-or-nontext` 或 `native-or-wasm` 的对象补充 `file(1)` 类型识别和原始 SHA-256。这里只做清单和来源固定，不把不可文本审计对象自动判为安全。

## 结果

- closure：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- coverage gaps：`18`
- auditor：`a9acb88943d56f68ac841a324adc309f8cc25396be087d0b2c245e29bbc5a210`
- 原始内容审计：`PARTIAL`，findings 为 0；本表补充了文件类型和摘要。

| 路径 | 原因 | 文件类型 | SHA-256 |
|---|---|---|---|
| build-tools/node_modules/.pnpm/rc-tree-select@5.27.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tree-select/assets/icons.png | `binary-or-nontext` | PNG image data, 160 x 97, 8-bit/color RGBA, non-interlaced | `b4c2be6c3138cbd3e1a53c589befdec96cc37001af1110a1806e3e55f9c8b5e4` |
| build-tools/node_modules/.pnpm/rc-tree-select@5.27.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tree-select/assets/loading.gif | `binary-or-nontext` | GIF image data, version 89a, 16 x 16 | `f627b902dbb57bcca1ab7ccba32a015c45d2c84cae719ca5626993d7ced3c428` |
| build-tools/node_modules/.pnpm/rc-tree-select@5.27.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tree-select/assets/minus.gif | `binary-or-nontext` | GIF image data, version 89a, 9 x 2 | `b7d92aaf29b3e825c5965cbf8d670f066739c5e146e58530da208424692e8881` |
| build-tools/node_modules/.pnpm/rc-tree@5.13.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tree/assets/icons.png | `binary-or-nontext` | PNG image data, 160 x 97, 8-bit/color RGBA, non-interlaced | `f7e96c5ba44df741ea5b15501eb0b468160e9ab6e0b956b386c523ef82c9c856` |
| build-tools/node_modules/.pnpm/rc-tree@5.13.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tree/assets/line.gif | `binary-or-nontext` | GIF image data, version 89a, 9 x 2 | `b7d92aaf29b3e825c5965cbf8d670f066739c5e146e58530da208424692e8881` |
| build-tools/node_modules/.pnpm/rc-tree@5.13.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tree/assets/loading.gif | `binary-or-nontext` | GIF image data, version 89a, 16 x 16 | `f627b902dbb57bcca1ab7ccba32a015c45d2c84cae719ca5626993d7ced3c428` |
| corepack/v1/pnpm/11.28.2/dist/node_modules/@reflink/reflink-darwin-arm64/reflink.darwin-arm64.node | `native-or-wasm` | Mach-O 64-bit dynamically linked shared library arm64 | `0cf6caf1b125009161c98e7fb39d996da26548b09e7b17d7688357f9c3b97a02` |
| corepack/v1/pnpm/11.28.2/dist/node_modules/@reflink/reflink-darwin-x64/reflink.darwin-x64.node | `native-or-wasm` | Mach-O 64-bit dynamically linked shared library x86_64 | `e107629c8000ad509954bdc84e4bb8fec38453c210d8a4370a9fadb28aff5b97` |
| corepack/v1/pnpm/11.28.2/dist/node_modules/@reflink/reflink-win32-arm64-msvc/reflink.win32-arm64-msvc.node | `native-or-wasm` | PE32+ executable (DLL) (GUI) Aarch64, for MS Windows | `b7c3fe5620ead8872593acd949fac7bb4d860ec015e320f7e117260fa3b12d96` |
| corepack/v1/pnpm/11.28.2/dist/node_modules/@reflink/reflink-win32-x64-msvc/reflink.win32-x64-msvc.node | `native-or-wasm` | PE32+ executable (DLL) (GUI) x86-64, for MS Windows | `370cdee825881d1f0c3e87a85df5589ee51f1a7eec3bca3c252255b6521224dc` |
| corepack/v1/pnpm/11.28.2/dist/vendor/fastlist-0.3.0-x64.exe | `native-or-wasm` | PE32+ executable (console) x86-64, for MS Windows | `d1a71f9ac1728082c1b276392725c3e010b98714888579b99152e401abedbf11` |
| corepack/v1/pnpm/11.28.2/dist/vendor/fastlist-0.3.0-x86.exe | `native-or-wasm` | PE32 executable (console) Intel 80386, for MS Windows | `017411f3b0b5c0402cc3b2cb87c32c6fc71abd82e5b17ea6108990096c75a65d` |
| upstream/node_modules/.pnpm/@esbuild+darwin-arm64@0.25.12/node_modules/@esbuild/darwin-arm64/bin/esbuild | `binary-or-nontext` | Mach-O 64-bit executable arm64 | `3e030ee2aa86ad3c33e5e95ae0e53bb03de40e0da35c9b1180a67de4a497cae5` |
| upstream/node_modules/.pnpm/@koromix+koffi-darwin-arm64@3.1.1/node_modules/@koromix/koffi-darwin-arm64/darwin_arm64/koffi.node | `native-or-wasm` | Mach-O 64-bit dynamically linked shared library arm64 | `571168fbd60ffe51953b82e305cd721da603577649e8e58584f25233012253be` |
| upstream/node_modules/.pnpm/node-addon-require-builtin-darwin-arm64@0.1.9/node_modules/node-addon-require-builtin-darwin-arm64/prebuilt/darwin-arm64-napi-v9.node | `native-or-wasm` | Mach-O 64-bit bundle arm64 | `93947abf5edc337b9b2b20267e1b99a26a3a5616dc857f1c2b67122d0057c752` |
| upstream/packages/client/ui-theme/lib/styles/montserrat-light.woff2 | `binary-or-nontext` | Web Open Font Format (Version 2), TrueType, length 61548, version 9.0 | `da25f1327eb1dcc70c193897b5d7e00d31821d9518c0a49e073ff50d97a3f10a` |
| upstream/packages/client/ui-theme/lib/styles/montserrat-medium.woff2 | `binary-or-nontext` | Web Open Font Format (Version 2), TrueType, length 62148, version 9.0 | `8a81ca6f05cb6831d5487e4b287ce5a625a718c39226b736f155900adc394166` |
| upstream/packages/client/ui-theme/lib/styles/montserrat-regular.woff2 | `binary-or-nontext` | Web Open Font Format (Version 2), TrueType, length 62008, version 9.0 | `0f4a15e29a9535af580a64db967929a8d6b202fad9a467be390619a591d2c4c5` |

## 门禁边界

清单确认了 18 个对象的字节摘要、文件类型和 closure 来源，但没有完成二进制反编译、原生 ABI 审计、发布者签名绑定、撤销验证或干净机器安装。因此 `opaque_content` / `native_content` 仍不是通过状态，M2-07 继续保持 `BLOCKED`，`release_ready=false`。
