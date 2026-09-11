#!/usr/bin/env bash
set -euo pipefail
# Upload the already-tested images, with at most two concurrent uploads.
push_image() {
  local image="$1"
  local succeeded=false
  for attempt in 1 2 3; do
    if timeout 12m docker push "${image}:1.0.${GITHUB_RUN_NUMBER}"; then
      succeeded=true
      break
    fi
    sleep "$((attempt * 10))"
  done
  [[ "${succeeded}" == true ]]
  timeout 3m docker push "${image}:sha-${GITHUB_SHA}"
}
pids=()
for image in "$@"; do
  push_image "${image}" &
  pids+=("$!")
done
failed=0
for pid in "${pids[@]}"; do
  wait "${pid}" || failed=1
done
exit "${failed}"
