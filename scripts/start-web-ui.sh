#!/usr/bin/env bash
# Start ACP proxy + Web UI dev server inside the devcontainer.
#
# Usage (from HOST):
#   ./scripts/start-web-ui.sh
#
# Usage (inside devcontainer):
#   ./scripts/start-web-ui.sh --local
#
# Environment:
#   ACP_PORT         ACP proxy port (default: 9315)
#   ACP_HOST         ACP proxy bind address (default: 0.0.0.0)
#   ACP_PROXY_FLAGS  Extra flags for acp-proxy (default: --no-auth)
#   ACP_AGENT_CMD    Agent command (default: claude-agent-acp)
#   UI_PORT          Web UI dev server port (default: 5173)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_USER="dev"
CONTAINER_WORKSPACE="/workspaces/acp_demo"
LOG_DIR="${ROOT_DIR}/logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/web-ui-${TIMESTAMP}.log"
DEVCONTAINER_LOG_LEVEL="${DEVCONTAINER_LOG_LEVEL:-warn}"

ACP_PORT="${ACP_PORT:-9315}"
ACP_HOST="${ACP_HOST:-0.0.0.0}"
ACP_PROXY_FLAGS="${ACP_PROXY_FLAGS:---no-auth}"
ACP_AGENT_CMD="${ACP_AGENT_CMD:-claude-agent-acp}"
UI_PORT="${UI_PORT:-5173}"

# ── If --local flag is passed, run directly (we are already inside the container)
if [[ "${1:-}" == "--local" ]]; then
  mkdir -p "${LOG_DIR}"
  echo "[INFO] Running in local mode (inside devcontainer)"

  # Install web-ui dependencies if node_modules is missing
  UI_DIR="${ROOT_DIR}/web-ui"
  if [ ! -d "${UI_DIR}/node_modules" ]; then
    echo "[INFO] Installing web-ui dependencies..."
    cd "${UI_DIR}" && npm install --silent
  fi

  # Use tmux to run both services side by side
  SESSION="acp-web-ui"
  if command -v tmux >/dev/null 2>&1; then
    if tmux has-session -t "${SESSION}" 2>/dev/null; then
      echo "[INFO] tmux session '${SESSION}' already exists, attaching..."
      exec tmux attach-session -t "${SESSION}"
    fi

    tmux new-session -d -s "${SESSION}" -x 220 -y 50

    # Pane 0: ACP proxy
    tmux send-keys -t "${SESSION}:0" \
      "echo '[ACP proxy] Starting on port ${ACP_PORT}...' && \
       acp-proxy --port ${ACP_PORT} --host ${ACP_HOST} ${ACP_PROXY_FLAGS} ${ACP_AGENT_CMD}" Enter

    # Pane 1: Web UI dev server (split horizontally)
    tmux split-window -h -t "${SESSION}:0"
    tmux send-keys -t "${SESSION}:0.1" \
      "echo '[Web UI] Starting on port ${UI_PORT}...' && \
       cd ${UI_DIR} && npm run dev -- --port ${UI_PORT} --host 0.0.0.0" Enter

    # Show status pane at the bottom
    tmux split-window -v -t "${SESSION}:0.0" -l 6
    tmux send-keys -t "${SESSION}:0.2" \
      "echo '' && \
       echo '  ACP Proxy : http://localhost:${ACP_PORT}' && \
       echo '  Web UI    : http://localhost:${UI_PORT}' && \
       echo '' && \
       echo '  WebSocket : ws://localhost:${ACP_PORT}/ws' && \
       echo '' && \
       echo '  Ctrl+B d to detach  |  Ctrl+B arrow to switch pane'" Enter

    exec tmux attach-session -t "${SESSION}"
  else
    # No tmux: run acp-proxy in background, web-ui in foreground
    echo "[INFO] tmux not found, starting acp-proxy in background..."
    acp-proxy --port "${ACP_PORT}" --host "${ACP_HOST}" ${ACP_PROXY_FLAGS} "${ACP_AGENT_CMD}" \
      >> "${LOG_FILE}" 2>&1 &
    ACP_PID=$!
    echo "[INFO] acp-proxy PID: ${ACP_PID}"
    trap "kill ${ACP_PID} 2>/dev/null || true" EXIT

    echo "[INFO] Starting Web UI on port ${UI_PORT}..."
    cd "${ROOT_DIR}/web-ui"
    exec npm run dev -- --port "${UI_PORT}" --host 0.0.0.0
  fi
fi

# ── Host mode: ensure devcontainer is up, then exec --local inside it ──

# Re-launch in tmux on the host if we're in an interactive terminal
if [ -t 0 ] && [ -t 1 ] && command -v tmux >/dev/null 2>&1 \
  && [ -z "${TMUX:-}" ] && [ "${WEB_UI_HOST_TMUX_LAUNCHED:-0}" != "1" ]; then
  HOST_SESSION="acp-web-ui-host"
  if tmux has-session -t "${HOST_SESSION}" 2>/dev/null; then
    exec tmux attach-session -t "${HOST_SESSION}"
  fi
  CMD="$(printf '%q ' "$0" "$@")"
  tmux new-session -d -s "${HOST_SESSION}" \
    "WEB_UI_HOST_TMUX_LAUNCHED=1 ${CMD}"
  exec tmux attach-session -t "${HOST_SESSION}"
fi

mkdir -p "${LOG_DIR}"
echo "[INFO] Log file: ${LOG_FILE}"
echo "[INFO] Start time: $(date -Iseconds)"

if command -v devcontainer >/dev/null 2>&1; then
  DEVCONTAINER_CMD=(devcontainer)
else
  DEVCONTAINER_CMD=(npx --yes --prefer-offline @devcontainers/cli)
fi

echo "[INFO] Running devcontainer up..."
if ! "${DEVCONTAINER_CMD[@]}" up \
    --workspace-folder "${ROOT_DIR}" \
    --log-level "${DEVCONTAINER_LOG_LEVEL}" \
    --log-format text; then
  echo "[WARN] devcontainer up failed, trying existing container..."
fi

find_container_id() {
  docker ps -q -a \
    --filter "label=devcontainer.local_folder=${ROOT_DIR}" \
    --filter "label=devcontainer.config_file=${ROOT_DIR}/.devcontainer/devcontainer.json" \
    | head -n 1
}

has_port_binding() {
  local cid="$1"
  docker inspect "${cid}" \
    --format '{{json .HostConfig.PortBindings}}' 2>/dev/null \
    | grep -q '"5173/tcp"'
}

CID="$(find_container_id)"
if [ -z "${CID}" ]; then
  echo "[ERROR] No devcontainer found for ${ROOT_DIR}"
  exit 1
fi

if ! has_port_binding "${CID}"; then
  echo "[WARN] Container missing port 5173 binding, rebuilding..."
  docker rm -f "${CID}" >/dev/null
  "${DEVCONTAINER_CMD[@]}" up \
    --workspace-folder "${ROOT_DIR}" \
    --log-level "${DEVCONTAINER_LOG_LEVEL}" \
    --log-format text
  CID="$(find_container_id)"
  if [ -z "${CID}" ]; then
    echo "[ERROR] Failed to recreate devcontainer."
    exit 1
  fi
fi

RUNNING="$(docker inspect -f '{{.State.Running}}' "${CID}" 2>/dev/null || echo false)"
if [ "${RUNNING}" != "true" ]; then
  docker start "${CID}" >/dev/null
fi

TAILSCALE_IP="$(tailscale ip -4 2>/dev/null || true)"
echo ""
echo "  Starting ACP Web UI..."
echo ""
echo "  ACP Proxy : http://localhost:${ACP_PORT}"
echo "  Web UI    : http://localhost:${UI_PORT}"
if [ -n "${TAILSCALE_IP}" ]; then
  echo "  Tailscale : http://${TAILSCALE_IP}:${UI_PORT}"
fi
echo ""

DOCKER_EXEC_CMD=(docker exec -u "${CONTAINER_USER}" -w "${CONTAINER_WORKSPACE}")
if [ -t 0 ]; then
  DOCKER_EXEC_CMD+=(-it)
else
  DOCKER_EXEC_CMD+=(-i)
fi
DOCKER_EXEC_CMD+=("${CID}" bash -lc \
  "ACP_PORT=${ACP_PORT} ACP_HOST=${ACP_HOST} ACP_PROXY_FLAGS='${ACP_PROXY_FLAGS}' \
   ACP_AGENT_CMD=${ACP_AGENT_CMD} UI_PORT=${UI_PORT} \
   ${CONTAINER_WORKSPACE}/scripts/start-web-ui.sh --local")

"${DOCKER_EXEC_CMD[@]}"

echo "[INFO] End time: $(date -Iseconds)"
