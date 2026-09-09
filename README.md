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
