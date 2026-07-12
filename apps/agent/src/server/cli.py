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

# ---- 日志 ----
logger = logging.getLogger(__name__)

# 项目根目录
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def dotenv_enabled(runtime_mode: str | None = None) -> bool:
    """Packaged sidecars trust only the supervisor-forwarded environment."""
    mode = runtime_mode if runtime_mode is not None else os.environ.get("PALADIN_RUNTIME_MODE")
    return mode != "packaged"


def setup_environment():
    """加载 .env 并配置日志"""
    if dotenv_enabled():
        load_dotenv(PROJECT_ROOT / ".env")
    else:
        # Logfire's Pydantic plugin inspects Python source while constructing
        # validators. PyInstaller one-file executables do not always expose
        # importable source, so packaged sidecars must disable this optional
        # instrumentation before FastAPI/Pydantic models are imported.
        os.environ.setdefault("LOGFIRE_PYDANTIC_RECORD", "off")
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
    from src.agent.paladin_agent import (
        create_paladin_agent,
        load_models,
        _create_model,
        get_fallback_models,
    )

    config_path = str(PROJECT_ROOT / "config" / "models.yaml")
    prompt_path = str(PROJECT_ROOT / "prompts" / "system.md")

    # 创建 Agent
    agent = create_paladin_agent(
        models_config_path=config_path,
        system_prompt_path=prompt_path,
        workspace_dir=str(PROJECT_ROOT / "workspace"),
    )

    # 构建 fallback 链：当前模型 + 备用模型
    model_configs = load_models(config_path)
    if model_override:
        matched = [c for c in model_configs if c.id == model_override]
        if not matched:
            print(f"错误: 模型 '{model_override}' 不在配置中")
            print(f"可用模型: {', '.join(c.id for c in model_configs)}")
            sys.exit(1)
        # 指定模型时也用 fallback 链（其他模型作为备用）
        fallback_chain = [(_create_model(matched[0]), matched[0])]
        fallback_chain += [
            (_create_model(c), c)
            for c in model_configs if c.id != model_override
        ]
        print(f"使用模型: {model_override}")
    else:
        # 默认使用完整的优先级 fallback 链
        primary = model_configs[0]
        fallback_chain = [(_create_model(c), c) for c in model_configs]
        print(f"使用模型: {primary.id}")
    print(f"可用备用: {', '.join(c.id for _, c in fallback_chain[1:])}")

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
                # 按 fallback 链逐一尝试模型
                last_error = None
                for model_instance, model_cfg in fallback_chain:
                    logger.info(
                        "REPL 请求: model=%s, base_url=%s",
                        model_instance.model_name,
                        model_instance.base_url,
                    )
                    try:
                        # 传入 _default_deps: pydantic-deep 的 @agent.instructions 动态函数需要 ctx.deps
                        result = agent.run_sync(
                            user_input,
                            deps=getattr(agent, '_default_deps', None),
                            model=model_instance,
                        )
                        # 如果当前模型不是首选模型，提示用户
                        if model_cfg.id != fallback_chain[0][1].id:
                            logger.warning("主模型失败，已降级到: %s", model_cfg.id)
                        print(result.output)
                        last_error = None
                        break
                    except Exception as e:
                        last_error = e
                        logger.warning("模型 '%s' 失败: %s", model_cfg.id, e)
                        continue

                if last_error is not None:
                    print(f"\n[错误] 所有模型均失败: {last_error}")

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
    from src.server.main import app

    print(f"Paladin Agent — HTTP 服务器")
    print(f"地址:       http://localhost:{port}")
    print(f"AG-UI:     http://localhost:{port}/copilotkit")
    print(f"健康检查:   http://localhost:{port}/health")
    print(f"Swagger:   http://localhost:{port}/docs")
    print("-" * 50)

    uvicorn.run(
        "src.server.main:app" if dev else app,
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
