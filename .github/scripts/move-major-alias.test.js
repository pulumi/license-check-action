const test = require("node:test");
const assert = require("node:assert");
const move = require("./move-major-alias.js");

// A fake Octokit: tag inventory in, attempted writes out. Same role as the `gh`
// stub, but a plain object rather than a shim on PATH.
function harness({ tags, aliases }) {
  const writes = [];
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
          if (!aliases.includes(ref.replace("tags/", ""))) throw err(404);
          return { data: {} };
        },
        createRef: async (p) => { writes.push(["create", p.ref, p.sha]); },
        updateRef: async (p) => { writes.push(["update", p.ref, p.sha]); },
      },
      repos: { getCommit: async () => ({ data: { sha: "1".repeat(40) } }) },
    },
  };
  const core = {
    notice: (m) => notices.push(m),
    setFailed: (m) => failures.push(m),
  };
  return { github, core, writes, notices, failures };
}

async function run(tag, tags, aliases) {
  const h = harness({ tags, aliases });
  const context = { repo: { owner: "o", repo: "r" }, payload: { release: { tag_name: tag } } };
  await move({ github: h.github, context, core: h.core });
  return h;
}

const cases = [
  ["non-semver skips",       "latest",      ["v1.0.0"],                   ["v1"], /not a stable/,          null],
  ["prerelease skips",       "v1.2.0-rc.1", ["v1.0.0", "v1.1.0"],         ["v1"], /not a stable/,          null],
  ["superseded skips",       "v1.0.0",      ["v1.0.0", "v1.1.0"],         ["v1"], /v1\.1\.0 supersedes/,   null],
  ["moves existing alias",   "v1.1.0",      ["v1.0.0", "v1.1.0"],         ["v1"], /moved v1 to v1\.1\.0/,  "update"],
  ["creates missing alias",  "v2.0.0",      ["v1.1.0", "v2.0.0"],         ["v1"], /created v2 at v2\.0\.0/, "create"],
  ["v2.10.0 beats v2.9.0",   "v2.9.0",      ["v2.9.0", "v2.10.0"],        ["v2"], /v2\.10\.0 supersedes/,  null],
  ["v20 is not a v2",        "v2.10.0",     ["v2.9.0","v2.10.0","v20.0.0"], ["v2"], /moved v2 to v2\.10\.0/, "update"],
  ["v20 gets its own alias", "v20.0.0",     ["v2.10.0", "v20.0.0"],       ["v2"], /created v20 at v20\.0\.0/, "create"],
];

for (const [name, tag, tags, aliases, wantMsg, wantWrite] of cases) {
  test(name, async () => {
    const h = await run(tag, tags, aliases);
    assert.match(h.notices.join("\n"), wantMsg);
    if (wantWrite === null) {
      assert.deepStrictEqual(h.writes, [], "expected no write");
    } else {
      assert.strictEqual(h.writes.length, 1);
      assert.strictEqual(h.writes[0][0], wantWrite);
    }
  });
}

test("no tags for a major fails the job", async () => {
  const h = await run("v3.0.0", ["v1.0.0", "v2.0.0"], ["v2"]);
  assert.match(h.failures.join("\n"), /no v3\.x\.y tags found/);
  assert.deepStrictEqual(h.writes, []);
});
