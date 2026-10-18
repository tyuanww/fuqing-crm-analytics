# M2-07 owner-local Linux portable runtime r9 gate receipt (2026-10-18)

## 结论

Linux x64 portable runtime 已在目标 Linux x64 builder 上完成 owner-local rebuild。资产可以解压并启动 @deepseek-ai/dsh@0.2.1-rc.1。本回执只证明单人本地完整性和新鲜目录回放，不是公司正式发布证据。

正式状态保持：

- M2-07=BLOCKED
- M2-08=NOT_RUN
- M2-09=NOT_RUN
- release_ready=false

## 真实构建输出

- upstream SHA: 1600d8a1e140dcde43a1a0941940a0480712c011
- source tree SHA-256: 1da0862e853d126219dbec4b77bd7187776112f620adadc12ccda07c420c3f4a
- preparation receipt SHA-256: 2d2f00923d8bc64b5efc5369b7eb9b3177d97c59354a24fdf8e83458adc5d971
- runtime archive: /srv/shinemage/dsh/staging/rc1-linux-x64-formal-r9/runtime-linux-x64-formal-r9.tar.zst
- runtime archive SHA-256: ed11ec808d939bbab292738be6227e8882c95889d3af5db1a9febbc318aa05a2
- provenance SHA-256: 22c710ca15e59d4659338a27b798f298d227b03b02c1c6ba912889df16e6921e
- local provenance copy: docs/hackathon/evidence/m2-07-owner-linux-runtime-r9-provenance-20261018.json
- builder: Node v24.21.0, pnpm 11.28.5, Linux x64, offline
- path shims rewritten: 315
- non-Linux-native files removed: 40
- portable scan: 29207 files, 0 metadata findings, 0 host-path findings, 0 native findings
- extracted runtime version: 0.2.1-rc.1

## 五项顺序回执

1. publisher identity

   生成了临时 Ed25519 公钥。私钥没有写入仓库。正式公司 identity 仍为 NOT_RUN_COMPANY_IDENTITY_UNAVAILABLE。

2. signature

   使用临时 owner key 对 binding 做 detached signature。openssl pkeyutl -verify 返回 PASS。这只属于 OWNER_LOCAL_ONLY。

3. revocation

   已探测本机工具和公司输入。cosign、gpg、notation、in-toto-verifier、slsa-verifier 和公司 trust-service 输入均缺失。状态为 NOT_RUN_NO_REVOCATION_SERVICE。没有作 non-revocation 推断。

4. final attestation

   生成了 owner-local draft。正式公司 final attestation 仍为 FORMAL_EXCEPTION_REQUIRED。

5. clean-machine

   在目标 Linux 主机创建新抽取目录。完成 zstd 校验、解压、host-path 检查、native 检查、必需文件检查和版本检查。结果为 OWNER_OPERATED_FRESH_EXTRACTION_PASS。这不是公司独立 clean-machine 回执。

## 仍未完成的正式缺口

- 公司批准的 publisher identity。
- 公司批准的 signer、KMS/HSM 或 keyless signature。
- 独立 verifier 身份或独立 CI job。
- revocation service 结果。
- 公司格式的 final attestation。
- 公司正式 clean-machine 回执。

未执行 GitHub Release、生产切换、杭州公网切换或 release-ready 提升。
