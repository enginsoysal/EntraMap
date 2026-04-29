# Files Reference

Version 0.5.1

This file describes the purpose of each file in the repository.

## Root Files

### app.py
Main Flask application.

Responsibilities:
- Initializes Flask app and session configuration
- Registers authentication, search, details, map, health, and group impact routes
- Exposes group impact TXT export route at `/api/impact/group/<group_id>/txt`
- Exposes group impact graph route at `/api/map/group/<group_id>/impact`
- Exposes group map compare route at `/api/map/group/<group_id>/compare`
- Loads and renders the signed-out changelog content from `LOG.md`
- Delegates business logic to engines and services
- Applies response security headers and compression

### requirements.txt
Python dependency list used for local installs and Azure deployment.

### .env.example
Environment variable template for local and hosted configuration.

### .gitignore
Git ignore rules for secrets, Python artifacts, logs, and editor folders.

### README.md
Primary project documentation with setup, deployment, permissions, and usage guidance.

### LOG.md
Release history and version notes.

### FILES.md
This file. It acts as a file inventory and quick project reference.

### scripts/smoke-check.ps1
Operational smoke validation script.

Responsibilities:
- Optionally starts the Flask app for validation and stops it afterwards
- Verifies homepage response and OG social preview metadata
- Verifies `/api/health` response availability and payload shape
- Verifies static social preview asset availability (`/static/brand/social-preview.png`)

## Templates

### templates/index.html
Main application page for both signed-in and signed-out states.

Responsibilities:
- Renders the left search panel
- Renders the tutorial launch button and phase picker below the search field
- Renders the operational insights section
- Renders the graph container
- Shows auth popup onboarding tabs (Sign In, Features, How To Use, API Permissions, Changelog) when signed out
- Renders session-timeout and disconnect lightboxes
- Shows current user state and version
- Loads the CSS and JavaScript assets

### templates/login.html
Legacy sign-in template kept for compatibility.

Responsibilities:
- Not used in the primary user flow (homepage popup login is the default)

### templates/auth_popup_done.html
Popup callback completion template for OAuth sign-in.

Responsibilities:
- Handles popup sign-in completion state
- Refreshes or redirects the opener window with success/error context
- Closes the popup window automatically

## Static Assets

### static/css/style.css
Main stylesheet for the signed-in application UI.

Responsibilities:
- Defines layout, colors, panels, graph toolbar, insight panel, detail panel, auth popup styles, and timeout lightboxes
- Styles the signed-in header state
- Styles the search and graph view

### static/js/main.js
Frontend logic for the graph application.

Responsibilities:
- Initializes Cytoscape
- Reads app auth context from frontend bootstrapped state
- Executes search requests
- Loads graph data from the backend APIs
- Hydrates node photos for users and groups
- Renders search results
- Handles node selection and detail rendering
- Handles double-click drill-down behavior
- Calculates and renders operational insights
- Supports graph export and read-only helper actions
- Manages popup auth tabs, permission accordion, signed-out frontend mode, and session timeout behavior
- Renders group impact executive guidance, remediation workflows, checklist persistence, and export actions
- Supports group impact export in JSON, CSV, and plain TXT formats
- Supports one-click loading of impact findings as graph links for group objects
- Supports quick map-mode switching (standard vs impact) for group objects
- Applies impact domain/severity visual styling for projected impact nodes and edges
- Supports in-toolbar impact filters (severity + domain chips) and filtered-view graph export
- Persists impact filter/explain profile state and supports CAB/Security/Reset presets
- Supports standard-vs-impact map compare with overlap and delta list views in the group impact panel
- Supports compare node filters (type/search), impact-score sorting, and compare JSON/CSV export
- Supports top edge-delta relation summaries for Standard-only and Impact-only map differences
- Supports a fully interactive tutorial coach with four levels (Basic, Advanced, Expert, God Mode)
- Shows a live tutorial launcher status badge with active level and current step progress
- Supports tutorial sandbox mode with dummy search results, dummy map graphs, and dummy compare output
- Handles Konami easter egg behavior (signed-out prompt and signed-in mini Asteroids mode)
- Displays notifications and loading states

### static/brand/logo.svg
Primary EntraMap brand logo used in header and auth popup.

### static/brand/favicon.svg
Favicon used in the browser tab.

### static/brand/social-preview.png
Primary social share image used by OG/Twitter metadata.

### static/brand/_unused/
Quarantine folder for suspected unused assets.

Purpose:
- Holds reversible cleanup candidates so files are not hard-deleted before confirmation

## Runtime-Only Files

### .env
Not committed.

Purpose:
- Stores production or local secrets and app configuration

## Folders

### config/
Configuration layer with environment parsing and app settings.

### services/
Shared low-level services (Graph communication, session/cache helpers, photos).

### engines/
Independent feature engines (auth, search types, map types).

Notable current additions:
- `group_impact_engine.py` performs pre-delete dependency analysis for groups across policies, apps, roles, licensing, governance, and collaboration workloads.
- Group impact coverage now includes additional Intune policy assignments (device configurations, settings catalog, admin templates, compliance, app protection/configuration, scripts, enrollment profiles, and Cloud PC policy surfaces).

Current notable product surface built on top of these engines:
- search and relationship mapping for users, groups, devices, Intune apps, and Conditional Access policies
- group delete impact analysis with multi-domain evidence collection and completeness reporting

### templates/
Jinja2 templates rendered by Flask.

### static/
Frontend assets served by Flask.

### static/css/
CSS assets.

### static/js/
JavaScript assets.

### static/brand/
Brand assets (logo, favicon, social preview, and quarantine candidates).

### scripts/
Operational utility scripts for local validation and maintenance.
