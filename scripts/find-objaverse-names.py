"""FruitAI — caută în TOATE adnotările Objaverse (după nume și etichete) modele pentru fructele care nu au încă
un model realist. Păstrează doar licențe care permit uz comercial (CC0, CC-BY, CC-BY-SA) și preferă modelele scanate.
Candidații (câte 4 pe fruct) se publică pe ramura `candidates2`, pentru verificare vizuală."""
import json, os, re, subprocess
import objaverse

OUT = "candidates"
OK = {"cc0", "by", "by-sa"}
TERMS = {
  "mango": ["mango"], "plum": ["plum", "plums"], "raspberry": ["raspberry", "raspberries"], "grapefruit": ["grapefruit"],
  "guava": ["guava"], "dragon-fruit": ["dragon fruit", "dragonfruit", "pitaya", "pitahaya"], "passion-fruit": ["passion fruit", "passionfruit", "maracuja"],
  "cranberry": ["cranberry", "cranberries"], "date": ["date fruit", "dates fruit", "medjool", "date palm fruit"], "durian": ["durian"],
  "jackfruit": ["jackfruit", "jack fruit"], "starfruit": ["starfruit", "star fruit", "carambola"], "longan": ["longan"],
  "rambutan": ["rambutan"], "quince": ["quince"], "mulberry": ["mulberry", "mulberries"], "gooseberry": ["gooseberry", "gooseberries"],
  "pomelo": ["pomelo"], "kumquat": ["kumquat"], "tamarind": ["tamarind"], "honeydew": ["honeydew", "honeydew melon"],
  "soursop": ["soursop", "guanabana", "graviola"], "custard-apple": ["custard apple", "sugar apple", "sweetsop"], "elderberry": ["elderberry", "elderberries"],
  "mangosteen": ["mangosteen"], "blackcurrant": ["blackcurrant", "black currant"], "redcurrant": ["redcurrant", "red currant"],
  "greengage": ["greengage", "green plum"], "prickly-pear": ["prickly pear", "cactus fruit", "nopal fruit"], "cherimoya": ["cherimoya", "chirimoya"],
  "medlar": ["medlar"], "olive": ["olive", "olives"],
}
BAD = re.compile(r"(juice|cake|pie|tree|plant|leaf|logo|cartoon|toon|chibi|kawaii|character|icecream|ice cream|smoothie|drink|bottle|can\b|label|shop|stand|market|scene|room|kitchen|bowl|basket|crate|box|soap|candle|keychain|plush|toy|oil|branch|bush|flower|garden|pizza|tart|salad|cocktail|emoji|icon|sticker|sign|house|car\b|truck)", re.I)
SCAN = re.compile(r"(scan|photogrammetry|realistic|photoreal|pbr|real\b)", re.I)

ann = objaverse.load_annotations()          # toate (~800 000 de modele)
print("adnotări:", len(ann))
def text(a): return " ".join([a.get("name") or ""] + [t.get("name", "") for t in a.get("tags", [])]).lower()
chosen, report = {}, {}
for fid, terms in TERMS.items():
    pats = [re.compile(r"\b" + re.escape(t) + r"\b", re.I) for t in terms]
    cand = []
    for uid, a in ann.items():
        if (a.get("license") or "").lower() not in OK: continue
        name = a.get("name") or ""
        if not any(p.search(name) for p in pats): continue          # numele trebuie să conțină fructul
        if BAD.search(name): continue
        if (a.get("faceCount") or 0) > 500000: continue
        score = (a.get("likeCount") or 0) * 3 + (a.get("viewCount") or 0) / 100 + (40 if SCAN.search(text(a)) else 0)
        cand.append((score, uid, a))
    cand.sort(key=lambda x: -x[0])
    chosen[fid] = [u for _, u, _ in cand[:4]]
    report[fid] = [{"uid": u, "name": a.get("name"), "license": a.get("license"), "author": (a.get("user") or {}).get("displayName"),
                    "url": a.get("viewerUrl"), "likes": a.get("likeCount")} for _, u, a in cand[:4]]
    print(fid, len(cand), [r["name"] for r in report[fid]])
paths = objaverse.load_objects([u for v in chosen.values() for u in v], download_processes=8)
os.makedirs(OUT, exist_ok=True)
for fid, uids in chosen.items():
    for i, u in enumerate(uids):
        src = paths.get(u)
        if not src: continue
        dst = f"{OUT}/{fid}-{i}.glb"
        r = subprocess.run(["npx", "--yes", "@gltf-transform/cli@4.1.1", "optimize", src, dst, "--compress", "meshopt",
                            "--texture-compress", "webp", "--texture-size", "1024", "--simplify", "true", "--simplify-ratio", "0.5"], capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(dst): print(fid, i, "conversie eșuată"); continue
        if os.path.getsize(dst) > 6_000_000: os.remove(dst); print(fid, i, "prea mare"); continue
        print(fid, i, u, os.path.getsize(dst) // 1024, "KB")
json.dump(report, open(f"{OUT}/report.json", "w"), indent=1, ensure_ascii=False)
