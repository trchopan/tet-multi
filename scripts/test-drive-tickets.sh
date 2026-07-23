#!/usr/bin/env bash

set -euo pipefail

readonly PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly SCRIPT="$PROJECT_DIR/scripts/drive-tickets.sh"
readonly TEST_ROOT="$(mktemp -d)"
readonly BIN_DIR="$TEST_ROOT/bin"
readonly BASE_RUN_DIR="$TEST_ROOT/run"

cleanup() {
	rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$BIN_DIR" "$BASE_RUN_DIR"

cat >"$BIN_DIR/gtimeout" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
shift 3
exec "$@"
EOF

cat >"$BIN_DIR/opencode" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
phase=""
while (( $# > 0 )); do
	case "$1" in
		--command) phase=$2; shift 2 ;;
		*) shift ;;
	esac
done
counter="${FAKE_COUNTER_DIR:?}/$phase"
count=0
if [[ -f "$counter" ]]; then
	count=$(<"$counter")
fi
count=$((count + 1))
printf '%s\n' "$count" >"$counter"

if [[ "${FAKE_MODE:-retry}" == retry && "$phase" == plan && "$count" == 1 ]]; then
	printf '%s\n' 'provider response: HTTP 429 rate limit' >&2
	exit 1
fi
if [[ "${FAKE_MODE:-retry}" == timeout && "$phase" == implement ]]; then
	exit 124
fi
if [[ "$phase" == plan ]]; then
	printf '%s\n' '{"sessionID":"test-session"}'
else
	printf '%s\n' '{}'
fi
EOF

chmod +x "$BIN_DIR/gtimeout" "$BIN_DIR/opencode"

assert_file() {
	[[ -f "$1" ]] || {
		printf 'Expected file: %s\n' "$1" >&2
		exit 1
	}
}

run_retry_test() {
	local test_run="$BASE_RUN_DIR/retry"
	mkdir -p "$test_run" "$TEST_ROOT/retry-counters"
	PATH="$BIN_DIR:$PATH" \
	RUN_DIR="$test_run" \
	FAKE_COUNTER_DIR="$TEST_ROOT/retry-counters" \
	MAX_RETRIES=1 RETRY_DELAY_SECONDS=0 RETRY_JITTER_SECONDS=0 \
	PHASE_TIMEOUT_SECONDS=10 \
	bash "$SCRIPT" 010 >/dev/null

	assert_file "$test_run/010-reconnection-and-prediction.complete"
	assert_file "$test_run/logs/010-reconnection-and-prediction.plan.attempt-1.jsonl"
	assert_file "$test_run/logs/010-reconnection-and-prediction.plan.attempt-2.jsonl"
	[[ ! -d "$test_run/.lock" ]] || {
		printf '%s\n' 'Successful run must release its lock' >&2
		exit 1
	}
}

run_timeout_test() {
	local test_run="$BASE_RUN_DIR/timeout"
	mkdir -p "$test_run" "$TEST_ROOT/timeout-counters"
	if PATH="$BIN_DIR:$PATH" \
		RUN_DIR="$test_run" \
		FAKE_COUNTER_DIR="$TEST_ROOT/timeout-counters" \
		FAKE_MODE=timeout MAX_RETRIES=0 RETRY_DELAY_SECONDS=0 \
		PHASE_TIMEOUT_SECONDS=10 \
		bash "$SCRIPT" 010 >/dev/null 2>&1; then
		printf '%s\n' 'Expected timeout run to fail' >&2
		exit 1
	fi

	assert_file "$test_run/logs/010-reconnection-and-prediction.implement.attempt-1.jsonl"
	assert_file "$test_run/state/010-reconnection-and-prediction.json"
	[[ ! -f "$test_run/010-reconnection-and-prediction.complete" ]] || {
		printf '%s\n' 'Timeout run must not create a completion checkpoint' >&2
		exit 1
	}
	[[ ! -d "$test_run/.lock" ]] || {
		printf '%s\n' 'Failed run must release its lock' >&2
		exit 1
	}
}

run_retry_test
run_timeout_test
printf '%s\n' 'drive-tickets tests passed'
