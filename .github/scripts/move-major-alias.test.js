const test = require("node:test");
const assert = require("node:assert");
const move = require("./move-major-alias.js");

const COMMIT_SHA = "abc1234def5678901234567890abcdef12345678";
const PREVIOUS_SHA = "0000000000000000000000000000000000000000";

// A fake Octokit: tag inventory in, attempted writes out.
function harness({ tags, aliases, failGetRefWith }) {
  const writes = [];
  const commitRefs = [];
  const notices = [];
  const failures = [];
  const err = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

  const github = {
    paginate: async (_fn, { ref }) =>
      tags.filter((t) => `refs/tags/${t}`.startsWith(`refs/${ref}`))
          .map((t) => ({ ref: `refs/tags/${t}` })),
    rest: {
      git: {
        listMatchingRefs: "listMatchingRefs",
        getRef: async ({ ref }) => {
          if (failGetRefWith) throw err(failGetRefWith);
          if (!aliases.includes(ref.replace("tags/", ""))) throw err(404);
          return { data: { object: { sha: PREVIOUS_SHA } } };
        },
        createRef: async (p) => { writes.push(["create", p.ref, p.sha]); },
        updateRef: async (p) => { writes.push(["update", p.ref, p.sha, p.force]); },
      },
      // Deliberately unlike anything derivable from a tag string, so writing
      // the tag where a sha belongs cannot coincidentally pass.
      repos: { getCommit: async ({ ref }) => { commitRefs.push(ref); return { data: { sha: COMMIT_SHA } }; } },
    },
  };
  const core = {
    notice: (m) => notices.push(m),
    setFailed: (m) => failures.push(m),
  };
  return { github, core, writes, commitRefs, notices, failures };
}

async function run(tag, tags, aliases, failGetRefWith) {
  const h = harness({ tags, aliases, failGetRefWith });
  const context = { repo: { owner: "o", repo: "r" } };
  const prev = process.env.RELEASE_TAG;
  if (tag === undefined) delete process.env.RELEASE_TAG;
  else process.env.RELEASE_TAG = tag;
  try {
    await move({ github: h.github, context, core: h.core });
  } finally {
    if (prev === undefined) delete process.env.RELEASE_TAG;
    else process.env.RELEASE_TAG = prev;
  }
  return h;
}

// Columns: name, released tag, tags in the repo, existing vN aliases, expected
// notice, expected write. A write is [kind, ref, sha] or null for "must not
// write" -- asserting the ref and sha, not just the kind, is what catches an
// implementation that aliases the wrong ref or writes the tag name where a sha
// belongs.
const cases = [
  ["non-semver skips",            "latest",      ["v1.0.0"],                     ["v1"], /not a stable/,             null],
  ["prerelease-suffixed tag skips", "v1.2.0-rc.1", ["v1.0.0", "v1.1.0"],         ["v1"], /not a stable/,             null],
  ["superseded skips",            "v1.0.0",      ["v1.0.0", "v1.1.0"],           ["v1"], /v1\.1\.0 supersedes/,      null],
  ["moves existing alias",        "v1.1.0",      ["v1.0.0", "v1.1.0"],           ["v1"], /moved v1 from .* to v1\.1\.0/, ["update", "tags/v1", COMMIT_SHA, true]],
  ["creates missing alias",       "v2.0.0",      ["v1.1.0", "v2.0.0"],           ["v1"], /created v2 at v2\.0\.0/,   ["create", "refs/tags/v2", COMMIT_SHA]],
  ["v2.10.0 beats v2.9.0",        "v2.9.0",      ["v2.9.0", "v2.10.0"],          ["v2"], /v2\.10\.0 supersedes/,     null],
  ["v20 is not a v2",             "v2.10.0",     ["v2.9.0","v2.10.0","v20.0.0"], ["v2"], /moved v2 from .* to v2\.10\.0/, ["update", "tags/v2", COMMIT_SHA, true]],
  ["v20 gets its own alias",      "v20.0.0",     ["v2.10.0", "v20.0.0"],         ["v2"], /created v20 at v20\.0\.0/, ["create", "refs/tags/v20", COMMIT_SHA]],
];

for (const [name, tag, tags, aliases, wantMsg, wantWrite] of cases) {
  test(name, async () => {
    const h = await run(tag, tags, aliases);
    assert.match(h.notices.join("\n"), wantMsg);
    if (wantWrite === null) {
      assert.deepStrictEqual(h.writes, [], "expected no write");
    } else {
      assert.deepStrictEqual(h.writes, [wantWrite]);
    }
  });
}

test("the commit is fetched for the released tag, not some other ref", async () => {
  const h = await run("v1.1.0", ["v1.0.0", "v1.1.0"], ["v1"]);
  assert.deepStrictEqual(h.commitRefs, ["v1.1.0"]);
});

test("the pre-move sha is reported, so a revert has something to read", async () => {
  const h = await run("v1.1.0", ["v1.0.0", "v1.1.0"], ["v1"]);
  assert.match(h.notices.join("\n"), new RegExp(`from ${PREVIOUS_SHA} to`));
});

test("a non-404 from getRef is rethrown rather than treated as absent", async () => {
  await assert.rejects(
    () => run("v1.1.0", ["v1.0.0", "v1.1.0"], ["v1"], 403),
    (err) => err.status === 403,
  );
});

test("an unset RELEASE_TAG fails with a diagnosis", async () => {
  const h = await run(undefined, ["v1.0.0"], ["v1"]);
  assert.match(h.failures.join("\n"), /RELEASE_TAG is unset/);
  assert.deepStrictEqual(h.writes, []);
});

test("no tags for a major fails the job", async () => {
  const h = await run("v3.0.0", ["v1.0.0", "v2.0.0"], ["v2"]);
  assert.match(h.failures.join("\n"), /no v3\.x\.y tags found/);
  assert.deepStrictEqual(h.writes, []);
});
