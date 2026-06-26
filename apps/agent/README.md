## 快速开始

```bash
cd apps/agent
cp .env.example .env           # 填入 DEEPSEEK_API_KEY
```

### 本地开发（推荐）

```bash
uv run paladin-agent serve --dev    # 启动服务器 + 热重载 (:9876)
```

`--dev` 启用 uvicorn 热重载，修改代码后自动重启。

可选参数：
- `--port 9999` / `-p 9999` — 指定端口（默认 9876）
- `--model m2` / `-m m2` — 覆盖默认模型（使用 `config/models.yaml` 中的 id）

### REPL 模式

```bash
uv run paladin-agent                # 交互式命令行对话
uv run paladin-agent --model m2     # 指定模型
```

### 验证服务

```bash
curl localhost:9876/health          # 健康检查
# 浏览器打开 http://localhost:9876/docs 查看 Swagger 文档
```
