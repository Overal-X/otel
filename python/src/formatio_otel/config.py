from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field

from opentelemetry.util.re import parse_env_headers

TRACES_PATH = "/v1/traces"

# Must match the instrumentation packages pinned in pyproject.toml. asgi and wsgi publish no
# entry point: they are the middleware the framework instrumentors build on.
CURATED_INSTRUMENTATIONS = frozenset(
    f"opentelemetry-instrumentation-{name}"
    for name in (
        "asgi", "wsgi", "fastapi", "starlette", "django", "flask", "requests", "httpx",
        "urllib", "urllib3", "psycopg", "psycopg2", "sqlalchemy", "redis", "celery",
    )
)


@dataclass(frozen=True)
class Config:
    endpoint: str | None
    headers: dict[str, str] = field(default_factory=dict)
    service_name: str | None = None

    def missing(self) -> str | None:
        """Why nothing can be exported, or None. The intake rejects a request without a token,
        so a missing token turns tracing off just like a missing endpoint."""
        if self.endpoint is None:
            return "no endpoint; set OTEL_EXPORTER_OTLP_ENDPOINT"
        if not self.headers:
            return "no token; set an authorization header in OTEL_EXPORTER_OTLP_HEADERS"
        return None


def resolve(
    env: Mapping[str, str],
    endpoint: str | None = None,
    token: str | None = None,
    service_name: str | None = None,
) -> Config:
    """The shared contract: explicit arguments, then the standard OTEL_* env. `endpoint` is a
    base URL like OTEL_EXPORTER_OTLP_ENDPOINT."""
    return Config(_traces_endpoint(env, endpoint), _headers(env, token), service_name or None)


def disabled_instrumentations(env: Mapping[str, str]) -> set[str]:
    raw = env.get("OTEL_PYTHON_DISABLED_INSTRUMENTATIONS", "")
    return {name.strip() for name in raw.split(",") if name.strip()}


def is_curated(distribution_name: str) -> bool:
    return re.sub(r"[-_.]+", "-", distribution_name).lower() in CURATED_INSTRUMENTATIONS


def _traces_endpoint(env: Mapping[str, str], endpoint: str | None) -> str | None:
    if endpoint:
        return _join(endpoint)
    if traces := env.get("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"):
        return traces
    if base := env.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return _join(base)
    return None


def _join(base: str) -> str:
    base = base.rstrip("/")
    return base if base.endswith(TRACES_PATH) else base + TRACES_PATH


def _headers(env: Mapping[str, str], token: str | None) -> dict[str, str]:
    if token:
        return {"authorization": f"Bearer {token}"}
    raw = env.get("OTEL_EXPORTER_OTLP_TRACES_HEADERS") or env.get("OTEL_EXPORTER_OTLP_HEADERS")
    return dict(parse_env_headers(raw, liberal=True)) if raw else {}
