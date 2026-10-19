from opentelemetry import trace
from opentelemetry.trace import SpanKind, StatusCode

import formatio_otel


def exception_events(span):
    return [event for event in span.events if event.name == "exception"]


def test_records_on_the_active_span(memory):
    with trace.get_tracer("test").start_as_current_span("work"):
        formatio_otel.capture_exception(ValueError("bad input"), {"order.id": "42"})

    (span,) = memory.get_finished_spans()
    assert span.name == "work"
    assert span.status.status_code is StatusCode.ERROR
    assert span.attributes["order.id"] == "42"
    (event,) = exception_events(span)
    assert event.attributes["exception.type"] == "ValueError"
    assert event.attributes["exception.message"] == "bad input"
    assert "order.id" not in event.attributes
    assert event.attributes["exception.escaped"] == "False"


def test_without_a_span_starts_one(memory):
    formatio_otel.capture_exception(KeyError("total"), {"job": "invoices"})

    (span,) = memory.get_finished_spans()
    assert span.name == "exception"
    assert span.attributes["job"] == "invoices"
    assert span.kind is SpanKind.INTERNAL
    assert span.status.status_code is StatusCode.ERROR
    (event,) = exception_events(span)
    assert event.attributes["exception.type"] == "KeyError"


def test_defaults_to_the_exception_being_handled(memory):
    try:
        {}["missing"]
    except KeyError:
        formatio_otel.capture_exception()

    (span,) = memory.get_finished_spans()
    (event,) = exception_events(span)
    assert "test_defaults_to_the_exception_being_handled" in event.attributes["exception.stacktrace"]


def test_nothing_to_capture(memory):
    formatio_otel.capture_exception()
    assert memory.get_finished_spans() == ()


def test_resource_names_the_distro(_memory_exporter):
    resource = trace.get_tracer_provider().resource
    assert resource.attributes["telemetry.distro.name"] == "formatio"
    assert resource.attributes["telemetry.distro.version"] == formatio_otel.__version__


def test_init_after_start_is_a_noop(_memory_exporter):
    provider = trace.get_tracer_provider()
    formatio_otel.init(endpoint="http://127.0.0.1:9")
    assert trace.get_tracer_provider() is provider
