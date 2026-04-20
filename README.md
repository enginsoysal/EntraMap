# EntraMap

Version 0.2.0

EntraMap is a Flask web application that signs users in with Microsoft Entra ID and visualizes tenant relationships as an interactive graph. It helps you explore users, devices, groups, applications, and Conditional Access policies from a single screen.

## Features

- Multi-tenant Microsoft sign-in with delegated Microsoft Graph permissions
- Search for users and groups
- Interactive graph view powered by Cytoscape.js
- Relationship mapping for:
  - Users to devices
  - Users to groups
  - Groups to enterprise applications
  - Users and groups to Conditional Access policies
- Clickable nodes with detail panels
- Graph node photo rendering for users and groups
- Double-click drill-down navigation on user and group nodes
- Operational insights panel with quick risk filters
- JSON export of the current graph for reporting and handover
- Read-only deep links to Entra portal object pages
- Azure App Service friendly deployment model

## Version 0.2.0 Changes

- Upgraded the project version to 0.2.0
- Added graph node photos for users and groups
- Added double-click drill-down behavior to quickly re-root the graph on user or group objects
- Added Operational Insights with KPIs and quick focus filters for unmanaged and non-compliant devices
- Added graph JSON export for read-only reporting workflows
- Added read-only object actions in detail views (copy object ID and open in Entra portal)
- Added footer links on both signed-in and login pages

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

## Project Structure

See FILES.md for a file-by-file breakdown.
See LOG.md for the release history.
