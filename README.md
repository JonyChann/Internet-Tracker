# Internet Tracker

一个用 Node.js 写的互联网数据跟踪工具。界面类似 Notion 表格：**每一列是一个抓取模板，每一行只需要填变量**，后台用 Chrome 打开页面、按模板提取数据，并保存每一次刷新得到的历史快照。

- 前端：原生 ES Modules + 手写 CSS，无构建步骤
- 抓取：`puppeteer-core` 驱动本机 Chrome（支持 CSS 选择器、XPath、JS、正则清洗）
- 存储：默认内置 SQLite（`node:sqlite`，零编译），可切换 PostgreSQL / MySQL
- 异步：抓取任务在后台队列执行，前端通过 SSE 实时收到进度
- 导出：独立导出页，支持 XLSX（多工作表）/ CSV

## 快速开始

要求：**Node.js ≥ 22.13**、本机安装 **Google Chrome / Chromium / Edge**。

```bash
cd Internet-Tracker
npm install
npm start
```

打开 <http://127.0.0.1:4780>。首次启动会自动创建示例数据表「示例 · 商品价格追踪」，它抓取的是内置演示商店 `/demo`（价格每 12 秒变化一次），可以直接点「刷新全部」看效果。

> 内置 SQLite 需要 Node 的 `--experimental-sqlite` 标志。`npm start` / `npm run dev` 已经带上了；如果直接 `node src/server.js` 会提示你改用 `npm start`。

## 五分钟上手

1. **刷新示例表**：进入示例数据表 → 右上角「刷新全部」。三行数据会被 Chrome 打开、抓取、写回表格，状态变成「成功」。
2. **只填变量加一行**：点「添加数据行」，只填 `商品 ASIN`（如 `B0DEMO002`），保存后立即抓取。表格里就多了一行。
3. **查看历史**：点任意一行（或行尾的历史按钮），能看到每次刷新保存的快照、字段值、错误信息和数值变化。
4. **导出**：左侧「导出中心」→ 选数据表、最新/历史/两者、列和行、XLSX/CSV → 下载。

### 新建自己的数据表

「＋ 新建数据表」：

- **网址模板**：`https://example.com/item?id={{id}}`。`{{id}}` 会被替换成变量值并做 URL 编码；`{{!id}}` 表示不编码。变量在「变量」区域定义。
- **抓取设置**：页面等待策略（DOM 加载 / load / networkidle）、额外等待、超时、先等待某个元素出现、自动滚动到底部（懒加载页面）、页面动作（点击、输入、按键、滚动、执行 JS 等）。
- **自动刷新**：给这张表设置刷新间隔（如每 30 分钟）。也可以关掉单表的自动刷新，只手动刷新。

建表后进入「列模板」，每一列配置：

- **选择器**：CSS 选择器（`.price .amount`）或 XPath（`//div[@id="main"]`、`xpath=...`）。
- **提取方式**：文本、HTML、outerHTML、属性、DOM 属性、href、src、表单值、匹配数量、是否存在、执行 JS。
- **数据类型**：文本 / 数字（自动去千分位、识别 `万`/`亿`、括号负数）/ 日期（转 ISO）/ 链接 / 图片（补全为绝对地址）/ JSON / 布尔。
- **正则清洗**：可只保留匹配部分，或取第 N 个捕获组；可勾选「提取所有匹配」得到多值列（表格里显示为标签，导出时用 ` | ` 连接）。
- **抓取预览**：填好变量直接试抓，确认选择器和结果再保存。

列可以拖拽排序（列模板弹窗里的上/下移按钮），删除列不会删除历史快照里的旧值。

### 模板导入 / 导出

表设置里有「导出模板」和「导入模板」：导出得到一份 JSON（网址模板、变量、列模板、抓取设置），可以在另一台机器上导入成新表，方便分享抓取配置。

## 自动刷新与手动刷新

- 每张表在「表设置 → 自动刷新」里设置间隔（秒）。最短 30 秒。
- 页面顶部的「刷新全部」、行尾的刷新按钮、选中多行后的批量刷新都会排入后台队列。
- 抓取并发数在「设置 → Chrome 抓取器 → 并发窗口数」里调整（1–10，默认 3）。
- 每一次刷新都会写入一条 `snapshots` 记录，同时更新该行的「最近一次结果」。历史不会被覆盖。
- 全局调度器可以在「设置 → 自动刷新」里一键关闭，关闭后所有表都不再自动刷新，手动刷新仍然可用。

## 导出

独立页面：<http://127.0.0.1:4780/export>，也可以从表格右上角「导出」进入（会带上当前表）。

| 模式 | 说明 |
| --- | --- |
| 最新数据 | 每行一行，取最近一次抓取结果 |
| 历史记录 | 每次刷新一行，按时间从早到晚，适合观察价格/库存变化 |
| 两者都要 | 生成两个工作表（仅 XLSX） |

- XLSX：带表头样式、冻结首行、自动筛选、按内容调整列宽；工作表名会清理 Excel 不允许的字符。
- CSV：UTF-8 带 BOM，Excel 直接打开不乱码；字段中的逗号、引号、换行会被正确转义。
- 支持按日期范围、按行、按列导出。

## 数据库

默认使用内置 SQLite，数据文件 `data/tracker.db`（WAL 模式）。

在「设置 → 数据库」里可以：

- 测试连接
- 切换并初始化一个新数据库（会自动建表）
- 下载 SQLite 数据库备份

PostgreSQL / MySQL 需要额外安装可选依赖（不装不影响 SQLite 使用）：

```bash
npm install pg          # PostgreSQL
npm install mysql2      # MySQL
```

连接串示例：

```text
postgres://user:password@127.0.0.1:5432/internet_tracker
mysql://user:password@127.0.0.1:3306/internet_tracker
```

当前使用的数据库配置保存在 `data/config.json`，也可以直接用环境变量指定。

## Chrome 抓取器

- 默认自动查找 Chrome：macOS 的应用目录、Windows 的 Program Files、Linux 的 `google-chrome` 等；找不到时可在设置里填绝对路径，或设置 `CHROME_PATH`。
- **无头模式**默认开启；关掉后会弹出真实浏览器窗口，方便调试选择器。
- **禁用 Chrome 沙箱**默认开启。部分容器/受限环境里 Chrome 的沙箱无法启动（报 `Failed to initialize sandbox`），所以默认关闭；在你自己的可信机器上可以在设置里重新勾选启用。
- 浏览器使用持久化用户目录 `data/chrome-profile`：需要登录的站点，可以先关掉无头模式、在弹出的窗口里手动登录一次，之后抓取会复用登录状态。
- 「测试启动 Chrome」会实际启动一次浏览器并读取一个测试页，用来确认路径、无头模式和沙箱设置是否可用。

## 演示站点

<http://127.0.0.1:4780/demo> 是一个内置的商品页，价格每 12 秒浮动，页面上直接列出了每一列可用的选择器，方便验证抓取链路。示例数据表就是抓它。

## 目录结构

```text
Internet-Tracker/
├─ src/
│  ├─ server.js            # 启动入口、路由装配、优雅退出
│  ├─ config.js            # 配置读写、默认值、环境变量
│  ├─ http.js              # 极简路由器、SSE、静态文件
│  ├─ demo.js              # 内置演示商店
│  ├─ api/                 # 表、列、行、导出、设置等 REST 接口
│  ├─ db/                  # SQLite / PostgreSQL / MySQL 适配 + 数据访问
│  ├─ scraper/             # Chrome 管理、字段提取、刷新队列、调度器
│  └─ export/              # CSV 与零依赖 XLSX 生成
├─ public/                 # 前端页面（无构建）
├─ tests/                  # node:test 单元/接口测试
└─ data/                   # 运行时数据：数据库、配置、Chrome 用户目录
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `PORT` / `HOST` | 监听地址，默认 `127.0.0.1:4780` |
| `IT_DATA_DIR` | 数据目录，默认 `./data` |
| `IT_DB_FILE` | SQLite 文件路径 |
| `IT_DB_URL` | 数据库连接串（postgres/mysql） |
| `CHROME_PATH` | Chrome 可执行文件路径 |
| `IT_SEED_DEMO=0` | 不创建示例数据表 |
| `IT_SCHEDULER=0` | 不启动自动刷新调度器 |

## 测试

```bash
npm test
```

包含：CSV/XLSX 生成与解包校验、变量插值/数字解析/模板规范化、数据访问层、以及一个真实启动 HTTP 服务的接口测试（会用临时目录和临时数据库，不碰你的 `data/`）。

## 主要 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/tables` | 数据表列表（含行数、失败数、最后刷新时间） |
| POST | `/api/tables` | 新建数据表 |
| GET | `/api/tables/:id` | 表详情（含列、行、最近任务） |
| POST | `/api/tables/:id/refresh` | 刷新整表或指定行 |
| POST | `/api/tables/:id/preview` | 试抓（可带草稿列，不落库） |
| POST | `/api/tables/:id/entries` | 添加行（只需变量） |
| POST | `/api/entries/:id/refresh` | 刷新单行 |
| GET | `/api/entries/:id/history` | 历史快照（分页） |
| GET | `/api/export` | 导出 CSV / XLSX |
| GET | `/api/settings` | 当前配置、Chrome、数据库状态 |
| PUT | `/api/settings/db` | 切换数据库 |
| GET | `/api/events` | SSE 实时事件流 |

## 常见问题

**Chrome 启动失败 / Failed to initialize sandbox**
确认 Chrome 路径正确；受限环境保持「禁用 Chrome 沙箱」勾选；Linux 服务器还需要安装 Chrome 依赖库。

**选择器抓不到内容**
先用「抓取预览」调试。检查页面是否需要等待（加大额外等待或先等待元素出现）、内容是否在 iframe / Shadow DOM 里（当前版本不穿透 iframe 和 Shadow DOM）、是否需要先点击展开。

**刷新后表格没有实时变化**
页面通过 SSE 接收更新；如果代理或浏览器插件拦截了 EventSource，表格会在 15 秒轮询后自动同步。

**端口被占用**
`PORT=4800 npm start` 换一个端口。

**Node 报 `node:sqlite` 不可用**
Node 版本过低，或没有带 `--experimental-sqlite`。用 `npm start`，并确保 Node ≥ 22.13。

## 限制

- 一次抓取只处理一个页面，不做站内翻页/列表批量抓取；批量跟踪请用「多行 + 每行一个变量」。
- 不穿透 iframe / Shadow DOM。
- 抓取依赖本机 Chrome，不内置浏览器内核。
- 本项目面向本机/内网使用，默认只监听 `127.0.0.1`，没有登录鉴权；不要直接暴露到公网。

## License

MIT
