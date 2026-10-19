from helpers import attributes, clean_env, run_python

import formatio_otel


def test_exports_protobuf_to_the_intake(receiver):
    result = run_python(
        "import formatio_otel\n"
        "formatio_otel.init()\n"
        "from opentelemetry import trace\n"
        "with trace.get_tracer('t').start_as_current_span('checkout'):\n"
        "    pass\n"
        "assert formatio_otel.flush()\n"
        "from opentelemetry import _logs, metrics\n"
        "from opentelemetry.sdk._logs import LoggerProvider\n"
        "from opentelemetry.sdk.metrics import MeterProvider\n"
        "assert not isinstance(metrics.get_meter_provider(), MeterProvider)\n"
        "assert not isinstance(_logs.get_logger_provider(), LoggerProvider)\n",
        clean_env(
            OTEL_EXPORTER_OTLP_ENDPOINT=receiver.url,
            OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer secret",
            OTEL_SERVICE_NAME="shop",
            OTEL_METRICS_EXPORTER="otlp",
            OTEL_LOGS_EXPORTER="otlp",
        ),
    )
    assert result.returncode == 0, result.stderr

    receiver.wait_for(lambda spans: any(s.name == "checkout" for s in spans))
    for export in receiver.exports:
        assert export.path == "/v1/traces"
        assert export.headers["content-type"] == "application/x-protobuf"
        assert export.headers["authorization"] == "Bearer secret"
    resource = attributes(receiver.exports[0].request.resource_spans[0].resource.attributes)
    assert resource["service.name"] == "shop"
    assert resource["telemetry.distro.name"] == "formatio"
    assert resource["telemetry.distro.version"] == formatio_otel.__version__


def test_formatio_shorthands(receiver):
    result = run_python(
        "import formatio_otel\n"
        "formatio_otel.init()\n"
        "formatio_otel.capture_exception(RuntimeError('handled'))\n"
        "assert formatio_otel.flush()\n",
        clean_env(FORMATIO_ENDPOINT=receiver.url, FORMATIO_TOKEN="tok"),
    )
    assert result.returncode == 0, result.stderr

    (span,) = receiver.wait_for(lambda spans: spans)
    assert span.name == "exception"
    assert receiver.exports[0].path == "/v1/traces"
    assert receiver.exports[0].headers["authorization"] == "Bearer tok"


def test_resolved_values_beat_the_exporters_own_env(receiver):
    result = run_python(
        "import formatio_otel\n"
        f"formatio_otel.init(endpoint={receiver.url!r}, token='right')\n"
        "formatio_otel.capture_exception(RuntimeError('handled'))\n"
        "assert formatio_otel.flush()\n",
        clean_env(
            OTEL_EXPORTER_OTLP_PROTOCOL="http/json",
            OTEL_EXPORTER_OTLP_TRACES_PROTOCOL="http/json",
            OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://127.0.0.1:9/elsewhere",
            OTEL_EXPORTER_OTLP_TRACES_HEADERS="authorization=Bearer wrong",
        ),
    )
    assert result.returncode == 0, result.stderr

    receiver.wait_for(lambda spans: spans)
    (export,) = receiver.exports
    assert export.path == "/v1/traces"
    assert export.headers["content-type"] == "application/x-protobuf"
    assert export.headers["authorization"] == "Bearer right"
    assert [s.name for s in export.spans()] == ["exception"]
