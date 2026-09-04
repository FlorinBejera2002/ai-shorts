"""Bounded local HTTP benchmark. Never targets a public/production service."""

import argparse
import asyncio
import json
import os
import statistics
import time
from urllib.parse import urlparse
from uuid import UUID

import httpx


async def run(args):
    parsed = urlparse(args.origin)
    if parsed.scheme != "http" or parsed.hostname not in {
        "localhost",
        "127.0.0.1",
        "::1",
    }:
        raise ValueError("Only loopback HTTP test servers are allowed")
    UUID(args.user_id)
    UUID(args.job_id)
    concurrency = asyncio.Semaphore(8)
    durations = []
    async with httpx.AsyncClient(
        base_url=args.origin,
        timeout=10,
        headers={
            "X-User-Id": args.user_id,
            "X-Internal-API-Key": os.environ["SNEEPCUT_BENCHMARK_INTERNAL_KEY"],
        },
    ) as client:

        async def poll():
            async with concurrency:
                start = time.perf_counter()
                response = await client.get(f"/api/jobs/{args.job_id}")
                response.raise_for_status()
                assert response.json()["job"]["id"] == args.job_id
                durations.append((time.perf_counter() - start) * 1000)

        await poll()  # Warm up outside the measurement.
        durations.clear()
        start = time.perf_counter()
        await asyncio.gather(*(poll() for _ in range(100)))
        elapsed = time.perf_counter() - start
    ordered = sorted(durations)
    print(
        json.dumps(
            {
                "requests": 100,
                "concurrency": 8,
                "errors": 0,
                "median_ms": round(statistics.median(ordered), 2),
                "p95_ms": round(ordered[94], 2),
                "max_ms": round(max(ordered), 2),
                "requests_per_second": round(100 / elapsed, 2),
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://127.0.0.1:58000")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--job-id", required=True)
    asyncio.run(run(parser.parse_args()))
