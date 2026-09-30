# Maintaining the public handbook

`docs/guide.json` is the content source for `/docs`. `services/docs_routes.py`
loads it at process startup; restart the local server after content changes.
The Jinja template escapes all content. Search does not inject HTML.

When adding a UI control, add its exact label, behavior, prerequisites and a
source selector to the relevant chapter. Keep its `key` stable: links to
`#control-<key>` may already be shared. Repeated dynamic controls such as
permission rows and finding disclosures have one reference entry plus their
variant/domain table. Hidden structural elements are not user controls.

Screenshots in `static/docs` are unmodified browser captures from the synthetic
tutorials or public planner labs, taken for 0.6.0. Never publish live tenant
screenshots. Capture a normal viewport after animations/toasts settle; scroll
the relevant pane into view. Preserve the actual media format, enter its native
dimensions, and give it useful alt text and a caption. The demo comparison is
simplified; its caption explains the extra controls available in a live scan.

Run `python -m unittest discover -s tests -v` and
`npm test --prefix tests/frontend`. Coverage checks fail for undocumented button
IDs, missing variants, mismatched permissions/domains, broken anchors/assets or
incorrect image metadata. Also test desktop/mobile search, empty results,
indexed links to filtered chapters, image links and print behavior in a browser.
Review explanatory text against the actual source; selector coverage alone does
not establish semantic accuracy.
