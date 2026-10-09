# 杭州生产恢复与品牌 / WeKnora 热补丁

日期：2026-10-09（北京时间）。用户明确要求恢复生产访问、处理 DSH Web 认证提示，并在生产端恢复左上角 / 首页品牌与知识库问答入口。

## 现场结论

- 生产 current 保持 `/srv/shinemage/dsh/releases/dsh-0.20.0.0-r3`，VERSION `0.20.0.0`，固定 DSH rc2 上游 `477b4f420553e8a52c2fbccc464d7561b239c443`。本地 A/B/C 候选没有部署；没有修改上游或 immutable release。
- app/page 初始 502：supervisor 残留锁对应的旧 PID 已不存在，服务反复重启。核验端口、PID 与锁归属后，只停止目标 DSH，将失效锁与 current 元数据移至 `/srv/shinemage/dsh/recovery/stale-supervisor-20261009-150804/`，随后恢复服务。
- 登录入口辅助服务因依赖 DSH 被一并停止，已恢复。经既有入口 `https://app.tyuan.chat/?from=shine-mage-promo` 创建正常认证会话后，主页返回 200。未认证直访所见 401 是认证保护；没有关闭认证或输出 launch token。
- 品牌消失涉及两处：生产启动参数未启用 `--shine-brand on`；r3 的 `runtimeEnv()` 虽设置品牌变量，`isolatedEnv()` 未传递该变量，单加参数仍不能修复。隔离宿主测试复现后，以独立插件注入既有品牌标志，复用原品牌插件和 workbench 插槽 / 资产。
- 当前生产 profile 缺少 WeKnora 插件。恢复固定 `@wxg-prc-cpg/dsh-weknora@0.1.0`，通过原生 agent-preset 注册“知识库问答”，连接现有 loopback API 与原两库，沿用已配置的检索凭据。

## 已生效补丁

现场目录：`/srv/shinemage/dsh/hotfixes/brand-weknora-20261009/`，root 私有权限。

| 文件 | 用途 |
| --- | --- |
| `brand-globals.mjs` | 经 `webserver/index-inject` 注入 `__SHINE_BRAND_OVERRIDE__=true`，修复当前 r3 的品牌标志传递遗漏。 |
| `weknora.mjs` | 固定插件的受控适配层，启用 list/search/readDocument 三工具；从现场独立 0600 文件读取原检索凭据。 |
| `preset.patch.json` | 接入上述插件；添加 `weknora-qa` 模式（order 1.5），保留 standard / ptc / minimal / cordis。 |
| `production-ui.conf` | `/etc/systemd/system/shinemage-dsh.service.d/50-brand-weknora.conf` 的副本；在原命令上增加品牌开关与 extra-patch。 |
| `before/` | 保存 web profile、原服务定义、原 current 目标和环境文件摘要；不包含数据库副本。 |
| `input-manifest.json` / `package-origin.json` | 公共输入摘要与固定插件来源，均不含凭据。 |

固定插件来自 npm，SHA512 integrity 已校验；20 个运行文件与原本机已安装的固定包一致。tarball SHA256：`3c91233ab69944128c1cf0d3ed2c16ef77fbf33d397fafd5e1e3734037b687fe`。没有自动升级插件或安装浮动 latest。

补丁通过 systemd daemon-reload 与目标 DSH restart 激活，并显式 start `shinemage-dsh-promo-enter.service`。原环境文件摘要与 current 目标保持。没有重启 CRM / WeKnora、改写真实数据库或迁移会话。

## 实际验证范围

- WSL 固定插件适配层注册三工具，使用原凭据读取知识库列表成功，返回原有两库；没有输出文档正文。
- 在独立 runtime / 4329 端口运行固定官方宿主，认证交换、主页、品牌标志及五模式注册通过；测试宿主已回收。
- 初始失败证据保留在现场 `host-preflight-first-failure.json` 和 `host-preflight-brand-flag-failure.json`；修后结果为 `host-preflight.json`（PASS）。
- 生产 `deploy/wsl/healthcheck.sh --all` 通过。15:34:07 的 `production-verification.json` 记录认证主页 200、品牌标志 true、`/b0/brand/mark.svg` 200，以及五模式列表。
- 公网浏览器实际显示左上角原品牌帽子、中央帽子 / Shine mage Work、“知识库问答”菜单；窄视口截图存于本地 `.context/checks/hangzhou-plugin-hotfix-20261009/production-ui-compact.jpg`。桌面截图采集未完成，不据此宣称完整响应式验收。
- 15:37 DSH 与登录辅助服务 active/running，NRestarts 为 0。生产端口：DSH 4328 经 nginx 6677；page 18091；CRM 18093/18094；WeKnora 18090/18092；官网 18095。page 根路径 404 不等于服务离线。
- 本次没有发起真实模型问答（model_calls=0），未验收检索答案质量、完整业务 UAT 或状态迁移；产品仍 PARTIAL。

原始本地证据位于 `.context/checks/hangzhou-plugin-hotfix-20261009/`；前序恢复记录位于 `.context/checks/hangzhou-recovery-20261009/report.md`。现场同名补丁目录保留隔离测试和生产验证 JSON。

## 回退与后续升级

本轮未执行回退。若仅需撤回本补丁，先确认是否已有使用 `weknora-qa` 的新会话；移除该 preset 会影响这些会话继续使用知识工具，应先保留兼容配置或明确影响。

回退时将 **仅本次创建的** `/etc/systemd/system/shinemage-dsh.service.d/50-brand-weknora.conf` 移到上述 `before/` 目录留存，执行 `systemctl daemon-reload`，重启 `shinemage-dsh.service`，再启动 `shinemage-dsh-promo-enter.service`。随后按认证入口、原生模式、端口及日志验证。保留补丁目录、密钥、profile 备份与会话，不删除数据，不切换 current。此回退会撤销品牌 / 知识库修复。

后续升级需显式审查该 drop-in 和 patch 的兼容性。当前品牌注入是 r3 的现场适配；若新宿主已正确传递品牌标志，应移除重复适配并重新验证。不要用 git pull 或切换 current 推断补丁自动继承。
