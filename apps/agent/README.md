```bash
cd apps/agent
cp .env.example .env           # 填入 DEEPSEEK_API_KEY
uv run paladin-agent           # REPL 模式
uv run paladin-agent serve     # 启动服务器 (:9876)
curl localhost:9876/health     # 健康检查
```
