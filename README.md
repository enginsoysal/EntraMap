# EntraMap

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Version 0.5.1

EntraMap is a Flask web application that signs users in with Microsoft Entra ID and visualizes tenant relationships as an interactive graph. It helps you explore users, devices, groups, applications, and Conditional Access policies from a single screen.

## Features

- Multi-tenant Microsoft sign-in with delegated Microsoft Graph permissions
- Homepage-first login popup flow with contextual onboarding tabs and in-app release transparency
- Search for users, groups, devices, Intune apps, and Conditional Access policies
- Group deletion impact analysis across CA, Intune apps and policy domains, IAM/PIM, Administrative Units, group nesting, licensing, Entitlement Management, M365 workloads, and Exchange workload signals
- Coverage transparency with completeness score, constrained-domain reasons, and scan-limit metadata
- Executive go/no-go delete guidance with top evidence, remediation guidance, owner suggestions, and per-group checklist tracking
- Saved checklist progress per group with reset and open-actions filtering
- Interactive graph view powered by Cytoscape.js
- Relationship mapping for:
  - Users to devices
  - Users to groups
  - Groups to enterprise applications
  - Users and groups to Conditional Access policies
- Clickable nodes with detail panels
- Graph node photo rendering for users and groups
- Double-click drill-down navigation on all supported object types
- Operational insights panel with quick risk filters
- JSON export of the current graph for reporting and handover
- CSV export of group impact analysis for governance and CAB workflows
- Plain TXT export of group impact findings for quick change/CAB handover notes
- Impact graph projection from group findings for visual dependency mapping
- Impact graph domain/severity styling and one-click standard/impact map toggle
- Impact graph toolbar filters, domain chips, and filtered-view JSON export
- Persistent impact filter profiles with CAB/Security presets and explain mode
- Group map compare action with node/edge delta metrics, edge relation summaries, and overlap/only-in-map lists
- Compare controls for node type filtering, in-panel search, and impact-score sorting
- Compare export in JSON and CSV using the currently visible filtered compare result
- Interactive in-app tutorial launcher under the search field with four guided levels (Basic, Advanced, Expert, God Mode)
- Step-by-step tutorial coach overlay with highlighted click targets, directional callouts, and required actions
- Tutorial sandbox mode with dummy search results, dummy graph data, and dummy compare output for safe onboarding drills
- Reusable PowerShell smoke-check script for homepage, health endpoint, and social preview validation
- Read-only deep links to Entra portal object pages
- Frontend onboarding tabs embedded in the authentication popup (Sign In, Features, How To Use, API Permissions, Changelog)
- In-app changelog rendered directly from `LOG.md`
- Idle session timeout warning with 60-second countdown before auto sign-out

## Latest Changes (0.5.1)

- Bumped application version to 0.5.1
- Removed `opencensus-ext-flask` from requirements to resolve Flask 3.x dependency conflicts during environment setup
- Updated telemetry fallback so instrumentation-key mode keeps OpenCensus logging when Flask middleware is unavailable
- Updated release documentation in README.md, FILES.md, and LOG.md for version consistency

## 0.4.11 Focus

Version 0.4.11 focuses on interactive operator onboarding: guided walkthroughs for search, map, impact, compare, and export flows using safe dummy data.

Operational highlights in 0.4.11:

- in-panel tutorial launcher below search with one-click phase selection
- progressive guided tracks from basic usage up to expert and god-mode operator drills
- click/type-driven tutorial completion flow with visual target emphasis
- dummy-data sandbox paths so onboarding never touches real tenant data

## Screenshots

### Main Screen

![Main screen](screenshots/mainScreen.png)

### Search Objects

![Search objects](screenshots/searchObjects.png)

### User Search

![User search](screenshots/userSearch.png)

### Linked Objects

![Linked objects](screenshots/linkedObjects.png)

### Impact Screen

![Impact screen](screenshots/impactScreen.png)

### Operational Insights

![Operational insights](screenshots/operationalInsights.png)

## Release History

For full historical version notes, see `LOG.md`.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Requirements

- Python 3.11+ recommended
- A Microsoft Entra app registration configured as multi-tenant
- A client secret for the app registration
- Microsoft Graph delegated permissions with tenant consent

## Microsoft Entra App Registration

Create an app registration in Azure with these settings:

- Name: EntraMap
- Supported account types: Accounts in any organizational directory (Multitenant)
- Redirect URIs:
  - http://localhost:5000/auth/callback
  - https://YOUR-PRODUCTION-DOMAIN/auth/callback

### Delegated Microsoft Graph Permissions

Add these delegated permissions:

- User.Read
- User.ReadBasic.All
- Group.Read.All
- Device.Read.All
- DeviceManagementApps.Read.All
- Application.Read.All
- Policy.Read.All
- RoleManagement.Read.Directory
- Organization.Read.All
- EntitlementManagement.Read.All
- Team.ReadBasic.All
- Sites.Read.All
- Tasks.Read
- Directory.Read.All

Optional (recommended if you want full Group Impact coverage without partial domains):

- AdministrativeUnit.Read.All
- DeviceManagementConfiguration.Read.All
- DeviceManagementManagedDevices.Read.All
- DeviceManagementServiceConfig.Read.All

Notes:

- RoleManagement.Read.Directory is used for IAM and PIM impact checks.
- Organization.Read.All improves group-based licensing resolution.
- EntitlementManagement.Read.All enables Entitlement Management policy coverage.
- Team.ReadBasic.All improves Teams workload signal coverage.
- Sites.Read.All improves SharePoint workload signal coverage.
- Tasks.Read improves Planner workload signal coverage.
- AdministrativeUnit.Read.All is used for Administrative Unit impact checks.
- Even with correct Graph permissions, some results can still be partial when the signed-in account lacks sufficient Entra role visibility.

### Consent Model

The first sign-in for a tenant must be completed by a role capable of granting tenant-wide consent, typically:

- Global Administrator
- Privileged Role Administrator

After tenant-wide consent is granted once, regular users in that tenant can sign in without extra Azure setup.

## Local Setup

1. Install dependencies:

```powershell
pip install -r requirements.txt
```

2. Copy the environment template:

```powershell
Copy-Item .env.example .env
```

3. Fill in these values in .env:

- CLIENT_ID
- CLIENT_SECRET
- FLASK_SECRET_KEY
- APPLICATIONINSIGHTS_CONNECTION_STRING or APPINSIGHTS_INSTRUMENTATIONKEY (optional)

4. Start the app:

```powershell
python app.py
```

5. Optional: run smoke checks (starts/stops app automatically by default):

```powershell
./scripts/smoke-check.ps1
```

If the app is already running, use:

```powershell
./scripts/smoke-check.ps1 -NoStart
```

6. Open:

```text
http://localhost:5000
```

## Azure Deployment Notes

This project is ready to be hosted on Azure App Service.

Recommended app settings:

- CLIENT_ID
- CLIENT_SECRET
- FLASK_SECRET_KEY
- APPLICATIONINSIGHTS_CONNECTION_STRING (preferred) or APPINSIGHTS_INSTRUMENTATIONKEY

Recommended startup command:

```text
gunicorn --bind=0.0.0.0 --timeout 600 app:app
```

If you deploy on Windows App Service and prefer the built-in Python startup behavior, make sure the app starts app.py correctly and the environment variables are configured in App Settings.

### Application Insights

This app can send request, exception, dependency, and optional application logging telemetry to Azure Monitor Application Insights.

Recommended configuration:

- Set `APPLICATIONINSIGHTS_CONNECTION_STRING` to the connection string from your Application Insights resource.
- If you only have an instrumentation key, set `APPINSIGHTS_INSTRUMENTATIONKEY`; the app uses a compatible instrumentation-key exporter path for Flask telemetry.
- Keep `APPLICATIONINSIGHTS_ENABLE_LOGGING=true` if you also want Python log events in Application Insights.

Notes:

- Connection strings are the modern Azure Monitor configuration model; prefer them over instrumentation keys for new deployments.
- Instrumentation-key support is kept as a compatibility path because many existing Application Insights resources still expose that value during migration.
- After deployment, hit `/api/health` or load the homepage once and then verify incoming requests in the Application Insights resource.

## Security Notes

- Never commit .env to source control
- Rotate client secrets regularly
- Use a strong FLASK_SECRET_KEY in production
- Review delegated permissions carefully before production rollout

### Production Hardening

For production usage, configure these additional safeguards:

- Set `SESSION_COOKIE_SECURE=true` when running behind HTTPS
- Keep session lifetime short with `SESSION_TTL_MINUTES` (for example 30-60)
- Prefer Redis-backed sessions over local filesystem (`SESSION_TYPE=redis`, `REDIS_URL`)
- Enable token cache encryption at rest with `TOKEN_CACHE_ENCRYPTION_KEY`
- Restrict operational access to host filesystem and deployment tooling (least privilege)

## Contributing

Contributions are welcome.

1. Fork the repository and create a feature branch.
2. Keep changes focused and include clear commit messages.
3. Run the app locally and validate the affected flow before opening a PR.
4. Open a pull request with context, test notes, and screenshots when UI is impacted.

## Project Structure

See FILES.md for a file-by-file breakdown.
See LOG.md for the release history.
