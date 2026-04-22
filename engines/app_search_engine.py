"""
App Search Engine
Search for Intune mobile apps
Handles consent re-prompting for Intune permissions
"""

from typing import List, Dict, Optional
from services.graph_service import GraphService


class AppSearchEngine:
    """Intune app search functionality"""

    @staticmethod
    def _search_mobile_apps(query: str, token: str, max_results: int, base_url: str = "https://graph.microsoft.com/v1.0") -> tuple[List[Dict], Optional[Dict]]:
        """Search Intune mobile apps from a Graph base URL (v1.0 or beta)."""
        q = query.lower()
        results = []
        seen_ids = set()

        next_url = (
            f"{base_url}/deviceAppManagement/mobileApps"
            "?$select=id,displayName,publisher,description,lastModifiedDateTime"
            "&$top=100"
        )
        scanned = 0
        max_scan = 5000

        while next_url and len(results) < max_results and scanned < max_scan:
            page = GraphService.get(next_url, token)
            if not page:
                break
            if "error" in page:
                return [], {
                    "error": "Intune app search unavailable",
                    "details": page.get("message", "Failed to read Intune mobile apps."),
                }
            if "value" not in page:
                break

            for app in page.get("value", []):
                scanned += 1
                if scanned > max_scan:
                    break

                app_id = app.get("id")
                if not app_id or app_id in seen_ids:
                    continue

                display_name = (app.get("displayName", "") or "").lower()
                publisher = (app.get("publisher", "") or "").lower()
                description = (app.get("description", "") or "").lower()

                if q not in display_name and q not in publisher and q not in description:
                    continue

                seen_ids.add(app_id)
                results.append(
                    {
                        "id": app_id,
                        "label": app.get("displayName", ""),
                        "subtitle": f"{AppSearchEngine._get_platform_label(app)} · "
                        + (app.get("publisher", "") or "Intune app"),
                        "type": "app",
                    }
                )

                if len(results) >= max_results:
                    break

            next_url = page.get("@odata.nextLink")

        results.sort(key=lambda a: a.get("label", "").lower())
        return results, None

    @staticmethod
    def _is_supported_intune_app(app: Dict) -> bool:
        """Check if app is a supported Intune app type"""
        odata_type = (app.get("@odata.type") or "").lower()
        if not odata_type:
            return True  # If no metadata, keep visible
        
        supported_types = [
            "win32lobapp", "windowsstoreapp", "windowsmicrosoftedgeapp",
            "windowsuniversalappx", "iosstoreapp", "ioslobapp",
            "managedioslobapp", "macosdmgapp", "macospkgapp", "macoslobapp",
            "androidstoreapp", "managedandroidlobapp", "androidmanagedstoreapp",
        ]
        return any(t in odata_type for t in supported_types)

    @staticmethod
    def _get_platform_label(app: Dict) -> str:
        """Get platform label from app type"""
        t = (app.get("@odata.type") or "").lower()
        if "windows" in t or "win32" in t:
            return "Windows"
        if "macos" in t:
            return "macOS"
        if "ios" in t:
            return "iOS/iPadOS"
        if "android" in t:
            return "Android"
        return "Intune"

    @staticmethod
    def search(query: str, token: str, max_results: int = 15) -> tuple[List[Dict], Optional[Dict]]:
        """
        Search for Intune apps.
        Returns: (results, error_response)
        error_response is None on success, otherwise it contains error/reauth_url
        """
        if len(query) < 2:
            return [], None

        # First check for permission issues so we can return a useful re-consent hint.
        first_page = GraphService.get(
            "/deviceAppManagement/mobileApps"
            "?$select=id"
            "&$top=1",
            token,
        )
        if first_page and "error" in first_page:
            error_code = first_page.get("error")
            message = (first_page.get("message") or "").lower()
            needs_consent = (error_code in (401, 403)) or any(
                k in message for k in [
                    "insufficient privileges",
                    "authorization_requestdenied",
                    "consent",
                    "forbidden",
                    "permission",
                ]
            )
            if needs_consent:
                return [], {
                    "error": "Intune permissions require re-consent",
                    "details": first_page.get("message", ""),
                    "reauth_url": "/auth/signin?popup=1&force_consent=1",
                }
            return [], {
                "error": "Intune app search unavailable",
                "details": first_page.get("message", "Missing Intune permissions."),
            }

        # Search v1.0 first.
        v1_results, v1_error = AppSearchEngine._search_mobile_apps(query, token, max_results, "https://graph.microsoft.com/v1.0")
        if v1_error:
            return [], v1_error
        if v1_results:
            return v1_results, None

        # Fallback to beta for app types not surfaced in v1.0 for some tenants.
        beta_results, beta_error = AppSearchEngine._search_mobile_apps(query, token, max_results, "https://graph.microsoft.com/beta")
        if beta_error:
            # Preserve "no results" behavior instead of hard-failing when beta is blocked.
            return [], None
        return beta_results, None

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
