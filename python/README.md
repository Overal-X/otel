# formatio-otel

Tracing and error tracking for Python apps on [Formatio](https://formatio.cloud). A thin
distribution of the OpenTelemetry SDK: it exports standard OTLP traces, so swapping it for plain
OpenTelemetry keeps every trace and error group.

Releases are on [GitHub](https://github.com/overal-x/otel/releases), not PyPI. Install the wheel by its URL:

```sh
pip install https://github.com/overal-x/otel/releases/download/python/v0.1.0/formatio_otel-0.1.0-py3-none-any.whl
```

In `requirements.txt` or `pyproject.toml`'s dependencies, name it with the URL:
`formatio-otel @ https://github.com/overal-x/otel/releases/download/python/v0.1.0/formatio_otel-0.1.0-py3-none-any.whl`.

The package installs as `formatio-otel` and imports as `formatio_otel`.

```python
import formatio_otel

formatio_otel.init()
```

On Formatio, turn **Tracing** on for the application: the endpoint and token are injected.
Elsewhere, set the standard OTLP variables from the Tracing card:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT='https://your-formatio-host/otlp'
export OTEL_EXPORTER_OTLP_HEADERS='authorization=Bearer <tracing token>'
```

`formatio_otel.init(endpoint=..., token=..., service_name=...)` arguments override them. Without
an endpoint and a token, `init()` logs one warning and tracing stays off.

`init()` instruments whichever of these are installed: FastAPI, Starlette, Django, Flask,
requests, httpx, urllib, urllib3, psycopg, psycopg2, SQLAlchemy, redis and Celery. Uncaught
exceptions, in the main thread or any other, are reported before the process exits as it
otherwise would.

## Where to call `init()`

Call it before the framework app is created, since instrumentation patches the framework
classes.

**FastAPI**

```python
import formatio_otel

formatio_otel.init()

from fastapi import FastAPI

app = FastAPI()
```

**Flask**

```python
import formatio_otel

formatio_otel.init()

from flask import Flask

app = Flask(__name__)
```

**Django**: in `wsgi.py` (or `asgi.py`), and in `manage.py` for `runserver` and commands,
before `get_wsgi_application()` / `execute_from_command_line()`.

```python
import os

import formatio_otel

formatio_otel.init()

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mysite.settings")
application = get_wsgi_application()
```

## gunicorn and uWSGI

**gunicorn** works with `init()` in the app module, with or without `--preload`: the export
thread is restarted in every worker after the fork. You can also call it from a `post_fork`
hook in `gunicorn.conf.py`, as long as the app module is imported afterwards (no `--preload`):

```python
import formatio_otel

def post_fork(server, worker):
    formatio_otel.init()
```

**uWSGI** forks without Python's fork hooks, so a provider created in the master never exports
from the workers. Load the app in each worker, and let uWSGI run threads:

```ini
[uwsgi]
lazy-apps = true
enable-threads = true
```

## Handled errors

```python
try:
    charge(order)
except PaymentError:
    formatio_otel.capture_exception(attributes={"order.id": order.id})
```

`capture_exception(exc=None, attributes=None)` records the exception being handled (or `exc`)
on the current span and marks it failed; with no span active it reports it on its own span.
`attributes` are set on that span.

`formatio_otel.flush(timeout_millis=2000)` exports what is queued, and `formatio_otel.shutdown()` flushes
and stops; both also happen at interpreter exit.
