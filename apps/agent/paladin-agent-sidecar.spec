from PyInstaller.utils.hooks import collect_all, copy_metadata

datas = [
    ("config", "config"),
    ("prompts", "prompts"),
    ("skills", "skills"),
    *copy_metadata("genai-prices"),
]
hiddenimports = []
for package in ("pydantic_ai", "pydantic_deep", "ag_ui", "uvicorn", "fastapi"):
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    datas += package_datas
    hiddenimports += package_hiddenimports

analysis = Analysis(
    ["src/server/cli.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(analysis.pure)

executable = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.datas,
    [],
    name="paladin-agent-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)
