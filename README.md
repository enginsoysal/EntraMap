# EntraMap

Version 0.3.13

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

## Version 0.3.13 Changes

- Bumped the project version to 0.3.13
- Restored explicit popup-window behavior for Microsoft sign-in and Intune re-consent flows in modern browsers

## Version 0.3.12 Changes
- Custom EntraMap favicon and refreshed logo branding
- Azure App Service friendly deployment model

## Version 0.3.12 Changes

- Bumped the project version to 0.3.12
- Fixed Intune app Graph queries by removing invalid `isAssigned` field selections
- Simplified Intune app search subtitles to avoid referencing unavailable properties
- Added `DeviceManagementApps.Read.All` explicitly to the required delegated permission list

## Version 0.3.11 Changes

- Bumped the project version to 0.3.11
- Intune app search now treats HTTP 401/403 as re-consent/permissions issues and triggers the consent flow
- Search UI now shows detailed backend error text instead of only a generic unavailable message

## Version 0.3.10 Changes

- Bumped the project version to 0.3.10
- Added automatic re-consent flow when Intune app search fails due to missing permissions
- App search now opens a consent popup automatically and guides the user to retry after consent

## Version 0.3.9 Changes

- Bumped the project version to 0.3.9
- Fixed Intune app search failure caused by an invalid Graph $select field
- Kept App tab Intune-only while making platform filtering tolerant when Graph omits metadata annotations

## Version 0.3.8 Changes

- Bumped the project version to 0.3.8
- App tab is now strict Intune-only (no Entra App Registration fallback)
- App search now returns only Windows, macOS, iOS/iPadOS, and Android Intune app types
- App map/details endpoints now resolve only Intune mobile apps

## Version 0.3.7 Changes

- Bumped the project version to 0.3.7
- App search is now resilient: Intune apps first, with automatic Entra app fallback when Intune access is unavailable
- Removed hard-fail behavior that showed "Intune app search failed" in the UI
- App map/details now resolve from Intune first and fallback to Entra app objects when needed

## Version 0.3.6 Changes

- Bumped the project version to 0.3.6
- Device map layout now centers on the searched device instead of defaulting to a user root
- Switched App search from Entra service principals to Intune Company Portal apps (`deviceAppManagement/mobileApps`)
- Switched App map/details endpoints to Intune mobile apps and assignment targets
- Added delegated scope `DeviceManagementApps.Read.All` for Intune app visibility

## Version 0.3.5 Changes

- Bumped the project version to 0.3.5
- Added Refresh button in graph toolbar to reload live Microsoft Graph data without re-searching
- Force re-consent on next sign-in after Disconnect tenant
- Added separate Sign Out button in header (distinct from Disconnect tenant)
- Widened group detection in memberOf filter for better compatibility across tenant configurations

## Version 0.3.4 Changes

- Bumped the project version to 0.3.4
- Replaced browser confirm dialog on Disconnect tenant with a styled in-app lightbox

## Version 0.3.3 Changes

- Bumped the project version to 0.3.3
- Added Disconnect tenant button below the header for a full local session and token wipe
- Moved footer links into the auth popup so they remain visible while signed out

## Version 0.3.2 Changes

- Bumped the project version to 0.3.2
- Changed sign-out to instant local sign-out (no Microsoft account picker)
- Kept popup sign-in behavior for a smooth in-app authentication flow

## Version 0.3.1 Changes

- Bumped the project version to 0.3.1
- Added true popup window behavior for Microsoft sign-in from frontend buttons
- Added popup callback completion handling to refresh the main app after successful sign-in
- Added popup callback error handling to surface login errors back in the main app

## Version 0.3.0 Changes

- Upgraded the project version to 0.3.0
- Replaced standalone login page flow with a homepage popup login experience
- Added frontend onboarding tabs in the popup: Sign In, Features, and How To Use
- Added custom EntraMap logo and favicon assets
- Improved signed-out behavior to keep the app visible while requiring sign-in for data actions
- Kept all operational functionality read-only

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

## Project Structure

See FILES.md for a file-by-file breakdown.
See LOG.md for the release history.
