// Package zerocode reports whether the binary was instrumented at build time by otelc with
// Formatio's rules, in which case the SDK must not start a second pipeline.
package zerocode

// Active is set by package otelc's init, which otelc links in only when it applied our rules.
// Package initialisation finishes before main, so every SDK call sees the final value.
var Active bool
