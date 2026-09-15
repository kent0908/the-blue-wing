"""
Marks Traditional Chinese string literals in a lib .ts file with k("...") so
scripts/check-i18n.cjs lists them as translation keys; the UI translates
them at display time with tr(value). Skips comments, template literals,
regexes and anything already wrapped. Review the diff: strings that are
model prompts, not UI copy, should be un-marked.

  python scripts/i18n-mark.py lib/foo.ts
"""
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
CJK = r'[一-鿿぀-ヿ]'
path = sys.argv[1]
raw = io.open(path, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in raw else '\n'
lines = raw.replace('\r\n', '\n').split('\n')
lit = re.compile(r'(?<![\w"\'`])(["\'])((?:\\.|(?!\1)[^\\\n])*' + CJK + r'(?:\\.|(?!\1)[^\\\n])*)\1')
n = 0
in_block = False
for i, l in enumerate(lines):
    st = l.strip()
    if in_block:
        if '*/' in st:
            in_block = False
        continue
    if st.startswith('/*'):
        if '*/' not in st:
            in_block = True
        continue
    if st.startswith(('//', '*')) or 'import ' in st and st.startswith('import'):
        continue
    code = l.split('//')[0] if '//' in l and not re.search(r'["\'].*//.*["\']', l) else l
    def rep(m):
        global n
        pre = code[:m.start()].rstrip()
        if pre.endswith(('k(', 'tr(', '===', '!==', '==', '!=', 'case')):
            return m.group(0)
        if re.search(r'\b(id|key|code|type|kind|href|src|className|reason|status|model|slug|url|path)\s*[:=]\s*$', pre):
            return m.group(0)
        n += 1
        inner = m.group(2).replace('"', '\\"') if m.group(1) == "'" else m.group(2)
        return 'k("' + inner + '")'
    new = lit.sub(rep, code)
    lines[i] = new + (l[len(code):] if code is not l else '')
s = '\n'.join(lines)
if n and 'from "./i18n/tr"' not in s and 'from "../i18n/tr"' not in s and 'from "@/lib/i18n/tr"' not in s:
    depth = path.count('/') - 1
    rel = ('../' * depth if depth else './') + 'i18n/tr'
    imp = f'import {{ k }} from "{rel}";'
    m = list(re.finditer(r'^import .*;$', s, re.M))
    if m:
        s = s[:m[-1].end()] + '\n' + imp + s[m[-1].end():]
    else:
        s = imp + '\n' + s
io.open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', nl))
print(f'{path}: marked {n}')
