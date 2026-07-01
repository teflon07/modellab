"""Two independent LRU bugs: get() must refresh recency, and capacity must be
respected exactly. Each block isolates one bug, so a one-bug fix still fails."""
import sys

from lru import LRUCache

errs = []

# Block 1: recency-on-read. Touch "a" via get, then a put that forces eviction
# must drop "b" (the true LRU), not "a".
c = LRUCache(2)
c.put("a", 1)
c.put("b", 2)
if c.get("a") != 1:
    errs.append("get('a') should return 1")
c.put("c", 3)
if c.get("b") is not None:
    errs.append("b should have been evicted (get must refresh recency)")
if c.get("a") != 1:
    errs.append("a was read recently and should survive eviction")
if c.get("c") != 3:
    errs.append("c should be present")

# Block 2: exact capacity. Four inserts into a cap-3 cache leaves exactly 3.
c2 = LRUCache(3)
for i, k in enumerate(["k0", "k1", "k2", "k3"]):
    c2.put(k, i)
if c2.get("k0") is not None:
    errs.append("cache exceeded capacity (off-by-one eviction)")
if not (c2.get("k1") == 1 and c2.get("k2") == 2 and c2.get("k3") == 3):
    errs.append("k1/k2/k3 should all be present")

# Block 3: updating an existing key must not grow the cache.
c3 = LRUCache(1)
c3.put("x", 1)
c3.put("x", 2)
if c3.get("x") != 2:
    errs.append("updating an existing key should overwrite its value")

if errs:
    print("FAIL: " + "; ".join(errs))
    sys.exit(1)
print("ok")
