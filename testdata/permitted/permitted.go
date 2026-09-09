// Package permitted depends only on permissively licensed code, so the action
// must pass against it.
package permitted

import "example.com/mit"

// Answer forces a dependency edge on the MIT module; without a real call the
// import is not one.
func Answer() int { return mit.Answer() }
