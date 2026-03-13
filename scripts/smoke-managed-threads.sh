#!/usr/bin/env bash

set -euo pipefail

CONTROL_PLANE_URL="${CONTROL_PLANE_URL:-http://localhost:8080}"
CONTROL_PLANE_PORT="${CONTROL_PLANE_PORT:-8080}"
LOCAL_RUNTIME_URL="${LOCAL_RUNTIME_URL:-http://localhost:9876}"
RUNTIME_PORT="${RUNTIME_PORT:-9876}"
RUNTIME_NAME="${RUNTIME_NAME:-local}"
THREAD_AGENT_TYPE="${THREAD_AGENT_TYPE:-codex}"
WORKSPACE_PATH="${WORKSPACE_PATH:-$PWD}"
EXECUTION_ID="${EXECUTION_ID:-smoke-thread-$(date +%s)}"
THREAD_NAME="${THREAD_NAME:-managed-thread-smoke}"
THREAD_ROLE="${THREAD_ROLE:-engineer}"
THREAD_OBJECTIVE="${THREAD_OBJECTIVE:-Inspect the repository, summarize current architecture risks, and finish with a short completion summary.}"
POLL_ATTEMPTS="${POLL_ATTEMPTS:-30}"
POLL_SLEEP_SECONDS="${POLL_SLEEP_SECONDS:-2}"
AUTO_START_RUNTIME="${AUTO_START_RUNTIME:-1}"
AUTO_START_CONTROL_PLANE="${AUTO_START_CONTROL_PLANE:-1}"
BLOCKED_KEYS="${BLOCKED_KEYS:-}"
BLOCKED_WAIT_ATTEMPTS="${BLOCKED_WAIT_ATTEMPTS:-60}"
BLOCKED_WAIT_SECONDS="${BLOCKED_WAIT_SECONDS:-2}"
BLOCKED_MAX_SENDS="${BLOCKED_MAX_SENDS:-3}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_LOG="${RUNTIME_LOG:-/tmp/parallax-runtime-local-smoke.log}"
CONTROL_PLANE_LOG="${CONTROL_PLANE_LOG:-/tmp/parallax-control-plane-smoke.log}"

STARTED_RUNTIME_PID=""
STARTED_CONTROL_PLANE_PID=""

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${STARTED_CONTROL_PLANE_PID}" ]]; then
    kill "${STARTED_CONTROL_PLANE_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${STARTED_RUNTIME_PID}" ]]; then
    kill "${STARTED_RUNTIME_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

json_get() {
  local expr="$1"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(0,'utf8')); const value=(${expr}); if (value === undefined || value === null) process.exit(1); if (typeof value === 'object') console.log(JSON.stringify(value)); else console.log(String(value));"
}

json_try_get() {
  local expr="$1"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(0,'utf8')); const value=(${expr}); if (value === undefined || value === null) process.exit(1); if (typeof value === 'object') console.log(JSON.stringify(value)); else console.log(String(value));" 2>/dev/null || true
}

json_array_from_csv() {
  local csv="$1"
  node -e "const value=(process.argv[1]||'').split(',').map((part)=>part.trim()).filter(Boolean); console.log(JSON.stringify(value));" "${csv}"
}

http_json_request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local tmp_body
  tmp_body="$(mktemp)"

  local status
  if [[ -n "${body}" ]]; then
    status="$(curl -sS -o "${tmp_body}" -w "%{http_code}" -X "${method}" "${url}" \
      -H "Content-Type: application/json" \
      -d "${body}")"
  else
    status="$(curl -sS -o "${tmp_body}" -w "%{http_code}" -X "${method}" "${url}")"
  fi

  local response
  response="$(cat "${tmp_body}")"
  rm -f "${tmp_body}"

  if [[ "${status}" -lt 200 || "${status}" -ge 300 ]]; then
    echo "HTTP ${status} from ${url}" >&2
    if [[ -n "${response}" ]]; then
      echo "${response}" >&2
    fi
    return 1
  fi

  printf '%s' "${response}"
}

health_ready() {
  local url="$1"
  curl -fsS "${url}" >/dev/null 2>&1
}

wait_for_health() {
  local url="$1"
  local label="$2"
  local attempts="${3:-30}"
  local sleep_seconds="${4:-1}"

  for attempt in $(seq 1 "${attempts}"); do
    if health_ready "${url}"; then
      return 0
    fi
    sleep "${sleep_seconds}"
  done

  echo "${label} did not become healthy at ${url}" >&2
  return 1
}

start_runtime_if_needed() {
  if health_ready "${LOCAL_RUNTIME_URL}/api/health"; then
    echo "Runtime already healthy at ${LOCAL_RUNTIME_URL}"
    return 0
  fi

  if [[ "${AUTO_START_RUNTIME}" != "1" ]]; then
    echo "Runtime is not healthy and AUTO_START_RUNTIME=0" >&2
    return 1
  fi

  echo "Starting runtime-local..."
  (
    cd "${REPO_ROOT}" && \
    RUNTIME_PORT="${RUNTIME_PORT}" pnpm --filter @parallaxai/runtime-local dev
  ) >"${RUNTIME_LOG}" 2>&1 &
  STARTED_RUNTIME_PID="$!"

  wait_for_health "${LOCAL_RUNTIME_URL}/api/health" "runtime-local" 60 2
  echo "Runtime started"
}

start_control_plane_if_needed() {
  if health_ready "${CONTROL_PLANE_URL}/health"; then
    echo "Control plane already healthy at ${CONTROL_PLANE_URL}"
    return 0
  fi

  if [[ "${AUTO_START_CONTROL_PLANE}" != "1" ]]; then
    echo "Control plane is not healthy and AUTO_START_CONTROL_PLANE=0" >&2
    return 1
  fi

  echo "Starting control-plane..."
  (
    cd "${REPO_ROOT}" && \
    PORT="${CONTROL_PLANE_PORT}" \
    PARALLAX_LOCAL_RUNTIME_URL="${LOCAL_RUNTIME_URL}" \
    pnpm --filter @parallaxai/control-plane dev
  ) >"${CONTROL_PLANE_LOG}" 2>&1 &
  STARTED_CONTROL_PLANE_PID="$!"

  wait_for_health "${CONTROL_PLANE_URL}/health" "control-plane" 60 2
  echo "Control plane started"
}

echo "== Managed Threads Smoke Test =="
echo "Control plane: ${CONTROL_PLANE_URL}"
echo "Local runtime: ${LOCAL_RUNTIME_URL}"
echo "Runtime: ${RUNTIME_NAME}"
echo "Workspace: ${WORKSPACE_PATH}"
echo "Execution ID: ${EXECUTION_ID}"
echo

start_runtime_if_needed
start_control_plane_if_needed

prepare_payload="$(cat <<JSON
{
  "executionId": "${EXECUTION_ID}",
  "name": "${THREAD_NAME}",
  "agentType": "${THREAD_AGENT_TYPE}",
  "role": "${THREAD_ROLE}",
  "objective": "${THREAD_OBJECTIVE}",
  "preparation": {
    "workspace": {
      "path": "${WORKSPACE_PATH}"
    },
    "approvalPreset": "standard"
  },
  "metadata": {
    "source": "smoke-managed-threads"
  },
  "env": {
    "AIDER_MODEL": "${AIDER_MODEL:-}"
  }
}
JSON
)"

echo "1. Preparing thread input..."
prepare_response="$(http_json_request "POST" "${CONTROL_PLANE_URL}/api/managed-threads/prepare" "${prepare_payload}")"

prepare_workspace="$(echo "${prepare_response}" | json_try_get "data.preparation.workspace.path")"
memory_file="$(echo "${prepare_response}" | json_try_get "data.preparation.contextFiles && data.preparation.contextFiles[0] ? data.preparation.contextFiles[0].path : null")"
echo "   Preparation OK"
if [[ -n "${prepare_workspace}" ]]; then
  echo "   Prepared workspace: ${prepare_workspace}"
fi
if [[ -n "${memory_file}" ]]; then
  echo "   Memory file: ${memory_file}"
fi

echo "2. Spawning managed thread..."
spawn_response="$(http_json_request "POST" "${CONTROL_PLANE_URL}/api/managed-threads?runtime=${RUNTIME_NAME}" "${prepare_payload}")"

thread_id="$(echo "${spawn_response}" | json_get "data.id")"
echo "   Thread ID: ${thread_id}"

echo "3. Waiting for startup state..."
thread_status=""
blocked_keys_sent=0
for attempt in $(seq 1 "${POLL_ATTEMPTS}"); do
  thread_response="$(http_json_request "GET" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}")"
  thread_status="$(echo "${thread_response}" | json_get "data.status")"
  echo "   Startup attempt ${attempt}: ${thread_status}"
  if [[ "${thread_status}" == "blocked" && -n "${BLOCKED_KEYS}" && "${blocked_keys_sent}" -lt "${BLOCKED_MAX_SENDS}" ]]; then
    blocked_keys_payload="$(json_array_from_csv "${BLOCKED_KEYS}")"
    http_json_request "POST" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}/send" \
      "{\"keys\":${blocked_keys_payload}}" >/dev/null
    blocked_keys_sent=$((blocked_keys_sent + 1))
    echo "   Sent blocked-state keys (${blocked_keys_sent}/${BLOCKED_MAX_SENDS}): ${BLOCKED_KEYS}"
  fi
  if [[ "${thread_status}" == "ready" || "${thread_status}" == "idle" || "${thread_status}" == "completed" || "${thread_status}" == "failed" || "${thread_status}" == "stopped" ]]; then
    break
  fi
  sleep "${POLL_SLEEP_SECONDS}"
done

if [[ "${thread_status}" == "blocked" && "${blocked_keys_sent}" -gt 0 ]]; then
  echo "   Thread is still blocked after startup key sends"
  echo "   Complete the interactive/browser auth flow, then wait for the thread to recover"
  for attempt in $(seq 1 "${BLOCKED_WAIT_ATTEMPTS}"); do
    thread_response="$(http_json_request "GET" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}")"
    thread_status="$(echo "${thread_response}" | json_get "data.status")"
    echo "   Auth wait ${attempt}: ${thread_status}"
    if [[ "${thread_status}" == "blocked" && -n "${BLOCKED_KEYS}" && "${blocked_keys_sent}" -lt "${BLOCKED_MAX_SENDS}" ]]; then
      blocked_keys_payload="$(json_array_from_csv "${BLOCKED_KEYS}")"
      http_json_request "POST" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}/send" \
        "{\"keys\":${blocked_keys_payload}}" >/dev/null
      blocked_keys_sent=$((blocked_keys_sent + 1))
      echo "   Sent blocked-state keys (${blocked_keys_sent}/${BLOCKED_MAX_SENDS}): ${BLOCKED_KEYS}"
    fi
    if [[ "${thread_status}" == "ready" || "${thread_status}" == "idle" || "${thread_status}" == "completed" || "${thread_status}" == "failed" || "${thread_status}" == "stopped" ]]; then
      break
    fi
    sleep "${BLOCKED_WAIT_SECONDS}"
  done
fi

if [[ "${thread_status}" != "ready" && "${thread_status}" != "idle" && "${thread_status}" != "completed" && "${thread_status}" != "failed" && "${thread_status}" != "stopped" ]]; then
  echo "Thread did not settle into a supervised startup state in time" >&2
  exit 1
fi

echo "4. Sending follow-up input..."
http_json_request "POST" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}/send" \
  '{"message":"Continue, inspect the current repository state, and provide a concise completion summary when done."}' >/dev/null
echo "   Input sent"

echo "5. Polling thread state..."
for attempt in $(seq 1 "${POLL_ATTEMPTS}"); do
  thread_response="$(http_json_request "GET" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}")"
  thread_status="$(echo "${thread_response}" | json_get "data.status")"
  echo "   Attempt ${attempt}: ${thread_status}"
  if [[ "${thread_status}" == "blocked" && -n "${BLOCKED_KEYS}" && "${blocked_keys_sent}" -lt "${BLOCKED_MAX_SENDS}" ]]; then
    blocked_keys_payload="$(json_array_from_csv "${BLOCKED_KEYS}")"
    http_json_request "POST" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}/send" \
      "{\"keys\":${blocked_keys_payload}}" >/dev/null
    blocked_keys_sent=$((blocked_keys_sent + 1))
    echo "   Sent blocked-state keys (${blocked_keys_sent}/${BLOCKED_MAX_SENDS}): ${BLOCKED_KEYS}"
  fi
  if [[ "${thread_status}" == "ready" || "${thread_status}" == "idle" || "${thread_status}" == "completed" || "${thread_status}" == "failed" || "${thread_status}" == "stopped" ]]; then
    break
  fi
  sleep "${POLL_SLEEP_SECONDS}"
done

if [[ "${thread_status}" == "blocked" && "${blocked_keys_sent}" -gt 0 ]]; then
  echo "   Thread is still blocked after initial key send"
  echo "   Complete the interactive/browser auth flow, then wait for the thread to recover"
  for attempt in $(seq 1 "${BLOCKED_WAIT_ATTEMPTS}"); do
    thread_response="$(http_json_request "GET" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}")"
    thread_status="$(echo "${thread_response}" | json_get "data.status")"
    echo "   Auth wait ${attempt}: ${thread_status}"
    if [[ "${thread_status}" == "blocked" && -n "${BLOCKED_KEYS}" && "${blocked_keys_sent}" -lt "${BLOCKED_MAX_SENDS}" ]]; then
      blocked_keys_payload="$(json_array_from_csv "${BLOCKED_KEYS}")"
      http_json_request "POST" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}/send" \
        "{\"keys\":${blocked_keys_payload}}" >/dev/null
      blocked_keys_sent=$((blocked_keys_sent + 1))
      echo "   Sent blocked-state keys (${blocked_keys_sent}/${BLOCKED_MAX_SENDS}): ${BLOCKED_KEYS}"
    fi
    if [[ "${thread_status}" == "ready" || "${thread_status}" == "idle" || "${thread_status}" == "completed" || "${thread_status}" == "failed" || "${thread_status}" == "stopped" ]]; then
      break
    fi
    sleep "${BLOCKED_WAIT_SECONDS}"
  done
fi

if [[ "${thread_status}" != "ready" && "${thread_status}" != "idle" && "${thread_status}" != "completed" && "${thread_status}" != "failed" && "${thread_status}" != "stopped" ]]; then
  echo "Thread did not settle into a supervised state in time" >&2
  exit 1
fi

echo "6. Verifying persisted events..."
events_response="$(http_json_request "GET" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}/events")"
event_count="$(echo "${events_response}" | json_get "data.count")"
event_types="$(echo "${events_response}" | json_try_get "data.events.map((event) => event.type)")"
echo "   Event count: ${event_count}"
if [[ "${event_count}" -lt 1 ]]; then
  echo "Expected persisted thread events" >&2
  exit 1
fi
if [[ -n "${event_types}" ]]; then
  echo "   Event types: ${event_types}"
fi

echo "7. Verifying shared decisions..."
decisions_response="$(http_json_request "GET" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}/shared-decisions")"
decision_count="$(echo "${decisions_response}" | json_get "data.count")"
echo "   Shared decisions: ${decision_count}"

echo "8. Verifying episodic experiences..."
experiences_response="$(http_json_request "GET" "${CONTROL_PLANE_URL}/api/managed-threads/experiences?executionId=${EXECUTION_ID}")"
experience_count="$(echo "${experiences_response}" | json_get "data.count")"
echo "   Episodic experiences: ${experience_count}"

echo "9. Listing execution threads..."
execution_threads="$(http_json_request "GET" "${CONTROL_PLANE_URL}/api/managed-threads/executions/${EXECUTION_ID}")"
execution_thread_count="$(echo "${execution_threads}" | json_get "data.count")"
echo "   Execution thread count: ${execution_thread_count}"
if [[ "${execution_thread_count}" -lt 1 ]]; then
  echo "Expected execution thread listing to include the smoke thread" >&2
  exit 1
fi

echo "10. Stopping managed thread..."
http_json_request "DELETE" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}" >/dev/null || true
for attempt in $(seq 1 "${POLL_ATTEMPTS}"); do
  thread_response="$(http_json_request "GET" "${CONTROL_PLANE_URL}/api/managed-threads/${thread_id}")"
  thread_status="$(echo "${thread_response}" | json_get "data.status")"
  echo "   Stop attempt ${attempt}: ${thread_status}"
  if [[ "${thread_status}" == "stopped" || "${thread_status}" == "failed" ]]; then
    break
  fi
  sleep "${POLL_SLEEP_SECONDS}"
done

if [[ "${thread_status}" != "stopped" && "${thread_status}" != "failed" ]]; then
  echo "Thread did not stop cleanly in time" >&2
  exit 1
fi

echo
echo "Smoke test complete"
echo "Thread: ${thread_id}"
echo "Final status: ${thread_status}"
echo "Events: ${event_count}"
echo "Shared decisions: ${decision_count}"
echo "Experiences: ${experience_count}"
