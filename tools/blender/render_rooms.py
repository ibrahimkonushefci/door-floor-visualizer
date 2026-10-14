"""Build and render every door model of one or more rooms.

    python3 tools/blender/render_rooms.py <room-id> [...] [--samples 512] [--skip-done]

For each room the default door model (room_spec.models_for) is built and
rendered in full first; every other model is rendered with --crop around the
door (render_layers.py), so its pixels match the full render where the
importer cuts its patch. Then run `pnpm exec tsx scripts/import-rendered-scene.ts <room-id>`.
"""
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import room_spec as spec  # noqa: E402

BLENDER = os.environ.get("BLENDER", "/Applications/Blender.app/Contents/MacOS/Blender")


def run(script, *args):
    cmd = [BLENDER, "--background", "--factory-startup", "--python", str(HERE / script), "--", *args]
    start = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or "Traceback" in proc.stderr + proc.stdout:
        sys.stdout.write(proc.stdout[-4000:] + proc.stderr[-4000:])
        raise SystemExit(f"{script} {' '.join(args)} failed")
    return time.time() - start


def main():
    args = sys.argv[1:]
    samples = "512"
    if "--samples" in args:
        i = args.index("--samples")
        samples = args[i + 1]
        del args[i : i + 2]
    skip = "--skip-done" in args
    rooms = [a for a in args if not a.startswith("--")]
    for room_id in rooms:
        room = spec.load(room_id)
        for model in spec.models_for(room):
            done = HERE / "out" / room_id / model / "layers" / "layers.json"
            if skip and done.exists():
                print(f"{room_id}/{model}: done, skipped", flush=True)
                continue
            t_build = run("build_room.py", "--room", room_id, "--model", model)
            extra = [] if model == room.DEFAULT_MODEL else ["--crop"]
            t_render = run("render_layers.py", "--room", room_id, "--model", model, "--samples", samples, *extra)
            print(f"{room_id}/{model}: build {t_build:.0f} s, render {t_render:.0f} s{' (cropped)' if extra else ''}",
                  flush=True)


if __name__ == "__main__":
    main()
