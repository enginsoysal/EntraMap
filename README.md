# EntraMap

Version 0.3.16

EntraMap is a Flask web application that signs users in with Microsoft Entra ID and visualizes tenant relationships as an interactive graph. It helps you explore users, devices, groups, applications, and Conditional Access policies from a single screen.

## Features

- Multi-tenant Microsoft sign-in with delegated Microsoft Graph permissions
- Homepage-first login popup flow with contextual onboarding tabs
- Search for users, groups, devices, Intune apps, and Conditional Access policies
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
- Read-only deep links to Entra portal object pages
- Frontend Features and How To Use pages embedded in the authentication popup

## Latest Changes (0.3.16)

- Fixed popup sign-in reliability by supporting multiple pending OAuth states in session
- Added local host canonicalization between `127.0.0.1` and `localhost` to prevent session cookie/state mismatch
- Improved Intune app search by scanning paginated `mobileApps` inventory and matching by name, publisher, and description
- Added Microsoft Graph beta fallback for Intune app search and app map retrieval when app types are not exposed in v1.0
- Added a clear in-app message when an Intune app is found but has no assignment links

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
- Directory.Read.All

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
