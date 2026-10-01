# 杭州 WSL 运行层

这套文件只描述单台 Windows + WSL 主机的运行层。它不迁移数据、不保存密钥、不启动服务，也不替代 DSH 上游。

## 目录约定

```text
/srv/shinemage/incoming/       # 迁移暂存区，只读验收
/srv/shinemage/src/             # Git checkout
/srv/shinemage/data/            # CRM 正式数据
/srv/shinemage/dsh/runtime/    # DSH durable runtime（rc1/rc2 共用，保持不迁移）
/srv/shinemage/dsh/upstream-0.1.7-rc.2/ # 固定 rc2 上游 checkout
/srv/shinemage/dsh/releases/<tag>/ # side-by-side 不可变候选
/srv/shinemage/dsh/current -> releases/<tag>/ # 原子激活 symlink
/srv/shinemage/weknora/         # WeKnora / Neo4j 数据
/srv/shinemage/backups/        # 不与 data 共盘的备份目标
/etc/shinemage/                # 600 权限的 env 文件
/etc/cloudflared/              # Tunnel 凭据与配置
```

`incoming` 不是生产数据目录。只有在文件数量、大小、SHA-256 和 WAL 状态全部核对后，才可复制到正式目录。131GB DuckDB 不能在服务写入时复制；备份或替换数据库前必须先停写服务并确认没有 `.wal` 文件。

## 第一次部署

1. 在 Windows 主机启用 WSL 2、Docker 和 systemd。当前运维入口是 WSL 内的 Tailscale + `sshd`，管理员从 Mac 直接 SSH 到 WSL 的 Tailscale 地址；不依赖 Windows OpenSSH，也不需要再套一层 `wsl.exe`。不要把 SSH、6677、8000、18090、18091、18092、18093 直接暴露到公网。
2. WSL 里启用 systemd 后，把 `dsh.service` 安装为系统服务：

   ```bash
   sudo install -m 0644 deploy/wsl/dsh.service /etc/systemd/system/shinemage-dsh.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now shinemage-dsh.service
   ```

   Windows 任务计划仍需在开机时启动该 WSL 发行版；systemd 服务本身不会保持 WSL 实例存活。
3. 将公开 GitHub 主线 checkout 到 `/srv/shinemage/src/fuqing-crm-analytics`，使用已经通过 CI 的明确提交 SHA。
4. 在 `/etc/shinemage/crm.env` 写入生产变量，权限设为 `600`。复制本目录的 `compose.production.yml` 时，必须提供 `CRM_DATA_ROOT`、`SHOP_DATA_SOURCE`、`MEMBER_DATA_SOURCE` 和 `CRM_ENV_FILE`。
5. 先执行预检和 Compose 展开：

   ```bash
   cd /srv/shinemage/src/fuqing-crm-analytics
   deploy/wsl/preflight.sh
   docker compose -f docker-compose.yml -f deploy/wsl/compose.production.yml config --quiet
   ```

6. 构建镜像后，先确认容器 `appuser` 的 UID/GID，再让正式数据目录对该 UID 可读；迁移文件保留原始 SHA-256 记录。宿主上的 `600 root:root` 文件不能直接保证容器里的非 root `appuser` 可读。
7. 仅启动 CRM 内部服务：

   ```bash
   docker compose -f docker-compose.yml -f deploy/wsl/compose.production.yml up -d backend frontend
   deploy/wsl/healthcheck.sh --crm
   ```

8. 安装 `dsh.service` 前，把 `dsh.service` 中的用户、仓库、上游和 runtime 路径替换成真实路径；`/etc/shinemage/dsh.env` 权限必须是 `600`。DSH 固定使用 `0.1.7-rc.2` 和 `477b4f420553e8a52c2fbccc464d7561b239c443`，不使用 `--fresh`；品牌覆盖显式 `--shine-brand off`。
9. WeKnora 和 Neo4j 按 `WeKnora-*.tar.gz` 自带的 compose/README 恢复。没有核对镜像、数据目录和端口前，不凭文件名猜启动命令。
10. CRM、DSH、WeKnora 都通过 Tailscale 完成内部验收后，才安装 Cloudflare Tunnel。`cloudflared-config.yml.example` 暴露网站、DSH、页面、看板和知识库五个入口；知识库只转发到 loopback 的 WeKnora 前端，登录和权限仍由 WeKnora 负责，Neo4j 管理口保持内部访问。

## DuckDB 备份

先停止 CRM backend，并确认没有 `${DUCKDB_PATH}.wal`，再把备份目标放到另一块磁盘、NAS 或远程挂载：

```bash
DUCKDB_PATH=/srv/shinemage/data/processed/fuqing_crm.duckdb \
  deploy/wsl/backup-duckdb.sh --service-stopped /mnt/backup/crm
```

脚本拒绝同文件系统目标，复制后会重新计算 SHA-256。它不会自动停止服务，也不会删除旧备份。

## 发布顺序

```text
CI 通过的 commit
  → 杭州 preflight
  → Compose config 校验
  → CRM 内部健康检查
  → DSH 登录与 HTML 收件箱验收
  → WeKnora 检索验收
  → operator gate 正/负探针（无隔离时不称 canary）
  → 明确授权后现有 hostname cutover
```

每次发布保留上一份代码 checkout、镜像和配置。先在内部检查通过，再切入口；切换失败时恢复上一版本并重新运行 `healthcheck.sh --all`。数据库格式变化必须另做备份和回退演练，代码回退本身不等于数据库回退。

## 防止磁盘再次被打满

- Docker 日志使用 Compose 覆盖文件的 `local` 驱动和轮转上限。
- `/srv/shinemage` 设置 70%、85%、95% 三档磁盘告警。
- 构建临时目录统一放在可清理目录，并设置单次构建容量上限。
- 备份目标必须和 `/srv/shinemage/data` 分离；同一块磁盘上的副本只能算临时副本。
- 只允许一个 ETL/数据库写入者，Web 使用单 worker。

## rc2 artifact promotion

杭州只接收已校验的 `release-publication.v1.json`、`release-manifest.v1.json`、`SHA256SUMS`、CI evidence index、source tarball、固定 rc2 production runtime tarball 和两份 GitHub attestation bundle。旧 internal-only 候选只有 source tarball，不能安装；当前 release workflow 会在固定 rc2 checkout 上构建 runtime bundle，并把它的 digest、allowlist、secret scan、GitHub Release 资产和 attestation 一起绑定。`install-release.sh` 会把 publication 摘要绑定到本地文件，在 runtime、checksum、evidence 或 provenance 任一项缺失时拒绝解包。

Tailscale 只承载 SSH 控制面和小体积 publication/attestation sidecar；大文件由杭州主机直接从 immutable GitHub Release 下载。`fetch-release.sh` 支持断点续传、重试、临时文件和原子改名，只有全部 SHA-256 与 publication sidecar 匹配后才生成 `release-fetch.v1.json`：

```bash
# 先通过 Tailscale SSH 传入 release-publication.v1.json、source-attestation.jsonl、upstream-runtime-attestation.jsonl
RELEASE_TAG=dsh-<version>-r<revision> \
RELEASE_REPO=tyuanww/fuqing-crm-analytics \
RELEASE_PUBLICATION=/srv/shinemage/incoming/dsh-<version>-r<revision>/release-publication.v1.json \
RELEASE_INCOMING=/srv/shinemage/incoming/dsh-<version>-r<revision> \
  deploy/wsl/fetch-release.sh
```

接收完成后，才在新目录执行安装：

```bash
RELEASE_ARTIFACT=/srv/shinemage/incoming/dsh-<version>-r<revision>/dsh-<version>-r<revision>.tar.zst \
RELEASE_UPSTREAM_RUNTIME=/srv/shinemage/incoming/dsh-<version>-r<revision>/shinemage-dsh-upstream-runtime-<upstream-sha>.tar.zst \
RELEASE_MANIFEST=/srv/shinemage/incoming/dsh-<version>-r<revision>/release-manifest.v1.json \
RELEASE_TAG=dsh-<version>-r<revision> \
RELEASE_ROOT=/srv/shinemage/dsh \
RELEASE_STATE_PATH=/srv/shinemage/dsh/release-state.json \
RELEASE_OWNER=shinemage-dsh \
RELEASE_RESTART_DEPENDENCY=shinemage-dsh.service \
RELEASE_PUBLICATION=/srv/shinemage/incoming/dsh-<version>-r<revision>/release-publication.v1.json \
RELEASE_SHA256SUMS=/srv/shinemage/incoming/dsh-<version>-r<revision>/SHA256SUMS \
RELEASE_EVIDENCE_INDEX=/srv/shinemage/incoming/dsh-<version>-r<revision>/ci-evidence-index.v1.json \
RELEASE_ATTESTATION_BUNDLE=/srv/shinemage/incoming/dsh-<version>-r<revision>/source-attestation.jsonl \
RELEASE_RUNTIME_ATTESTATION_BUNDLE=/srv/shinemage/incoming/dsh-<version>-r<revision>/upstream-runtime-attestation.jsonl \
RELEASE_GITHUB_REPO=tyuanww/fuqing-crm-analytics \
RELEASE_SOURCE_REF=refs/tags/dsh-<version>-r<revision> \
  deploy/wsl/install-release.sh

RELEASE_ROOT=/srv/shinemage/dsh RELEASE_STATE_PATH=/srv/shinemage/dsh/release-state.json RELEASE_TAG=dsh-<version>-r<revision> \
RELEASE_SOURCE_SHA=<reviewed-source-sha> RELEASE_OWNER=shinemage-dsh \
RELEASE_RESTART_DEPENDENCY=shinemage-dsh.service \
  deploy/wsl/activate-release.sh
```

`activate-release.sh` 只切换 `current` symlink，不重启服务；重启自有 DSH service、hostname 验证和 Cloudflare route 变更分别需要现场授权。失败按 `rollback-release.sh` 使用已记录的旧 target 回退，稳定窗口结束前不删除旧目录。

回退同样必须绑定 owner 和 restart dependency：

```bash
RELEASE_ROOT=/srv/shinemage/dsh \
RELEASE_STATE_PATH=/srv/shinemage/dsh/release-state.json \
RELEASE_OWNER=shinemage-dsh \
RELEASE_RESTART_DEPENDENCY=shinemage-dsh.service \
  deploy/wsl/rollback-release.sh
```
