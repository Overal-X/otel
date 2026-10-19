import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from helpers import attributes, clean_env
from opentelemetry.proto.trace.v1.trace_pb2 import Span

APP = """
import os, time
import formatio_otel
formatio_otel.init()
import flask
from opentelemetry import trace

app = flask.Flask(__name__)

@app.get("/")
def index():
    trace.get_current_span().set_attribute("worker.pid", os.getpid())
    time.sleep(0.1)
    return str(os.getpid())
"""

UWSGI = shutil.which("uwsgi", path=str(Path(sys.executable).parent))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get(url):
    with urllib.request.urlopen(url, timeout=5) as response:
        return int(response.read())


def wait_until_up(url, server):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise AssertionError(f"server exited: {server.stdout.read()}")
        try:
            return get(url)
        except OSError:
            time.sleep(0.1)
    raise AssertionError("server did not start")


def worker_pids(url):
    """Concurrent requests until two workers have answered; a single worker could serve them
    all one by one."""
    seen = set()
    with ThreadPoolExecutor(8) as pool:
        for _ in range(10):
            seen.update(pool.map(get, [url] * 8))
            if len(seen) >= 2:
                return seen
    raise AssertionError(f"only workers {seen} answered")


def assert_every_worker_exports(command, cwd, receiver, port):
    server = subprocess.Popen(
        command,
        cwd=cwd,
        env=clean_env(FORMATIO_ENDPOINT=receiver.url, FORMATIO_TOKEN="t"),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    try:
        url = f"http://127.0.0.1:{port}/"
        wait_until_up(url, server)
        pids = worker_pids(url)

        def exported_pids(spans):
            return {
                attributes(s.attributes).get("worker.pid")
                for s in spans
                if s.kind == Span.SPAN_KIND_SERVER
            }

        receiver.wait_for(lambda spans: pids <= exported_pids(spans))
    finally:
        os.killpg(server.pid, signal.SIGTERM)
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(server.pid, signal.SIGKILL)
            server.wait()


POST_FORK_CONF = """
import formatio_otel

def post_fork(server, worker):
    formatio_otel.init()
"""


@pytest.mark.parametrize("setup", ["preload", "app-module", "post-fork"])
def test_gunicorn_workers_export(tmp_path, receiver, setup):
    port = free_port()
    command = [sys.executable, "-m", "gunicorn", "-w", "2", "-b", f"127.0.0.1:{port}", "app:app"]
    app = APP
    if setup == "preload":
        # init() runs in the master; workers inherit the provider through fork and the batch
        # processor restarts its thread in each.
        command.append("--preload")
    elif setup == "post-fork":
        app = APP.replace("formatio_otel.init()", "")
        (tmp_path / "gunicorn.conf.py").write_text(POST_FORK_CONF)
    (tmp_path / "app.py").write_text(app)
    assert_every_worker_exports(command, tmp_path, receiver, port)


@pytest.mark.skipif(UWSGI is None, reason="uWSGI is not installed (it needs a C toolchain to build)")
def test_uwsgi_lazy_apps_workers_export(tmp_path, receiver):
    (tmp_path / "app.py").write_text(APP)
    port = free_port()
    command = [
        UWSGI,
        "--http-socket", f"127.0.0.1:{port}",
        "--master",
        "--processes", "2",
        # uWSGI forks without Python's fork hooks, so a provider made in the master would
        # export from no worker; lazy-apps loads the app, and runs init(), in each worker.
        "--lazy-apps",
        # Without it uWSGI never runs the batch processor's export thread.
        "--enable-threads",
        "--virtualenv", sys.prefix,
        "--module", "app:app",
        "--die-on-term",
    ]
    assert_every_worker_exports(command, tmp_path, receiver, port)
