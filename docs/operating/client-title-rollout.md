# 客户端标题（`DSH_CLIENT_TITLE`）Rollout

C15 的构建期标题只由 Linux release preflight 产生：`scripts/release/preflight.mjs` 调 `scripts/release/runtime-bundle.mjs`，后者仅在 `DSH_CLIENT_TITLE` 显式设置时重写 client 产物；未设置或空值时不改字节、不写 `client_title_build`。本 runbook 用 `dsh-release-preflight.yml` 的 dispatch-only 输入 `client_title` 触发这条路径，默认仍然不启用。

边界：

- 标题是 runtime 构建输入，不是运行期插件 hook；不改上游源码，不新增 `document.title` 写回。
- DSH runtime **不是** `.ci/rc3-composition` 封印的 20 个作者/domain pack 成员，所以标题变更**不需要** composition reseal，也不重算 config lock；不要改 `.ci` 封印、`config/*` 锁或 `dsh-plugins/*/toolchain.json`。
- 不修改 workflow 的 action pin，不把 `DSH_CLIENT_TITLE` 写进仓库配置，不在 PR/push 路径设置标题。
- runtime 资产名固定为 `shinemage-dsh-upstream-runtime-<upstream_sha>.tar.zst`，标题只改 bytes/sha256；GitHub Release immutable 之后不能换同名资产，所以**必须发新的 release tag**，不能复用旧 tag。

## 0. 输入合同

`dsh-release-preflight.yml` 新增：

```yaml
client_title:
  description: 'Optional build-time client title; empty keeps the pinned official title. Dispatch only.'
  required: false
  default: ''
  type: string
```

- 只接受 `workflow_dispatch`；步骤 `if: github.event_name == 'workflow_dispatch'`，PR/push 没有这条路径。`pull_request` 事件不声明 `inputs`。
- 空值或不传：不做任何事，`DSH_CLIENT_TITLE` 不出现在 preflight 环境，runtime bytes/provenance 与今天一致。
- 非空：先校验再写入 `$GITHUB_ENV`，仅随后续步骤继承。校验失败即 fail closed，不生成 runtime：
  - `strip()` 后必须非空（只传空白也算无效）；
  - 最长 200 字符；
  - 拒绝控制字符与换行（`0x00`–`0x1f`、`0x7f`）；
  - 拒绝 HTML 不安全字符 `< > &`；
  - 拒绝包含上游默认标题 `DeepSeek Harness`（会与官方字节冲突）。

校验在 `Resolve the optional dispatch-only client title` 步骤里执行；runtime 由 `Build the exact pinned runtime before tag creation` 步骤产生，它通过 `$GITHUB_ENV` 继承该值。设置标题时，还会额外上传 `dsh-rc2-preflight-client-title-provenance-<reviewed_sha>` artifact（默认/空值不上传）。

## 1. 准备 reviewed SHA 与 release tag

```bash
cd /path/to/fuqing-crm-analytics
git fetch origin main
reviewed_sha="$(git rev-parse origin/main)"
upstream_sha="$(git --no-pager show "$reviewed_sha:dsh-plugins/plugin-kit/toolchain.json" | jq -r .upstream_sha)"
release_tag="dsh-0.21.0.0-r1"   # 本次要发布的新 immutable tag；preflight 不创建 tag
test "$(git rev-parse HEAD)" = "$reviewed_sha"
```

`release_tag` 必须匹配 `^dsh-[A-Za-z0-9._-]+$` 且从未发布过。`reviewed_sha` 必须等于 `--ref` 的 HEAD：dispatch 的 `GITHUB_SHA` 与 `reviewed_sha` 不一致时 workflow 会失败关闭。

## 2. 触发 C15 重建（唯一受支持的入口）

```bash
gh workflow run dsh-release-preflight.yml \
  --repo tyuanww/fuqing-crm-analytics \
  --ref main \
  -f reviewed_sha="$reviewed_sha" \
  -f release_tag="$release_tag" \
  -f client_title="伸美 AI 增长董事会"
```

确认并等待：

```bash
gh run list --repo tyuanww/fuqing-crm-analytics \
  --workflow dsh-release-preflight.yml --limit 3 \
  --json databaseId,event,headSha,status,conclusion,createdAt
run_id="$(gh run list --repo tyuanww/fuqing-crm-analytics \
  --workflow dsh-release-preflight.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run view "$run_id" --repo tyuanww/fuqing-crm-analytics   # 核对 event=workflow_dispatch、headSha=$reviewed_sha
gh run watch "$run_id" --repo tyuanww/fuqing-crm-analytics --exit-status
```

绿色标志：`preflight` job 成功，日志包含 `DSH_RELEASE_PREFLIGHT_PASS`；失败时按 `DSH_PREFLIGHT_RECOVERY code=... evidence=...` 定位，不要重试成另一个 tag。

## 3. 下载

```bash
rm -rf /tmp/c15-preflight /tmp/c15-provenance
mkdir -p /tmp/c15-preflight /tmp/c15-provenance
gh run download "$run_id" --repo tyuanww/fuqing-crm-analytics \
  --name "dsh-rc2-preflight-$reviewed_sha" \
  --dir /tmp/c15-preflight
gh run download "$run_id" --repo tyuanww/fuqing-crm-analytics \
  --name "dsh-rc2-preflight-client-title-provenance-$reviewed_sha" \
  --dir /tmp/c15-provenance
```

`/tmp/c15-preflight` 应恰好有七个文件：runtime tarball、`$release_tag.tar.zst`、`pre-manifest.v1.json`、`release-manifest.v1.json`、`SHA256SUMS`、`ci-evidence-index.v1.json`、`release-preflight.json`。`/tmp/c15-provenance` 应有一个 `*.provenance.json`。

## 4. 校验 runtime 资产与 `release-preflight.json`

```bash
cd /tmp/c15-preflight
ls -1
jq -e '.schema_version == "release-preflight/v2" and .status == "PASS"' release-preflight.json
jq -e --arg sha "$reviewed_sha" '.source_sha == $sha' release-preflight.json
jq -r '.assets[] | "\(.sha256)  \(.name)"' release-preflight.json | sha256sum -c -   # macOS: shasum -a 256 -c -
zstd -t shinemage-dsh-upstream-runtime-*.tar.zst
```

再用与 reviewed SHA 相同的代码走完整合同（会核 `release-preflight.json`、manifest、`upstream_runtime`、`SHA256SUMS` 和全部资产摘要）：

```bash
git worktree add --detach /tmp/c15-verify "$reviewed_sha"
node --input-type=module -e "
import { verifyPreflight } from '/tmp/c15-verify/scripts/release/preflight-bundle.mjs';
const [, directory, tag, sourceSha] = process.argv;
await verifyPreflight(directory, { tag, sourceSha });
console.log('PREFLIGHT_VERIFY PASS');
" /tmp/c15-preflight "$release_tag" "$reviewed_sha"
git worktree remove /tmp/c15-verify
```

`release-manifest.v1.json` 的 `upstream_runtime` 必须是：

```json
{
  "name": "shinemage-dsh-upstream-runtime-<upstream_sha>.tar.zst",
  "role": "upstream-runtime-bundle",
  "upstream_sha": "<upstream_sha>",
  "bytes": "<新 runtime 字节数>",
  "sha256": "<新 runtime sha256>"
}
```

`name` / `upstream_sha` 不变；`bytes` / `sha256` 是本次标题构建的新值，且必须等于 `release-preflight.json.assets[]` 里同名资产的摘要。

## 5. 校验 `client_title_build` provenance

```bash
cd /tmp/c15-provenance
provenance="$(ls -1 *.provenance.json)"
jq -e --arg title "伸美 AI 增长董事会" '
  .client_title_build.status == "REWRITTEN"
  and .client_title_build.title == $title
  and .client_title_build.prepared_source_tree.sha256 != .client_title_build.shipped_source_tree.sha256
  and .client_title_build.build_record.environment.DSH_CLIENT_TITLE == $title
  and .client_title_build.runtime_paths == [
    "@deepseek-ai/dsh-web-frontend/dist/index.html",
    "@deepseek-ai/dsh-client-ui-layout/lib/client.js",
    ".dsh-build/client-build-environment.json"
  ]
  and .source_tree.sha256 == .client_title_build.shipped_source_tree.sha256
' "$provenance"
test "$(jq -r '.archive.sha256' "$provenance")" = "$(jq -r '.upstream_runtime.sha256' /tmp/c15-preflight/release-manifest.v1.json)"
```

字段含义：`status` 为 `REWRITTEN`（若为 `ALREADY_APPLIED`，说明固定 checkout 已带标题，不能当作本次重写证据）；`title` 是去除首尾空白后的标题；`files` / `occurrences` 是被改写的 client artifact 数量与替换次数；`prepared_source_tree` 是重写前、`shipped_source_tree` 是重写后进入 deploy 的 source tree 摘要；`build_record` 是 `.dsh-build` 记录；`runtime_paths` 是安装进 deployed runtime 的三处路径。`prepared` 与 `shipped` 必须不同。

## 6. 校验 deployed `<title>` / `productTitle` / `.dsh-build`

```bash
rm -rf /tmp/c15-runtime && mkdir -p /tmp/c15-runtime
cd /tmp/c15-preflight
zstd -dc shinemage-dsh-upstream-runtime-*.tar.zst | tar -xf - -C /tmp/c15-runtime
cd /tmp/c15-runtime
frontend_index="$(find . -path '*dsh-web-frontend/dist/index.html' -print -quit)"
layout_client="$(find . -path '*dsh-client-ui-layout/lib/client.js' -print -quit)"
test -n "$frontend_index" && test -n "$layout_client"

grep -Fq '<title>伸美 AI 增长董事会</title>' "$frontend_index"
! grep -Fq 'DeepSeek Harness' "$frontend_index"
grep -Fq 'const productTitle = "伸美 AI 增长董事会";' "$layout_client"
! grep -Fq 'DeepSeek Harness' "$layout_client"

jq -e '.environment.DSH_CLIENT_TITLE == "伸美 AI 增长董事会"' .dsh-build/client-build-environment.json
jq -e '.artifacts.sha256 and .artifacts.fileCount' .dsh-build/client-build-environment.json
diff <(jq -S '.client_title_build.build_record.environment' "$provenance") \
     <(jq -S '.environment' .dsh-build/client-build-environment.json)
test "$(jq -r '.client_title_build.build_record.artifacts.sha256' "$provenance")" = \
     "$(jq -r '.artifacts.sha256' .dsh-build/client-build-environment.json)"
```

deployed 布局下两个包可能不在顶层 `node_modules`：`find` 必须能命中 `.pnpm` 或 `dsh-web-app/node_modules` 下的真实路径。命中不到时不要手改 archive，直接判本次 runtime 失败。

## 7. 重 pin：manifest / release / host

`release-manifest.v1.json` 由 preflight 生成，不要手改。发布时：

1. 在 `reviewed_sha` 上创建 `$release_tag`（`dsh-*` immutable ruleset 生效），不要移动已有 tag：

   ```bash
   git tag -a "$release_tag" "$reviewed_sha" -m "DSH $release_tag"
   git push origin "$release_tag"
   ```

2. 用该 tag 跑 `dsh-release-evidence.yml`，传 `release_tag=$release_tag`、`reviewed_sha=$reviewed_sha`、`approval_ref=run:<approval-run-id>`、`preflight_run_id=$run_id`；它下载同一个 preflight artifact 并复用本次 runtime。
3. 按发布 owner 流程创建 draft release，再把 `release_id`、`evidence_run_id` 传给 `dsh-release-publish.yml`；发布后 `release-publication.v1.json` 会固定六个资产，其中 runtime 的 `sha256` 就是第 4 节的新值。

host 重 pin 的增量只有 runtime 摘要：按 [rc2 runbook](dsh-rc2-runbook.md#现场顺序) 用新 tag 执行 `deploy/wsl/fetch-release.sh`（参数与 [deploy/wsl/README.md](../../deploy/wsl/README.md) 一致），再执行 `deploy/wsl/install-release.sh` 时显式传：

```bash
RELEASE_ROOT=/srv/shinemage/dsh \
RELEASE_STATE_PATH=/srv/shinemage/dsh/release-state.json \
RELEASE_UPSTREAM_RUNTIME=/srv/shinemage/incoming/$release_tag/shinemage-dsh-upstream-runtime-$upstream_sha.tar.zst \
RELEASE_RUNTIME_ATTESTATION_BUNDLE=/srv/shinemage/incoming/$release_tag/upstream-runtime-attestation.jsonl \
  deploy/wsl/install-release.sh
```

装完、切换前核对 marker 与 manifest 一致：

```bash
jq '.upstream_runtime' "/srv/shinemage/dsh/releases/$release_tag/release-marker.json"
test "$(jq -r '.upstream_runtime.sha256' "/srv/shinemage/dsh/releases/$release_tag/release-marker.json")" = \
     "$(jq -r '.upstream_runtime.sha256' /tmp/c15-preflight/release-manifest.v1.json)"
```

`activate-release.sh` 只切 `current`；重启自己拥有的 DSH service 后再做视觉验收。不要重启 CRM、WeKnora 或 Cloudflare route。

## 8. 真机视觉验收

1. 打开真实 host 的 DSH 页面，hard reload，浏览器 tab 标题必须是「伸美 AI 增长董事会」。
2. 进入一个会话、再新建/切换会话，标题不能被导航抢回；DevTools `document.title` 仍是业务品牌。
3. 确认 `shine-brand` 不再写回标题（作者包已删除该赋值），hero 与预览徽章保持可用。
4. 在 host 上抽查 deployed 文件（路径同第 6 节，根为 `/srv/shinemage/dsh/releases/$release_tag/upstream`）：

```bash
grep -RF --include=index.html '<title>伸美 AI 增长董事会</title>' \
  "/srv/shinemage/dsh/releases/$release_tag/upstream/node_modules"
jq '.environment.DSH_CLIENT_TITLE' \
  "/srv/shinemage/dsh/releases/$release_tag/upstream/.dsh-build/client-build-environment.json"
```

5. 把 host、旧/新 runtime 摘要、`release-preflight.json`、provenance 和截图写回 C15 的 rollout 记录。视觉验收通过前不要把该 tag 当作已验收。

## 9. 回滚（重新构建，不带标题）

标题只在构建期生效，回滚不是手改 host 文件，而是用空输入重建：

```bash
gh workflow run dsh-release-preflight.yml \
  --repo tyuanww/fuqing-crm-analytics \
  --ref main \
  -f reviewed_sha="$(git rev-parse origin/main)" \
  -f release_tag="dsh-0.21.0.0-r2" \
  # 不传 client_title（或传空串）
```

空输入的 runtime 与今天字节一致：`release-preflight.json`、manifest、`SHA256SUMS` 里 runtime 的 bytes/sha256 都会回到无标题构建的值，provenance 不会出现 `client_title_build`。然后按第 7 节用新 tag 走 evidence/publish/host 并重新验证 `<title>DeepSeek Harness</title>`。

紧急情况下也可以按 runbook 用 `rollback-release.sh` 把 host 切回上一个已验收 target（会连同旧 runtime 一起回退），但它只是 host 侧止损，不是 C15 的标题回滚路径；恢复后仍要用上面的空输入重建收口。稳定窗口结束前不要删除旧版本或旧 tag。

## 10. 禁止事项

- 不要在 `pull_request`/push 路径设置 `DSH_CLIENT_TITLE`，不要在仓库配置文件里写默认标题。
- 不要手改 `release-manifest.v1.json`、`SHA256SUMS`、runtime archive 或 `.dsh-build` 记录。
- 不要为标题变更执行 composition reseal、重算 config lock 或改 `.ci` 封印；runtime 不在那 20 个成员内。
- 不要复用已发布 tag 或覆盖同名 runtime 资产；每次标题变化都发新 tag。
- 不要用 `scp`/`rsync` 搬 runtime 包，host 只从 immutable Release 下载并校验。
