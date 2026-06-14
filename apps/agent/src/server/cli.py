"""
Paladin Agent — CLI 入口

提供两种运行模式:
- paladin-agent: 交互式 REPL
- paladin-agent serve: HTTP 服务器

用法:
    uv run paladin-agent              # REPL 模式
    uv run paladin-agent --model m2   # 指定模型
    uv run paladin-agent serve        # 启动 HTTP 服务
    uv run paladin-agent serve --dev  # 热重载开发模式
    uv run paladin-agent serve --port 9999  # 指定端口
"""
import argparse
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# 项目根目录
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def setup_environment():
    """加载 .env 并配置日志"""
    load_dotenv(PROJECT_ROOT / ".env")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


# ---- REPL 模式 ----

def run_repl(model_override: str | None = None):
    """
    交互式 REPL 循环

    从 stdin 读取用户输入，调用 Agent.run_sync() 获取回复并打印。
    Ctrl+C 退出。

    Args:
        model_override: 覆盖默认模型的配置 ID
    """
    from src.agent.paladin_agent import create_paladin_agent, load_models, _create_openai_model

    config_path = str(PROJECT_ROOT / "config" / "models.yaml")
    prompt_path = str(PROJECT_ROOT / "prompts" / "system.md")

    # 创建 Agent
    agent = create_paladin_agent(
        models_config_path=config_path,
        system_prompt_path=prompt_path,
        workspace_dir=str(PROJECT_ROOT / "workspace"),
    )

    # 覆盖模型（如果指定了 --model）
    if model_override:
        model_configs = load_models(config_path)
        matched = [c for c in model_configs if c.id == model_override]
        if not matched:
            print(f"错误: 模型 '{model_override}' 不在配置中")
            print(f"可用模型: {', '.join(c.id for c in model_configs)}")
            sys.exit(1)
        agent.model = _create_openai_model(matched[0])
        print(f"使用模型: {model_override}")
    else:
        primary = load_models(config_path)[0]
        print(f"使用模型: {primary.id}")

    print("Paladin Agent — REPL 模式")
    print("输入消息开始对话，Ctrl+C 退出")
    print("-" * 50)

    # REPL 主循环
    try:
        while True:
            user_input = input("\033[32m你: \033[0m").strip()
            if not user_input:
                continue
            if user_input.lower() in ("exit", "quit"):
                print("再见！")
                break

            print("\033[34mPaladin: \033[0m", end="", flush=True)
            try:
                # 传入 _default_deps: pydantic-deep 的 @agent.instructions 动态函数需要 ctx.deps
                result = agent.run_sync(
                    user_input,
                    deps=getattr(agent, '_default_deps', None),
                )
                print(result.data)
            except Exception as e:
                print(f"\n[错误] {e}")

    except (KeyboardInterrupt, EOFError):
        print("\n再见！")


# ---- Serve 模式 ----

def run_serve(dev: bool = False, port: int = 9876):
    """
    启动 FastAPI HTTP 服务器

    Args:
        dev: 启用热重载
        port: 监听端口
    """
    import uvicorn

    print(f"Paladin Agent — HTTP 服务器")
    print(f"地址:       http://localhost:{port}")
    print(f"AG-UI:     http://localhost:{port}/copilotkit")
    print(f"健康检查:   http://localhost:{port}/health")
    print(f"Swagger:   http://localhost:{port}/docs")
    print("-" * 50)

    uvicorn.run(
        "src.server.main:app",
        host="0.0.0.0",
        port=port,
        reload=dev,
        log_level="info",
    )


# ---- 主入口 ----

def main():
    """CLI 入口点（注册在 pyproject.toml [project.scripts]）"""
    setup_environment()

    parser = argparse.ArgumentParser(
        description="Paladin Agent — Pydantic AI + AG-UI protocol",
    )
    parser.add_argument(
        "--model", "-m",
        type=str,
        help="覆盖默认模型（使用 config/models.yaml 中的 id）",
    )

    subparsers = parser.add_subparsers(dest="command", help="运行模式")

    # serve 子命令
    serve_parser = subparsers.add_parser("serve", help="启动 HTTP 服务器")
    serve_parser.add_argument(
        "--dev", action="store_true", help="启用热重载（开发模式）"
    )
    serve_parser.add_argument(
        "--port", "-p", type=int, default=9876, help="监听端口 (默认: 9876)"
    )

    args = parser.parse_args()

    # 检查 API Key
    if not os.environ.get("DEEPSEEK_API_KEY"):
        print("警告: DEEPSEEK_API_KEY 未设置，请在 .env 中配置")
        print("复制 .env.example 为 .env 并填入你的 API Key")
        sys.exit(1)

    if args.command == "serve":
        run_serve(dev=args.dev, port=args.port)
    else:
        run_repl(model_override=args.model)


if __name__ == "__main__":
    main()
