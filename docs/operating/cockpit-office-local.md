# 驾驶舱历史产物与本地文档编辑

历史产物与多格式编辑已随旧仓库 #215 合入；2026-09-21 的 6677 已加载公开仓库 #36 / `7575d07`（0.13.0.0），沿用原本机 Office 配置。早期手动编辑证据见[本地验收](../hackathon/COCKPIT-HISTORY-IMPORT-2026-09-20.md)，当前 reload 与未验收边界见[UI / UX 报告](../hackathon/COCKPIT-UI-UX-2026-09-20.md)。合入代码不会自动安装或启动文档服务；以下配置示例用于独立候选，不是现役重建步骤。

## 使用方式

AI修改流程另见[原生AI修改](cockpit-ai-edit.md)；手动编辑成功不等于真实模型修改已验收。

进入驾驶舱后，列表同时显示已保存页面/看板、已添加文件，以及原生历史会话中的交付。来源对话名称可搜索；长列表使用“加载更多历史产物”。扫描不调用模型，不恢复 Agent Loop，不扫描归档业务库。

“添加产物”支持 HTML、DOCX/DOC/ODT/RTF、XLSX/XLS/ODS/CSV、PDF，单文件最多 20 MB。上传保存独立原件。HTML 先预览、再确认可编辑副本，进入现有页面编辑器；Office/PDF 在 ONLYOFFICE 中编辑，点击驾驶舱“保存版本”后等待产物库回执。编辑器内部的“已保存”只表示同步至文档服务，不表示已写入产物库。

历史文件也可“保存副本并编辑”，不会改写原会话文件。相同工作目录及相同相对路径只展示一次；不同工作目录同名文件仍分别保留。无法读取、位于所属工作目录外或已删除的文件不会被虚构成可用产物，可用“添加产物”重新添加实际文件。

HTML 手动添加目前面向单文件页面。引用的外部资源、不可读取的相对资源仍会阻止可编辑副本入库；历史 HTML 的可读相对资源通过原生分段二进制接口读取。HTML 页面库仍执行其原有 2 MB 源码包限制，20 MB 文件上传限制不改变它。未绑定业务结果的手动 HTML 保持 `UNBOUND_SAMPLE`。

非 OOXML 文件可能由 ONLYOFFICE 保存为 DOCX/XLSX，列表会显示实际新格式，原始版本仍保留。文本型 PDF 编辑和扫描件 OCR 是不同能力，本接入不提供 OCR，也不承诺任意 PDF、宏、复杂版式的无损转换。

PDF 正文验收使用主工具栏“编辑PDF → 编辑文本”，待文本框生成后双击正文，再修改和保存。固定 9.4.0 的选中文字浮动菜单“编辑文本”在本轮首次尝试中触发过 `pasteCallback` 内部异常；该失败保留记录，主工具栏路径已独立验证。不要把正文编辑能力写成任意入口、任意 PDF 均通过。

## Docker Desktop 配置

固定 ONLYOFFICE Docs **9.4.0** 多架构镜像 digest：
`sha256:e3da62a847b9a5d51a11f73cfea1d9c13c3be3809614490d4edddcf01dcf919b`。

以下仅在明确启动本地文档服务时执行。在候选仓库根目录生成私有配置；重复执行拒绝覆盖既有密钥：

```bash
python3.14 - <<'PY'
import json, os, secrets
from pathlib import Path
root = Path('.context/cockpit-office').resolve()
root.mkdir(parents=True, exist_ok=True, mode=0o700)
env = root / 'office.env'
config = root / 'config.json'
if env.exists() or config.exists():
    raise SystemExit('已有配置，保留原密钥；请核对后复用。')
secret = secrets.token_urlsafe(48)
payloads = {
    env: 'JWT_ENABLED=true\nJWT_HEADER=Authorization\nJWT_IN_BODY=true\nALLOW_PRIVATE_IP_ADDRESS=true\nJWT_SECRET=' + secret + '\n',
    config: json.dumps({'base': 'http://127.0.0.1:18110', 'callback_base': 'http://host.docker.internal:19091', 'secret': secret}),
}
for path, content in payloads.items():
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
        f.write(content)
print('私有配置已创建；密钥未输出。')
PY
export COCKPIT_OFFICE_ENV_FILE="$PWD/.context/cockpit-office/office.env"
docker compose -p cockpit-office -f scripts/dsh-dev/office.compose.yml up -d
curl --fail http://127.0.0.1:18110/healthcheck
```

Compose 仅发布 `127.0.0.1:18110`，关闭自动重启，资源限额 4 GB / 2 CPU。Docker Desktop 的 `host.docker.internal` 回调目标必须与实际隔离文件服务端口一致。不要将其改成 6677；本轮验收用 19091。不要因已有监听而停止其他项目。

在**候选** DSH 启动命令的环境中指定：

```bash
export COCKPIT_OFFICE_CONFIG="$PWD/.context/cockpit-office/config.json"
# 使用现有 dsh-dev start 命令及独立 runtime，显式选择 --page-http on --page-http-port 19091。
# Node 24、固定上游和候选插件路径沿用本仓 dsh-dev 入口，不改现役 runtime。
```

现有 `startPageHttp` 向子服务传递配置文件路径；`page_http_server.py` 要求文件权限为 600。JWT 密钥不会进入打包的前端 JS，用户 bearer 不交给 ONLYOFFICE。原件及正式版本保存在所选 runtime 下独立的 `files/files.sqlite3`；普通 compose 停止不删除文件库。容器内转换缓存不是正式产物库备份。

明确结束该 Compose 演示时，只停止这一项目：

```bash
docker compose -p cockpit-office -f scripts/dsh-dev/office.compose.yml stop
```

## 接口与保存边界

- 原生 `/api/shine-mage-deliveries` 通过 DSH Connection 身份围栏，使用固定 SDK `sessionQuery.listSessions/observeSession` 冷读日志；每页最多 20 会话 / 200 文件，释放 observation lease。
- 文件接口 `/api/v1/analytics/cockpit-files` 沿现有 page HTTP bearer，要求 `dashboard:read/update` 并隔离文件 owner。
- 上传带稳定内容幂等键；正式版本使用 SQLite 事务及 head CAS。另一个编辑器产生新版本时，旧编辑器不能覆盖。
- ONLYOFFICE 配置及回调用 HS256，读取/回调 ticket 各自限定 purpose、actor、edit key 和有效期。回调仅下载配置 origin 的 `/cache/`，拒绝跳转和超限内容。
- 自动回调只保存草稿；显式保存请求及回执才推进正式版本。相同回执不可接受不同字节。回执未知时保留请求标识、禁用编辑/换选/放弃，并允许重试核对。
- 编辑器内保存/Ctrl+S只同步，带产物库请求标识的强制保存由驾驶舱按钮发起。`forcesave`返回error 4不能证明当前内容已落盘，也不能用旧草稿代替当前回调；回执必须匹配请求id、编辑会话与有效版本号。
- 丢失回执后重试仍对应首次请求的编辑状态；期间到达的新修改继续保留为未保存，需要再次保存。带有效签名和当前请求标识的`status: 7`写为`FAILED`，可保留修改重新保存；失败回执不能被晚到的成功回调复活。
- 其他编辑器已推进版本时，回执返回`CONFLICT`，不会覆盖新版。界面保留当前修改，允许下载备份后显式放弃、刷新；网络丢失或错配回执仍维持未知状态并锁定，不能借冲突分支跳过核对。
- Office 压缩包在原有条目数和解压大小限制内检查内容校验和，拒绝损坏或加密包；该检查不等于任意复杂文档都能无损编辑。
- HTML 合同新增 `origin_file_id`，允许手动文件使用 `session_id: null`；无会话时禁止绑定业务结果。既有会话 HTML 合同兼容，离线 OpenAPI/前端类型同步更新。

官方参考：[保存机制](https://api.onlyoffice.com/docs/docs-api/more-information/faq/saving/)、[回调协议](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)、[Docker 镜像](https://github.com/ONLYOFFICE/Docker-DocumentServer)。
