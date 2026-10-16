# M2-07 opaque 对象 source archive 绑定（2026-10-14）

本轮继续核对 compact closure 的 18 个 opaque/native/font 对象：每个对象的 audit SHA 是否等于 closure manifest 中的文件 SHA，以及 closure 的 `source_archive_sha256` 是否与 compact archive pack receipt 的来源摘要一致。

结果：`18/18` 文件 manifest 摘要一致，source archive 摘要一致。

- closure SHA-256：`6d27be924873ca88061beb59a1103164711b4468ba15a6d5f36ef41296582a1b`
- source archive SHA-256：`969de1d098a07971a34635cd20d93b30051efdad7eac6d125e2f57847c3559bf`
- compact archive SHA-256：`17bdc6cf14731f47a459cbaf455bd8cbe011f516787d9839847372a931b0d54c`
- binding report：`.context/checks/dsh-upgrade-0.2.1-alpha.2-20261013/candidate-sdk-opaque-source-binding-20261014.json`
- binding report SHA-256：`c04ea5db6fc1cb1de1e6dec8b358d5a9bd72e5bab4a56b48e1943c5280f435d8`

这证明对象字节来自固定 closure manifest，并且 closure 绑定到固定 source archive；它不等价于 registry integrity、二进制语义安全审计、发布者身份、签名或撤销验证。M2-07 整体继续保持 `BLOCKED`，`release_ready=false`。
