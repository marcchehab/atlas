#!/usr/bin/env python3
"""Direkte Niveau-Zahl vs. Item-Katalog, beide gegen die korrigierten Anker vom 27.9.

Antwortschluessel sind die 12 Belege aus niveau/informatik.md mit ihrer neuen Bandzuordnung.
Stabilitaet wird ueber alle 35 zwischengespeicherten Belege gemessen, weil sie nichts
mit dem Schluessel zu tun hat.
"""
import json, re, statistics as st
from pathlib import Path

W = Path(__file__).resolve().parent.parent
E = W / 'data' / 'eval'

def schluessel():
    band, out = None, {}
    for z in (W / 'niveau' / 'informatik.md').read_text(encoding='utf8').split('\n'):
        m = re.match(r'^### (\d+)–(\d+)', z)
        if m: band = (int(m.group(1)), int(m.group(2)))
        l = re.match(r'^- \[[^\]]+\]\((https?://[^)\s]+)\)', z)
        if l and band: out[l.group(1)] = band
    return out

def rang(x):
    s = sorted(range(len(x)), key=lambda i: x[i]); r = [0.0]*len(x); i = 0
    while i < len(s):
        j = i
        while j+1 < len(s) and x[s[j+1]] == x[s[i]]: j += 1
        for k in range(i, j+1): r[s[k]] = (i+j)/2
        i = j+1
    return r

def spearman(a, b):
    ra, rb = rang(a), rang(b); n = len(a)
    ma, mb = sum(ra)/n, sum(rb)/n
    num = sum((ra[i]-ma)*(rb[i]-mb) for i in range(n))
    da = sum((v-ma)**2 for v in ra); db = sum((v-mb)**2 for v in rb)
    return num/(da*db)**.5 if da and db else float('nan')

bandnr = lambda v: (max(1, min(100, v))-1)//20

def kennzahlen(name, paare):
    """paare: [(url, (von,bis), wert_lauf1)]"""
    if not paare: return
    mitte = [(v+b)/2 for _, (v, b), _ in paare]
    w = [x for _, _, x in paare]
    tr = sum(1 for (_, (v, b), x) in paare if v <= x <= b)
    nah = sum(1 for i, (_, _, x) in enumerate(paare) if abs(bandnr(x)-bandnr(mitte[i])) <= 1)
    ab = st.mean(abs(w[i]-mitte[i]) for i in range(len(w)))
    bi = st.mean(w[i]-mitte[i] for i in range(len(w)))
    print(f"| {name} | {round(100*tr/len(w))} % | {round(100*nah/len(w))} % | {ab:.0f} | {bi:+.0f} | {spearman(mitte, w):.2f} |")

def agg_mittel(items, niv):
    t = [(niv[i['id']], i['gewicht']) for i in items if i['id'] in niv]
    return sum(n*g for n, g in t)/sum(g for _, g in t) if t else None

def agg_median(items, niv):
    t = sorted(((niv[i['id']], i['gewicht']) for i in items if i['id'] in niv))
    if not t: return None
    ges = sum(g for _, g in t); k = 0
    for n, g in t:
        k += g
        if k >= .5*ges: return n
    return t[-1][0]

key = schluessel()
niv = {m.group(1): int(m.group(2)) for m in re.finditer(
    r'^- `([a-z0-9-]+)` \| (\d+) \|', (W/'scripts'/'kriterien-informatik.md').read_text(encoding='utf8'), re.M)}

direkt = json.loads((E/'direkt_kurzanker.json').read_text())['ergebnisse']
krit = json.loads((E/'kriterien_z-ai_glm-5.3-flash.json').read_text())['ergebnisse']

print(f"Antwortschluessel: {len(key)} Belege aus den korrigierten Ankern\n")
print('| Verfahren | Band exakt | ±1 Band | Ø Abstand | Tendenz | Spearman |')
print('|---|---|---|---|---|---|')
kennzahlen('direkte Zahl', [(e['url'], key[e['url']], e['werte'][0])
                            for e in direkt if e['url'] in key and e['werte'][0] is not None])
for nm, fn in (('Katalog, gew. Mittel', agg_mittel), ('Katalog, gew. Median', agg_median)):
    zs = []
    for e in krit:
        if e['url'] not in key: continue
        ok = [d for d in e['durchgaenge'] if isinstance(d, list)]
        if not ok: continue
        v = fn(ok[0], niv)
        if v is not None: zs.append((e['url'], key[e['url']], v))
    kennzahlen(nm, zs)

print('\nStabilitaet Lauf 1 vs. 2 (alle zwischengespeicherten Belege):')
d2 = [abs(e['werte'][0]-e['werte'][1]) for e in direkt if None not in e['werte']]
print(f"  direkte Zahl         n={len(d2):2}  Ø {st.mean(d2):.1f}  Median {st.median(d2):.0f}  max {max(d2)}")
for nm, fn in (('Katalog, gew. Mittel', agg_mittel), ('Katalog, gew. Median', agg_median)):
    ds = []
    for e in krit:
        ok = [d for d in e['durchgaenge'] if isinstance(d, list)]
        if len(ok) < 2: continue
        a, b = fn(ok[0], niv), fn(ok[1], niv)
        if a is not None and b is not None: ds.append(abs(a-b))
    print(f"  {nm:20} n={len(ds):2}  Ø {st.mean(ds):.1f}  Median {st.median(ds):.0f}  max {max(ds):.0f}")

print('\nEinzeln (Soll | direkt | Katalog Mittel/Median):')
for e in krit:
    if e['url'] not in key: continue
    ok = [d for d in e['durchgaenge'] if isinstance(d, list)]
    dd = next((x['werte'] for x in direkt if x['url'] == e['url']), [None, None])
    m = agg_mittel(ok[0], niv) if ok else None
    md = agg_median(ok[0], niv) if ok else None
    v, b = key[e['url']]
    print(f"  {v:3}–{b:<3} | {str(dd[0]):>3}/{str(dd[1]):<3} | {('%.0f' % m) if m else '  -':>3}/{str(md):<3} | "
          + (' '.join('%s:%s' % (i['id'], i['gewicht']) for i in ok[0]) if ok else 'FEHLER')[:110])
