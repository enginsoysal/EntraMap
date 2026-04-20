# Change Log

## 0.3.7 - 2026-04-20

- Bumped application version to 0.3.7
- App search now tries Intune mobile apps first and falls back to Entra app search when Intune access is unavailable
- Removed hard Intune search failure behavior to prevent user-facing red error state
- App map/details now support Intune-first with Entra fallback for compatibility across tenant permission states

## 0.3.6 - 2026-04-20

- Bumped application version to 0.3.6
- Fixed graph layout root selection to prioritize the searched object (device/app/policy/user/group)
- Switched App search from Entra service principals to Intune mobile apps (Company Portal catalog)
- Switched App map/details endpoints to Intune mobile apps and assignment targets
- Added delegated scope `DeviceManagementApps.Read.All` for Intune app visibility

## 0.3.5 - 2026-04-20

- Bumped application version to 0.3.5
- Added Refresh button in graph toolbar to reload live Graph data for the current node
- Force re-consent prompt after Disconnect tenant so permissions are requested again on next sign-in
- Added dedicated Sign Out button in header (separate from Disconnect tenant in footer)
- Widened memberOf group detection to handle tenants that omit @odata.type in API responses

## 0.3.4 - 2026-04-20

- Bumped application version to 0.3.4
- Replaced native browser confirm dialog with a custom styled lightbox for Disconnect tenant confirmation

## 0.3.3 - 2026-04-20

- Bumped application version to 0.3.3
- Added Disconnect tenant button in a dedicated sub-bar below the header
- Disconnect wipes server session, token cache, localStorage, and sessionStorage before returning to sign-in
- Moved GitHub and LinkedIn footer links inside the auth popup for signed-out visibility

## 0.3.2 - 2026-04-20

- Bumped application version to 0.3.2
- Updated sign-out behavior to complete immediately in-app without Microsoft account selection prompts
- Preserved popup sign-in flow introduced in 0.3.1

## 0.3.1 - 2026-04-20

- Bumped application version to 0.3.1
- Implemented true popup window sign-in behavior for Microsoft authentication buttons
- Added popup callback completion page that closes itself and refreshes the main application window
- Added popup callback error pass-through to show login errors on the main page

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
