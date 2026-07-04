# Issue Tracker

Ask the user which issue tracker to use each time an engineering workflow needs one. Do not persist a tracker choice between workflows.

When the user chooses local Markdown:

- Store work under `.scratch/<feature-slug>/`.
- Store a PRD as `.scratch/<feature-slug>/PRD.md`.
- Store issues as `.scratch/<feature-slug>/issues/<NN>-<slug>.md`.
- Record triage state in a `Status:` line.
- Append discussion under `## Comments`.

The cash-drawer diagnosis initiated on 2026-07-01 uses local Markdown for that workflow only.
