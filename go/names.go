package formatio

import "strings"

// routeOf turns a ServeMux pattern ("GET example.com/users/{id}") into its http.route
// ("/users/{id}"), the same conversion otelhttp applies.
func routeOf(pattern string) string {
	if i := strings.IndexByte(pattern, '/'); i >= 0 {
		return pattern[i:]
	}
	return ""
}
