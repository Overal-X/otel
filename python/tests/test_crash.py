from helpers import attributes, clean_env, run_python
from opentelemetry.proto.trace.v1.trace_pb2 import Span, Status

CRASH = "def load_settings():\n    raise ValueError('missing DATABASE_URL')\nload_settings()\n"


def crash_event(span):
    (event,) = [e for e in span.events if e.name == "exception"]
    return attributes(event.attributes)


def test_uncaught_exception_is_exported_and_the_exit_code_kept(receiver):
    without_sdk = run_python(CRASH, clean_env())
    with_sdk = run_python("import formatio\nformatio.init()\n" + CRASH, clean_env(FORMATIO_ENDPOINT=receiver.url, FORMATIO_TOKEN="t"))

    assert without_sdk.returncode == with_sdk.returncode == 1
    assert "ValueError: missing DATABASE_URL" in with_sdk.stderr

    # The hook flushes before chaining, so the span is already there when the process is gone.
    # One span, one event: the crash is recorded once.
    (span,) = receiver.spans()
    assert span.name == "uncaught exception"
    assert span.kind == Span.SPAN_KIND_INTERNAL
    assert span.status.code == Status.STATUS_CODE_ERROR
    event = crash_event(span)
    assert event["exception.type"] == "ValueError"
    assert event["exception.escaped"] is True
    assert "load_settings" in event["exception.stacktrace"]


def test_thread_crash_is_exported_and_the_thread_hook_chained(receiver):
    result = run_python(
        "import threading, formatio\n"
        "formatio.init()\n"
        "def job():\n"
        "    raise RuntimeError('job failed')\n"
        "t = threading.Thread(target=job)\n"
        "t.start()\n"
        "t.join()\n"
        "print('still running')\n",
        clean_env(FORMATIO_ENDPOINT=receiver.url, FORMATIO_TOKEN="t"),
    )

    assert result.returncode == 0
    assert result.stdout == "still running\n"
    assert "RuntimeError: job failed" in result.stderr
    (span,) = receiver.wait_for(lambda spans: spans)
    assert span.name == "uncaught exception"
    assert crash_event(span)["exception.type"] == "RuntimeError"


def test_previous_excepthook_still_runs(receiver):
    result = run_python(
        "import sys, formatio\n"
        "sys.excepthook = lambda *exc: print('app hook', exc[1])\n"
        "formatio.init()\n"
        "raise SystemError('down')\n",
        clean_env(FORMATIO_ENDPOINT=receiver.url, FORMATIO_TOKEN="t"),
    )

    assert result.returncode == 1
    assert result.stdout == "app hook down\n"
    assert [s.name for s in receiver.spans()] == ["uncaught exception"]
