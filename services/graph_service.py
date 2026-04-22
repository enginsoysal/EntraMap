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
from functools import lru_cache
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
    _cache = {}
    _cache_times = {}
    _CACHE_TTL = 5 * 60  # 5 minute cache for Graph results

    @staticmethod
    def _cache_key(endpoint: str, token: str) -> str:
        """Generate cache key (use token hash, not full token)."""
        import hashlib
        token_hash = hashlib.sha256(token.encode()).hexdigest()[:8]
        return f"{endpoint}:{token_hash}"

    @staticmethod
    def get(endpoint: str, token: str, extra_headers: Optional[Dict] = None) -> Optional[Dict]:
        """
        GET request to Graph API.
        Returns dict on success, None on 404, or error dict on failure.
        Uses connection pooling and caching.
        """
        # Check cache first (except for paginated requests)
        cache_key = GraphService._cache_key(endpoint, token)
        now = time.time()
        if cache_key in GraphService._cache:
            cache_time = GraphService._cache_times.get(cache_key, 0)
            if now - cache_time < GraphService._CACHE_TTL:
                return GraphService._cache[cache_key]
        
        headers = {"Authorization": f"Bearer {token}"}
        if extra_headers:
            headers.update(extra_headers)
        
        # Keep-alive is automatic with session reuse
        url = endpoint if endpoint.startswith("http") else f"{GRAPH_BASE}{endpoint}"
        try:
            session = _get_session()
            # Shorter timeout for fast-fail behavior
            resp = session.get(url, headers=headers, timeout=(5, 15))
        except requests.RequestException as exc:
            return {"error": "network", "message": str(exc)}
        
        # Process response
        if resp.status_code == 200:
            result = resp.json()
            # Cache successful responses
            GraphService._cache[cache_key] = result
            GraphService._cache_times[cache_key] = now
            return result
        if resp.status_code == 404:
            return None
        return {"error": resp.status_code, "message": resp.text[:500]}

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
        
        while url and len(results) < max_items:
            data = GraphService.get(url, token, extra_headers)
            if not data or "value" not in data:
                break
            
            # Get only items we need (early stopping)
            items_needed = max_items - len(results)
            results.extend(data["value"][:items_needed])
            
            # Stop if we have enough or no more pages
            if len(results) >= max_items:
                break
            
            url = data.get("@odata.nextLink")
        
        return results[:max_items]

    @staticmethod
    def build_url(base_path: str, **params) -> str:
        """Build Graph endpoint URL with query parameters."""
        url = f"{GRAPH_BASE}{base_path}"
        if params:
            query_parts = []
            for k, v in params.items():
                query_parts.append(f"{k}={v}")
            if query_parts:
                url += "?" + "&".join(query_parts)
        return url

    @staticmethod
    def clear_cache():
        """Clear the results cache (useful for testing or forcing refresh)."""
        GraphService._cache.clear()
        GraphService._cache_times.clear()
