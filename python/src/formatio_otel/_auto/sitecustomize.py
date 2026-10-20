"""Starts formatio_otel in every Python process of an app that Formatio built with Tracing on.

Formatio's build installs formatio-otel apart from the app's packages and puts only this
directory on PYTHONPATH, so Python imports this module at startup, before the app's own code.
"""

import importlib.machinery
import importlib.util
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))


def _start() -> None:
    # The install directory goes last, so that where the app has its own version of a package
    # formatio-otel also uses (protobuf, wrapt), the app's is the one imported.
    install = os.path.dirname(os.path.dirname(_HERE))
    if install not in sys.path:
        sys.path.append(install)
    try:
        import formatio_otel

        formatio_otel.init()
    except Exception as exc:
        print(f"formatio: tracing is off: {exc!r}", file=sys.stderr)


def _chain() -> None:
    """Runs the sitecustomize this module shadows, as Python would have without Formatio."""
    path = [entry for entry in sys.path if os.path.abspath(entry or os.curdir) != _HERE]
    spec = importlib.machinery.PathFinder.find_spec("sitecustomize", path)
    if spec is None or spec.loader is None:
        return
    module = importlib.util.module_from_spec(spec)
    sys.modules["sitecustomize"] = module
    spec.loader.exec_module(module)


_start()
_chain()
