"""Download the pinned CC0 Poly Haven inputs listed in tools/blender/assets.json.

Run with the system Python 3:  python3 tools/blender/fetch_assets.py
Files land in tools/blender/.cache/polyhaven/<asset id>/ (git-ignored) and are
verified against the md5 Poly Haven publishes. Existing verified files are kept.
The sha256 of every file is written to tools/blender/assets.lock.json, which is
committed so renders can be traced to exact inputs.
"""
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache" / "polyhaven"


def digest(path: Path, algo: str) -> str:
    h = hashlib.new(algo)
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    manifest = json.loads((HERE / "assets.json").read_text())
    lock = {"schemaVersion": 1, "files": []}
    for asset in manifest["assets"]:
        for entry in asset["files"]:
            target = CACHE / asset["id"] / entry["path"]
            if "/.." in entry["path"] or entry["path"].startswith(("/", "..")):
                raise SystemExit(f"Unsafe path {entry['path']}")
            if not (target.exists() and digest(target, "md5") == entry["md5"]):
                target.parent.mkdir(parents=True, exist_ok=True)
                print(f"GET {entry['url']}")
                with urllib.request.urlopen(entry["url"], timeout=120) as r:
                    target.write_bytes(r.read())
                if digest(target, "md5") != entry["md5"]:
                    target.unlink()
                    raise SystemExit(f"md5 mismatch {entry['url']}")
            lock["files"].append(
                {
                    "asset": asset["id"],
                    "path": entry["path"],
                    "url": entry["url"],
                    "bytes": target.stat().st_size,
                    "sha256": digest(target, "sha256"),
                }
            )
    (HERE / "assets.lock.json").write_text(json.dumps(lock, indent=2) + "\n")
    print(f"{len(lock['files'])} files verified in {CACHE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
