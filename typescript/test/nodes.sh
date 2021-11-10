#!/usr/bin/env bash

BASE_DIR="$(dirname "${BASH_SOURCE[0]}")"

DATA_DIR="${BASE_DIR}/data"
DTACH_DIR="${BASE_DIR}/dtach"

mkdir -p "${DATA_DIR}"
mkdir -p "${DTACH_DIR}"

ubilog_cmd=(deno run --unstable -A ./src/ubilog.ts)

ports=(42001 42002 42003)

ip="127.0.0.1"
peers=()
for port in "${ports[@]}"; do
    peers+=("${ip}:${port}")
done

peers_str=$(
    IFS=,
    echo "${peers[*]}"
)

echo "Peers: $peers_str"

id=0
for port in "${ports[@]}"; do
    id=$((id + 1))
    echo "Starting node $id on port $port..."
    dtach_path="${DTACH_DIR}/${id}"
    data_dir="${DATA_DIR}/${id}"
    mkdir -p "${data_dir}"
    UBILOG_DIR="${data_dir}" dtach -n "${dtach_path}" \
        "${ubilog_cmd[@]}" --port "${port}" --display --peers "${peers_str}"
done
