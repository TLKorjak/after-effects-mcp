# AE ↔ Claude Code MCP Bridge

## Context

Right now, every AE interaction in Claude Code goes through the `after-effects` skill: generate a one-off `.jsx` script → run it via `osascript`/`DoScriptFile` → poll a result JSON file in `/tmp`. It works, but it's slow (a fresh AE script execution per call), and every "understand this comp/layer/effect" question requires writing a bespoke diagnostic script from scratch — there's no reusable, general-purpose tool surface.

The user wants a live, persistent bridge between Claude Code and After Effects instead — the same chat experience they already have (in Claude Code, not an embedded panel — confirmed via AskUserQuestion), but with instant, general-purpose execution instead of the current file-based round-trip.

Research (via two parallel Explore agents) compared the two viable open-source starting points:

| | Dakkshin/after-effects-mcp | mikechambers/adb-mcp |
|---|---|---|
| Transport | File-polling (~250ms), plain ScriptUI panel | True WebSocket, CEP panel |
| AE tool coverage | Rich: comps, layers, keyframes, **expressions**, effects, masks, cameras/nulls | Proof-of-concept: **one** generic `execute_extend_script` tool only |
| Setup friction | None (no CEP signing/trust needed) | Requires unsigned-CEP-extension debug-mode trust |
| Maintenance | Active, explicit AE 2026 support (PR #20) | Active, but AE support is the least-developed part of a multi-app project |
| License | MIT | MIT |

**Decision: fork Dakkshin/after-effects-mcp.** Its tool surface already covers most of what we do manually today (especially `setLayerExpression`, which is the single most common operation across our whole AE workflow this session). The polling latency (~250ms) is still far faster than the current osascript-per-call approach. adb-mcp's only real advantage (true push sockets) isn't worth rebuilding an entire AE tool surface from a single generic `execute_extend_script` primitive.

**Decision: separate repo, not nested in `adobe-dev`.** This is general-purpose tooling (its own npm package, build step, globally-installed AE panel) being forked from someone else's open-source project — it belongs in its own repo with proper upstream tracking, not inside the studio's project-asset workspace.

## Plan

### 1. Fork and clone — ✅ done
- Forked `Dakkshin/after-effects-mcp` to `https://github.com/TLKorjak/after-effects-mcp`.
- Cloned locally to `~/Documents/Github/after-effects-mcp` (sibling to `adobe-dev`, matching the existing `~/Documents/Github/tc-markers` pattern already in this user's workspace).
- `origin` → the fork, `upstream` → `Dakkshin/after-effects-mcp`, both configured automatically by `gh repo fork --clone`.

### 2. Build and install as-is first (validate the base works)
- `npm install` → `npm run build` → `npm run install-bridge` (copies the compiled `.jsx` panel into `/Applications/Adobe After Effects 2026/Scripts/ScriptUI Panels/`).
- One-time manual AE setting (documented in the project's PR #20, not scriptable): **After Effects → Settings → Scripting & Expressions → "Allow Scripts to Write Files and Access Network"**, then restart AE.
- Open the panel in AE via **Window → mcp-bridge-auto.jsx**, enable "Auto-run commands".
- Register the built MCP server with Claude Code: `claude mcp add ae-bridge -- node <path-to-repo>/build/index.js` (same registration pattern as the other MCP servers already visible in this environment, e.g. the various `claude.ai X` connectors).
- Verify end-to-end with a trivial existing tool (e.g. `listCompositions` or `getLayerInfo`) against a real open AE project, confirming round-trip latency and correctness before touching any code.

### 3. Extend the tool set for identified gaps
Based on this session's actual recurring needs, add new MCP tools (as new `src/scripts/*.jsx` action scripts + corresponding entries in `src/index.ts`, following the existing pattern of e.g. `getLayerInfo.jsx`/`setLayerExpression.jsx`):
- **Essential Graphics panel access** (confirmed gap — not in the base repo): list/get/set EGP master properties on a comp, matching what the `after-effects` skill's `rules/` docs already cover for scripting the EGP.
- **Expression error querying**: a tool that surfaces `property.expressionError` for a given property/layer/comp scope, mirroring the existing skill's `expression-errors.jsx` query script (`~/.agents/skills/after-effects/scripts/expression-errors.jsx`) — reuse that script's logic rather than reinventing it.
- Any other gaps that surface once real usage starts (project-overview-style comp/folder summaries, font inventory, etc. — the existing skill's `scripts/*.jsx` files are a ready-made reference for porting logic over, since they already encode the ES3/utils.jsx conventions this project also needs).

### 4. Retire (or keep as fallback) the old `after-effects` skill workflow
Once the MCP bridge is confirmed working end-to-end for the core operations (query comp/layer/effect state, apply/edit expressions), stop using the osascript-based skill as the primary path. Keep it documented as a fallback for anything the MCP tool set doesn't cover yet (e.g. truly one-off diagnostic scripts), rather than deleting it outright.

### 5. Update `adobe-dev/CLAUDE.md`
Add a short pointer note (a few lines, not a full section) mentioning the MCP bridge exists, where its repo lives, and that it supersedes the manual `osascript` flow for routine AE queries/edits — so future sessions in this repo know about it without re-discovering it from scratch.

## Verification
- End-to-end test: with a real AE project open, run a query tool (comp/layer listing) and an action tool (apply a test expression to a property) through the MCP bridge from Claude Code, confirming both read and write paths work and results come back correctly formatted.
- Confirm the new Essential Graphics and expression-error tools work against a real EGP-enabled comp and a property with a deliberately broken expression, respectively.
- Confirm Claude Code's MCP server list (`claude mcp list` or `/mcp`) shows the new server connected and its tools are visible/callable.
