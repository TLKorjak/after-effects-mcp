# The after-effects skill's tools in the MCP (branch `skill-tools-in-mcp`, 2026-11-16)

Until now, After Effects work from Claude Code went through two separate routes:

- **the `after-effects` skill**: Claude writes a `.jsx` file and runs it through `osascript` (`runner.sh`). Any script is
  possible, and about 50 ready-made scripts come with it (project overview, comp detail, expression errors, font
  inventory, project audit, batch rename …);
- **this MCP**: named tools (`getEssentialGraphics`, `setLayerExpression` …) that the **MCP Bridge Auto** panel in AE
  runs.

This branch brings the skill's power into the MCP, and fixes what made the MCP awkward to use, so the MCP can be the
main route and the skill a fallback.

## Why: what a first trial showed

A read-only test against a real template (Games Render Template 07) worked, but showed these problems:

| Problem | What happened |
|---|---|
| Two steps per command | Every tool only *queued* its command ("use get-results after a few seconds"). The first `get-results` often said "waiting", or returned **the previous command's result**. |
| Comps by number only | `compIndex` is the item number in the whole project panel (folders and footage count), not the comp's place among comps. `listCompositions` didn't show it (only an internal `id`), so a guess of 21 hit a different comp. |
| No free scripts | `run-script` only runs a fixed list of predefined scripts. One-off jobs (e.g. measuring each logo shape in a shape layer) were impossible. |
| Noisy answers | `getLayerExpressions` returned ~100 empty Layer Styles / Geometry Options / Audio rows for one layer. |

## What changed

### Every tool returns its own result (`src/index.ts`, panel)
- Each command gets a unique **id** (`writeCommandFile` returns it). The panel copies it into the result as
  `_commandId`.
- `runBridge(command, args, timeout)` queues the command and waits for the result **with that id**. All tools use it,
  so a tool call returns the answer itself: no `get-results` step, and a stale result can't be mistaken for a new one.
- Commands are queued one after another (the command file has one slot, so two at once would overwrite each other).
- When nothing comes back in time, the reply says why, from the command's status: still `pending` = the panel didn't
  pick it up (is it open, Auto-run on, reloaded?); `running` = AE is still busy (a long script, a dialog).
- `get-results` stays, only for a command that timed out.

### A bug that was already there: `Date.toISOString`
The panel stamped every result with `new Date().toISOString()`, which ExtendScript (ES3) doesn't have. The stamping
always failed silently, so results never carried `_commandExecuted`, which is why the existing
`waitForBridgeResult(expectedCommand)` helper could never have worked for the tools. Replaced by `isoNow()` (ES3).

### Comps by name everywhere
- Every tool that takes `compIndex` also takes **`compName`** (the comp's exact name; the first comp with that name).
  The panel turns the name into the item number before running the command, or answers "No composition named …".
- `listCompositions` now gives each comp's **`index`** (the item number `compIndex` means) and its **`folder`**.

### New tool: `run-jsx`, any ExtendScript
- `code`: the body of a function that gets `args` and returns plain data (numbers, strings, arrays, plain objects, not
  AE objects). Example: `var c = app.project.activeItem; return { name: c.name, layers: c.numLayers };`
- or `file`: a `.jsx` file run with `$.evalFile`.
- `undoName`: everything the script changes becomes one undo step with this name.
- `timeoutSeconds`: default 60, max 600.
- A value that isn't plain data comes back as text, with a note.

### New tool: `run-skill-script`, the skill's ~50 scripts through the panel
- `script`: the name without `.jsx` (`project-overview`, `comp-detail`, `layer-detail`, `expression-errors`,
  `font-inventory`, `project-audit`, `batch-rename`, `expression-replace` …). The tool's description lists what's
  available (read from the skill's folder when the server starts).
- `args`: what `runner.sh` would get as JSON. They're written to `/tmp/ae-assistant-args.json` (the skill's
  `readArgs()`), and the script's `/tmp/ae-assistant-result.json` (its `writeResult()`) comes back as the result.
- The skill's folder is found at `~/.claude/skills/after-effects/scripts` (or `~/.agents/…`), using the **real path**,
  since ExtendScript `#include` can't follow symlinks.
- Scripts that change the project: use their `dryRun` first where they have one.

### `getLayerExpressions`: less noise
Layer Styles, Geometry Options and Audio properties **without** an expression are left out, with a note saying how many.
`all: true` lists them too.

## Test results (2026-11-16, Template 07 open, all read-only)

| Test | Result |
|---|---|
| `run-jsx`: list the comps with their item numbers | ✓ one call, right id, no stale result |
| `getEssentialGraphics` with `compName: "Champions Slide essential graphics"` | ✓ all 15 Essential Properties |
| `getLayerExpressions` with `compName: "text-logos"` | ✓ the expressions; 98 empty rows left out |
| `run-skill-script expression-errors` `{compName: "text-logos"}` | ✓ 117 expressions, 0 errors, 0 disabled |
| `run-skill-script project-overview` | ✓ the full project summary |

## Pros and cons so far

**Pros**
- One call per command, with its own answer.
- Named tools (`getEssentialGraphics`, `getLayerExpressions`, `setLayerExpression`) read clearly in the chat and fit
  template work well; expression errors come back with the expression.
- `run-jsx` and `run-skill-script` cover everything the skill could do, so the skill is only needed if the bridge is down.
- No `osascript`: AE doesn't come to the front.

**Cons / still open**
- The panel must be open in AE with Auto-run on.
- After a panel change: `npm run build && npm run install-bridge`, then **reload the panel** in AE (its reload link). After
  a server change: **reconnect** the MCP in Claude Code (`/mcp`).
- Up to ~2 s per command (the panel checks every 2 s).
- `getLayerExpressions` on a shape layer still lists every path of every group. Next step: an option to list only the
  properties that **have** an expression.
- `run-jsx` runs whatever code it's given, like the skill does: changes should be explained before they're run, and
  wrapped in `undoName`.

## Updating after a change

```bash
npm run build            # server (build/index.js) + panel (build/scripts/)
npm run install-bridge   # copies the panel to AE's ScriptUI Panels folder
```
Then reload the panel in AE, and reconnect the MCP in Claude Code (`/mcp`) when `src/index.ts` changed.

## Files

- `src/index.ts`: `writeCommandFile` (ids), `runBridge`, `bridgeReply`, `compName` in the schemas, `run-jsx`,
  `run-skill-script`, help text.
- `src/scripts/mcp-bridge-auto.jsx`: `_commandId` in results (also errors and non-JSON results), `compName`, `runJsx`,
  `isoNow`, `listCompositions` (index, folder), `getLayerExpressions(…, all)`.
