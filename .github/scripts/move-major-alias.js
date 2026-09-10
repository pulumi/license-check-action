// Moves the `vN` alias to the release named by the triggering event, so
// consumers can pin a major and still receive fixes.
const STABLE = /^v(\d+)\.(\d+)\.(\d+)$/;

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const tag = context.payload.release.tag_name;

  const parsed = STABLE.exec(tag);
  if (!parsed) {
    core.notice(`${tag} is not a stable vMAJOR.MINOR.PATCH tag; leaving the major alias alone`);
    return;
  }
  const major = `v${parsed[1]}`;

  // `matching-refs` is a prefix search, and the trailing dot is load-bearing:
  // `tags/v2.` excludes v20.0.0, which a bare `tags/v2` would sweep in. Note
  // the contrast with `getRef` below, which is an exact lookup on the
  // near-identical `git/ref` endpoint -- `tags/v1.0` 404s there even when
  // v1.0.0 exists, which is what makes the create branch reachable.
  const refs = await github.paginate(github.rest.git.listMatchingRefs, {
    owner, repo, ref: `tags/${major}.`,
  });

  const versions = refs
    .map((r) => STABLE.exec(r.ref.replace("refs/tags/", "")))
    .filter(Boolean)
    .map((m) => ({ tag: m[0], parts: [+m[1], +m[2], +m[3]] }));

  if (versions.length === 0) {
    core.setFailed(`no ${major}.x.y tags found, so ${tag} cannot be placed`);
    return;
  }

  // Numeric compare, because 9 > 10 as strings and the alias would go backwards
  // on the tenth minor release of any major.
  versions.sort((a, b) =>
    b.parts[0] - a.parts[0] || b.parts[1] - a.parts[1] || b.parts[2] - a.parts[2]);
  const highest = versions[0].tag;

  // `edited` fires on release-note changes to ANY release, including superseded
  // ones, so without this a typo fix on v1.0.0 would drag `v1` backwards.
  if (highest !== tag) {
    core.notice(`${highest} supersedes ${tag}; leaving ${major} where it is`);
    return;
  }

  // Peels an annotated tag to the commit it points at.
  const { data: commit } = await github.rest.repos.getCommit({ owner, repo, ref: tag });

  try {
    await github.rest.git.getRef({ owner, repo, ref: `tags/${major}` });
  } catch (err) {
    if (err.status !== 404) throw err;
    await github.rest.git.createRef({ owner, repo, ref: `refs/tags/${major}`, sha: commit.sha });
    core.notice(`created ${major} at ${tag} (${commit.sha})`);
    return;
  }

  await github.rest.git.updateRef({ owner, repo, ref: `tags/${major}`, sha: commit.sha, force: true });
  core.notice(`moved ${major} to ${tag} (${commit.sha})`);
};
