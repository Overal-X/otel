from __future__ import annotations

import logging
import sys
import threading
from collections.abc import Callable

from opentelemetry import trace
from opentelemetry.trace import SpanKind, Status, StatusCode
from opentelemetry.util.types import Attributes

from formatio.version import __version__

logger = logging.getLogger("formatio")

CRASH_FLUSH_MILLIS = 2000


def capture_exception(exc: BaseException | None = None, attributes: Attributes = None) -> None:
    """Record `exc` (default: the exception being handled) on the active span and mark it
    failed, or on a new span named `exception` when none is recording."""
    if exc is None:
        exc = sys.exc_info()[1]
        if exc is None:
            return
    span = trace.get_current_span()
    if span.is_recording():
        _record(span, exc, attributes)
        return
    with _tracer().start_as_current_span(
        "exception",
        kind=SpanKind.INTERNAL,
        record_exception=False,
        set_status_on_exception=False,
    ) as span:
        _record(span, exc, attributes)


def install_crash_hooks(flush: Callable[[int], bool]) -> None:
    previous_excepthook = sys.excepthook
    previous_threading_hook = threading.excepthook

    def excepthook(exc_type, exc, tb):
        _record_crash(exc, flush)
        previous_excepthook(exc_type, exc, tb)

    def threading_excepthook(args):
        _record_crash(args.exc_value, flush)
        previous_threading_hook(args)

    sys.excepthook = excepthook
    threading.excepthook = threading_excepthook


def _record_crash(exc: BaseException | None, flush: Callable[[int], bool]) -> None:
    # Ctrl-C is not a bug, and the default threading hook ignores SystemExit as a normal exit.
    if exc is None or isinstance(exc, (KeyboardInterrupt, SystemExit)):
        return
    try:
        span = _tracer().start_span("uncaught exception", kind=SpanKind.INTERNAL)
        _record(span, exc, None, escaped=True)
        span.end()
        flush(CRASH_FLUSH_MILLIS)
    except Exception:
        logger.exception("formatio: recording an uncaught exception failed")


def _record(span: trace.Span, exc: BaseException, attributes: Attributes, escaped: bool = False) -> None:
    if attributes:
        span.set_attributes(attributes)
    # The SDK writes exception.escaped as the string "False"/"True"; a crash overrides it with
    # the boolean the other Formatio SDKs send. Captures keep the SDK default.
    span.record_exception(exc, attributes={"exception.escaped": True} if escaped else None)
    # The same description OTel's own use_span gives a span that raised.
    span.set_status(Status(StatusCode.ERROR, f"{type(exc).__name__}: {exc}"))


def _tracer() -> trace.Tracer:
    return trace.get_tracer("formatio", __version__)
