// Package permitted depends only on permissively licensed code, so the action
// must pass against it.
package permitted

import "github.com/google/uuid"

// New exists to create a real dependency edge for go-licenses to walk.
func New() string { return uuid.NewString() }
