"""Read-only local comparison; explicit synthetic account required."""

import json
import os
import statistics
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen

user_id = str(uuid.UUID(os.environ["SNEEPCUT_BENCH_USER_ID"]))
key = os.environ["INTERNAL_API_KEY"]
assert os.environ.get("SNEEPCUT_BENCH_ALLOW_LOCAL") == "yes"

for port, label in [(58000, "python"), (58080, "go")]:
    def read(_):
        request = Request(f"http://127.0.0.1:{port}/api/jobs", headers={
            "X-Internal-API-Key": key, "X-User-Id": user_id,
        })
        start = time.perf_counter()
        with urlopen(request, timeout=10) as response:
            assert response.status == 200
            assert "jobs" in json.load(response)
        return (time.perf_counter()-start)*1000

    read(0)
    with ThreadPoolExecutor(max_workers=8) as pool:
        values = sorted(pool.map(read, range(100)))
    print(json.dumps({"service": label, "requests": 100, "concurrency": 8,
        "median_ms": round(statistics.median(values), 2),
        "p95_ms": round(values[94], 2)}))
