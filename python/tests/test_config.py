import pytest
from helpers import clean_env, run_python

from formatio.config import disabled_instrumentations, is_curated, resolve

BEARER = {"authorization": "Bearer t"}


@pytest.mark.parametrize(
    ("env", "kwargs", "endpoint"),
    [
        pytest.param(
            {"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "http://traces/v1/traces", "FORMATIO_ENDPOINT": "http://f"},
            {"endpoint": "http://arg"},
            "http://arg/v1/traces",
            id="argument wins",
        ),
        pytest.param(
            {"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "http://traces/custom", "OTEL_EXPORTER_OTLP_ENDPOINT": "http://o"},
            {},
            "http://traces/custom",
            id="traces endpoint used as-is",
        ),
        pytest.param(
            {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://o/", "FORMATIO_ENDPOINT": "http://f"},
            {},
            "http://o/v1/traces",
            id="otlp endpoint gets the path once",
        ),
        pytest.param({"FORMATIO_ENDPOINT": "https://f.example"}, {}, "https://f.example/v1/traces", id="formatio"),
        pytest.param({"OTEL_EXPORTER_OTLP_ENDPOINT": ""}, {"endpoint": "http://arg/"}, "http://arg/v1/traces", id="trailing slash"),
        pytest.param({}, {"endpoint": "http://arg/v1/traces"}, "http://arg/v1/traces", id="argument with the path"),
        pytest.param({"FORMATIO_ENDPOINT": "http://f/v1/traces/"}, {}, "http://f/v1/traces", id="base with the path"),
    ],
)
def test_endpoint_precedence(env, kwargs, endpoint):
    assert resolve(env, **kwargs).endpoint == endpoint


@pytest.mark.parametrize(
    ("env", "kwargs", "headers"),
    [
        pytest.param({"OTEL_EXPORTER_OTLP_HEADERS": "authorization=Bearer env"}, {"token": "t"}, BEARER, id="argument wins"),
        pytest.param(
            {"OTEL_EXPORTER_OTLP_TRACES_HEADERS": "authorization=Bearer%20t", "OTEL_EXPORTER_OTLP_HEADERS": "x=1"},
            {},
            BEARER,
            id="traces headers before otlp headers",
        ),
        pytest.param(
            {"OTEL_EXPORTER_OTLP_HEADERS": "authorization=Bearer t,x-extra=1", "FORMATIO_TOKEN": "other"},
            {},
            {**BEARER, "x-extra": "1"},
            id="otlp headers before formatio token",
        ),
        pytest.param({"FORMATIO_TOKEN": "t"}, {}, BEARER, id="formatio token"),
        pytest.param({}, {}, {}, id="none"),
    ],
)
def test_header_precedence(env, kwargs, headers):
    assert resolve({"FORMATIO_ENDPOINT": "http://f", **env}, **kwargs).headers == headers


def test_service_name_argument():
    assert resolve({"FORMATIO_ENDPOINT": "http://f"}, service_name="api").service_name == "api"


@pytest.mark.parametrize(
    ("env", "missing"),
    [
        ({}, "no endpoint"),
        ({"FORMATIO_TOKEN": "t"}, "no endpoint"),
        ({"OTEL_EXPORTER_OTLP_HEADERS": "a=b", "OTEL_EXPORTER_OTLP_ENDPOINT": ""}, "no endpoint"),
        ({"FORMATIO_ENDPOINT": "http://f"}, "no token"),
        ({"OTEL_EXPORTER_OTLP_ENDPOINT": "http://o", "FORMATIO_TOKEN": ""}, "no token"),
    ],
)
def test_nothing_to_export_to(env, missing):
    assert resolve(env).missing().startswith(missing)


def test_endpoint_and_token_is_enough():
    assert resolve({"FORMATIO_ENDPOINT": "http://f", "FORMATIO_TOKEN": "t"}).missing() is None


def test_disabled_instrumentations():
    assert disabled_instrumentations({"OTEL_PYTHON_DISABLED_INSTRUMENTATIONS": "requests , flask,"}) == {"requests", "flask"}


def test_curated_names_are_normalized():
    assert is_curated("opentelemetry_instrumentation_flask")
    assert not is_curated("opentelemetry-instrumentation-boto3")


@pytest.mark.parametrize(
    ("env", "warning"),
    [({}, "no endpoint"), ({"FORMATIO_ENDPOINT": "http://127.0.0.1:9"}, "no token")],
    ids=["no endpoint", "no token"],
)
def test_init_unconfigured_warns_once_and_is_a_noop(env, warning):
    result = run_python(
        "import formatio\n"
        "formatio.init()\n"
        "formatio.init()\n"
        "from opentelemetry import trace\n"
        "with trace.get_tracer('t').start_as_current_span('s') as span:\n"
        "    assert not span.is_recording()\n"
        "formatio.capture_exception(ValueError('x'))\n"
        "assert formatio.flush() is False\n"
        "formatio.shutdown()\n"
        "print('ok')\n",
        clean_env(**env),
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == "ok\n"
    assert result.stderr.count(f"formatio: tracing is off: {warning}") == 1
    assert result.stderr.count("\n") == 1


def test_init_never_raises():
    result = run_python(
        "import formatio, formatio._sdk as sdk\n"
        "def boom(*a, **k): raise RuntimeError('broken')\n"
        "sdk._start = boom\n"
        "formatio.init(endpoint='http://127.0.0.1:9', token='t')\n"
        "print('ok')\n",
        clean_env(),
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == "ok\n"
    assert "formatio: init failed" in result.stderr
