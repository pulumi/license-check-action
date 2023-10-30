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

