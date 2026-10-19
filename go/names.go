package formatio

import (
	"fmt"
	"reflect"
	"strings"
)

// routeOf turns a ServeMux pattern ("GET example.com/users/{id}") into its http.route
// ("/users/{id}"), the same conversion otelhttp applies.
func routeOf(pattern string) string {
	if i := strings.IndexByte(pattern, '/'); i >= 0 {
		return pattern[i:]
	}
	return ""
}

// exceptionType names a panic value the way the OTel SDK does when a span ends mid-panic, so
// both kinds of record group as one error.
func exceptionType(v any) string {
	t := reflect.TypeOf(v)
	if t.PkgPath() == "" && t.Name() == "" {
		return t.String()
	}
	return fmt.Sprintf("%s.%s", t.PkgPath(), t.Name())
}
