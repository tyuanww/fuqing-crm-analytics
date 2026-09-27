# T4 release trust contract evidence（2026-09-26）

实现提交：fb126a61、2804dc21。

本地合同现在要求：

- protected tag 必须是 refs/tags/dsh-*，且 tag target、reviewed SHA、source SHA 三者一致；
- `approval_ref` 必须是 `run:<GitHub Actions run id>`，并由部署前实时 API 校验成功的 `dsh-release-evidence` protected environment run 绑定到 release tag 与 reviewed SHA；
- publication sidecar 必须是 PUBLISHED_VERIFIED、draft=false、immutable=true；
- publication 必须绑定 release_tag、source/reviewed SHA、manifest/SHA256SUMS/evidence index SHA；
- asset 名称必须唯一，required asset 未提供或重复时拒收；
- CI evidence workflow checkout 明确 release tag，并校验 tag 指向 reviewed SHA 和干净工作树。
- WSL install wrapper 现在必须接收 publication、SHA256SUMS、CI evidence 和 GitHub attestation bundle；本地 sidecar 结构有效但 provenance 为 `NOT_AVAILABLE` 时明确拒绝部署，`PUBLICATION_RECORD_VALID` 不再冒充 `PUBLISHED_VERIFIED`。
- 安装前还会解析并绑定 SHA256SUMS 中的 artifact/manifest 摘要，并校验 CI evidence index schema 与 release tag，避免只绑定文件本身摘要而不验证其内容。
- 部署路径还会用 `gh api` 实时核对非 draft、immutable GitHub Release、tag target SHA 和每个本地 asset digest，并强制 `gh attestation verify --signer-workflow`；workflow 使用 `dsh-release-evidence` environment 和 main ancestor 校验，未配置审批或未执行 live 查询时保持阻断。

验证：trust tests、publication schema 和 workflow YAML 均通过；aggregate release tests 65/65 PASS。GitHub Actions 已声明 OIDC/attestation 权限并对精确 tarball 生成 provenance，但远端 workflow、Sigstore 结果、GitHub protected tag/branch 仓库设置、真实 GitHub Release 和人工批准记录未执行，仍为 NOT_AVAILABLE/NOT_RUN；T4 保持 PARTIAL。
