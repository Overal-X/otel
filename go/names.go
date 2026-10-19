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

// exceptionType names a panic value as "pkgpath.Name". It departs from the OTel SDK only for
// predeclared types, which the SDK prints as ".string": the Errors page shows this name.
func exceptionType(v any) string {
	t := reflect.TypeOf(v)
	if t.PkgPath() == "" {
		return t.String()
	}
	return fmt.Sprintf("%s.%s", t.PkgPath(), t.Name())
}
