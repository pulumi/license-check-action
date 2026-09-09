// Package forbidden depends on a BUSL-licensed module, so the action must fail
// against it.
package forbidden

import "example.com/busl"

// Answer forces a dependency edge on the BUSL module; without a real call the
// import is not one.
func Answer() int { return busl.Answer() }
