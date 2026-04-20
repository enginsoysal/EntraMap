# Files Reference

Version 0.3.14

This file describes the purpose of each file in the repository.

## Root Files

### app.py
Main Flask application.

Responsibilities:
- Handles Microsoft sign-in and sign-out routes
- Performs immediate local app sign-out without Microsoft account-picker interaction
- Stores the MSAL token cache in the Flask session
- Calls Microsoft Graph
- Builds graph data for users, groups, devices, Intune apps, and CA policies
- Exposes API endpoints used by the frontend
- Defines the application version

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

## Templates

### templates/index.html
Main application page for both signed-in and signed-out states.

Responsibilities:
- Renders the left search panel
- Renders the operational insights section
- Renders the graph container
- Shows auth popup onboarding tabs (Sign In, Features, How To Use) when signed out
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
- Defines layout, colors, panels, graph toolbar, insight panel, detail panel, and auth popup styles
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
- Manages popup auth tab behavior and signed-out frontend mode
- Displays notifications and loading states

### static/brand/logo.svg
Primary EntraMap brand logo used in header and auth popup.

### static/brand/favicon.svg
Favicon used in the browser tab.

## Runtime-Only Files

### .env
Not committed.

Purpose:
- Stores production or local secrets and app configuration

## Folders

### templates/
Jinja2 templates rendered by Flask.

### static/
Frontend assets served by Flask.

### static/css/
CSS assets.

### static/js/
JavaScript assets.

### static/brand/
Brand assets (logo and favicon).
