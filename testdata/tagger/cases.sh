#!/usr/bin/env bash
# Exercises move-major-alias.sh against the `gh` stub in this directory.
# Each case asserts on both the message and the write the script did (or didn't)
# make -- a case that only checked the exit status would pass if the script
# stopped doing anything at all.
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
script=${here}/../../.github/scripts/move-major-alias.sh
export PATH="${here}:${PATH}"
export REPO=example/repo
export COMMIT_SHA=1111111111111111111111111111111111111111

failures=0

run_case() {
  local name=$1 tag=$2 tags=$3 aliases=$4 want_msg=$5 want_write=$6
  local out writes
  writes=$(mktemp)
  out=$(RELEASE_TAG=${tag} TAGS=${tags} EXISTING_ALIASES=${aliases} WRITES=${writes} bash "${script}" 2>&1)
  local got_write
  got_write=$(cat "${writes}")
  rm -f "${writes}"

  if [[ ${out} != *"${want_msg}"* ]]; then
    echo "FAIL ${name}: wanted message containing '${want_msg}', got: ${out}"
    failures=$((failures + 1))
    return
  fi
  if [[ ${want_write} == "none" && -n ${got_write} ]]; then
    echo "FAIL ${name}: expected no write, but the script called: ${got_write}"
    failures=$((failures + 1))
    return
  fi
  if [[ ${want_write} != "none" && ${got_write} != *"${want_write}"* ]]; then
    echo "FAIL ${name}: wanted a write containing '${want_write}', got: ${got_write:-<none>}"
    failures=$((failures + 1))
    return
  fi
  echo "ok   ${name}"
}

run_case "non-semver skips"       "latest"       "v1.0.0"                    "v1"     "not a stable"                    "none"
run_case "prerelease skips"       "v1.2.0-rc.1"  "v1.0.0 v1.1.0"             "v1"     "not a stable"                    "none"
run_case "superseded skips"       "v1.0.0"       "v1.0.0 v1.1.0"             "v1"     "v1.1.0 supersedes v1.0.0"        "none"
run_case "moves existing alias"   "v1.1.0"       "v1.0.0 v1.1.0"             "v1"     "moved v1 to v1.1.0"              "PATCH"
run_case "creates missing alias"  "v2.0.0"       "v1.1.0 v2.0.0"             "v1"     "created v2 at v2.0.0"            "POST"
run_case "v2.10.0 beats v2.9.0"   "v2.9.0"       "v2.9.0 v2.10.0"            "v2"     "v2.10.0 supersedes v2.9.0"       "none"
run_case "v20 is not a v2"        "v2.10.0"      "v2.9.0 v2.10.0 v20.0.0"    "v2"     "moved v2 to v2.10.0"             "PATCH"
run_case "v20 gets its own alias" "v20.0.0"      "v2.10.0 v20.0.0"           "v2"     "created v20 at v20.0.0"          "POST"
run_case "no tags for a major"    "v3.0.0"       "v1.0.0 v2.0.0"             "v2"     "no v3.x.y tags found"            "none"

if [[ ${failures} -gt 0 ]]; then
  echo "${failures} case(s) failed"
  exit 1
fi
echo "all cases passed"
