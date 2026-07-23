---
'@rilaykit/agent': patch
---

Fix `show_form`/`show_flow` HITL forms silently never rendering (#23). The tool's `schema` argument was declared `z.unknown()`, projecting to an unconstrained `{}` (no `type`), so models serialized the nested FormSchema/FlowSchema as stringified JSON and the built-in renderer threw instead of mounting the form. Three layers: (1) an honest permissive `z.looseObject` shape so the emitted JSON Schema is object-typed on both adapters (models emit a nested object); (2) `coerceEmittedSchema` — defense-in-depth that parses a residually-stringified emission before compiling; (3) `SettledToolResult` — settled forms now render an explicit read-only summary instead of leaking the humanized tool name.
