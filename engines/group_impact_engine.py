"""
Group Impact Engine
Builds a deletion-impact summary for a group across key Entra/Intune domains.

This is intentionally isolated from map engines so existing graph behavior remains unchanged.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Any

from services.graph_service import GraphService


class GroupImpactEngine:
    """Group impact analysis for safe pre-delete checks."""

    MAX_CA_ITEMS = 400
    MAX_INTUNE_APPS = 1200
    MAX_INTUNE_POLICIES = 1200
    MAX_INTUNE_ASSIGNMENTS = 100
    MAX_ASSIGNMENTS_PER_APP = 100
    MAX_TEAMS_CHANNELS = 200
    MAX_SITE_DRIVES = 200
    MAX_PLANS = 200

    @staticmethod
    def _contains_value(obj: Any, expected: str) -> bool:
        if isinstance(obj, dict):
            return any(GroupImpactEngine._contains_value(v, expected) for v in obj.values())
        if isinstance(obj, list):
            return any(GroupImpactEngine._contains_value(v, expected) for v in obj)
        if isinstance(obj, str):
            return obj == expected
        return False

    @staticmethod
    def _get_risk_summary(blockers: int, warnings: int, partial_domains: int) -> Dict:
        """Translate raw findings into a simple, user-facing risk summary."""
        score = min(100, blockers * 25 + warnings * 10 + partial_domains * 5)
        if blockers > 0:
            return {
                "riskLevel": "blocked",
                "riskLabel": "Blocked",
                "riskScore": score,
                "recommendation": "Do not delete this group before reviewing blocker findings.",
                "safeToDelete": False,
            }
        if warnings > 0 or partial_domains > 0:
            return {
                "riskLevel": "caution",
                "riskLabel": "Caution",
                "riskScore": max(score, 15),
                "recommendation": "Review linked resources before deleting this group.",
                "safeToDelete": False,
            }
        return {
            "riskLevel": "safe",
            "riskLabel": "Safe",
            "riskScore": 0,
            "recommendation": "No direct dependencies were detected in the checked domains.",
            "safeToDelete": True,
        }

    @staticmethod
    def _clean(obj: Dict) -> Dict:
        return {k: v for k, v in obj.items() if not k.startswith("@")}

    @staticmethod
    def _is_permission_error(err: Dict) -> bool:
        if not err or "error" not in err:
            return False
        code = err.get("error")
        msg = str(err.get("message", "")).lower()
        return code in (401, 403) or any(k in msg for k in ["forbidden", "insufficient", "permission", "authorization"])

    @staticmethod
    def _probe(endpoint: str, token: str) -> Tuple[bool, Dict]:
        """Return (is_ok, error_dict_or_none)."""
        data = GraphService.get(endpoint, token)
        if data and "error" in data:
            return False, data
        return True, None

    @staticmethod
    def _assignment_target_matches_group(target: Dict, group_id: str) -> bool:
        if not isinstance(target, dict):
            return False

        direct_ids = [
            target.get("groupId"),
            target.get("entraObjectId"),
            target.get("sourceId"),
            target.get("sourceGroupId"),
        ]
        if any(item == group_id for item in direct_ids if item):
            return True

        for key in ["groupIds", "includedGroupIds", "excludedGroupIds"]:
            value = target.get(key)
            if isinstance(value, list) and group_id in value:
                return True

        return False

    @staticmethod
    def _collect_group_assignment_hits(assignments: List[Dict], group_id: str) -> List[Dict]:
        hits = []
        for assignment in assignments:
            target = assignment.get("target", {})
            if not GroupImpactEngine._assignment_target_matches_group(target, group_id):
                continue

            target_type = str(target.get("@odata.type", "")).lower()
            impact = "excluded_scope" if "exclusion" in target_type else "included_scope"
            hits.append(
                {
                    "id": assignment.get("id", ""),
                    "impact": impact,
                    "severity": "warning" if impact == "excluded_scope" else "blocker",
                    "targetType": target_type,
                }
            )
        return hits

    @staticmethod
    def _collect_assignment_domain_impact(
        group_id: str,
        token: str,
        *,
        key: str,
        label: str,
        list_endpoint: str,
        list_select: str,
        assignment_endpoint_template: str,
        name_fallback: str,
        name_fields: Tuple[str, ...] = ("displayName", "name", "title"),
        probe_endpoint: str = "",
        base_url: str = "https://graph.microsoft.com/v1.0",
        max_items: int = 400,
        max_assignments: int = 100,
    ) -> Dict:
        probe_url = probe_endpoint or f"{base_url}{list_endpoint}?$select=id&$top=1"
        ok, err = GroupImpactEngine._probe(probe_url, token)
        if not ok:
            return {
                "key": key,
                "label": label,
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", f"Unable to read {label.lower()} assignments."),
            }

        items = GraphService.get_all(
            f"{base_url}{list_endpoint}?$select={list_select}&$top=100",
            token,
            max_items=max_items,
        )

        findings = []

        def collect_assignments(item: Dict) -> List[Dict]:
            item_id = item.get("id")
            if not item_id:
                return []

            assignments = GraphService.get_all(
                f"{base_url}{assignment_endpoint_template.format(id=item_id)}?$top=100",
                token,
                max_items=max_assignments,
            )

            item_name = ""
            for field in name_fields:
                value = item.get(field)
                if value:
                    item_name = value
                    break
            if not item_name:
                item_name = name_fallback

            hits = []
            for hit in GroupImpactEngine._collect_group_assignment_hits(assignments, group_id):
                hits.append(
                    {
                        "id": hit.get("id", ""),
                        "name": item_name,
                        "impact": hit.get("impact", "included_scope"),
                        "severity": hit.get("severity", "blocker"),
                        "resourceId": item_id,
                    }
                )
            return hits

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(collect_assignments, item) for item in items if item.get("id")]
            for future in as_completed(futures):
                try:
                    findings.extend(future.result())
                except Exception:
                    pass

        return {
            "key": key,
            "label": label,
            "status": "ok",
            "count": len(findings),
            "findings": findings,
        }

    @staticmethod
    def _collect_ca_impact(group_id: str, token: str) -> Dict:
        ok, err = GroupImpactEngine._probe(
            "/identity/conditionalAccess/policies?$select=id&$top=1",
            token,
        )
        if not ok:
            return {
                "key": "conditional_access",
                "label": "Conditional Access",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read Conditional Access policies."),
            }

        findings = []
        policies = GraphService.get_all(
            "/identity/conditionalAccess/policies?$select=id,displayName,state,conditions&$top=100",
            token,
            max_items=GroupImpactEngine.MAX_CA_ITEMS,
        )
        for policy in policies:
            cond = policy.get("conditions", {})
            users_cond = cond.get("users", {})
            include_groups = users_cond.get("includeGroups", [])
            exclude_groups = users_cond.get("excludeGroups", [])

            if group_id in include_groups:
                findings.append(
                    {
                        "id": policy.get("id", ""),
                        "name": policy.get("displayName", "CA Policy"),
                        "impact": "included_scope",
                        "severity": "blocker",
                        "state": policy.get("state", ""),
                    }
                )
            if group_id in exclude_groups:
                findings.append(
                    {
                        "id": policy.get("id", ""),
                        "name": policy.get("displayName", "CA Policy"),
                        "impact": "excluded_scope",
                        "severity": "warning",
                        "state": policy.get("state", ""),
                    }
                )

        return {
            "key": "conditional_access",
            "label": "Conditional Access",
            "status": "ok",
            "count": len(findings),
            "findings": findings,
        }

    @staticmethod
    def _collect_enterprise_app_impact(group_id: str, token: str) -> Dict:
        ok, err = GroupImpactEngine._probe(
            f"/groups/{group_id}/appRoleAssignments?$top=1",
            token,
        )
        if not ok:
            return {
                "key": "enterprise_apps",
                "label": "Enterprise App Access",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read enterprise app assignments."),
            }

        assignments = GraphService.get_all(
            f"/groups/{group_id}/appRoleAssignments?$select=id,resourceId,appRoleId,principalDisplayName&$top=100",
            token,
            max_items=300,
        )

        resource_ids = {a.get("resourceId") for a in assignments if a.get("resourceId")}
        sp_cache = {}

        def fetch_sp(sp_id: str):
            sp = GraphService.get(
                f"/servicePrincipals/{sp_id}?$select=id,displayName,appId,publisherName,servicePrincipalType",
                token,
            )
            return sp_id, sp

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(fetch_sp, rid) for rid in resource_ids]
            for future in as_completed(futures):
                try:
                    rid, sp = future.result()
                    if sp and "error" not in sp:
                        sp_cache[rid] = sp
                except Exception:
                    pass

        findings = []
        for assignment in assignments:
            rid = assignment.get("resourceId")
            sp = sp_cache.get(rid)
            findings.append(
                {
                    "id": assignment.get("id", ""),
                    "name": sp.get("displayName", "Enterprise App") if sp else "Enterprise App",
                    "impact": "app_role_assignment",
                    "severity": "warning",
                    "resourceId": rid,
                    "publisher": sp.get("publisherName", "") if sp else "",
                }
            )

        return {
            "key": "enterprise_apps",
            "label": "Enterprise App Access",
            "status": "ok",
            "count": len(findings),
            "findings": findings,
        }

    @staticmethod
    def _collect_intune_impact(group_id: str, token: str) -> Dict:
        return GroupImpactEngine._collect_intune_impact_from_base(group_id, token, "https://graph.microsoft.com/v1.0")

    @staticmethod
    def _collect_intune_impact_from_base(group_id: str, token: str, base_url: str) -> Dict:
        ok, err = GroupImpactEngine._probe(
            f"{base_url}/deviceAppManagement/mobileApps?$select=id&$top=1",
            token,
        )
        if not ok:
            return {
                "key": "intune_apps",
                "label": "Intune App Assignments",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read Intune mobile apps."),
            }

        apps = GraphService.get_all(
            f"{base_url}/deviceAppManagement/mobileApps?$select=id,displayName,publisher,description,lastModifiedDateTime&$top=100",
            token,
            max_items=GroupImpactEngine.MAX_INTUNE_APPS,
        )

        findings = []

        def collect_assignments(app: Dict):
            assignments = GraphService.get_all(
                f"{base_url}/deviceAppManagement/mobileApps/{app['id']}/assignments?$top=100",
                token,
                max_items=GroupImpactEngine.MAX_ASSIGNMENTS_PER_APP,
            )
            hits = []
            for assignment in assignments:
                target = assignment.get("target", {})
                target_type = (target.get("@odata.type") or "").lower()
                target_group_id = target.get("groupId")
                if target_group_id != group_id:
                    continue

                impact = "excluded_scope" if "exclusion" in target_type else "included_scope"
                hits.append(
                    {
                        "id": assignment.get("id", ""),
                        "name": app.get("displayName", "Intune App"),
                        "impact": impact,
                        "severity": "warning" if impact == "excluded_scope" else "blocker",
                        "publisher": app.get("publisher", ""),
                    }
                )
            return hits

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(collect_assignments, app) for app in apps if app.get("id")]
            for future in as_completed(futures):
                try:
                    findings.extend(future.result())
                except Exception:
                    pass

        return {
            "key": "intune_apps",
            "label": "Intune App Assignments",
            "status": "ok",
            "count": len(findings),
            "findings": findings,
        }

    @staticmethod
    def _collect_intune_device_configuration_impact(group_id: str, token: str, base_url: str) -> Dict:
        return GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_device_configurations",
            label="Intune Device Configurations",
            list_endpoint="/deviceManagement/deviceConfigurations",
            list_select="id,displayName,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/deviceConfigurations/{id}/assignments",
            name_fallback="Device configuration",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

    @staticmethod
    def _collect_intune_settings_catalog_impact(group_id: str, token: str, base_url: str) -> Dict:
        return GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_settings_catalog",
            label="Settings Catalog Policies",
            list_endpoint="/deviceManagement/configurationPolicies",
            list_select="id,name,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/configurationPolicies/{id}/assignments",
            name_fallback="Settings catalog policy",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

    @staticmethod
    def _collect_intune_admin_template_impact(group_id: str, token: str, base_url: str) -> Dict:
        return GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_admin_templates",
            label="Administrative Templates",
            list_endpoint="/deviceManagement/groupPolicyConfigurations",
            list_select="id,displayName,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/groupPolicyConfigurations/{id}/assignments",
            name_fallback="Administrative template policy",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

    @staticmethod
    def _collect_intune_compliance_impact(group_id: str, token: str, base_url: str) -> Dict:
        return GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_compliance",
            label="Compliance Policies",
            list_endpoint="/deviceManagement/deviceCompliancePolicies",
            list_select="id,displayName,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/deviceCompliancePolicies/{id}/assignments",
            name_fallback="Compliance policy",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

    @staticmethod
    def _collect_intune_app_protection_impact(group_id: str, token: str, base_url: str) -> Dict:
        return GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_app_protection",
            label="App Protection Policies",
            list_endpoint="/deviceAppManagement/managedAppPolicies",
            list_select="id,displayName,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceAppManagement/managedAppPolicies/{id}/assignments",
            name_fallback="App protection policy",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

    @staticmethod
    def _collect_intune_app_configuration_impact(group_id: str, token: str, base_url: str) -> Dict:
        return GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_app_configuration",
            label="App Configuration Policies",
            list_endpoint="/deviceAppManagement/targetedManagedAppConfigurations",
            list_select="id,displayName,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceAppManagement/targetedManagedAppConfigurations/{id}/assignments",
            name_fallback="App configuration policy",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

    @staticmethod
    def _collect_intune_script_impact(group_id: str, token: str, base_url: str) -> Dict:
        script_domain = GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_scripts",
            label="Platform Scripts",
            list_endpoint="/deviceManagement/deviceManagementScripts",
            list_select="id,displayName,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/deviceManagementScripts/{id}/assignments",
            name_fallback="Platform script",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

        remediation_domain = GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_proactive_remediations",
            label="Proactive Remediation Scripts",
            list_endpoint="/deviceManagement/deviceHealthScripts",
            list_select="id,displayName,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/deviceHealthScripts/{id}/assignments",
            name_fallback="Proactive remediation script",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

        if script_domain.get("status") == "ok" and remediation_domain.get("status") == "ok":
            return {
                "key": "intune_scripts_bundle",
                "label": "Scripts and Remediations",
                "status": "ok",
                "count": script_domain.get("count", 0) + remediation_domain.get("count", 0),
                "findings": script_domain.get("findings", []) + remediation_domain.get("findings", []),
            }

        details = script_domain.get("details") or remediation_domain.get("details") or ""
        status = "ok"
        if script_domain.get("status") != "ok" and remediation_domain.get("status") != "ok":
            status = script_domain.get("status") if script_domain.get("status") == remediation_domain.get("status") else "error"
        elif script_domain.get("status") != "ok" or remediation_domain.get("status") != "ok":
            status = "error"

        return {
            "key": "intune_scripts_bundle",
            "label": "Scripts and Remediations",
            "status": status,
            "count": script_domain.get("count", 0) + remediation_domain.get("count", 0),
            "findings": script_domain.get("findings", []) + remediation_domain.get("findings", []),
            "details": details,
        }

    @staticmethod
    def _collect_autopilot_enrollment_impact(group_id: str, token: str, base_url: str) -> Dict:
        autopilot_domain = GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_autopilot_profiles",
            label="Autopilot Deployment Profiles",
            list_endpoint="/deviceManagement/windowsAutopilotDeploymentProfiles",
            list_select="id,displayName,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/windowsAutopilotDeploymentProfiles/{id}/assignments",
            name_fallback="Autopilot deployment profile",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

        esp_domain = GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="intune_enrollment_status_page",
            label="Enrollment Status Page Profiles",
            list_endpoint="/deviceManagement/deviceEnrollmentConfigurations",
            list_select="id,displayName,description,priority,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/deviceEnrollmentConfigurations/{id}/assignments",
            name_fallback="Enrollment status page profile",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

        if autopilot_domain.get("status") == "ok" and esp_domain.get("status") == "ok":
            return {
                "key": "intune_enrollment_bundle",
                "label": "Autopilot and Enrollment Profiles",
                "status": "ok",
                "count": autopilot_domain.get("count", 0) + esp_domain.get("count", 0),
                "findings": autopilot_domain.get("findings", []) + esp_domain.get("findings", []),
            }

        details = autopilot_domain.get("details") or esp_domain.get("details") or ""
        status = "ok"
        if autopilot_domain.get("status") != "ok" and esp_domain.get("status") != "ok":
            status = autopilot_domain.get("status") if autopilot_domain.get("status") == esp_domain.get("status") else "error"
        elif autopilot_domain.get("status") != "ok" or esp_domain.get("status") != "ok":
            status = "error"

        return {
            "key": "intune_enrollment_bundle",
            "label": "Autopilot and Enrollment Profiles",
            "status": status,
            "count": autopilot_domain.get("count", 0) + esp_domain.get("count", 0),
            "findings": autopilot_domain.get("findings", []) + esp_domain.get("findings", []),
            "details": details,
        }

    @staticmethod
    def _collect_cloud_pc_impact(group_id: str, token: str, base_url: str) -> Dict:
        provisioning_domain = GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="cloud_pc_provisioning",
            label="Windows 365 Cloud PC Provisioning Policies",
            list_endpoint="/deviceManagement/virtualEndpoint/provisioningPolicies",
            list_select="id,displayName,description,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/virtualEndpoint/provisioningPolicies/{id}/assignments",
            name_fallback="Cloud PC provisioning policy",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

        user_settings_domain = GroupImpactEngine._collect_assignment_domain_impact(
            group_id,
            token,
            key="cloud_pc_user_settings",
            label="Windows 365 Cloud PC User Settings",
            list_endpoint="/deviceManagement/virtualEndpoint/userSettings",
            list_select="id,displayName,lastModifiedDateTime",
            assignment_endpoint_template="/deviceManagement/virtualEndpoint/userSettings/{id}/assignments",
            name_fallback="Cloud PC user setting",
            base_url=base_url,
            max_items=GroupImpactEngine.MAX_INTUNE_POLICIES,
            max_assignments=GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
        )

        if provisioning_domain.get("status") == "ok" and user_settings_domain.get("status") == "ok":
            return {
                "key": "cloud_pc_bundle",
                "label": "Windows 365 Cloud PC",
                "status": "ok",
                "count": provisioning_domain.get("count", 0) + user_settings_domain.get("count", 0),
                "findings": provisioning_domain.get("findings", []) + user_settings_domain.get("findings", []),
            }

        details = provisioning_domain.get("details") or user_settings_domain.get("details") or ""
        status = "ok"
        if provisioning_domain.get("status") != "ok" and user_settings_domain.get("status") != "ok":
            status = provisioning_domain.get("status") if provisioning_domain.get("status") == user_settings_domain.get("status") else "error"
        elif provisioning_domain.get("status") != "ok" or user_settings_domain.get("status") != "ok":
            status = "error"

        return {
            "key": "cloud_pc_bundle",
            "label": "Windows 365 Cloud PC",
            "status": status,
            "count": provisioning_domain.get("count", 0) + user_settings_domain.get("count", 0),
            "findings": provisioning_domain.get("findings", []) + user_settings_domain.get("findings", []),
            "details": details,
        }

    @staticmethod
    def _collect_intune_policy_domains(group_id: str, token: str) -> List[Dict]:
        collectors = [
            GroupImpactEngine._collect_intune_device_configuration_impact,
            GroupImpactEngine._collect_intune_settings_catalog_impact,
            GroupImpactEngine._collect_intune_admin_template_impact,
            GroupImpactEngine._collect_intune_compliance_impact,
            GroupImpactEngine._collect_intune_app_protection_impact,
            GroupImpactEngine._collect_intune_app_configuration_impact,
            GroupImpactEngine._collect_intune_script_impact,
            GroupImpactEngine._collect_autopilot_enrollment_impact,
            GroupImpactEngine._collect_cloud_pc_impact,
        ]

        domains = [collector(group_id, token, "https://graph.microsoft.com/v1.0") for collector in collectors]

        # Fallback to beta when v1.0 has no matches and no read errors for the domain.
        for idx, domain in enumerate(domains):
            if domain.get("status") != "ok" or domain.get("count", 0) > 0:
                continue
            beta_domain = collectors[idx](group_id, token, "https://graph.microsoft.com/beta")
            if beta_domain.get("status") == "ok" and beta_domain.get("count", 0) > 0:
                domains[idx] = beta_domain

        return domains

    @staticmethod
    def _collect_iam_impact(group_id: str, token: str) -> Dict:
        ok, err = GroupImpactEngine._probe(
            "/roleManagement/directory/roleAssignments?$top=1",
            token,
        )
        if not ok:
            return {
                "key": "iam_roles",
                "label": "Directory Role Assignments",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read directory role assignments."),
            }

        assignments = GraphService.get_all(
            f"/roleManagement/directory/roleAssignments?$filter=principalId eq '{group_id}'&$select=id,roleDefinitionId,directoryScopeId,appScopeId&$top=200",
            token,
            max_items=200,
        )

        role_defs = {}

        def get_role_name(role_definition_id: str) -> str:
            if role_definition_id in role_defs:
                return role_defs[role_definition_id]
            role_def = GraphService.get(
                f"/roleManagement/directory/roleDefinitions/{role_definition_id}?$select=id,displayName,description,isBuiltIn",
                token,
            )
            name = role_def.get("displayName", "Directory Role") if role_def and "error" not in role_def else "Directory Role"
            role_defs[role_definition_id] = name
            return name

        findings = []
        for assignment in assignments:
            role_definition_id = assignment.get("roleDefinitionId", "")
            findings.append(
                {
                    "id": assignment.get("id", ""),
                    "name": get_role_name(role_definition_id) if role_definition_id else "Directory Role",
                    "impact": "role_assignment",
                    "severity": "blocker",
                    "directoryScopeId": assignment.get("directoryScopeId", ""),
                    "appScopeId": assignment.get("appScopeId", ""),
                }
            )

        return {
            "key": "iam_roles",
            "label": "Directory Role Assignments",
            "status": "ok",
            "count": len(findings),
            "findings": findings,
        }

    @staticmethod
    def _collect_pim_impact(group_id: str, token: str) -> Dict:
        ok_schedule, err_schedule = GroupImpactEngine._probe(
            "/roleManagement/directory/roleEligibilitySchedules?$top=1",
            token,
        )
        ok_instance, err_instance = GroupImpactEngine._probe(
            "/roleManagement/directory/roleAssignmentScheduleInstances?$top=1",
            token,
        )

        if not ok_schedule and not ok_instance:
            err = err_schedule or err_instance or {}
            return {
                "key": "pim_roles",
                "label": "PIM Role Eligibility",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read PIM role schedules."),
            }

        role_defs = {}

        def get_role_name(role_definition_id: str) -> str:
            if role_definition_id in role_defs:
                return role_defs[role_definition_id]
            role_def = GraphService.get(
                f"/roleManagement/directory/roleDefinitions/{role_definition_id}?$select=id,displayName,description,isBuiltIn",
                token,
            )
            name = role_def.get("displayName", "Directory Role") if role_def and "error" not in role_def else "Directory Role"
            role_defs[role_definition_id] = name
            return name

        findings = []

        eligibilities = GraphService.get_all(
            f"/roleManagement/directory/roleEligibilitySchedules?$filter=principalId eq '{group_id}'&$select=id,roleDefinitionId,directoryScopeId,memberType,status&$top=200",
            token,
            max_items=200,
        )
        for item in eligibilities:
            role_definition_id = item.get("roleDefinitionId", "")
            findings.append(
                {
                    "id": item.get("id", ""),
                    "name": get_role_name(role_definition_id) if role_definition_id else "Directory Role",
                    "impact": "eligible_role_assignment",
                    "severity": "warning",
                    "directoryScopeId": item.get("directoryScopeId", ""),
                    "statusText": item.get("status", ""),
                }
            )

        active_instances = GraphService.get_all(
            f"/roleManagement/directory/roleAssignmentScheduleInstances?$filter=principalId eq '{group_id}'&$select=id,roleDefinitionId,directoryScopeId,assignmentType,endDateTime&$top=200",
            token,
            max_items=200,
        )
        for item in active_instances:
            role_definition_id = item.get("roleDefinitionId", "")
            findings.append(
                {
                    "id": item.get("id", ""),
                    "name": get_role_name(role_definition_id) if role_definition_id else "Directory Role",
                    "impact": "active_pim_assignment",
                    "severity": "blocker",
                    "directoryScopeId": item.get("directoryScopeId", ""),
                    "assignmentType": item.get("assignmentType", ""),
                }
            )

        return {
            "key": "pim_roles",
            "label": "PIM Role Eligibility",
            "status": "ok",
            "count": len(findings),
            "findings": findings,
        }

    @staticmethod
    def _collect_administrative_unit_impact(group_id: str, token: str) -> Dict:
        ok, err = GroupImpactEngine._probe(
            "/directory/administrativeUnits?$select=id&$top=1",
            token,
        )
        if not ok:
            return {
                "key": "administrative_units",
                "label": "Administrative Units",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read administrative units."),
            }

        units = GraphService.get_all(
            "/directory/administrativeUnits?$select=id,displayName,description&$top=100",
            token,
            max_items=300,
        )

        findings = []

        def check_unit(unit: Dict):
            members = GraphService.get_all(
                f"/directory/administrativeUnits/{unit['id']}/members?$select=id&$top=100",
                token,
                max_items=500,
            )
            if any(member.get("id") == group_id for member in members):
                return {
                    "id": unit.get("id", ""),
                    "name": unit.get("displayName", "Administrative Unit"),
                    "impact": "administrative_unit_member",
                    "severity": "warning",
                }
            return None

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(check_unit, unit) for unit in units if unit.get("id")]
            for future in as_completed(futures):
                try:
                    hit = future.result()
                    if hit:
                        findings.append(hit)
                except Exception:
                    pass

        return {
            "key": "administrative_units",
            "label": "Administrative Units",
            "status": "ok",
            "count": len(findings),
            "findings": findings,
        }

    @staticmethod
    def _collect_group_nesting_impact(group_id: str, token: str) -> Dict:
        ok_parents, err_parents = GroupImpactEngine._probe(
            f"/groups/{group_id}/transitiveMemberOf?$select=id&$top=1",
            token,
        )
        ok_children, err_children = GroupImpactEngine._probe(
            f"/groups/{group_id}/transitiveMembers?$select=id&$top=1",
            token,
        )

        if not ok_parents and not ok_children:
            err = err_parents or err_children or {}
            return {
                "key": "group_nesting",
                "label": "Group Nesting",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read nested group relationships."),
            }

        findings = []

        parent_objects = GraphService.get_all(
            f"/groups/{group_id}/transitiveMemberOf?$select=id,displayName,groupTypes,securityEnabled,mailEnabled&$top=100",
            token,
            max_items=300,
        )
        for parent in parent_objects:
            odata_type = parent.get("@odata.type", "")
            if "#microsoft.graph.group" not in odata_type and "groupTypes" not in parent and "securityEnabled" not in parent:
                continue
            findings.append(
                {
                    "id": parent.get("id", ""),
                    "name": parent.get("displayName", "Group"),
                    "impact": "member_of_group",
                    "severity": "blocker",
                }
            )

        child_objects = GraphService.get_all(
            f"/groups/{group_id}/transitiveMembers?$select=id,displayName,groupTypes,securityEnabled,mailEnabled&$top=100",
            token,
            max_items=300,
        )
        for child in child_objects:
            odata_type = child.get("@odata.type", "")
            if "#microsoft.graph.group" not in odata_type and "groupTypes" not in child and "securityEnabled" not in child:
                continue
            findings.append(
                {
                    "id": child.get("id", ""),
                    "name": child.get("displayName", "Group"),
                    "impact": "contains_group",
                    "severity": "warning",
                }
            )

        return {
            "key": "group_nesting",
            "label": "Group Nesting",
            "status": "ok",
            "count": len(findings),
            "findings": findings,
        }

    @staticmethod
    def _collect_group_licensing_impact(group_id: str, token: str) -> Dict:
        group = GraphService.get(
            f"/groups/{group_id}?$select=id,displayName,assignedLicenses",
            token,
        )
        if not group or "error" in group:
            err = group if group and "error" in group else {}
            return {
                "key": "group_licensing",
                "label": "Group-based Licensing",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read group licensing."),
            }

        assigned = group.get("assignedLicenses", []) or []
        if not assigned:
            return {
                "key": "group_licensing",
                "label": "Group-based Licensing",
                "status": "ok",
                "count": 0,
                "findings": [],
            }

        sku_probe_ok, sku_probe_err = GroupImpactEngine._probe(
            "/subscribedSkus?$select=skuId&$top=1",
            token,
        )

        sku_map = {}
        sku_data = GraphService.get_all(
            "/subscribedSkus?$select=skuId,skuPartNumber&$top=200",
            token,
            max_items=300,
        )
        for sku in sku_data:
            sku_id = str(sku.get("skuId", "")).lower()
            if sku_id:
                sku_map[sku_id] = sku.get("skuPartNumber", sku_id)

        findings = []
        for lic in assigned:
            sku_id = str(lic.get("skuId", ""))
            sku_name = sku_map.get(sku_id.lower(), sku_id or "License SKU")
            findings.append(
                {
                    "id": sku_id,
                    "name": sku_name,
                    "impact": "group_license_assignment",
                    "severity": "blocker",
                }
            )

        return {
            "key": "group_licensing",
            "label": "Group-based Licensing",
            "status": "ok" if sku_probe_ok else ("no_permission" if GroupImpactEngine._is_permission_error(sku_probe_err) else "error"),
            "count": len(findings),
            "findings": findings,
            "details": "" if sku_probe_ok else (sku_probe_err or {}).get("message", "Unable to resolve SKU names."),
        }

    @staticmethod
    def _collect_entitlement_management_impact(group_id: str, token: str) -> Dict:
        ok, err = GroupImpactEngine._probe(
            "/identityGovernance/entitlementManagement/assignmentPolicies?$select=id&$top=1",
            token,
        )
        if not ok:
            return {
                "key": "entitlement_management",
                "label": "Entitlement Management",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read Entitlement Management policies."),
            }

        policies = GraphService.get_all(
            "/identityGovernance/entitlementManagement/assignmentPolicies?$select=id,displayName,description,requestorSettings&$top=100",
            token,
            max_items=400,
        )

        findings = []
        for policy in policies:
            if GroupImpactEngine._contains_value(policy, group_id):
                findings.append(
                    {
                        "id": policy.get("id", ""),
                        "name": policy.get("displayName", "Access package policy"),
                        "impact": "entitlement_policy_scope",
                        "severity": "warning",
                    }
                )

        return {
            "key": "entitlement_management",
            "label": "Entitlement Management",
            "status": "ok",
            "count": len(findings),
            "findings": findings,
        }

    @staticmethod
    def _collect_m365_workload_impact(group_id: str, token: str) -> Dict:
        group = GraphService.get(
            f"/groups/{group_id}?$select=id,displayName,groupTypes,mailEnabled,resourceProvisioningOptions",
            token,
        )
        if not group or "error" in group:
            err = group if group and "error" in group else {}
            return {
                "key": "m365_workloads",
                "label": "M365 Workloads",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read M365 workload footprint."),
            }

        findings = []
        access_issues = []
        group_types = group.get("groupTypes", []) or []
        if "Unified" in group_types:
            findings.append(
                {
                    "id": group_id,
                    "name": group.get("displayName", "Microsoft 365 Group"),
                    "impact": "m365_workspace_backing_group",
                    "severity": "blocker",
                }
            )

        team = GraphService.get(f"/groups/{group_id}/team?$select=id,isArchived,webUrl", token)
        if team and "error" not in team:
            channel_count = len(
                GraphService.get_all(
                    f"/teams/{group_id}/channels?$select=id,displayName&$top=100",
                    token,
                    max_items=GroupImpactEngine.MAX_TEAMS_CHANNELS,
                )
            )
            findings.append(
                {
                    "id": team.get("id", ""),
                    "name": f"Microsoft Teams team ({channel_count} channels)",
                    "impact": "teams_backed_group",
                    "severity": "warning",
                }
            )
        elif team and "error" in team and team.get("error") != 404:
            access_issues.append(team)

        site = GraphService.get(f"/groups/{group_id}/sites/root?$select=id,webUrl,displayName", token)
        if site and "error" not in site:
            drives_count = len(
                GraphService.get_all(
                    f"/sites/{site.get('id', '')}/drives?$select=id,name&$top=100",
                    token,
                    max_items=GroupImpactEngine.MAX_SITE_DRIVES,
                )
            ) if site.get("id") else 0
            findings.append(
                {
                    "id": site.get("id", ""),
                    "name": f"{site.get('displayName', 'SharePoint site')} ({drives_count} document libraries)",
                    "impact": "sharepoint_site_backing_group",
                    "severity": "warning",
                    "webUrl": site.get("webUrl", ""),
                }
            )
        elif site and "error" in site and site.get("error") != 404:
            access_issues.append(site)

        planner_probe_ok, planner_probe_err = GroupImpactEngine._probe(
            f"/groups/{group_id}/planner/plans?$select=id&$top=1",
            token,
        )
        if not planner_probe_ok and planner_probe_err and planner_probe_err.get("error") != 404:
            access_issues.append(planner_probe_err)

        plans = GraphService.get_all(
            f"/groups/{group_id}/planner/plans?$select=id,title&$top=50",
            token,
            max_items=GroupImpactEngine.MAX_PLANS,
        )
        for plan in plans:
            findings.append(
                {
                    "id": plan.get("id", ""),
                    "name": plan.get("title", "Planner plan"),
                    "impact": "planner_plan_backing_group",
                    "severity": "warning",
                }
            )

        status = "ok"
        details = ""
        if access_issues:
            first_issue = access_issues[0]
            status = "no_permission" if GroupImpactEngine._is_permission_error(first_issue) else "error"
            details = first_issue.get("message", "Some M365 workload endpoints could not be read.")

        return {
            "key": "m365_workloads",
            "label": "M365 Workloads",
            "status": status,
            "count": len(findings),
            "findings": findings,
            "details": details,
        }

    @staticmethod
    def _collect_exchange_workload_impact(group_id: str, token: str) -> Dict:
        group = GraphService.get(
            f"/groups/{group_id}?$select=id,displayName,mailEnabled,proxyAddresses",
            token,
        )
        if not group or "error" in group:
            err = group if group and "error" in group else {}
            return {
                "key": "exchange_workloads",
                "label": "Exchange Workloads",
                "status": "no_permission" if GroupImpactEngine._is_permission_error(err) else "error",
                "count": 0,
                "findings": [],
                "details": err.get("message", "Unable to read Exchange workload footprint."),
            }

        findings = []
        access_issues = []

        if group.get("mailEnabled"):
            findings.append(
                {
                    "id": group.get("id", ""),
                    "name": "Exchange group mailbox",
                    "impact": "exchange_group_mailbox",
                    "severity": "warning",
                }
            )

        conversations = GraphService.get_all(
            f"/groups/{group_id}/conversations?$select=id,topic&$top=50",
            token,
            max_items=200,
        )
        if conversations:
            findings.append(
                {
                    "id": group.get("id", ""),
                    "name": f"Exchange conversations ({len(conversations)})",
                    "impact": "exchange_conversation_history",
                    "severity": "warning",
                }
            )
        else:
            conv_probe_ok, conv_probe_err = GroupImpactEngine._probe(
                f"/groups/{group_id}/conversations?$select=id&$top=1",
                token,
            )
            if not conv_probe_ok and conv_probe_err and conv_probe_err.get("error") != 404:
                access_issues.append(conv_probe_err)

        events = GraphService.get_all(
            f"/groups/{group_id}/events?$select=id,subject&$top=50",
            token,
            max_items=200,
        )
        if events:
            findings.append(
                {
                    "id": group.get("id", ""),
                    "name": f"Group calendar events ({len(events)})",
                    "impact": "exchange_group_calendar",
                    "severity": "warning",
                }
            )
        else:
            evt_probe_ok, evt_probe_err = GroupImpactEngine._probe(
                f"/groups/{group_id}/events?$select=id&$top=1",
                token,
            )
            if not evt_probe_ok and evt_probe_err and evt_probe_err.get("error") != 404:
                access_issues.append(evt_probe_err)

        status = "ok"
        details = ""
        if access_issues:
            first_issue = access_issues[0]
            status = "no_permission" if GroupImpactEngine._is_permission_error(first_issue) else "error"
            details = first_issue.get("message", "Some Exchange workload endpoints could not be read.")

        return {
            "key": "exchange_workloads",
            "label": "Exchange Workloads",
            "status": status,
            "count": len(findings),
            "findings": findings,
            "details": details,
        }

    @staticmethod
    def build(group_id: str, token: str) -> Tuple[Dict, Dict]:
        """
        Build impact report for a group.
        Returns: (result, error_dict_or_none)
        """
        group = GraphService.get(
            f"/groups/{group_id}?$select=id,displayName,description,groupTypes,securityEnabled,mailEnabled",
            token,
        )
        if not group or "error" in group:
            return None, {"error": "Group not found", "status": 404}

        domains = [
            GroupImpactEngine._collect_ca_impact(group_id, token),
            GroupImpactEngine._collect_enterprise_app_impact(group_id, token),
            GroupImpactEngine._collect_iam_impact(group_id, token),
            GroupImpactEngine._collect_pim_impact(group_id, token),
            GroupImpactEngine._collect_administrative_unit_impact(group_id, token),
            GroupImpactEngine._collect_group_nesting_impact(group_id, token),
            GroupImpactEngine._collect_group_licensing_impact(group_id, token),
            GroupImpactEngine._collect_entitlement_management_impact(group_id, token),
            GroupImpactEngine._collect_m365_workload_impact(group_id, token),
            GroupImpactEngine._collect_exchange_workload_impact(group_id, token),
        ]

        intune_impact = GroupImpactEngine._collect_intune_impact_from_base(group_id, token, "https://graph.microsoft.com/v1.0")
        if intune_impact.get("status") == "ok" and intune_impact.get("count", 0) == 0:
            beta_intune = GroupImpactEngine._collect_intune_impact_from_base(group_id, token, "https://graph.microsoft.com/beta")
            if beta_intune.get("status") == "ok" and beta_intune.get("count", 0) > 0:
                intune_impact = beta_intune
        domains.insert(1, intune_impact)
        domains[2:2] = GroupImpactEngine._collect_intune_policy_domains(group_id, token)

        findings = [f for domain in domains for f in domain.get("findings", [])]
        blockers = sum(1 for f in findings if f.get("severity") == "blocker")
        warnings = sum(1 for f in findings if f.get("severity") == "warning")
        domains_with_hits = sum(1 for d in domains if d.get("count", 0) > 0)
        partial_domains = sum(1 for d in domains if d.get("status") != "ok")
        ok_domains = sum(1 for d in domains if d.get("status") == "ok")
        coverage_score = int(round((ok_domains / len(domains)) * 100)) if domains else 0
        risk_summary = GroupImpactEngine._get_risk_summary(blockers, warnings, partial_domains)

        domain_modes = {
            "conditional_access": "enumerated",
            "intune_apps": "enumerated",
            "intune_device_configurations": "enumerated",
            "intune_settings_catalog": "enumerated",
            "intune_admin_templates": "enumerated",
            "intune_compliance": "enumerated",
            "intune_app_protection": "enumerated",
            "intune_app_configuration": "enumerated",
            "intune_scripts_bundle": "enumerated",
            "intune_enrollment_bundle": "enumerated",
            "cloud_pc_bundle": "enumerated",
            "enterprise_apps": "enumerated",
            "iam_roles": "enumerated",
            "pim_roles": "enumerated",
            "administrative_units": "enumerated",
            "group_nesting": "enumerated",
            "group_licensing": "enumerated",
            "entitlement_management": "enumerated",
            "m365_workloads": "enumerated",
            "exchange_workloads": "enumerated",
        }

        constrained_domains = [
            {
                "key": d.get("key", ""),
                "label": d.get("label", ""),
                "status": d.get("status", ""),
                "reason": d.get("details", "") or "Limited by permissions, role visibility, or API constraints.",
            }
            for d in domains
            if d.get("status") != "ok"
        ]

        result = {
            "group": GroupImpactEngine._clean(group),
            "summary": {
                "blockers": blockers,
                "warnings": warnings,
                "domainsChecked": len(domains),
                "domainsWithHits": domains_with_hits,
                "partialDomains": partial_domains,
                "coverageScore": coverage_score,
                "confidence": "high" if coverage_score >= 90 else "medium" if coverage_score >= 70 else "low",
                "completeness": {
                    "domainsTotal": len(domains),
                    "domainsOk": ok_domains,
                    "domainsConstrained": partial_domains,
                    "domainModes": domain_modes,
                    "constrainedDomains": constrained_domains,
                    "scanLimits": {
                        "maxConditionalAccessPolicies": GroupImpactEngine.MAX_CA_ITEMS,
                        "maxIntuneApps": GroupImpactEngine.MAX_INTUNE_APPS,
                        "maxIntunePolicies": GroupImpactEngine.MAX_INTUNE_POLICIES,
                        "maxIntuneAssignments": GroupImpactEngine.MAX_INTUNE_ASSIGNMENTS,
                        "maxAssignmentsPerApp": GroupImpactEngine.MAX_ASSIGNMENTS_PER_APP,
                        "maxTeamChannels": GroupImpactEngine.MAX_TEAMS_CHANNELS,
                        "maxSiteDrives": GroupImpactEngine.MAX_SITE_DRIVES,
                        "maxPlannerPlans": GroupImpactEngine.MAX_PLANS,
                    },
                },
                **risk_summary,
                "checkedAt": datetime.now(timezone.utc).isoformat(),
            },
            "domains": domains,
        }
        return result, None

    def init(self, app):
        pass

    def health_check(self) -> bool:
        return True
