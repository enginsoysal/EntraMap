# EntraMap

Version 0.4.0

EntraMap is a Flask web application that signs users in with Microsoft Entra ID and visualizes tenant relationships as an interactive graph. It helps you explore users, devices, groups, applications, and Conditional Access policies from a single screen.

## Features

- Multi-tenant Microsoft sign-in with delegated Microsoft Graph permissions
- Homepage-first login popup flow with contextual onboarding tabs and in-app release transparency
- Search for users, groups, devices, Intune apps, and Conditional Access policies
- Group deletion impact analysis across CA, Intune, IAM/PIM, Administrative Units, group nesting, licensing, Entitlement Management, M365 workloads, and Exchange workload signals
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
- Read-only deep links to Entra portal object pages
- Frontend onboarding tabs embedded in the authentication popup (Sign In, Features, How To Use, API Permissions, Changelog)
- In-app changelog rendered directly from `LOG.md`
- Idle session timeout warning with 60-second countdown before auto sign-out

## Latest Changes (0.4.0)

- Expanded EntraMap from a graph visualizer into a broader operational decision tool for group delete impact analysis
- Added executive guidance, remediation actions, owner suggestions, checklist persistence, ready-to-delete signaling, and CSV export for group impact workflows
- Broadened impact coverage across policy, device management, governance, licensing, and Microsoft 365 workload dependencies
- Added signed-out onboarding tabs for API Permissions and Changelog so operators can review access scope and release history before sign-in
- Added server-rendered changelog loading from `LOG.md`, keeping release notes in one source of truth
- Added idle-session timeout warning UX with countdown, final-seconds emphasis, and activity-based reset

## 0.4.0 Focus

The main difference between 0.3.16 and 0.4.0 is scope: 0.3.16 still centered on authentication reliability and Intune app visibility, while 0.4.0 turns EntraMap into a much more complete read-only impact and governance cockpit.

Operationally, the largest additions are:

- pre-delete group dependency analysis across multiple Entra and M365 domains
- executive decision support instead of raw findings only
- remediation and ownership guidance instead of passive visibility
- exportable evidence in both JSON and CSV
- richer signed-out onboarding with permissions and changelog transparency
- idle session timeout protection in the frontend

## Release History

For full historical version notes, see `LOG.md`.

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

4. Start the app:

```powershell
python app.py
```

5. Open:

```text
http://localhost:5000
```

## Azure Deployment Notes

This project is ready to be hosted on Azure App Service.

Recommended app settings:

- CLIENT_ID
- CLIENT_SECRET
- FLASK_SECRET_KEY

Recommended startup command:

```text
gunicorn --bind=0.0.0.0 --timeout 600 app:app
```

If you deploy on Windows App Service and prefer the built-in Python startup behavior, make sure the app starts app.py correctly and the environment variables are configured in App Settings.

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

## Project Structure

See FILES.md for a file-by-file breakdown.
See LOG.md for the release history.
