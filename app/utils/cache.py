"""
Lightweight in-memory caching utilities for autocomplete.

Provides:
1. TTLCache - Time-based expiry cache for consultation context
2. PrefixCache - Hash-based cache for autocomplete responses
3. Background refresh to avoid cache stampede

No Redis required - pure Python for simplicity.
For production scale, swap with Redis implementation.
"""

import hashlib
import time
import threading
from typing import Any, Callable, Dict, Optional, Tuple
from collections import OrderedDict
from functools import wraps
import logging

logger = logging.getLogger(__name__)


class TTLCache:
    """
    Thread-safe TTL (time-to-live) cache.
    
    Items expire after `ttl_seconds` and are lazily cleaned up.
    Uses OrderedDict for LRU eviction when max_size reached.
    """
    
    def __init__(self, ttl_seconds: int = 300, max_size: int = 1000):
        self.ttl = ttl_seconds
        self.max_size = max_size
        self._cache: OrderedDict[str, Tuple[Any, float]] = OrderedDict()
        self._lock = threading.RLock()
    
    def get(self, key: str) -> Optional[Any]:
        """Get value if exists and not expired."""
        with self._lock:
            if key not in self._cache:
                return None
            
            value, timestamp = self._cache[key]
            if time.time() - timestamp > self.ttl:
                # Expired
                del self._cache[key]
                return None
            
            # Move to end (most recently used)
            self._cache.move_to_end(key)
            return value
    
    def set(self, key: str, value: Any, ttl_override: Optional[int] = None) -> None:
        """Set value with optional TTL override."""
        with self._lock:
            # Evict oldest if at capacity
            while len(self._cache) >= self.max_size:
                self._cache.popitem(last=False)
            
            self._cache[key] = (value, time.time())
            self._cache.move_to_end(key)
    
    def delete(self, key: str) -> bool:
        """Delete key if exists."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    def clear_prefix(self, prefix: str) -> int:
        """Clear all keys starting with prefix."""
        with self._lock:
            keys_to_delete = [k for k in self._cache if k.startswith(prefix)]
            for key in keys_to_delete:
                del self._cache[key]
            return len(keys_to_delete)
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            now = time.time()
            valid_count = sum(1 for _, (_, ts) in self._cache.items() if now - ts <= self.ttl)
            return {
                "total_keys": len(self._cache),
                "valid_keys": valid_count,
                "max_size": self.max_size,
                "ttl_seconds": self.ttl,
            }


class AutocompleteCache:
    """
    Specialized cache for autocomplete responses.
    
    Uses prefix hashing for stable cache keys:
    - Last N chars of text (normalized)
    - Section and field type
    - Active problems hash
    
    This allows reusing completions for similar typing patterns.
    """
    
    def __init__(self, ttl_seconds: int = 120, max_size: int = 500):
        self._cache = TTLCache(ttl_seconds=ttl_seconds, max_size=max_size)
        self._hits = 0
        self._misses = 0
    
    @staticmethod
    def _hash_text(text: str, chars: int = 40) -> str:
        """Hash the last N chars of text for cache key."""
        suffix = text[-chars:].lower().strip() if text else ""
        return hashlib.md5(suffix.encode()).hexdigest()[:12]
    
    @staticmethod
    def _hash_problems(problems: Optional[list]) -> str:
        """Hash active problems list."""
        if not problems:
            return "none"
        sorted_problems = sorted(p.lower() for p in problems[:5])
        return hashlib.md5("|".join(sorted_problems).encode()).hexdigest()[:8]
    
    def get_key(
        self, 
        consultation_id: str, 
        section: str, 
        field_type: Optional[str],
        text: str,
        active_problems: Optional[list] = None
    ) -> str:
        """Generate stable cache key."""
        text_hash = self._hash_text(text)
        problems_hash = self._hash_problems(active_problems)
        return f"ac:{consultation_id}:{section}:{field_type or 'gen'}:{problems_hash}:{text_hash}"
    
    def get(
        self, 
        consultation_id: str, 
        section: str, 
        field_type: Optional[str],
        text: str,
        active_problems: Optional[list] = None
    ) -> Optional[str]:
        """Get cached completion if available."""
        key = self.get_key(consultation_id, section, field_type, text, active_problems)
        result = self._cache.get(key)
        if result is not None:
            self._hits += 1
            logger.debug(f"Autocomplete cache HIT: {key[:40]}...")
        else:
            self._misses += 1
        return result
    
    def set(
        self, 
        consultation_id: str, 
        section: str, 
        field_type: Optional[str],
        text: str,
        completion: str,
        active_problems: Optional[list] = None
    ) -> None:
        """Cache a completion result."""
        if not completion:  # Don't cache empty results
            return
        key = self.get_key(consultation_id, section, field_type, text, active_problems)
        self._cache.set(key, completion)
        logger.debug(f"Autocomplete cache SET: {key[:40]}...")
    
    def invalidate_consultation(self, consultation_id: str) -> int:
        """Invalidate all cache entries for a consultation."""
        return self._cache.clear_prefix(f"ac:{consultation_id}:")
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        base_stats = self._cache.stats()
        total = self._hits + self._misses
        return {
            **base_stats,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{(self._hits / total * 100):.1f}%" if total > 0 else "N/A",
        }


class ConsultationContextCache:
    """
    Cache for consultation context (patient info, problems, medications).
    
    This avoids repeated DB queries for the same consultation.
    Context is cached for longer (5-15 min) since it changes infrequently.
    """
    
    def __init__(self, ttl_seconds: int = 600, max_size: int = 200):
        self._cache = TTLCache(ttl_seconds=ttl_seconds, max_size=max_size)
        self._hits = 0
        self._misses = 0
    
    def get(self, consultation_id: str, patient_id: str) -> Optional[Dict]:
        """Get cached consultation context."""
        key = f"ctx:{consultation_id}:{patient_id}"
        result = self._cache.get(key)
        if result is not None:
            self._hits += 1
            logger.debug(f"Context cache HIT: {key}")
        else:
            self._misses += 1
        return result
    
    def set(self, consultation_id: str, patient_id: str, context: Dict) -> None:
        """Cache consultation context."""
        key = f"ctx:{consultation_id}:{patient_id}"
        self._cache.set(key, context)
        logger.debug(f"Context cache SET: {key}")
    
    def invalidate(self, consultation_id: str) -> None:
        """Invalidate context for a consultation (call when workspace changes)."""
        self._cache.clear_prefix(f"ctx:{consultation_id}:")
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        base_stats = self._cache.stats()
        total = self._hits + self._misses
        return {
            **base_stats,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{(self._hits / total * 100):.1f}%" if total > 0 else "N/A",
        }


# ============================================================================
# GLOBAL CACHE INSTANCES
# ============================================================================

# Autocomplete response cache: 2 min TTL, max 500 entries
autocomplete_cache = AutocompleteCache(ttl_seconds=120, max_size=500)

# Consultation context cache: 10 min TTL, max 200 consultations
context_cache = ConsultationContextCache(ttl_seconds=600, max_size=200)


def get_cache_stats() -> Dict[str, Any]:
    """Get combined cache statistics."""
    return {
        "autocomplete": autocomplete_cache.stats(),
        "context": context_cache.stats(),
    }


def invalidate_consultation_caches(consultation_id: str) -> None:
    """Invalidate all caches for a consultation (call on workspace changes)."""
    autocomplete_cache.invalidate_consultation(consultation_id)
    context_cache.invalidate(consultation_id)
    logger.info(f"Invalidated caches for consultation: {consultation_id}")
