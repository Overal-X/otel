from __future__ import annotations

import pytest
from helpers import Receiver
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from formatio import _sdk


@pytest.fixture
def receiver():
    receiver = Receiver()
    yield receiver
    receiver.server.shutdown()


@pytest.fixture(scope="session")
def _memory_exporter():
    exporter = InMemorySpanExporter()
    _sdk._start(SimpleSpanProcessor(exporter))
    return exporter


@pytest.fixture
def memory(_memory_exporter):
    _memory_exporter.clear()
    yield _memory_exporter
    _memory_exporter.clear()
