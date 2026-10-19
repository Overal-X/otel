//go:build ignore

// otelc adds this file to net/http (see otelc.yaml); it is not part of package otelc.

package http

import _ "unsafe"

// formatioRecordPanic is set by github.com/overal-x/otel/go/otelc through go:linkname. A push
// linkname is what lets a package outside the standard library reach this variable.
//
//go:linkname formatioRecordPanic
var formatioRecordPanic func(*Request, any)
