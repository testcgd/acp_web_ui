#!/usr/bin/env bash
# Start the devcontainer and launch Claude Code inside it.
# Usage: ./scripts/start-devcontainer-claude.sh [claude-args]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_USER="dev"
CONTAINER_WORKSPACE="/workspaces/acp_demo"
LOG_DIR="${ROOT_DIR}/logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/devcontainer-start-${TIMESTAMP}.log"
DEVCONTAINER_LOG_LEVEL="${DEVCONTAINER_LOG_LEVEL:-debug}"

if [ -t 0 ] && [ -t 1 ] && command -v tmux >/dev/null 2>&1 \
  && [ -z "${TMUX:-}" ] && [ "${CLAUDE_HOST_TMUX_LAUNCHED:-0}" != "1" ]; then
  HOST_SESSION_NAME="${CLAUDE_HOST_TMUX_SESSION:-acp-demo-claude}"
  if tmux has-session -t "${HOST_SESSION_NAME}" 2>/dev/null; then
    exec tmux attach-session -t "${HOST_SESSION_NAME}"
  fi
  CMD="$(printf '%q ' "$0" "$@")"
  tmux new-session -d -s "${HOST_SESSION_NAME}" \
    "CLAUDE_HOST_TMUX_LAUNCHED=1 ${CMD}"
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
  DEVCONTAINER_SOURCE="system"
else
  DEVCONTAINER_CMD=(npx --yes --prefer-offline @devcontainers/cli)
  DEVCONTAINER_SOURCE="npx"
fi

find_container_id() {
  docker ps -q -a \
    --filter "label=devcontainer.local_folder=${ROOT_DIR}" \
    --filter "label=devcontainer.config_file=${ROOT_DIR}/.devcontainer/devcontainer.json" \
    | head -n 1
}

ensure_container_running() {
  local cid="$1"
  local running
  running="$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || echo false)"
  if [ "${running}" != "true" ]; then
    docker start "${cid}" >/dev/null
  fi
}

is_layout_compatible() {
  local cid="$1"
  local mounts
  mounts="$(docker inspect "${cid}" --format '{{json .Mounts}}' 2>/dev/null || true)"
  [ -n "${mounts}" ] || return 1
  echo "${mounts}" | grep -q '"/claude-host"' || return 1
  echo "${mounts}" | grep -q '"/claude-host-state.json"' || return 1
  echo "${mounts}" | grep -q '"/gh-host"' || return 1
  return 0
}

echo "[INFO] devcontainer source: ${DEVCONTAINER_SOURCE}"

echo "[INFO] Running devcontainer up..."
if ! "${DEVCONTAINER_CMD[@]}" up \
    --workspace-folder "${ROOT_DIR}" \
    --log-level "${DEVCONTAINER_LOG_LEVEL}" \
    --log-format text; then
  echo "[WARN] devcontainer up failed, trying existing container fallback"
fi

CID="$(find_container_id)"
if [ -z "${CID}" ]; then
  echo "[ERROR] No devcontainer found for ${ROOT_DIR}"
  exit 1
fi
ensure_container_running "${CID}"

if ! is_layout_compatible "${CID}"; then
  echo "[WARN] Container layout is incompatible, rebuilding once..."
  docker rm -f "${CID}" >/dev/null || true
  "${DEVCONTAINER_CMD[@]}" up \
    --workspace-folder "${ROOT_DIR}" \
    --log-level "${DEVCONTAINER_LOG_LEVEL}" \
    --log-format text
  CID="$(find_container_id)"
  if [ -z "${CID}" ]; then
    echo "[ERROR] Failed to recreate devcontainer."
    exit 1
  fi
  ensure_container_running "${CID}"
  if ! is_layout_compatible "${CID}"; then
    echo "[ERROR] Container layout is still incompatible after rebuild."
    exit 1
  fi
fi

EXEC_SCRIPT='set -euo pipefail; claude --dangerously-skip-permissions "$@"'

DOCKER_EXEC_CMD=(docker exec -u "${CONTAINER_USER}" -w "${CONTAINER_WORKSPACE}" -i)
if [ -t 0 ]; then
  DOCKER_EXEC_CMD+=(-t)
fi
DOCKER_EXEC_CMD+=("${CID}" bash -lc "${EXEC_SCRIPT}" bash "$@")

if [ -t 0 ] && [ -t 1 ] && command -v script >/dev/null 2>&1; then
  printf -v DOCKER_EXEC_ESCAPED '%q ' "${DOCKER_EXEC_CMD[@]}"
  script -q -e -f "${LOG_FILE}" -c "${DOCKER_EXEC_ESCAPED}"
else
  "${DOCKER_EXEC_CMD[@]}"
fi

echo "[INFO] End time: $(date -Iseconds)"
echo "[INFO] Completed successfully. Log file: ${LOG_FILE}"
