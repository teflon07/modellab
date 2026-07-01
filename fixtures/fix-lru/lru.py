class LRUCache:
    """Least-recently-used cache with a fixed capacity. `get` and `put` should
    both count as using a key; when capacity is exceeded, the least-recently-used
    key is evicted."""

    def __init__(self, capacity):
        self.capacity = capacity
        self._data = {}      # key -> value
        self._order = []     # keys, least-recently-used first

    def get(self, key):
        if key not in self._data:
            return None
        # BUG 1: a read does not refresh the key's recency, so a recently-read
        # key can be wrongly chosen as the eviction victim.
        return self._data[key]

    def put(self, key, value):
        if key in self._data:
            self._data[key] = value
            self._order.remove(key)
            self._order.append(key)
            return
        self._data[key] = value
        self._order.append(key)
        # BUG 2: off-by-one — the cache is allowed to grow one past capacity.
        if len(self._data) > self.capacity + 1:
            oldest = self._order.pop(0)
            del self._data[oldest]
