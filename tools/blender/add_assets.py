"""Pin Poly Haven assets into tools/blender/assets.json (metadata only).

    python3 tools/blender/add_assets.py <id>[:<res>] ... [--used-in <scene-id>]

Reads the public Poly Haven API (api.polyhaven.com) for each asset's author,
licence and file list, and adds one entry per asset with the URL, size and
md5 Poly Haven publishes for every file: models as the .blend plus its
textures, textures as diffuse/roughness/normal JPEGs, HDRIs as .hdr. Default
resolution is 2k. Run fetch_assets.py afterwards to download and verify.
"""
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
API = "https://api.polyhaven.com"


def get(path):
    req = urllib.request.Request(API + path, headers={"User-Agent": "porta-studio-tools/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def entry(asset_id, res, used_in):
    info, files = get(f"/info/{asset_id}"), get(f"/files/{asset_id}")
    kind = {0: "hdri", 1: "texture", 2: "model"}[info["type"]]
    out = []
    if kind == "model":
        blend = files["blend"][res]["blend"]
        out.append({"path": blend["url"].rsplit("/", 1)[1], "url": blend["url"], "size": blend["size"], "md5": blend["md5"]})
        for path, f in sorted(blend.get("include", {}).items()):
            out.append({"path": path, "url": f["url"], "size": f["size"], "md5": f["md5"]})
    elif kind == "texture":
        for key in ("Diffuse", "Rough", "nor_gl"):
            f = files[key][res]["jpg"]
            out.append({"path": f["url"].rsplit("/", 1)[1], "url": f["url"], "size": f["size"], "md5": f["md5"]})
    else:
        f = files["hdri"][res]["hdr"]
        out.append({"path": f["url"].rsplit("/", 1)[1], "url": f["url"], "size": f["size"], "md5": f["md5"]})
    return {
        "id": asset_id,
        "type": kind,
        "author": ", ".join(info["authors"].keys()),
        "page": f"https://polyhaven.com/a/{asset_id}",
        "license": "CC0-1.0",
        "usedIn": used_in,
        "files": out,
    }


def main():
    args = sys.argv[1:]
    used_in = []
    if "--used-in" in args:
        i = args.index("--used-in")
        used_in = args[i + 1].split(",")
        del args[i : i + 2]
    path = HERE / "assets.json"
    manifest = json.loads(path.read_text())
    have = {a["id"]: a for a in manifest["assets"]}
    for spec_ in args:
        asset_id, _, res = spec_.partition(":")
        if asset_id in have:
            have[asset_id]["usedIn"] = sorted(set(have[asset_id].get("usedIn", [])) | set(used_in))
            continue
        e = entry(asset_id, res or "2k", used_in)
        manifest["assets"].append(e)
        have[asset_id] = e
        print(f"{asset_id}: {len(e['files'])} files, {sum(f['size'] for f in e['files']) / 1e6:.1f} MB")
    path.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
