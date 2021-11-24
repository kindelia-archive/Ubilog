#!/usr/bin/env bash

QT_PEERS=${1:-2}
QT_DEPLOY=${2:-QT_PEERS}
shift 2

echo "$QT_PEERS" "$QT_DEPLOY"

BASE_DIR="$(dirname "${BASH_SOURCE[0]}")"

# DATA_DIR="${BASE_DIR}/data"
DATA_DIR="/tmp/ubilog-test-data/"
DTACH_DIR="${BASE_DIR}/dtach"

mkdir -p "${DATA_DIR}"
mkdir -p "${DTACH_DIR}"

ubilog_cmd=(deno run --unstable -A ./src/cli.ts)

base_port=42000
ports=()
for i in $(seq 1 "$QT_PEERS"); do
    ports+=($((base_port + i)))
done

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
echo "Args: ${*}"

first_id=$((QT_PEERS - QT_DEPLOY + 1))
for id in $(seq "$first_id" "$QT_PEERS"); do
    port="${ports[id-1]}"
    echo "Starting node $id on port $port..."
    dtach_path="${DTACH_DIR}/${id}"
    data_dir="${DATA_DIR}/${id}"
    mkdir -p "${data_dir}"
    UBILOG_DIR="${data_dir}" dtach -n "${dtach_path}" \
        "${ubilog_cmd[@]}" --port "${port}" --display --peers "${peers_str}" \
        "$@"
done
