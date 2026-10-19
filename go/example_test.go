package formatio_test

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"

	formatio "github.com/overal-x/otel/go"
	"go.opentelemetry.io/otel/attribute"
)

func Example() {
	ctx := context.Background()
	shutdown, err := formatio.Init(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer shutdown(ctx)
	defer formatio.Recover(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /users/{id}", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "user %s\n", r.PathValue("id"))
	})
	log.Print(http.ListenAndServe(":8080", formatio.Handler(mux)))
}

func ExampleHandler() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /crash", func(http.ResponseWriter, *http.Request) {
		panic("reported in Errors, then handled by net/http as usual")
	})
	log.Print(http.ListenAndServe(":8080", formatio.Handler(mux)))
}

func ExampleTransport() {
	client := &http.Client{Transport: formatio.Transport(nil)}

	handler := func(w http.ResponseWriter, r *http.Request) {
		// The request context carries the trace, so the call joins it.
		req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, "http://payments/charge", nil)
		resp, err := client.Do(req)
		if err != nil {
			formatio.CaptureError(r.Context(), err)
			http.Error(w, "payments unavailable", http.StatusBadGateway)
			return
		}
		resp.Body.Close()
	}
	http.Handle("GET /checkout", formatio.Handler(http.HandlerFunc(handler)))
}

func ExampleCaptureError() {
	ctx := context.Background()
	if err := syncInvoices(ctx); err != nil {
		formatio.CaptureError(ctx, err, attribute.String("job", "sync-invoices"))
	}
}

func ExampleRecover() {
	ctx := context.Background()
	go func() {
		defer formatio.Recover(ctx)
		_ = syncInvoices(ctx)
	}()
}

func syncInvoices(context.Context) error { return errors.New("ledger unreachable") }
