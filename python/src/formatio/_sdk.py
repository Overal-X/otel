from __future__ import annotations

import logging
import os
import threading

from opentelemetry import propagate, trace
from opentelemetry.baggage.propagation import W3CBaggagePropagator
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

from formatio import config
from formatio._capture import install_crash_hooks
from formatio._instrument import instrument_installed
from formatio.version import __version__

logger = logging.getLogger("formatio")

_lock = threading.Lock()
_initialized = False
_provider: TracerProvider | None = None


def init(endpoint: str | None = None, token: str | None = None, service_name: str | None = None) -> None:
    """Start exporting traces to Formatio. Safe to call more than once; only the first call
    counts. Arguments override the OTEL_* and FORMATIO_* environment; `endpoint` is a base URL
    such as FORMATIO_ENDPOINT, to which /v1/traces is appended."""
    global _initialized
    with _lock:
        if _initialized:
            return
        _initialized = True
        try:
            resolved = config.resolve(os.environ, endpoint, token, service_name)
            if missing := resolved.missing():
                logger.warning("formatio: tracing is off: %s", missing)
                return
            # Explicit, because the exporter otherwise resolves OTEL_EXPORTER_OTLP_* itself. It
            # still merges the env headers under these, and it only ever encodes protobuf,
            # whatever OTEL_EXPORTER_OTLP_PROTOCOL says.
            exporter = OTLPSpanExporter(endpoint=resolved.endpoint, headers=resolved.headers)
            _start(BatchSpanProcessor(exporter), resolved.service_name)
        except Exception:
            logger.exception("formatio: init failed, tracing is off")


def flush(timeout_millis: int = 2000) -> bool:
    if _provider is None:
        return False
    return _provider.force_flush(timeout_millis)


def shutdown() -> None:
    if _provider is not None:
        _provider.shutdown()


def _start(processor: SpanProcessor, service_name: str | None = None) -> TracerProvider:
    """Everything init() does once the export target is known. Tests call it directly with an
    in-memory processor."""
    global _initialized, _provider
    _initialized = True
    attributes = {"telemetry.distro.name": "formatio", "telemetry.distro.version": __version__}
    if service_name:
        attributes[SERVICE_NAME] = service_name
    provider = TracerProvider(resource=Resource.create(attributes))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    _provider = provider
    propagate.set_global_textmap(
        CompositePropagator([TraceContextTextMapPropagator(), W3CBaggagePropagator()])
    )
    install_crash_hooks(flush)
    instrument_installed(config.disabled_instrumentations(os.environ))
    return provider
