# Files Reference

Version 0.2.0

This file describes the purpose of each file in the repository.

## Root Files

### app.py
Main Flask application.

Responsibilities:
- Handles Microsoft sign-in and sign-out routes
- Stores the MSAL token cache in the Flask session
- Calls Microsoft Graph
- Builds graph data for users and groups
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
Main signed-in application page.

Responsibilities:
- Renders the left search panel
- Renders the operational insights section
- Renders the graph container
- Shows the signed-in user and version
- Loads the CSS and JavaScript assets

### templates/login.html
Microsoft sign-in landing page.

Responsibilities:
- Presents the Sign in with Microsoft button
- Explains tenant consent expectations
- Displays login errors
- Shows the current application version

## Static Assets

### static/css/style.css
Main stylesheet for the signed-in application UI.

Responsibilities:
- Defines layout, colors, panels, graph toolbar, insight panel, and detail panel styles
- Styles the signed-in header state
- Styles the search and graph view

### static/js/main.js
Frontend logic for the graph application.

Responsibilities:
- Initializes Cytoscape
- Executes search requests
- Loads graph data from the backend APIs
- Hydrates node photos for users and groups
- Renders search results
- Handles node selection and detail rendering
- Handles double-click drill-down behavior
- Calculates and renders operational insights
- Supports graph export and read-only helper actions
- Displays notifications and loading states

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
