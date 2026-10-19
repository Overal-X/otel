package formatio

import (
	"errors"
	"testing"
)

type panicCode int

func TestExceptionType(t *testing.T) {
	tests := []struct {
		value any
		want  string
	}{
		{"boom", "string"},
		{42, "int"},
		{errors.New("boom"), "*errors.errorString"},
		{panicCode(1), "github.com/overal-x/otel/go.panicCode"},
	}
	for _, tt := range tests {
		if got := exceptionType(tt.value); got != tt.want {
			t.Errorf("exceptionType(%#v) = %q, want %q", tt.value, got, tt.want)
		}
	}
}
