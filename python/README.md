# formatio

Tracing and error tracking for Python apps on [Formatio](https://formatio.cloud). A thin
distribution of the OpenTelemetry SDK: it exports standard OTLP traces, so swapping it for plain
OpenTelemetry keeps every trace and error group.

```sh
pip install formatio
```

```python
import formatio

formatio.init()
```

On Formatio, turn **Tracing** on for the application: the endpoint and token are injected.
Elsewhere, set `FORMATIO_ENDPOINT` (the public endpoint on the Tracing card) and
`FORMATIO_TOKEN`, or pass `formatio.init(endpoint=..., token=..., service_name=...)`. The
standard `OTEL_EXPORTER_OTLP_*` variables are honoured before the `FORMATIO_*` ones. Without an
endpoint and a token, `init()` logs one warning and tracing stays off.

`init()` instruments whichever of these are installed: FastAPI, Starlette, Django, Flask,
requests, httpx, urllib, urllib3, psycopg, psycopg2, SQLAlchemy, redis and Celery. Uncaught
exceptions, in the main thread or any other, are reported before the process exits as it
otherwise would.

## Where to call `init()`

Call it before the framework app is created, since instrumentation patches the framework
classes.

**FastAPI**

```python
import formatio

formatio.init()

from fastapi import FastAPI

app = FastAPI()
```

**Flask**

```python
import formatio

formatio.init()

from flask import Flask

app = Flask(__name__)
```

**Django**: in `wsgi.py` (or `asgi.py`), and in `manage.py` for `runserver` and commands,
before `get_wsgi_application()` / `execute_from_command_line()`.

```python
import os

import formatio

formatio.init()

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mysite.settings")
application = get_wsgi_application()
```

## gunicorn and uWSGI

**gunicorn** works with `init()` in the app module, with or without `--preload`: the export
thread is restarted in every worker after the fork. You can also call it from a `post_fork`
hook in `gunicorn.conf.py`, as long as the app module is imported afterwards (no `--preload`):

```python
import formatio

def post_fork(server, worker):
    formatio.init()
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
    formatio.capture_exception(attributes={"order.id": order.id})
```

`capture_exception(exc=None, attributes=None)` records the exception being handled (or `exc`)
on the current span and marks it failed; with no span active it reports it on its own span.
`attributes` are set on that span.

`formatio.flush(timeout_millis=2000)` exports what is queued, and `formatio.shutdown()` flushes
and stops; both also happen at interpreter exit.
