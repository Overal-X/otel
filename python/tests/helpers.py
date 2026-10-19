from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
    ExportTraceServiceRequest,
    ExportTraceServiceResponse,
)


@dataclass
class Export:
    path: str
    headers: dict[str, str]
    request: ExportTraceServiceRequest

    def spans(self):
        for resource_spans in self.request.resource_spans:
            for scope_spans in resource_spans.scope_spans:
                yield from scope_spans.spans


class Receiver:
    """A fake OTLP/HTTP intake that keeps every decoded export."""

    def __init__(self):
        self.exports: list[Export] = []
        receiver = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                request = ExportTraceServiceRequest()
                request.ParseFromString(body)
                headers = {k.lower(): v for k, v in self.headers.items()}
                receiver.exports.append(Export(self.path, headers, request))
                payload = ExportTraceServiceResponse().SerializeToString()
                self.send_response(200)
                self.send_header("Content-Type", "application/x-protobuf")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def spans(self):
        return [span for export in self.exports for span in export.spans()]

    def wait_for(self, predicate, timeout=10.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate(self.spans()):
                return self.spans()
            time.sleep(0.05)
        raise AssertionError(f"timed out; received {[s.name for s in self.spans()]}")


def clean_env(**overrides: str) -> dict[str, str]:
    """The current environment without any exporter settings, so a test controls them all."""
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("OTEL_")
    }
    # macOS: a forked child that asks the system for proxy settings can abort (the requests
    # session the exporter uses does). Any *_proxy variable keeps urllib on the environment.
    env["no_proxy"] = "*"
    env["OTEL_BSP_SCHEDULE_DELAY"] = "100"
    env.update(overrides)
    return env


def run_python(code: str, env: dict[str, str], timeout: float = 30) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", code], env=env, capture_output=True, text=True, timeout=timeout
    )


def attributes(proto_attributes) -> dict:
    return {kv.key: getattr(kv.value, kv.value.WhichOneof("value")) for kv in proto_attributes}
