package exception

import (
	"errors"
	"testing"
)

type panicCode int

func TestType(t *testing.T) {
	tests := []struct {
		value any
		want  string
	}{
		{"boom", "string"},
		{42, "int"},
		{errors.New("boom"), "*errors.errorString"},
		{panicCode(1), "github.com/overal-x/otel/go/internal/exception.panicCode"},
	}
	for _, tt := range tests {
		if got := Type(tt.value); got != tt.want {
			t.Errorf("Type(%#v) = %q, want %q", tt.value, got, tt.want)
		}
	}
}
