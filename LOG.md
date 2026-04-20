# Change Log

## 0.3.0 - 2026-04-20

- Bumped application version to 0.3.0
- Introduced homepage popup login flow instead of a standalone login screen
- Added frontend onboarding pages in the popup (Sign In, Features, How To Use)
- Added custom logo and favicon assets under static/brand
- Updated auth behavior so signed-out users still see the app shell while data actions remain sign-in gated
- Continued read-only operational model (no write actions to tenant data)

## 0.2.0 - 2026-04-20

- Bumped application version to 0.2.0
- Added graph node photos for users and groups
- Added double-click drill-down to re-focus the graph on user and group nodes
- Added Operational Insights with KPIs and quick filters for unmanaged and non-compliant devices
- Added JSON export for the currently loaded graph
- Added read-only object actions in the detail panel (copy object ID and open in Entra portal)
- Added footer links on signed-in and login views

## 0.1.0 - 2026-04-20

- Bumped application version to 0.1.0
- Added server-side session storage with Flask-Session to avoid OAuth state mismatch
- Added explicit REDIRECT_URI support with fallback behavior
- Updated README.md, LOG.md, and FILES.md for release consistency

## 0.0.3 - 2026-04-20

- Added README.md with setup, deployment, and Entra app registration guidance
- Added FILES.md with a file-by-file project reference
- Converted user-facing application text and configuration comments to English
- Added a visible application version in the UI
- Standardized backend error messages in English

## 0.0.2 - 2026-04-20

- Added multi-tenant Microsoft sign-in using MSAL authorization code flow
- Added delegated Microsoft Graph access for cross-tenant sign-in scenarios
- Added a dedicated sign-in screen and session-based authentication flow
- Added logout support
- Added GitHub repository creation and initial push to main

## 0.0.1 - 2026-04-20

- Initial EntraMap prototype created
- Added Flask backend for Microsoft Graph queries
- Added graph UI with search, node details, and relationship mapping
