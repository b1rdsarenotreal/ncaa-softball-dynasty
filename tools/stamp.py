"""Stamp every script and stylesheet reference with a version (?v=...) so
browsers load a matching set of files after an update instead of mixing
cached old files with new ones. Run before each commit:  python3 tools/stamp.py
"""
import pathlib, re, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = time.strftime("%Y%m%d%H%M%S")

def stamp(text, pattern):
    return re.sub(pattern, lambda m: f"{m.group(1)}?v={VERSION}{m.group(3)}", text)

for f in sorted((ROOT / "js").glob("*.js")):
    s = f.read_text()
    s2 = stamp(s, r"""((?:from|import)\s+['"]\./[\w.-]+\.js)(\?v=[\w.-]+)?(['"])""")
    if s2 != s: f.write_text(s2)

index = ROOT / "index.html"
s = index.read_text()
s = stamp(s, r"""((?:href|src)="(?:css/styles\.css|js/app\.js))(\?v=[\w.-]+)?(")""")
index.write_text(s)
print("stamped", VERSION)
