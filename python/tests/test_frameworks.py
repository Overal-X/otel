from opentelemetry.trace import SpanKind, StatusCode


def server_span(memory):
    (span,) = [s for s in memory.get_finished_spans() if s.kind is SpanKind.SERVER]
    return span


def assert_recorded_crash(span, function):
    assert span.status.status_code is StatusCode.ERROR
    (event,) = [e for e in span.events if e.name == "exception"]
    assert event.attributes["exception.type"] == "ZeroDivisionError"
    assert function in event.attributes["exception.stacktrace"]


def test_flask_route_error(memory):
    # The module, not the class: instrumentation swaps flask.Flask, so the app must be built
    # from the attribute looked up after init(), as an app module would.
    import flask

    app = flask.Flask(__name__)

    @app.get("/boom")
    def boom():
        return str(1 / 0)

    response = app.test_client().get("/boom")

    assert response.status_code == 500
    span = server_span(memory)
    assert span.attributes["http.route"] == "/boom"
    assert_recorded_crash(span, "boom")


def test_fastapi_route_error(memory):
    import fastapi
    from fastapi.testclient import TestClient

    app = fastapi.FastAPI()

    @app.get("/boom")
    def boom():
        return 1 / 0

    response = TestClient(app, raise_server_exceptions=False).get("/boom")

    assert response.status_code == 500
    span = server_span(memory)
    assert span.attributes["http.route"] == "/boom"
    assert_recorded_crash(span, "boom")
