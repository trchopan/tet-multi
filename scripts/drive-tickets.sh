#!/usr/bin/env bash

# Run each ticket through the repository's OpenCode workflow without TUI input.
set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
readonly TICKETS_DIR="$PROJECT_DIR/tickets"
readonly COMMANDS_DIR="$PROJECT_DIR/.opencode/commands"
readonly RUN_DIR="${RUN_DIR:-$PROJECT_DIR/.ticket-runs}"
readonly MAX_RETRIES="${MAX_RETRIES:-2}"
readonly RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-5}"
readonly RETRY_BACKOFF="${RETRY_BACKOFF:-2}"
readonly MAX_RETRY_DELAY_SECONDS="${MAX_RETRY_DELAY_SECONDS:-300}"
readonly RETRY_JITTER_SECONDS="${RETRY_JITTER_SECONDS:-3}"
readonly PHASE_TIMEOUT_SECONDS="${PHASE_TIMEOUT_SECONDS:-1800}"
readonly TIMEOUT_KILL_SECONDS="${TIMEOUT_KILL_SECONDS:-30}"
readonly DRY_RUN="${DRY_RUN:-0}"
readonly START_AT="${1:-}"
readonly OPENCODE_PORT="${OPENCODE_PORT:-4097}"
readonly OPENCODE_SERVER_URL="http://127.0.0.1:${OPENCODE_PORT}"
readonly OPENCODE_SERVER_USERNAME="${OPENCODE_SERVER_USERNAME:-opencode}"
readonly OPENCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}"

declare -a COMPLETED_TICKETS=()
declare -a FAILED_TICKETS=()
LOCK_DIR=""
LOCK_ACQUIRED=0
CURRENT_TICKET=""
CURRENT_PHASE=""
PHASE_SESSION_ID=""
OPENCODE_SERVER_PID=""
USE_OPENCODE_SERVER=0

usage() {
	cat <<'EOF'
Usage: scripts/drive-tickets.sh [START_AT]

Runs each tickets/[0-9]*.md file in lexical order through:
  plan -> implement -> review -> fix -> handoff

START_AT may be a ticket filename or its numeric prefix, such as 004 or
004-canvas-local-play.md. Earlier tickets are skipped.

Environment:
  DRY_RUN=1                    Print commands without running OpenCode.
  MAX_RETRIES=2                Retries per failed phase after the initial attempt.
  RETRY_DELAY_SECONDS=5        Initial delay between retries.
  RETRY_BACKOFF=2              Exponential retry multiplier.
  MAX_RETRY_DELAY_SECONDS=300  Maximum retry delay before jitter.
  RETRY_JITTER_SECONDS=3       Random jitter added to retry delays.
  PHASE_TIMEOUT_SECONDS=1800   Maximum runtime for one OpenCode phase.
  TIMEOUT_KILL_SECONDS=30      Grace period after TERM before gtimeout sends KILL.
  RUN_DIR=path                 Directory for checkpoints, state, locks, and logs.

Requires GNU timeout as `gtimeout` (macOS: brew install coreutils).
EOF
}

log() {
	printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >&2
}

fatal() {
	log "ERROR: $*"
	return 1 2>/dev/null || exit 1
}

cleanup() {
	local exit_code=$?
	if [[ -n "$OPENCODE_SERVER_PID" ]]; then
		kill "$OPENCODE_SERVER_PID" 2>/dev/null || true
		wait "$OPENCODE_SERVER_PID" 2>/dev/null || true
	fi
	if (( LOCK_ACQUIRED == 1 )) && [[ -n "$LOCK_DIR" && -d "$LOCK_DIR" ]]; then
		rm -f "$LOCK_DIR/owner"
		rmdir "$LOCK_DIR" 2>/dev/null || true
	fi
	if (( exit_code != 0 )); then
		log "Stopped after ${#COMPLETED_TICKETS[@]} completed ticket(s)."
		if [[ -n "$CURRENT_TICKET" ]]; then
			log "Interrupted work: $CURRENT_TICKET${CURRENT_PHASE:+ ($CURRENT_PHASE)}"
		fi
		if (( ${#FAILED_TICKETS[@]} > 0 )); then
			log "Failed ticket(s): ${FAILED_TICKETS[*]}"
		fi
	fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

require_command() {
	command -v "$1" >/dev/null 2>&1 || fatal "Required command not found: $1"
}

validate_nonnegative_integer() {
	[[ "$2" =~ ^[0-9]+$ ]] || fatal "$1 must be a non-negative integer"
}

validate_inputs() {
	require_command opencode
	require_command jq
	require_command gtimeout
	require_command curl
	[[ -d "$TICKETS_DIR" ]] || fatal "Tickets directory not found: $TICKETS_DIR"
	[[ -d "$COMMANDS_DIR" ]] || fatal "OpenCode commands directory not found: $COMMANDS_DIR"
	for command in plan implement review fix handoff; do
		[[ -f "$COMMANDS_DIR/$command.md" ]] || fatal "OpenCode command not found: $COMMANDS_DIR/$command.md"
	done
	validate_nonnegative_integer MAX_RETRIES "$MAX_RETRIES"
	validate_nonnegative_integer RETRY_DELAY_SECONDS "$RETRY_DELAY_SECONDS"
	validate_nonnegative_integer RETRY_BACKOFF "$RETRY_BACKOFF"
	validate_nonnegative_integer MAX_RETRY_DELAY_SECONDS "$MAX_RETRY_DELAY_SECONDS"
	validate_nonnegative_integer RETRY_JITTER_SECONDS "$RETRY_JITTER_SECONDS"
	validate_nonnegative_integer PHASE_TIMEOUT_SECONDS "$PHASE_TIMEOUT_SECONDS"
	validate_nonnegative_integer TIMEOUT_KILL_SECONDS "$TIMEOUT_KILL_SECONDS"
	mkdir -p "$RUN_DIR/logs" || fatal "Cannot create run directory: $RUN_DIR"
	[[ -w "$RUN_DIR" ]] || fatal "Run directory is not writable: $RUN_DIR"
	local version
	version=$(opencode --version 2>/dev/null || true)
	if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
		USE_OPENCODE_SERVER=1
	fi
}

start_opencode_server() {
	(( USE_OPENCODE_SERVER == 1 )) || return 0
	opencode serve --hostname 127.0.0.1 --port "$OPENCODE_PORT" >"$RUN_DIR/opencode-server.log" 2>&1 &
	OPENCODE_SERVER_PID=$!
	local attempt
	for (( attempt = 1; attempt <= 30; attempt++ )); do
		if curl --fail --silent --user "$OPENCODE_SERVER_USERNAME:$OPENCODE_SERVER_PASSWORD" "$OPENCODE_SERVER_URL/global/health" >/dev/null 2>&1; then
			return 0
		fi
		sleep 1
	done
	fatal "OpenCode server did not become ready; see $RUN_DIR/opencode-server.log"
}

create_opencode_session() {
	local response
	response=$(curl --fail --silent --show-error \
		-X POST "$OPENCODE_SERVER_URL/session" \
		--user "$OPENCODE_SERVER_USERNAME:$OPENCODE_SERVER_PASSWORD" \
		-H 'content-type: application/json' \
		-d '{}') || fatal "Cannot create OpenCode session"
	jq -er '.id' <<<"$response"
}

acquire_lock() {
	LOCK_DIR="$RUN_DIR/.lock"
	if ! mkdir "$LOCK_DIR" 2>/dev/null; then
		fatal "Another ticket run is active; remove stale lock only after verifying no runner is active: $LOCK_DIR"
	fi
	if ! printf '%s\n' "pid=$$" "started=$(date '+%Y-%m-%dT%H:%M:%S%z')" >"$LOCK_DIR/owner"; then
		rmdir "$LOCK_DIR" 2>/dev/null || true
		fatal "Cannot write lock metadata: $LOCK_DIR"
	fi
	LOCK_ACQUIRED=1
}

resolve_start_ticket() {
	local requested=$1
	shift
	local ticket
	local ticket_name
	for ticket in "$@"; do
		ticket_name=$(basename "$ticket")
		if [[ "$ticket_name" == "$requested" || "$ticket_name" == "$requested-"* ]]; then
			printf '%s\n' "$ticket"
			return
		fi
	done
	fatal "Starting ticket not found: $requested"
}

session_id_from_log() {
	local log_file=$1
	jq -r '
		select(type == "object")
		| (.sessionID // .sessionId // .session?.id // .properties?.info?.id // empty)
	' "$log_file" | awk 'NF { value = $0 } END { if (value != "") print value }'
}

state_file_for() {
	printf '%s/state/%s.json\n' "$RUN_DIR" "$(basename "$1" .md)"
}

read_state_value() {
	local state_file=$1
	local key=$2
	[[ -f "$state_file" ]] || return 0
	 jq -r --arg key "$key" '.[$key] // empty' "$state_file"
}

write_state() {
	local state_file=$1
	local ticket_name=$2
	local phase=$3
	local session_id=$4
	local temporary="$state_file.tmp.$$"
	mkdir -p "$(dirname "$state_file")"
jq -n \
	--arg ticket "$ticket_name" \
	--arg phase "$phase" \
	--arg session_id "$session_id" \
	--arg updated_at "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
	'{ticket: $ticket, completed_phase: $phase, session_id: $session_id, updated_at: $updated_at}' \
	>"$temporary"
	mv -f "$temporary" "$state_file"
}

phase_number() {
	case "$1" in
		plan) printf '1\n' ;;
		implement) printf '2\n' ;;
		review) printf '3\n' ;;
		fix) printf '4\n' ;;
		handoff) printf '5\n' ;;
		*) fatal "Unknown phase: $1" ;;
	esac
}

is_retryable_failure() {
	local status=$1
	local log_file=$2
	(( status == 124 || status == 137 )) && return 0
	if grep -Eiq 'rate limit|too many requests|HTTP[ /]429|\b429\b|temporarily unavailable|service unavailable|connection reset|connection refused|network|timed out|timeout|HTTP[ /]5[0-9][0-9]' "$log_file"; then
		return 0
	fi
	if grep -Eiq 'unauthorized|forbidden|invalid (api|request|command)|authentication failed|HTTP[ /]4(0[013]|22)\b' "$log_file"; then
		return 1
	fi
	return 0
}

retry_delay() {
	local attempt=$1
	local delay=$RETRY_DELAY_SECONDS
	local multiplier=1
	local index
	for (( index = 1; index < attempt; index++ )); do
		multiplier=$((multiplier * RETRY_BACKOFF))
	done
	delay=$((delay * multiplier))
	(( delay > MAX_RETRY_DELAY_SECONDS )) && delay=$MAX_RETRY_DELAY_SECONDS
	if (( RETRY_JITTER_SECONDS > 0 )); then
		delay=$((delay + RANDOM % (RETRY_JITTER_SECONDS + 1)))
	fi
	printf '%s\n' "$delay"
}

run_phase() {
	local ticket=$1
	local phase=$2
	local session_id=${3:-}
	local ticket_name
	ticket_name=$(basename "$ticket" .md)
	local attempt=0
	local status=0
	local log_file
	local failure_kind
	local delay
	# Prevent nested OpenCode from resolving the interactive parent session.
	local -a command=(env -u OPENCODE gtimeout --signal=TERM --kill-after="${TIMEOUT_KILL_SECONDS}s" "$PHASE_TIMEOUT_SECONDS" opencode run --dir "$PROJECT_DIR" --format json --command "$phase" --dangerously-skip-permissions)
	if (( USE_OPENCODE_SERVER == 1 )); then
		command+=(--attach "$OPENCODE_SERVER_URL" --username "$OPENCODE_SERVER_USERNAME" --password "$OPENCODE_SERVER_PASSWORD")
	fi

	if [[ -n "$session_id" ]]; then
		command+=(--session "$session_id")
	fi
	command+=("$ticket" "Work autonomously. Do not ask questions; make reasonable decisions from the ticket, SPEC.md, AGENTS.md, and repository state. Complete this phase before responding.")

	while (( attempt <= MAX_RETRIES )); do
		((attempt += 1))
		log_file="$RUN_DIR/logs/$ticket_name.$phase.attempt-$attempt.jsonl"
		log "$ticket_name: $phase (attempt $attempt/$((MAX_RETRIES + 1)))"
		if [[ "$DRY_RUN" == "1" ]]; then
			printf 'DRY RUN:' >&2
			printf ' %q' "${command[@]}" >&2
			printf '\n' >&2
			PHASE_SESSION_ID=${session_id:-dry-run-session}
			return 0
		fi

		status=0
		if "${command[@]}" >"$log_file" 2>&1; then
			if [[ -z "$session_id" ]]; then
				if ! session_id=$(session_id_from_log "$log_file"); then
					status=65
				else
					[[ -n "$session_id" ]] || status=65
				fi
			fi
			if (( status == 0 )); then
				PHASE_SESSION_ID=$session_id
				return 0
			fi
		else
			status=$?
		fi

		if (( status == 124 || status == 137 )); then
			failure_kind="timeout"
		else
			failure_kind="failure"
		fi
		log "$ticket_name: $phase $failure_kind (exit $status); see $log_file"
		if (( attempt > MAX_RETRIES )) || ! is_retryable_failure "$status" "$log_file"; then
			FAILED_TICKETS+=("$ticket_name ($phase, exit $status)")
			return "$status"
		fi
		delay=$(retry_delay "$attempt")
		log "$ticket_name: retrying $phase in ${delay}s"
		sleep "$delay"
	done
}

run_ticket() {
	local ticket=$1
	local ticket_name
	ticket_name=$(basename "$ticket" .md)
	local checkpoint="$RUN_DIR/$ticket_name.complete"
	local state_file
	local completed_phase=""
	local session_id=""
	local phase
	local phase_index
	local completed_index=0
	CURRENT_TICKET=$ticket_name

	if [[ -f "$checkpoint" ]]; then
		log "$ticket_name: already completed; skipping"
		COMPLETED_TICKETS+=("$ticket_name")
		CURRENT_TICKET=""
		return 0
	fi

	state_file=$(state_file_for "$ticket")
	completed_phase=$(read_state_value "$state_file" completed_phase)
	session_id=$(read_state_value "$state_file" session_id)
	if [[ -z "$session_id" && "$DRY_RUN" != "1" && "$USE_OPENCODE_SERVER" == 1 ]]; then
		session_id=$(create_opencode_session)
	fi
	if [[ -n "$completed_phase" ]]; then
		completed_index=$(phase_number "$completed_phase")
		[[ -n "$session_id" ]] || fatal "$ticket_name: state has completed phase but no session ID: $state_file"
		log "$ticket_name: resuming after $completed_phase"
	fi

	for phase in plan implement review fix handoff; do
		CURRENT_PHASE=$phase
		phase_index=$(phase_number "$phase")
		if (( phase_index <= completed_index )); then
			continue
		fi
		if ! run_phase "$ticket" "$phase" "$session_id"; then
			fatal "$ticket_name: $phase failed; resume with the same RUN_DIR after reviewing $state_file"
		fi
		session_id=$PHASE_SESSION_ID
		write_state "$state_file" "$ticket_name" "$phase" "$session_id"
	done

	if [[ "$DRY_RUN" != "1" ]]; then
		: >"$checkpoint"
		rm -f "$state_file"
	fi
	COMPLETED_TICKETS+=("$ticket_name")
	CURRENT_PHASE=""
	CURRENT_TICKET=""
	log "$ticket_name: complete"
}

main() {
	if [[ "$START_AT" == "--help" || "$START_AT" == "-h" ]]; then
		usage
		return 0
	fi

	validate_inputs
	acquire_lock
	start_opencode_server
	local -a tickets=()
	while IFS= read -r ticket; do
		[[ -f "$ticket" ]] && tickets+=("$ticket")
	done < <(LC_ALL=C printf '%s\n' "$TICKETS_DIR"/[0-9]*.md | sort)
	(( ${#tickets[@]} > 0 )) || fatal "No numbered ticket files found in $TICKETS_DIR"

	local start_ticket=""
	if [[ -n "$START_AT" ]]; then
		start_ticket=$(resolve_start_ticket "$START_AT" "${tickets[@]}")
	fi

	local ticket
	for ticket in "${tickets[@]}"; do
		if [[ -z "$start_ticket" || "$ticket" == "$start_ticket" || "$ticket" > "$start_ticket" ]]; then
			run_ticket "$ticket"
		fi
	done

	log "Completed tickets: ${COMPLETED_TICKETS[*]}"
}

main "$@"
