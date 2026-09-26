# T4 release trust contract evidence（2026-09-26）

实现提交：fb126a61。

本地合同现在要求：

- protected tag 必须是 refs/tags/dsh-*，且 tag target、reviewed SHA、source SHA 三者一致；
- 必须提供非空 approval_ref；
- publication sidecar 必须是 PUBLISHED_VERIFIED、draft=false、immutable=true；
- publication 必须绑定 release_tag、source/reviewed SHA、manifest/SHA256SUMS/evidence index SHA；
- asset 名称必须唯一，required asset 缺失或重复时拒收；
- CI evidence workflow checkout 明确 release tag，并校验 tag 指向 reviewed SHA 和干净工作树。

验证：trust tests、publication schema 和 workflow YAML 均通过；aggregate release tests 48/48 PASS。OIDC/Sigstore 签名验证、GitHub protected tag/branch 仓库设置、真实 GitHub Release 和人工批准记录未执行，仍为 NOT_AVAILABLE/NOT_RUN；T4 保持 PARTIAL。
