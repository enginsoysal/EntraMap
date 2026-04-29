# Change Log

## 0.5.1 - 2026-04-29

- Bumped application version to 0.5.1
- Removed `opencensus-ext-flask` from requirements to resolve Flask 3.x dependency conflicts during environment setup
- Updated telemetry fallback so instrumentation-key mode keeps OpenCensus logging when Flask middleware is unavailable
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.5.0 - 2026-04-29

- Bumped application version to 0.5.0
- Stabilized tutorial reliability for Advanced, Expert, and God Mode progression across dynamic UI updates
- Routed tutorial group impact views and exports through sandbox dummy data to prevent session-expired interruptions during guided runs
- Added explicit "What this does" and "Why it matters" guidance blocks in the tutorial coach for clearer operator training context
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.21 - 2026-04-29

- Bumped application version to 0.4.21
- Added explicit "What this does" and "Why it matters" sections in the tutorial coach UI
- Added automatic what/why narrative parsing for existing tutorial steps
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.20 - 2026-04-29

- Bumped application version to 0.4.20
- Routed tutorial group impact views and impact exports through dummy sandbox data so guided steps no longer trigger session-expired API failures
- Rewrote tutorial step descriptions to explain both what the action does and why it matters in the workflow
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.19 - 2026-04-29

- Bumped application version to 0.4.19
- Added a placement override for detail-panel and compare action stacks so the tutorial coach prefers sitting above action buttons
- Prevented the tutorial coach from covering the next guided action in stacked button flows such as Export impact report -> Load impact graph
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.18 - 2026-04-29

- Bumped application version to 0.4.18
- Refined tutorial coach placement to center on the active target within the current pane
- Added smarter above/below placement based on available space inside left and detail panes
- Added tighter pane-based max-height and text wrapping so long tutorial copy remains readable
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.17 - 2026-04-29

- Bumped application version to 0.4.17
- Fixed tutorial stalls where Advanced and Expert steps could remain waiting after the required state was already active
- Made the tutorial coach pane-aware with narrower sizing and wrapped action buttons in left/detail panes
- Added state-sync checks so tutorial progress advances when targets load late but the step is already satisfied
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.16 - 2026-04-29

- Bumped application version to 0.4.16
- Added a live tutorial launcher badge showing active level and step progress (for example: Advanced: 3/11)
- Synced launcher progress updates across tutorial start, step progression, and tutorial stop/completion
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.15 - 2026-04-29

- Bumped application version to 0.4.15
- Added pulsing tutorial coach visuals with viewport-safe sizing and scrollable content
- Added explicit off-screen target guidance with a "Find it ✨" jump-to-target action
- Expanded Advanced, Expert, and God Mode tutorial flows with more practical guided steps
- Added tutorial completion support for copy-object-ID actions to avoid step stalls
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.14 - 2026-04-29

- Bumped application version to 0.4.14
- Reworked tutorial coach positioning so it stays near the active element in left/detail/graph panes
- Expanded Basic tutorial flow from 4 steps to 8 practical onboarding steps
- Added completion-state checks for linked-object focus transitions to avoid false stalls
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.13 - 2026-04-29

- Bumped application version to 0.4.13
- Improved tutorial coach placement to avoid blocking critical controls while guiding steps
- Added state-based fallback completion checks for guided steps that depend on map/context transitions
- Expanded guided query matching and progression robustness in advanced/expert/god-mode tracks
- Added a tutorial launch button under Microsoft sign-in for users who are not signed in
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.12 - 2026-04-29

- Bumped application version to 0.4.12
- Standardized tutorial launcher and guided-step UI copy to English
- Fixed tutorial progression stalls on result-click steps by waiting for dynamic targets before binding actions
- Added Tier-0 query matching for both `tier0` and `tier-0` in guided search steps
- Updated Expert tutorial to start from a clean, self-contained flow instead of depending on previous phase context
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.11 - 2026-04-29

- Bumped application version to 0.4.11
- Added an interactive tutorial launch button directly under the search field
- Added four guided tutorial phases: Basis, Advanced, Expert, and God Mode
- Added tutorial coach overlays with highlighted click targets and directional callouts
- Added tutorial sandbox mode with dummy search results, dummy graph data, and dummy compare output
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.10 - 2026-04-29

- Bumped application version to 0.4.10
- Added compare controls for node type filtering, search, and impact-score sorting
- Added top Standard-only and Impact-only edge relation summaries in compare results
- Added compare export actions (JSON and CSV) based on active visible compare data
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.9 - 2026-04-29

- Bumped application version to 0.4.9
- Upgraded group map compare panel with node/edge overlap and delta metrics
- Added Standard-only, Impact-only, and overlap node list sections in compare results
- Added quick compare actions to open standard or impact graph directly from compare output
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.8 - 2026-04-29

- Bumped application version to 0.4.8
- Added `scripts/smoke-check.ps1` to validate homepage, health API, and social preview asset in a repeatable way
- Updated social metadata image mapping to use `static/brand/social-preview.png`
- Moved suspected unused brand assets into `static/brand/_unused/` quarantine instead of hard deletion
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.7 - 2026-04-28

- Bumped application version to 0.4.7
- Added persistent impact filter state (domain, severity, explain mode) with localStorage
- Added impact profile presets for CAB, Security, and Reset workflows
- Added explain mode details in relationship rail chips and detail panel for projected impact nodes
- Added group map compare action using `/api/map/group/<group_id>/compare` with overlap and delta KPI summary
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.6 - 2026-04-28

- Bumped application version to 0.4.6
- Added impact graph toolbar filters for severity and domain selection
- Added clickable domain chips to focus impact nodes/edges per domain
- Added filtered graph view export as JSON with active map mode and filter context
- Updated group refresh and deep-refresh behavior to respect active map mode
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.5 - 2026-04-28

- Bumped application version to 0.4.5
- Added impact-domain and severity-aware Cytoscape styling for projected impact graph nodes and edges
- Added quick group map mode toggle actions in the detail panel (Load standard graph / Load impact graph)
- Kept dedicated impact map endpoint and standard group map endpoint behavior unchanged
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.4 - 2026-04-28

- Bumped application version to 0.4.4
- Added group impact graph builder in GroupMapEngine that projects impact findings into graph nodes and edges
- Added dedicated group impact map endpoint: `/api/map/group/<group_id>/impact`
- Added Group detail action to load impact graph directly in the existing graph canvas
- Kept existing standard group map behavior unchanged (`/api/map/group/<group_id>`)
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.3 - 2026-04-28

- Bumped application version to 0.4.3
- Added server-side TXT renderer for group impact payloads in Flask
- Added dedicated TXT impact endpoint: `/api/impact/group/<group_id>/txt`
- Updated frontend TXT export flow to consume backend TXT output
- Kept JSON and CSV impact export behavior unchanged
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.2 - 2026-04-28

- Bumped application version to 0.4.2
- Expanded group delete impact coverage with additional Intune assignment domains:
	- Device Configurations
	- Settings Catalog Policies
	- Administrative Templates
	- Compliance Policies
	- App Protection Policies
	- App Configuration Policies
	- Platform Scripts and Proactive Remediation Scripts
	- Autopilot Deployment Profiles and Enrollment Status Page profiles
	- Windows 365 Cloud PC provisioning and user settings
- Added generic assignment-target matching helpers in GroupImpactEngine to normalize included/excluded group scope detection across Intune policy domains
- Added v1.0-first with beta fallback behavior for newly added Intune impact domains
- Added plain TXT export for group impact findings in addition to existing JSON and CSV export paths
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.1 - 2026-04-27

- Bumped application version to 0.4.1
- Added Conditional Access policy-to-group scope mapping for both included and excluded groups
- Added dynamic group support in mapping and search flows, including membership rule and membership rule processing state details
- Added CA scope-specific edge metadata and frontend edge styling (include/exclude) with contextual legend visibility
- Added Konami easter egg behavior: signed-out users get a lightweight "not logged in" prompt; signed-in users get an in-panel mini Asteroids mode
- Added mini Asteroids enhancements including scanline visual layer, boss encounter, enrage phase cues, and difficulty balancing
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.0 - 2026-04-22

- Bumped application version to 0.4.0
- Added a major group delete impact workflow for groups instead of only graph exploration
- Added executive go/no-go guidance with risk scoring, top evidence, coverage score, confidence, and constrained-domain visibility
- Added domain-by-domain remediation guidance and owner suggestions for follow-up actions before delete
- Added per-group remediation checklist tracking with saved progress, open-actions filtering, reset behavior, completion state, and ready-to-delete indication
- Added JSON and CSV export for group impact evidence
- Expanded dependency coverage across Conditional Access, Intune app targeting, enterprise apps, IAM/PIM role assignments, Administrative Units, group nesting, group licensing, Entitlement Management, M365 workloads, and Exchange signals
- Added API Permissions and Changelog tabs to the signed-out auth modal
- Added server-rendered changelog content from `LOG.md` directly into the front page modal
- Refreshed the popup onboarding content in Sign In, Features, and How To Use to match the current operational product surface
- Added an idle session timeout warning with a visible 60-second countdown, red pulsing final seconds, reset-on-activity behavior, and automatic sign-out
- Continued auth and UX hardening around popup sign-in, signed-out onboarding, and operational safety

## 0.3.16 - 2026-04-22

- Bumped application version to 0.3.16
- Fixed popup sign-in reliability by supporting multiple pending OAuth states in session
- Added localhost canonicalization (`127.0.0.1` -> `localhost`) to prevent session state mismatches
- Improved Intune app search with full pagination scan and matching on name, publisher, and description
- Added Graph beta fallback for Intune app search and Intune app map retrieval
- Added a user-facing info toast when an Intune app is found but has no assignments

## 0.3.15 - 2026-04-21

- Bumped application version to 0.3.15
- Added stronger session defaults: explicit TTL, non-refreshing session lifetime, and hardened cookie settings
- Added optional Redis-backed session storage via `SESSION_TYPE=redis` and `REDIS_URL`
- Added optional token cache encryption at rest via `TOKEN_CACHE_ENCRYPTION_KEY`
- Added response hardening headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`)
- Added no-store cache headers for non-static routes

## 0.3.14 - 2026-04-20

- Bumped application version to 0.3.14
- Forced the sign-in buttons themselves to open the Microsoft auth flow in a popup window
- Preserved popup callback completion and main-window refresh after successful sign-in

## 0.3.13 - 2026-04-20

- Bumped application version to 0.3.13
- Added explicit popup window hints to sign-in and consent flows so browsers open a popup instead of a normal tab when allowed

## 0.3.12 - 2026-04-20

- Bumped application version to 0.3.12
- Removed invalid `isAssigned` field selections from Intune mobile app queries
- Added `DeviceManagementApps.Read.All` explicitly to setup documentation requirements

## 0.3.11 - 2026-04-20

- Bumped application version to 0.3.11
- Intune app search now treats HTTP 401/403 responses as consent/permissions issues
- Search UI now surfaces detailed backend error text instead of only a generic unavailable label

## 0.3.10 - 2026-04-20

- Bumped application version to 0.3.10
- Added automatic Intune permission re-consent flow for App search
- App search now returns actionable reauth metadata instead of a dead-end error when consent is missing

## 0.3.9 - 2026-04-20

- Bumped application version to 0.3.9
- Fixed Intune app search failure by removing invalid metadata field from Graph $select query
- Preserved Intune-only App tab behavior while tolerating missing Graph metadata annotations

## 0.3.8 - 2026-04-20

- Bumped application version to 0.3.8
- Removed Entra app fallback from App tab so only Intune mobile apps are shown
- App search now filters to supported endpoint app platforms: Windows, macOS, iOS/iPadOS, Android
- App map/details are now Intune-only for consistent behavior

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
