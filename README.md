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

- `permitted/` depends only on permissively licensed code, so the action must
  pass.
- `forbidden/` depends on a local module carrying the BUSL-1.1 text, so the
  action must fail. That job asserts the failure rather than just running the
  action — otherwise it would go green if detection stopped working entirely,
  which is the regression worth catching. A third job re-runs the same fixture
  with `ignore-modules` set, covering the allowlist path.

The BUSL dependency is a local `replace`, so nothing in that fixture is fetched
over the network and the negative test cannot start passing because a real
upstream relicensed.

### The go-licenses pin

`action.yml` pins `github.com/pulumi/go-licenses/v2` to an exact version and
Renovate bumps it. It used to track `@latest`, which moved every consumer onto a
new major with no review when v2 shipped, and broke `pulumi-service` CI outright
when `latest` briefly failed to resolve.

The install is also retried. Pinning fixes neither half of that: `go install`
still talks to the module proxy and the checksum database on every run, and an
outage in either fails a consumer's PR for reasons that have nothing to do with
their change.
