#!/usr/bin/env python3
"""Select images from Dockerfile inputs; unknown events rebuild all."""
import json
import os
from pathlib import Path
import shlex
import subprocess


def inputs(dockerfile):
    result = [dockerfile, ".dockerignore"]
    for line in Path(dockerfile).read_text().splitlines():
        if not line.startswith("COPY ") or "--from=" in line:
            continue
        parts = [p for p in shlex.split(line)[1:] if not p.startswith("--")]
        result.extend(p.rstrip("/") for p in parts[:-1])
    return result


def choose(changed):
    if changed is None or any(p.startswith((".github/", "scripts/")) for p in changed):
        return {key: True for key in IMAGES}
    result = {key: any(p == s or p.startswith(s + "/") for p in changed for s in sources())
              for key, sources in IMAGES.items()}
    # Classify deletions as well as existing files; the old path may no longer
    # exist in this checkout. All non-excluded context can affect the frontend.
    result["frontend"] = any(
        (not p.startswith(("backend/", "docker/", "docs/")) and p not in {"README.md", "LICENSE"})
        or p in {"docker/Dockerfile.frontend", "docker/Dockerfile.frontend.dockerignore"}
        for p in changed)
    return result


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    before = event.get("before") if os.environ["GITHUB_EVENT_NAME"] == "push" else event.get("pull_request", {}).get("base", {}).get("sha")
    changed = None
    if before and set(before) != {"0"}:
        changed = subprocess.check_output(["git", "diff", "--name-only", before, os.environ["GITHUB_SHA"]], text=True).splitlines()
    result = choose(changed)
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        for key, value in result.items():
            stream.write(f"{key}={str(value).lower()}\n")
    print(json.dumps(result))


IMAGES = {
    "backend": lambda: inputs("docker/Dockerfile.backend"),
    "frontend": lambda: [p.as_posix() for p in Path(".").iterdir()
                         if p.name not in {"backend", "docker", "docs", ".git", "README.md", "LICENSE"}]
                        + ["docker/Dockerfile.frontend", "docker/Dockerfile.frontend.dockerignore"],
}

if __name__ == "__main__":
    main()
