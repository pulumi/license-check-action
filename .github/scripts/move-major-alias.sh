#!/usr/bin/env bash
#
# Moves the `vN` alias to the release named by RELEASE_TAG, so consumers can pin
# a major and still receive fixes.
#
# Reads REPO and RELEASE_TAG from the environment, and authenticates as GH_TOKEN.
# Lives in a file rather than inline in the workflow so the test suite can run it.
set -euo pipefail

# Only stable vMAJOR.MINOR.PATCH moves the alias. A prerelease would point
# everyone pinning `vN` at unreleased code, and a non-semver tag has no major
# to derive.
if [[ ! ${RELEASE_TAG} =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "::notice::${RELEASE_TAG} is not a stable vMAJOR.MINOR.PATCH tag; leaving the major alias alone"
  exit 0
fi

major=${RELEASE_TAG%%.*}

# `edited` fires when release notes change on ANY release, including superseded
# ones -- so without this guard, fixing a typo in v1.0.0's notes would drag `v1`
# back onto code two releases old.
#
# `sort -V` rather than `sort`: lexically v2.9.0 sorts above v2.10.0, which
# would move the alias backwards on the tenth minor release of any major.
highest=$(gh api "repos/${REPO}/git/refs/tags" --paginate \
  --jq '.[].ref | ltrimstr("refs/tags/")' \
  | grep -E "^${major}\.[0-9]+\.[0-9]+$" \
  | sort -V | tail -1)

if [[ ${highest} != "${RELEASE_TAG}" ]]; then
  echo "::notice::${highest} supersedes ${RELEASE_TAG}; leaving ${major} where it is"
  exit 0
fi

sha=$(gh api "repos/${REPO}/commits/${RELEASE_TAG}" --jq .sha)

if gh api "repos/${REPO}/git/ref/tags/${major}" >/dev/null 2>&1; then
  gh api -X PATCH "repos/${REPO}/git/refs/tags/${major}" -F sha="${sha}" -F force=true >/dev/null
  echo "::notice::moved ${major} to ${RELEASE_TAG} (${sha})"
else
  gh api -X POST "repos/${REPO}/git/refs" -f ref="refs/tags/${major}" -f sha="${sha}" >/dev/null
  echo "::notice::created ${major} at ${RELEASE_TAG} (${sha})"
fi
