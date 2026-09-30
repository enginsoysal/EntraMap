"""
Graph Service - Low-level Microsoft Graph API communication
Handles all HTTP requests to Microsoft Graph with token management.
No business logic, purely communication layer.

PERFORMANCE OPTIMIZATIONS:
- Connection pooling with requests.Session
- Keep-alive headers for persistent connections
- Timeout optimization (fast fail vs slow hanging)
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Optional, Dict, Any, List
from copy import deepcopy
from threading import RLock
from urllib.parse import urlparse, urlencode
from services.scan_service import record, is_fresh
import time


GRAPH_BASE = "https://graph.microsoft.com/v1.0"


class GraphServiceError(Exception):
    """Raised when Graph API call fails"""
    pass


# Global session with connection pooling and retry logic
_session = None


def _get_session() -> requests.Session:
    """Get or create global requests session with pooling."""
    global _session
    if _session is None:
        _session = requests.Session()
        
        # Connection pooling: reuse TCP connections
        adapter = HTTPAdapter(
            pool_connections=10,      # Keep-alive connections to same host
            pool_maxsize=10,          # Max connections in pool
            max_retries=Retry(
                total=2,              # Max retries
                backoff_factor=0.3,   # Exponential backoff
                status_forcelist=[429, 500, 502, 503, 504]  # Retry on these
            )
        )
        _session.mount("https://", adapter)
        _session.mount("http://", adapter)
    return _session


class GraphService:
    """Minimal Graph API client with performance optimizations"""

    # Simple result cache: (endpoint, token_hash) -> result
    # Token hash used to avoid storing full tokens in memory
    _lock = RLock()
    _MAX_CACHE = 2048
    _cache = {}
    _cache_times = {}
    _CACHE_TTL = 5 * 60  # 5 minute cache for Graph results

    @staticmethod
    def _cache_key(endpoint: str, token: str) -> str:
        """Generate cache key (use token hash, not full token)."""
        import hashlib
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        return f"{endpoint}:{token_hash}"

    @staticmethod
    def get(endpoint: str, token: str, extra_headers: Optional[Dict] = None) -> Optional[Dict]:
        """
        GET request to Graph API.
        Returns dict on success, None on 404, or error dict on failure.
        Uses connection pooling and caching.
        """
        url = endpoint if endpoint.startswith("http") else f"{GRAPH_BASE}{endpoint}"
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.netloc != "graph.microsoft.com":
            record(endpoint, "error", reason="Untrusted Graph endpoint")
            return {"error": "endpoint", "message": "Untrusted Graph endpoint"}
        cache_key = GraphService._cache_key(url + str(sorted((extra_headers or {}).items())), token)
        now = time.time()
        with GraphService._lock:
            if not is_fresh() and now - GraphService._cache_times.get(cache_key, 0) < GraphService._CACHE_TTL and cache_key in GraphService._cache:
                record(url, "ok", cached=True)
                return deepcopy(GraphService._cache[cache_key])
        headers = {"Authorization": f"Bearer {token}", **(extra_headers or {})}
        try:
            resp = _get_session().get(url, headers=headers, timeout=(5, 15), allow_redirects=False)
            if resp.status_code == 200:
                result = resp.json()
                if not isinstance(result, dict):
                    raise ValueError("Expected Graph object")
                with GraphService._lock:
                    if len(GraphService._cache) >= GraphService._MAX_CACHE:
                        oldest = min(GraphService._cache_times, key=GraphService._cache_times.get)
                        GraphService._cache.pop(oldest, None)
                        GraphService._cache_times.pop(oldest, None)
                    GraphService._cache[cache_key] = deepcopy(result)
                    GraphService._cache_times[cache_key] = now
                record(url, "ok", cached=False)
                return result
            if resp.status_code == 404:
                record(url, "not_found")
                return None
            record(url, "error", code=resp.status_code)
            return {"error": resp.status_code, "message": resp.text[:500]}
        except (requests.RequestException, ValueError) as exc:
            record(url, "error", reason=type(exc).__name__)
            return {"error": "network", "message": "Graph request failed or returned invalid JSON"}

    @staticmethod
    def get_all(endpoint: str, token: str, extra_headers: Optional[Dict] = None, 
                max_items: int = 100) -> List[Dict]:
        """
        GET request with pagination support.
        Returns list of all items (capped at max_items).
        
        OPTIMIZATION: Early stop when we have enough items, don't fetch all pages.
        """
        results = []
        url = endpoint if endpoint.startswith("http") else f"{GRAPH_BASE}{endpoint}"
        
        visited = set()
        while url and len(results) < max_items:
            if url in visited:
                record(endpoint, "error", reason="Repeated pagination link")
                break
            visited.add(url)
            data = GraphService.get(url, token, extra_headers)
            if not data or not isinstance(data.get("value"), list):
                record(endpoint, "missing" if data is None else "error", reason="Collection could not be fully read")
                break
            
            # Get only items we need (early stopping)
            items_needed = max_items - len(results)
            results.extend(data["value"][:items_needed])
            
            # Stop if we have enough or no more pages
            if len(results) >= max_items:
                if data.get("@odata.nextLink") or len(data["value"]) > items_needed:
                    record(endpoint, "truncated", limit=max_items)
                break
            
            url = data.get("@odata.nextLink")
        
        return results[:max_items]

    @staticmethod
    def build_url(base_path: str, **params) -> str:
        """Build Graph endpoint URL with query parameters."""
        url = f"{GRAPH_BASE}{base_path}"
        if params:
            url += "?" + urlencode(params)
        return url

    @staticmethod
    def clear_cache():
        """Clear the results cache (useful for testing or forcing refresh)."""
        with GraphService._lock:
            GraphService._cache.clear()
            GraphService._cache_times.clear()
