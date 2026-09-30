# Group Change Planner · 0.6.0

EntraMap captures read-only evidence for a group replacement or retirement review. It compares references and assignment settings, then lets you verify the source group again after changes made with your normal admin tools. It never changes directory objects or approves deletion.

## Try the community labs

Open **Change Planner** from the relationship map, or visit `/planner`. No tenant or sign-in is required for the synthetic labs.

1. **Application replacement:** the source and replacement reference the same enterprise application, but their app roles differ. Expect **changed**, not equivalent.
2. **CA exception review:** the same Conditional Access policy includes one group and excludes the other. Expect **changed**. Matching collected references would still not establish the policy's effective result for a sign-in.
3. **Intune targeting:** an assignment's intent changes from required to available. Expect **changed**. The comparison also includes assignment filters and settings.

In any lab, select **Demo: verify removal**. The later synthetic scan no longer contains the reference: expect **removed**. Select **Demo: lost visibility** instead: expect **unknown**, with a coverage warning. A permission failure is never proof that a dependency disappeared.

Expand each finding to inspect baseline and comparison evidence. Try **Unknown / incomplete** and **Needs attention** filters, then export both dossier formats.

## Plan a replacement with live evidence

1. Sign in on the configured public domain. The Azure hosting alias redirects entry pages and sign-in to the callback domain to preserve the session cookie.
2. Find the source group or enter its object ID. Select **Capture baseline**, then **Save baseline**.
3. Find a different proposed replacement group. Select **Scan replacement**.
4. Choose **Compare replacement assignments**, then **Compare evidence**.
5. Review changed, missing, additional and unknown references, direct member differences, and every collection limitation. Inspect the raw settings rather than relying on counts alone.
6. Export the dossier for review. Carry out any approved changes separately in the appropriate Microsoft administration tools.

**Equivalent** means the collected assignment settings match. It does not prove effective access. Enterprise application group assignments do not extend to nested groups. Conditional Access evaluation depends on the user, application, device, location, conditions and other policies. Intune applicability depends on its workload-specific targeting rules.

Microsoft 365 content, PIM, governance and nested-group dependencies need manual review. Replacing a Microsoft 365 group does not move its mailbox, Teams, SharePoint or Planner content. Dynamic and synchronized group membership must be reviewed at its source.

## Verify the source again

Keep or import the original baseline, then select **Re-scan source**. This requests fresh Graph data, bypassing the five-minute cache. Compare in **Verify changes to the source group** mode. Verification requires a later scan of the same group; the same snapshot cannot verify itself.

**Removed** only describes a reference absent from the later scan when both domain collections succeeded. It is not a successful migration or deletion decision. A partially read domain produces **unknown**, even when its later finding list is empty. The report lists incomplete domains even if neither scan returned a finding.

## Snapshot and export handling

- Snapshots live in page memory. Refreshing or leaving clears the workspace. Save them explicitly to retain them.
- Original snapshots contain tenant identifiers, group information, direct member IDs and assignment evidence. Store them appropriately for your organization.
- Snapshots are signed by this deployment, bound to their tenant and account, and accepted for comparison for 24 hours. Modified, expired, cross-account and cross-tenant snapshots are rejected. Keep `FLASK_SECRET_KEY` stable across workers and restarts; rotating it invalidates existing signatures.
- The JSON dossier contains the exact signed snapshots used for comparison and the calculated report. The HTML dossier presents the evidence for review. An exported dossier is not a snapshot import file.
- **Pseudonymize exports** omits original snapshots, raw evidence, names, object IDs and endpoints. It retains domain/status counts, generic notes, anonymous resource labels and membership counts. It cannot be imported to continue verification.
- Scans have collection limits, including 10,000 direct members. A reached limit or failed later page is a coverage issue, never a silent complete result. Large tenants may take several minutes.
- Separate scans are observations over time, not an atomic directory transaction. Changes and Graph propagation delays during collection can affect the observed result.

## Development validation

```sh
pip install -r requirements.txt
python -m unittest discover -s tests -v
npm ci --prefix tests/frontend --ignore-scripts
npm test --prefix tests/frontend
```

The Python suite covers comparison semantics, signatures, isolation, collection failures, pagination, freshness and routes. The DOM suite covers rendering, escaped evidence, state invalidation, failed captures and downloads. These fixtures do not replace authenticated tenant and browser testing. The pull-request pipeline runs both suites and the existing HTTP smoke check; deployment follows validation on `main`.
