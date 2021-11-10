#!/usr/bin/env bash

id="$1"
shift 1

BASE_DIR="$(dirname "${BASH_SOURCE[0]}")"

DTACH_DIR="${BASE_DIR}/dtach"
mkdir -p "${DTACH_DIR}"

while true; do
    dtach_path="${DTACH_DIR}/${id}"
    printf "\n\n"
    echo "Waiting for ${dtach_path}..."

    while [ ! -S "${dtach_path}" ]; do sleep 0.5; done
    echo "Attaching to ${dtach_path}..."
    dtach -a "${dtach_path}"
done
