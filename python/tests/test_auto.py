import os
import shutil

import formatio_otel
from helpers import clean_env, run_python

# What Formatio's build puts on PYTHONPATH.
AUTO = os.path.join(os.path.dirname(formatio_otel.__file__), "_auto")

CRASH = "def load_settings():\n    raise ValueError('missing DATABASE_URL')\nload_settings()\n"


def env(receiver, pythonpath=AUTO):
    return clean_env(
        PYTHONPATH=pythonpath,
        OTEL_EXPORTER_OTLP_ENDPOINT=receiver.url,
        OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer%20t",
    )


def test_an_unchanged_app_reports_a_crash_at_boot(receiver):
    result = run_python(CRASH, env(receiver))

    assert result.returncode == 1
    assert "ValueError: missing DATABASE_URL" in result.stderr
    (span,) = receiver.wait_for(lambda spans: spans)
    assert span.name == "uncaught exception"


def test_the_apps_packages_come_before_the_install(receiver, tmp_path):
    # A separate install, as the build makes; the app's environment has formatio_otel too, and
    # its copy must be the one imported.
    install = tmp_path / "install"
    shutil.copytree(os.path.dirname(formatio_otel.__file__), install / "formatio_otel")

    result = run_python(
        "import sys, formatio_otel, formatio_otel._sdk as sdk\n"
        "print(sys.path[-1])\n"
        "print(formatio_otel.__file__)\n"
        "print(sdk._provider is not None)\n",
        env(receiver, str(install / "formatio_otel" / "_auto")),
    )

    assert result.stdout.splitlines() == [str(install), formatio_otel.__file__, "True"], result.stderr


def test_a_shadowed_sitecustomize_still_runs(receiver, tmp_path):
    (tmp_path / "sitecustomize.py").write_text("print('app sitecustomize')\n")

    result = run_python("print('app')\n", env(receiver, f"{AUTO}{os.pathsep}{tmp_path}"))

    assert result.stdout == "app sitecustomize\napp\n", result.stderr


def test_a_broken_install_never_stops_the_app(receiver, tmp_path):
    broken = tmp_path / "formatio_otel"
    broken.mkdir()
    (broken / "__init__.py").write_text("raise ImportError('half installed')\n")

    result = run_python("print('app')\n", env(receiver, f"{AUTO}{os.pathsep}{tmp_path}"))

    assert result.returncode == 0
    assert result.stdout == "app\n"
    assert "formatio: tracing is off: ImportError('half installed')" in result.stderr
