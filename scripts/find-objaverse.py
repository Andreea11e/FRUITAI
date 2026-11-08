"""FruitAI — caută în Objaverse (modele 3D cu licențe libere) câte 3 candidați pentru fiecare fruct din catalog.
Păstrează doar licențe care permit uz comercial (CC0, CC-BY, CC-BY-SA). Rezultatul (modele + raport) se publică
pe ramura `candidates`, pentru verificare vizuală înainte de a fi folosite în aplicație."""
import gzip, json, os, re, shutil, subprocess, sys
import objaverse

OUT = "candidates"
OK_LICENSES = {"cc0", "by", "by-sa"}
fruits = json.load(open("data/fruits.json"))["fruits"]
lvis = objaverse.load_lvis_annotations()
cats = sorted(lvis)
print("categorii LVIS cu fructe:", [c for c in cats if any(w in c for w in ("fruit", "berry", "apple", "melon", "orange", "lemon", "lime", "grape", "banana", "pear", "peach", "plum", "cherry", "kiwi", "mango", "papaya", "coconut", "avocado", "fig", "date", "olive", "pomegranate", "pineapple", "apricot"))])

def norm(s): return re.sub(r"[^a-z]+", " ", s.lower()).strip()
# fructul → categoriile LVIS potrivite (după numele englezesc)
EXTRA = {"orange": ["orange_(fruit)"], "kiwi": ["kiwi_fruit"], "fig": ["fig_(fruit)"], "date": ["date_(fruit)"],
         "cantaloupe": ["cantaloup", "melon"], "honeydew": ["melon"], "tangerine": ["tangerine", "orange_(fruit)"],
         "clementine": ["tangerine", "orange_(fruit)"], "blood-orange": ["orange_(fruit)"], "pomelo": ["grapefruit"],
         "plantain": ["banana"], "nectarine": ["peach"], "greengage": ["plum"], "grape": ["grape"], "cherry": ["cherry"],
         "passion-fruit": ["passion_fruit"], "olive": ["olive"], "blackberry": ["blackberry"], "raspberry": ["raspberry"],
         "blueberry": ["blueberry"], "strawberry": ["strawberry"], "watermelon": ["watermelon"], "pineapple": ["pineapple"]}
plan = {}
for f in fruits:
    names = EXTRA.get(f["id"], []) + [c for c in cats if norm(c) == norm(f["en"]) or norm(c) == norm(f["en"]) + "s"]
    uids = [u for c in dict.fromkeys(names) for u in lvis.get(c, [])]
    if uids: plan[f["id"]] = list(dict.fromkeys(uids))
print({k: len(v) for k, v in plan.items()})

allu = sorted({u for v in plan.values() for u in v})
ann = objaverse.load_annotations(allu)
report = {}
chosen = {}
for fid, uids in plan.items():
    good = []
    for u in uids:
        a = ann.get(u) or {}
        lic = (a.get("license") or "").lower()
        if lic not in OK_LICENSES: continue
        if (a.get("faceCount") or 0) > 400000: continue
        good.append((a.get("likeCount", 0) * 3 + a.get("viewCount", 0) / 100, u, a))
    good.sort(reverse=True)
    chosen[fid] = [u for _, u, _ in good[:3]]
    report[fid] = [{"uid": u, "name": a.get("name"), "license": a.get("license"), "author": (a.get("user") or {}).get("displayName"),
                    "url": a.get("viewerUrl"), "likes": a.get("likeCount"), "faces": a.get("faceCount")} for _, u, a in good[:3]]
paths = objaverse.load_objects([u for v in chosen.values() for u in v], download_processes=4)
os.makedirs(OUT, exist_ok=True)
for fid, uids in chosen.items():
    for i, u in enumerate(uids):
        src = paths.get(u)
        if not src: continue
        dst = f"{OUT}/{fid}-{i}.glb"
        r = subprocess.run(["npx", "--yes", "@gltf-transform/cli@4.1.1", "optimize", src, dst, "--compress", "meshopt",
                            "--texture-compress", "webp", "--texture-size", "1024", "--simplify", "true", "--simplify-ratio", "0.5"], capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(dst):
            print(fid, i, "conversie eșuată", r.stderr[-300:]); continue
        sz = os.path.getsize(dst)
        if sz > 6_000_000: os.remove(dst); print(fid, i, "prea mare", sz); continue
        print(fid, i, u, sz // 1024, "KB")
json.dump(report, open(f"{OUT}/report.json", "w"), indent=1, ensure_ascii=False)
