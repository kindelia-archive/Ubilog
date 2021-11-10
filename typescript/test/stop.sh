#!/usr/bin/env bash

BASE_DIR="$(dirname "${BASH_SOURCE[0]}")"

DTACH_DIR="${BASE_DIR}/dtach"
mkdir -p "${DTACH_DIR}"

for id in $(seq 3); do
    dtach_path="${DTACH_DIR}/${id}"
    echo "Stopping ${dtach_path}..."
    if [ -S "${dtach_path}" ]; then
        printf $'\3' | dtach -p "${dtach_path}"
    else
        echo "Socket does not exit."
    fi
done
