module github.com/pulumi/license-check-action/testdata/forbidden

go 1.24

require example.com/busl v0.0.0

replace example.com/busl => ./busl
