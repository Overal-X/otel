from __future__ import annotations

import logging
from collections.abc import Collection
from importlib.metadata import entry_points

from opentelemetry.instrumentation.dependencies import get_dist_dependency_conflicts

from formatio_otel.config import is_curated

logger = logging.getLogger("formatio_otel")


def instrument_installed(disabled: Collection[str] = ()) -> list[str]:
    """Mirrors opentelemetry-instrument's loader, but only over the curated set, and a failing
    instrumentor is logged rather than aborting the rest."""
    instrumented = []
    for entry_point in entry_points(group="opentelemetry_instrumentor"):
        dist = entry_point.dist
        if dist is None or not is_curated(dist.name) or entry_point.name in disabled:
            continue
        try:
            conflict = get_dist_dependency_conflicts(dist)
            if conflict is not None:
                # found/found_any are set only when the library is installed at an unsupported
                # version; an absent library is the common case and stays silent.
                if conflict.found or conflict.found_any:
                    logger.warning("formatio: skipping %s: %s", entry_point.name, conflict)
                continue
            entry_point.load()().instrument(skip_dep_check=True)
            instrumented.append(entry_point.name)
        except ModuleNotFoundError:
            continue
        except Exception:
            logger.exception("formatio: instrumenting %s failed", entry_point.name)
    return instrumented
