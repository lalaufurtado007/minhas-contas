"""Monta o index.html (app + núcleo num arquivo só) e os ícones PNG.

Uso: python3 build.py
Ao mudar o app, aumente APP_VERSION no app.html; o service worker detecta o
index.html novo sozinho e mostra "Nova versão pronta" no celular.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
app = (ROOT / "app.html").read_text(encoding="utf-8")
core = (ROOT / "core.js").read_text(encoding="utf-8")
core = core.replace('if (typeof module !== "undefined") module.exports = Core;', "")
assert "/*@@CORE@@*/" in app
out = app.replace("/*@@CORE@@*/", core.strip())
(ROOT / "index.html").write_text(out, encoding="utf-8")
version = re.search(r'APP_VERSION = "([^"]+)"', app).group(1)
print(f"index.html gerado ({len(out) // 1024} KB), versão {version}")
