"""Generează data/ar/<fruct>.glb (modelele pentru Google Scene Viewer pe Android).
Rulare: porniți un server în rădăcina proiectului (python3 -m http.server 8000), apoi: python3 scripts/export-ar.py"""
import asyncio, base64, os, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "ar")
async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page()
        three = os.environ.get("THREE_DIR")   # opțional: o copie locală a pachetului three@0.170.0 (fără internet)
        if three:
            async def local(route):
                rel = route.request.url.split("three@0.170.0/")[1]
                await route.fulfill(status=200, content_type="application/javascript", body=open(os.path.join(three, rel)).read())
            await pg.route("**/three@0.170.0/**", local)
        pg.on("pageerror", lambda e: print("eroare:", e))
        pg.on("console", lambda m: print("consola:", m.text) if m.type in ("error", "warning") else None)
        await pg.goto(BASE + "/tools/export-ar.html")
        await pg.wait_for_function("window.__ready", timeout=20000)
        for fid in await pg.evaluate("window.__ids"):
            data = base64.b64decode(await pg.evaluate("id => window.__export(id)", fid))
            open(os.path.join(OUT, fid + ".glb"), "wb").write(data)
            print(f"{fid}: {len(data) // 1024} KB")
        await b.close()
asyncio.run(main())
