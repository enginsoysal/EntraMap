# Self-hosting EntraMap

EntraMap is MIT-licensed and can run on your own infrastructure, including an
on-premises server or an Azure deployment in a region chosen by your organization.
You do not need to use the public entramap.com application or its app registration.
Self-hosting controls where the EntraMap server runs; it is not an offline mode or
a guarantee that every external service processes data in the same country.

## Install and configure

1. Clone this repository and install Python 3.11+ and the dependencies in
   `requirements.txt`. Use an isolated virtual environment.
2. Create your own Microsoft Entra app registration using the README instructions.
   The current authentication implementation uses the `organizations` authority;
   the documented setup is a multitenant registration. Restrict enterprise-app
   access and network ingress according to your organization's policy. Do not
   assume a single-tenant registration works without adapting the authority.
3. Configure the delegated Graph permissions listed in `config/config.py`
   (`Config.SCOPES`) and obtain the necessary administrator consent.
4. Configure `CLIENT_ID`, `CLIENT_SECRET`, and a stable random `FLASK_SECRET_KEY`
   using your deployment's secret-management mechanism. Do not commit credentials.
5. Set `REDIRECT_URI=https://YOUR-HOST/auth/callback` and register that exact URL
   as a **Web** redirect URI. Your users' browsers must be able to reach it.
   For local development use `http://localhost:5000/auth/callback`.
6. Run `python app.py` for local development. For a Linux production host, install
   a process manager and HTTPS reverse proxy and run, for example,
   `gunicorn --bind=127.0.0.1:8000 --timeout 600 app:app`.
   On Azure App Service use the startup command in the README.
7. Set `SESSION_COOKIE_SECURE=true` for HTTPS. Keep secret keys stable across
   workers. For multiple instances use the supported Redis session backend
   (`SESSION_TYPE=redis`, `REDIS_URL`) with appropriate network and access controls.
8. Configure `TOKEN_CACHE_ENCRYPTION_KEY` as described in `.env.example` to encrypt
   cached MSAL tokens. This is optional in code, not enabled automatically.
9. Verify `/api/health`, then perform a fresh browser sign-in and a read-only search.
   A healthy HTTP endpoint alone does not prove that the OAuth credential works.

## Data flows and external connections

| Connection or storage | Purpose and operator responsibility |
| --- | --- |
| Browser to your EntraMap host | Displays and exports directory evidence through your own deployment. Protect it with HTTPS and appropriate access controls. |
| Microsoft identity endpoints (`login.microsoftonline.com`) | Authentication and token exchange. Self-hosting still depends on Microsoft identity services. |
| Microsoft Graph (`graph.microsoft.com`) | Server-side read requests for directory and workload evidence. This version targets the commercial Microsoft cloud; sovereign-cloud endpoints are not configurable end to end. |
| Browser CDN requests (`cdn.jsdelivr.net`, `cdnjs.cloudflare.com`) | The map/login templates load frontend libraries and styles externally. A restricted-egress deployment must review these requests or vendor the dependencies and update the templates. |
| Server-side session backend | Stores session identity and token cache. Defaults to filesystem storage; Redis is optional. Set access, encryption, retention and cleanup policies. Session expiry is not a guarantee that backups or logs have been erased. |
| Browser state and downloaded reports | Evidence and exports can contain tenant data. Apply endpoint, download and retention controls. Pseudonymization is not proof of anonymization. |
| Optional Application Insights | Request, exception, dependency and optional log telemetry can leave the host when configured. Leave both `APPLICATIONINSIGHTS_CONNECTION_STRING` and `APPINSIGHTS_INSTRUMENTATIONKEY` unset if not wanted; also check hosting-level agents and diagnostic settings. Disabling only `APPLICATIONINSIGHTS_ENABLE_LOGGING` does not disable all telemetry. |

The application's Graph requests run from your self-hosted server, rather than
through the public EntraMap server. Review hosting logs, proxies, backups, CDN
requests and Microsoft service commitments separately with your security team.
Neither open source nor read-only operation is a data-residency certification.

## Revoking access and handling existing data

Your Entra administrator controls your app registration and enterprise application.
They can block sign-in, revoke consent and rotate/remove credentials as appropriate.
To stop your deployment serving data immediately, stop it or block access and clear
its sessions using your operational procedures. Issued-token lifetimes and existing
sessions matter; removing a secret alone is not an immediate universal kill switch.

Revoking access does not recall earlier downloads or erase previously transmitted
data. Review and delete session data, exports, logs and backups under your retention
policy. Ask the operator of any previously used deployment about its retained data.

## Expired credential: AADSTS7000222

This error means the client secret used by the server has expired. It is not fixed
by reinstalling the application or asking every user to grant consent again.

1. Identify the app registration from the deployment's `CLIENT_ID` and inspect
   credential expiry dates. Do not print secret values in logs or tickets.
2. Add a replacement credential, preserving other credentials during the rotation.
   If using Azure CLI, use `az ad app credential reset --append` rather than a reset
   that deletes other credentials. Capture its secret output securely.
3. Update **this deployment's** `CLIENT_SECRET` in its hosting configuration or
   secret store. Never place the production secret in GitHub source or releases.
4. Restart/reload the application workers so they use the replacement value.
5. Start a fresh sign-in from the home page and verify a read-only Graph operation.
   An old URL containing `login_error` can still display the previous failure.
6. After successful validation, retire the old credential according to your
   organization's policy. Record the replacement expiry date and assign an owner
   to renew it before expiry, with alerts at least 30 and 7 days beforehand.

The current code accepts a client secret; certificate authentication requires an
implementation change. The project does not automatically renew credentials or
create expiry alerts for your deployment.
