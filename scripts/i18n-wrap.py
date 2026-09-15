"""
Mechanical first pass that wraps Traditional Chinese UI strings in tr("...")
inside a .tsx file, then injects `const tr = useTr();` into every top-level
component that uses it. Handles the common shapes only - JSX text, string
attributes, string arguments to setX()/alert()/confirm()/prompt(), and
string literals inside JSX braces - and leaves anything else (module-level
constants, template literals, comparisons) for a human. Always review the
diff and run tsc afterwards.

  python scripts/i18n-wrap.py components/Foo.tsx [--server] [--show]

--server injects `const tr = await getTr();` (async server components).
--show lists the lines that still contain untranslated CJK afterwards.
"""
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8')

CJK = r'[一-鿿぀-ヿ]'
ATTRS = ('placeholder', 'title', 'aria-label', 'label', 'hint', 'alt', 'description', 'sub', 'name', 'reason', 'text', 'eyebrow', 'heading')


def wrap_text(s):
    def rep(m):
        lead, txt, trail = m.group(1), m.group(2), m.group(3)
        core = txt.strip()
        if not re.search(CJK, core) or '{' in core or '}' in core or re.search(r'[;=()`]', core):
            return m.group(0)
        pre = txt[:len(txt) - len(txt.lstrip())]
        post = txt[len(txt.rstrip()):]
        pre = ' ' if pre.strip(' ') == '' and pre else pre
        post = ' ' if post.strip(' ') == '' and post else post
        core = re.sub(r'\s*\n\s*', ' ', core).replace('"', '\\"')
        return f'{lead}{pre}{{tr("{core}")}}{post}{trail}'
    return re.sub(r'(>|\})([^<>{}]*?)(<|\{)', rep, s)


def wrap_attrs(s):
    def rep(m):
        name, val = m.group(1), m.group(2)
        if not re.search(CJK, val):
            return m.group(0)
        return f'{name}={{tr("{val}")}}'
    return re.sub(r'\b(' + '|'.join(ATTRS) + r')="([^"\n]*)"', rep, s)


def wrap_calls(s):
    def rep(m):
        fn, q, val = m.group(1), m.group(2), m.group(3)
        if not re.search(CJK, val):
            return m.group(0)
        return f'{fn}(tr("{val}")'
    return re.sub(r'\b(set[A-Z]\w*|alert|confirm|prompt|pushToast|toast)\((["\'])([^"\'\n]*)\2', rep, s)


def wrap_brace_literals(s):
    out = []
    i = 0
    for m in re.finditer(r'\{[^{}\n]*\}', s):
        seg = m.group(0)
        before = s[max(0, m.start() - 24):m.start()]
        line_start = s.rfind('\n', 0, m.start()) + 1
        line = s[line_start:m.start()].lstrip()
        jsx_pos = re.search(r'(\w=|>|\})\s*$', before) is not None
        if not jsx_pos or line.startswith(('const ', 'let ', 'export ', 'type ', 'interface ', 'return {', 'import ')):
            continue
        if 'tr(' in seg or '===' in seg or '!==' in seg or 'className' in before[-12:]:
            continue
        new = re.sub(r'(["\'])([^"\'\n]*' + CJK + r'[^"\'\n]*)\1', lambda mm: f'tr("{mm.group(2)}")', seg)
        if new != seg:
            out.append(s[i:m.start()])
            out.append(new)
            i = m.end()
    out.append(s[i:])
    return ''.join(out)


def inject_hook(s, server):
    hook = 'const tr = await getTr();' if server else 'const tr = useTr();'
    lines = s.split('\n')
    starts = [i for i, l in enumerate(lines)
              if re.match(r'^(export\s+)?(default\s+)?(async\s+)?function\s+\w+', l)
              or re.match(r'^(export\s+)?const\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*(:\s*[^=]+)?=>\s*\{\s*$', l)]
    starts.append(len(lines))
    inserted = 0
    for a, b in zip(starts, starts[1:]):
        a += inserted
        b += inserted
        body = '\n'.join(lines[a:b])
        if 'tr(' not in body or 'useTr()' in body or 'getTr()' in body:
            continue
        depth = 0
        for j in range(a, b):
            depth += lines[j].count('(') - lines[j].count(')')
            if lines[j].rstrip().endswith('{') and depth <= 0:
                nxt = lines[j + 1] if j + 1 < len(lines) else '  '
                indent = re.match(r'^\s*', nxt).group(0) or '  '
                lines.insert(j + 1, f'{indent}{hook}')
                inserted += 1
                break
    s = '\n'.join(lines)
    imp = 'import { getTr } from "@/lib/i18n/server";' if server else 'import { useTr } from "@/lib/i18n/client";'
    if imp not in s:
        m = list(re.finditer(r'^import .*;$', s, re.M))
        if m:
            kpos = m[-1].end()
            s = s[:kpos] + '\n' + imp + s[kpos:]
        else:
            s = imp + '\n' + s
    return s


def wrap_in_components(s, server):
    """Inside function bodies that already have the hook, wrap remaining plain
    string literals containing CJK unless they are compared (===, !==, case) or object keys."""
    hook = 'const tr = await getTr();' if server else 'const tr = useTr();'
    lines = s.split('\n')
    starts = [i for i, l in enumerate(lines)
              if re.match(r'^(export\s+)?(default\s+)?(async\s+)?function\s+\w+', l)
              or re.match(r'^(export\s+)?const\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*(:\s*[^=]+)?=>\s*\{\s*$', l)]
    starts.append(len(lines))
    lit = re.compile(r'(?<![\w"\'`])(["\'])([^"\'`\n]*' + CJK + r'[^"\'`\n]*)\1')
    for a, b in zip(starts, starts[1:]):
        block = lines[a:b]
        if not any(hook in l for l in block):
            continue
        for j in range(a, b):
            l = lines[j]
            st = l.strip()
            if st.startswith(('//', '*', '/*', 'case ', 'import ')):
                continue

            def rep(m, l=l):
                pre = l[:m.start()].rstrip()
                if pre.endswith(('===', '!==', '==', '!=', 'case', 'key=', 'tr(', 'k(')):
                    return m.group(0)
                if re.search(r'\b(className|href|src|key|id|name|type|kind|mode|reason|status|code)\s*[=:]\s*$', pre):
                    return m.group(0)
                return 'tr("' + m.group(2) + '")'
            lines[j] = lit.sub(rep, l)
    return '\n'.join(lines)


def main():
    path = sys.argv[1]
    server = '--server' in sys.argv
    raw = io.open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in raw else '\n'
    s = raw.replace('\r\n', '\n')
    before = len(re.findall(r'tr\("', s))
    s = wrap_text(s)
    s = wrap_attrs(s)
    s = wrap_calls(s)
    s = wrap_brace_literals(s)
    s = inject_hook(s, server)
    s = wrap_in_components(s, server)
    after = len(re.findall(r'tr\("', s))
    io.open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', nl))
    stripped = re.sub(r'tr\("[^"]*"\)', '', s)
    left = [(i, l.strip()) for i, l in enumerate(stripped.split('\n'), 1)
            if re.search(CJK, l) and not l.strip().startswith(('//', '*', '/*'))]
    print(f'{path}: wrapped {after - before}, lines with remaining CJK: {len(left)}')
    if '--show' in sys.argv:
        for i, l in left:
            print(f'  {i}: {l[:140]}')


main()
