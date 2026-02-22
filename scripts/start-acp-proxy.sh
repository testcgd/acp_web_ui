#!/usr/bin/env bash
# Start the devcontainer and launch the chrome-acp proxy with Claude Code ACP.
#
# Usage:
#   ./scripts/start-acp-proxy.sh                   # default: claude-code-acp
#   ./scripts/start-acp-proxy.sh --no-auth         # override acp-proxy flags
#
# Environment:
#   ACP_PORT         Port for the proxy (default: 9315)
#   ACP_HOST         Bind address (default: 0.0.0.0, accessible via Tailscale)
#   ACP_PROXY_FLAGS  Extra flags passed to acp-proxy (default: --no-auth)
#   ACP_AGENT_CMD    Agent command (default: claude-agent-acp)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_USER="dev"
CONTAINER_WORKSPACE="/workspaces/acp_demo"
LOG_DIR="${ROOT_DIR}/logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/acp-proxy-${TIMESTAMP}.log"
DEVCONTAINER_LOG_LEVEL="${DEVCONTAINER_LOG_LEVEL:-warn}"

ACP_PORT="${ACP_PORT:-9315}"
ACP_HOST="${ACP_HOST:-0.0.0.0}"
ACP_PROXY_FLAGS="${ACP_PROXY_FLAGS:---no-auth}"
ACP_AGENT_CMD="${ACP_AGENT_CMD:-claude-agent-acp}"

if [ -t 0 ] && [ -t 1 ] && command -v tmux >/dev/null 2>&1 \
  && [ -z "${TMUX:-}" ] && [ "${ACP_HOST_TMUX_LAUNCHED:-0}" != "1" ]; then
  HOST_SESSION_NAME="${ACP_HOST_TMUX_SESSION:-acp-demo-proxy}"
  if tmux has-session -t "${HOST_SESSION_NAME}" 2>/dev/null; then
    exec tmux attach-session -t "${HOST_SESSION_NAME}"
  fi
  CMD="$(printf '%q ' "$0" "$@")"
  tmux new-session -d -s "${HOST_SESSION_NAME}" \
    "ACP_HOST_TMUX_LAUNCHED=1 ${CMD}"
  exec tmux attach-session -t "${HOST_SESSION_NAME}"
fi

mkdir -p "${LOG_DIR}" "${HOME}/.claude" "${HOME}/.config/gh"
touch "${HOME}/.gitconfig" "${HOME}/.claude.json"

if [ -t 0 ] && [ -t 1 ]; then
  : > "${LOG_FILE}"
else
  exec > >(tee -a "${LOG_FILE}") 2>&1
fi

echo "[INFO] Log file: ${LOG_FILE}"
echo "[INFO] Start time: $(date -Iseconds)"
echo "[INFO] Root dir: ${ROOT_DIR}"

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
    | grep -q "0.0.0.0"
}

CID="$(find_container_id)"

if [ -z "${CID}" ]; then
  echo "[ERROR] No devcontainer found for ${ROOT_DIR}"
  exit 1
fi

if ! has_port_binding "${CID}"; then
  echo "[WARN] Container missing 0.0.0.0:${ACP_PORT} binding, rebuilding..."
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

echo "[INFO] Agent:       ${ACP_AGENT_CMD}"
echo "[INFO] Bind:        ${ACP_HOST}:${ACP_PORT}"
echo "[INFO] Local:       http://localhost:${ACP_PORT}"
if [ -n "${TAILSCALE_IP}" ]; then
  echo "[INFO] Tailscale:   http://${TAILSCALE_IP}:${ACP_PORT}"
else
  echo "[INFO] Tailscale:   http://<tailscale-ip>:${ACP_PORT}  (run 'tailscale ip -4' to get your IP)"
fi
echo ""

DOCKER_EXEC_CMD=(docker exec -u "${CONTAINER_USER}" -w "${CONTAINER_WORKSPACE}")
if [ -t 0 ]; then
  DOCKER_EXEC_CMD+=(-it)
else
  DOCKER_EXEC_CMD+=(-i)
fi
DOCKER_EXEC_CMD+=("${CID}" bash -lc \
  "acp-proxy --port ${ACP_PORT} --host ${ACP_HOST} ${ACP_PROXY_FLAGS} ${ACP_AGENT_CMD}")

"${DOCKER_EXEC_CMD[@]}"

echo "[INFO] End time: $(date -Iseconds)"
