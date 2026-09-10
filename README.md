# license-check-action

This action can be used to check the licenses of projects using Github actions. Currently, **it only checks golang dependencies**.

It uses tools modified to accurately detect and block BUSL variants in use.

## Basic usage

See [action.yml](action.yml)

```yaml
    - uses: pulumi/license-check-action@main
    with:
        module-path: provider
        # If there are any modules where the license can't be detected and is unknown,
        # you will need to check them manually and add them to the list
        ignore-modules: >-
        github.com/golang/freetype,
        github.com/jmespath/go-jmespath
```

Before using the action, you should checkout the repository you want to test and run any commands
(like `make ensure`) to fetch all the go dependencies

The `module-path` argument specifies the file path where the checked out go module you want to check is located
(the directory containing `go.mod`).

`ignore-modules` is an optional argument to manually allowlist specific modules. Usually this is necessary because the
[licenseclassifier](https://github.com/pulumi/licenseclassifier) library is unable to detect the license they are using.
It is a comma-separated string, each entry contains the start of a path under which all packages that will be ignored.
See "[Ignoring packages](https://github.com/pulumi/go-licenses#ignoring-packages)" for more details.


## Versioning

Releases are tagged `vMAJOR.MINOR.PATCH`, and a moving `vMAJOR` alias points at
the newest release in that line — the same shape as `pulumi/actions`. Publishing
a GitHub release moves the alias automatically (`.github/workflows/tag.yml`).

Consumers may pin either:

```yaml
- uses: pulumi/license-check-action@v1     # fixes and new detections, no majors
- uses: pulumi/license-check-action@v1.1.0 # frozen until you bump it
- uses: pulumi/license-check-action@main   # every merge, immediately
```

`@v1` moves, so two jobs in one workflow run can resolve it to different
commits if a release lands between them. Pin the full version when you need a
reproducible result, or while freezing during an incident.

`@main` is what the ~30 current consumers use, and that is fine for now — this
repo changes rarely and the fleet moving together has kept it consistent. The
tags exist so that stops being the only option: a bad merge here reaches every
consumer's next CI run at once, and until now there was no earlier ref to fall
back to. Pinning `@v1` is the escape hatch, whether it is adopted fleet-wide or
reached for during an incident.

### Cutting a release

Releases are hand-authored, and publishing one is what moves the alias:

```sh
gh release create v1.2.0 --generate-notes
```

The alias follows the *release*, not the tag. A version tag pushed without a
release leaves `vMAJOR` pointing at the previous one, with nothing to say so --
so cut the release rather than pushing a tag on its own. Drafts and prereleases
are ignored on purpose: a draft names a tag that does not exist yet, and a
prerelease would put `@vMAJOR` consumers on unreleased code.

Publishing out of order is safe. The alias only ever moves forward, so
re-publishing or editing an older release leaves it where it is.

Release events run the workflow at the *released tag's* commit, not at `main`.
So a release only moves the alias if its tag names a commit that already
contains `.github/workflows/tag.yml` -- tagging an older commit silently runs
whatever that commit carried. Tag releases on `main`.

Recover from a bad release by rolling forward -- revert on `main` and cut the
next patch version. `@vMAJOR` is a public ref other repos resolve on every run,
so moving it backwards changes what an already-green build meant; a new version
only ever adds a state.

The alias cannot be walked back by this workflow in any case. Publishing an
older release is reported as superseded and skipped, and the token cannot point
a ref at a commit whose `.github/workflows/` differ from `main` -- which any
older commit does, by definition. The run that made the move logs the sha it
replaced, so what changed stays on the record.

A major bump is for changes to what the action *rejects* — a go-licenses major
that reclassifies a licence, or a change to the inputs. Anything that only fixes
this action's own behaviour is a minor or patch, and reaches `@v1` consumers
without their involvement, which is the point of the alias.

## Development

`testdata/` holds two throwaway Go modules the CI workflow runs this action
against:

- `permitted/` depends on a local module carrying an MIT licence, so the action
  must pass.
- `forbidden/` depends on a local module carrying the BUSL-1.1 text, so the
  action must fail. That job asserts the failure *names the licence* rather than
  merely checking the action exited non-zero — otherwise it would go green
  exactly when detection stopped working, which is the regression worth
  catching. A third job re-runs the same fixture with a folded multi-entry
  `ignore-modules` list, matching the shape real consumers pass.

Both dependencies are local `replace`s, so no fixture is fetched over the
network and neither test can start passing because a real upstream relicensed.
The BUSL file under `testdata/forbidden/busl/` is a test fixture, not a licence
grant covering anything in this repo.

`ignore-modules` entries are literal path prefixes, not globs.

`.github/scripts/move-major-alias.js` holds the alias logic; `node --test`
runs its tests against a fake Octokit that records attempted writes.

### The go-licenses pin

`action.yml` pins `github.com/pulumi/go-licenses/v2` to an exact version and
Renovate bumps it. It used to track `@latest`, which moved every consumer onto a
new major with no review when v2 shipped, and broke `pulumi-service` CI outright
when `latest` briefly failed to resolve.

The install is also retried. Pinning fixes neither half of that: `go install`
still talks to the module proxy and the checksum database on every run, and an
outage in either fails a consumer's PR for reasons unrelated to their change.

Two limits worth knowing. The retry covers the install only — `go-licenses
check` downloads the consumer's whole dependency graph and is not retried. And
the pin's freshness depends on Renovate being onboarded to this repo; until the
app has access here, the version is simply frozen.
