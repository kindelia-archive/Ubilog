#!/usr/bin/env bash

QT_PEERS=${1:-2}
QT_DEPLOY=${2:-QT_PEERS}
shift 2

BASE_DIR="$(dirname "${BASH_SOURCE[0]}")"

DTACH_DIR="${BASE_DIR}/dtach"
mkdir -p "${DTACH_DIR}"

first_id=$((QT_PEERS - QT_DEPLOY + 1))
for id in $(seq "$first_id" "$QT_PEERS"); do
    dtach_path="${DTACH_DIR}/${id}"
    echo "Stopping ${dtach_path}..."
    if [ -S "${dtach_path}" ]; then
        printf $'\3' | dtach -p "${dtach_path}"
    else
        echo "Socket does not exit."
    fi
done
