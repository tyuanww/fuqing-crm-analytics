"""Resource caps for the synthetic-period adapter. Not a real-archive SLA."""

from __future__ import annotations

# Small synthetic library only. Do not copy these onto a 131 GiB archive.
MAX_SOURCE_BYTES = 16 * 1024 * 1024
MAX_CACHE_BYTES = 16 * 1024 * 1024
MAX_ROWS = 10_000
MEMORY_MIB = 32
THREADS = 1
TEMP_MIB = 32
QUERY_TIMEOUT_SECONDS = 5.0
MAX_CHANNEL_FILTERS = 32
MAX_PRODUCT_FILTERS = 64
