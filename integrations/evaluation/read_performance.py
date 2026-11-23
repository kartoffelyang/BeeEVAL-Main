"""Bounded, identity-scoped caching for expensive read-only aggregation routes.

FastAPI still resolves authentication/authorization on every request. Never decorate
identity, video signing, raw evidence, or write endpoints with this cache.
"""
import copy
import asyncio
import functools
import json
import threading
import time
from collections import OrderedDict


def cached_read(ttl=20, max_entries=128):
    cache = OrderedDict()
    lock = threading.RLock()
    flights = {}

    def decorate(function):
        @functools.wraps(function)
        def wrapped(*args, **kwargs):
            # Include the complete resolved principal, not just its nominal tier.
            key = json.dumps([args, kwargs], sort_keys=True, default=str)
            with lock:
                entry = cache.get(key)
                if entry and entry[0] > time.monotonic():
                    cache.move_to_end(key)
                    return copy.deepcopy(entry[1])
                gate = flights.setdefault(key, threading.Lock())
            with gate:
                with lock:
                    entry = cache.get(key)
                    if entry and entry[0] > time.monotonic():
                        return copy.deepcopy(entry[1])
                try:
                    value = function(*args, **kwargs)
                    with lock:
                        cache[key] = (time.monotonic() + ttl, copy.deepcopy(value))
                        cache.move_to_end(key)
                        while len(cache) > max_entries:
                            cache.popitem(last=False)
                    return value
                finally:
                    with lock:
                        if flights.get(key) is gate:
                            flights.pop(key, None)
        return wrapped
    return decorate


def analytics_read(name, principal, **kwargs):
    """Run the existing async analytics body off-loop, with its exact scope intact."""
    from api.services import website_analytics
    return asyncio.run(getattr(website_analytics, name)(**kwargs))
