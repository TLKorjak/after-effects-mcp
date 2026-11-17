// expressionCheck.ts — static checks for After Effects expressions.
//
// The bridge panel (collectExpressions) sends every expression's text plus the project's names:
// comps, their layers, each layer's effects + effect controls, masks, and footage. This file parses
// each expression with acorn (a real JavaScript parser) and looks for:
//   - names that don't exist: comp("…"), layer("…"), effect("…"), effect("…")("…"), mask("…"),
//     footage("…") - with WHY they don't match (extra space, capital letters, a hidden right-to-left
//     mark, a long dash, a layer name used as a comp name, a layer that lives in another comp…)
//   - duplicate comp / layer names that make a reference ambiguous
//   - variables and functions used but never defined (typos like myVarr / linar / thiscomp)
//   - likely typos after a dot (.positon, .valueAtTme)
//   - variables defined but never used
//   - syntax errors, AE's own errors, expressions AE has switched off
import { parse } from "acorn";

// ───── What the bridge sends ─────
export interface EffectInfo { name: string; matchName: string; params: string[]; paramMatchNames: string[] }
export interface LayerInfo { index: number; name: string; effects: EffectInfo[]; masks: string[] }
export interface CompInfo { name: string; layers: LayerInfo[] }
export interface ExpressionInfo { comp: string; layer: string; layerIndex: number; property: string; expression: string; enabled: boolean; error: string }
export interface ProjectData { projectName?: string; comps: CompInfo[]; footage: string[]; expressions: ExpressionInfo[] }

export type Severity = "error" | "warning" | "info";
export interface Issue {
  severity: Severity;
  check: string;          // short id, e.g. "comp-name", "undefined-name"
  comp: string;
  layer: string;
  property: string;
  line?: number;
  code?: string;          // the expression line the issue is on
  message: string;
}

// ───── Names that exist without being defined in the expression ─────
// AE expression globals (thisLayer / thisProperty attributes are reachable without a prefix).
const AE_GLOBALS = `thisComp thisLayer thisProperty thisProject time value velocity speed numKeys key nearestKey
comp footage effect mask marker transform content text sourceText position anchorPoint scale rotation opacity
orientation xRotation yRotation zRotation index name inPoint outPoint startTime hasParent parent active enabled
audioActive hasVideo hasAudio width height source sourceRectAtTime sourceTime sampleImage toComp fromComp toWorld
fromWorld toCompVec fromCompVec toWorldVec fromWorldVec fromCompToSurface timeRemap audioLevels pointOfInterest zoom
depthOfField focusDistance aperture blurLevel intensity color coneAngle coneFeather shadowDarkness shadowDiffusion
castsShadows acceptsShadows acceptsLights ambient diffuse specular shininess metal lightTransmission
wiggle temporalWiggle smooth loopIn loopOut loopInDuration loopOutDuration valueAtTime velocityAtTime speedAtTime
propertyGroup propertyIndex numProperties createPath points inTangents outTangents isClosed pointOnPath
tangentOnPath normalOnPath linear ease easeIn easeOut clamp random gaussRandom seedRandom noise degreesToRadians
radiansToDegrees timeToFrames framesToTime timeToTimecode timeToCurrentFormat timeToFeetAndFrames timeToNTSCTimecode
add sub mul div length lookAt normalize dot cross rgbToHsl hslToRgb hexToRgb posterizeTime colorDepth
displayStartTime frameDuration shutterAngle shutterPhase bgColor pixelAspect activeCamera numLayers`.split(/\s+/);

const JS_GLOBALS = `Math Number String Array Object JSON Date Boolean RegExp Error TypeError RangeError ReferenceError
SyntaxError parseInt parseFloat isNaN isFinite undefined NaN Infinity eval encodeURI encodeURIComponent decodeURI
decodeURIComponent escape unescape Symbol Map Set WeakMap WeakSet Promise arguments globalThis Reflect Proxy BigInt`.split(/\s+/);

// Names that commonly follow a dot - used only to spot near-miss typos (.positon -> .position).
const KNOWN_MEMBERS = new Set([...AE_GLOBALS, ...`layer comment duration chapter cuePointName eventCuePoint url
frameTarget parameters protectedRegion label style font fontSize fillColor strokeColor strokeWidth tracking leading
isFauxBold isFauxItalic isAllCaps isSmallCaps baselineShift applyFill applyStroke setText setFont setFontSize
setFillColor setStrokeColor setStrokeWidth setTracking setLeading setApplyFill setApplyStroke setFauxBold
setFauxItalic setAllCaps setSmallCaps setBaselineShift getStyleAt createStyle dataValue dataKeyCount dataKeyTimes
dataKeyValues sourceData param maskPath maskOpacity maskFeather maskExpansion invert
toFixed toString toPrecision toUpperCase toLowerCase substring substr slice split replace replaceAll indexOf
lastIndexOf charAt charCodeAt trim trimStart trimEnd join push pop shift unshift concat reverse sort map filter
forEach reduce some every includes match search test exec keys values entries floor ceil round abs sqrt pow sin
cos tan atan atan2 asin acos min max PI log exp sign hypot parse stringify getTime getHours getMinutes getSeconds
getFullYear getMonth getDate getDay padStart padEnd startsWith endsWith repeat fromCharCode isArray`.split(/\s+/)]);

// ───── Name comparison: why doesn't "wanted" match any real name? ─────

// Invisible marks and look-alike characters that make two names look identical on screen
// but differ in the file - common with Hebrew (right-to-left marks) and copy-pasted text.
function normalizeLookalikes(s: string): string {
  return s
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")   // zero-width + direction marks
    .replace(/[  -  　]/g, " ")                 // non-breaking / odd spaces
    .replace(/[‐-―−]/g, "-")                             // long dashes, minus sign
    .replace(/[‘’׳]/g, "'")
    .replace(/[“”״]/g, '"');
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

const show = (s: string) => JSON.stringify(s);   // shows quotes, so stray spaces are visible

// Explains how `wanted` differs from the closest real name, or null if nothing is close.
function explainMismatch(wanted: string, candidates: string[]): string | null {
  const uniq = Array.from(new Set(candidates));
  const trimmed = wanted.trim();
  let hit = uniq.find(c => c.trim() === trimmed);
  if (hit !== undefined) return `the real name is ${show(hit)} - they differ only in spaces at the start or end`;
  const collapse = (s: string) => s.trim().replace(/\s+/g, " ");
  hit = uniq.find(c => collapse(c) === collapse(wanted));
  if (hit !== undefined) return `the real name is ${show(hit)} - they differ only in spaces (e.g. a double space)`;
  hit = uniq.find(c => c.toLowerCase() === wanted.toLowerCase());
  if (hit !== undefined) return `the real name is ${show(hit)} - they differ only in capital letters`;
  const norm = (s: string) => collapse(normalizeLookalikes(s)).toLowerCase();
  hit = uniq.find(c => norm(c) === norm(wanted));
  if (hit !== undefined) return `the real name is ${show(hit)} - they look the same but one has a hidden character ` +
    `(e.g. a right-to-left mark, a non-breaking space, or a long dash instead of "-")`;
  let best: string | null = null, bestD = Infinity;
  for (const c of uniq) {
    const d = levenshtein(norm(c), norm(wanted));
    if (d < bestD) { bestD = d; best = c; }
  }
  const limit = Math.max(2, Math.ceil(wanted.length * 0.3));
  if (best !== null && bestD <= limit) return `closest real name: ${show(best)}`;
  return null;
}

// ───── AST helpers ─────
type N = any;   // acorn ESTree node

function childNodes(node: N): N[] {
  const out: N[] = [];
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === "string") out.push(x); }
    else if (v && typeof v.type === "string") out.push(v);
  }
  return out;
}

function walk(node: N, parent: N | null, visit: (n: N, p: N | null) => void) {
  visit(node, parent);
  for (const c of childNodes(node)) walk(c, node, visit);
}

function patternIdentifiers(p: N, out: N[]) {
  if (!p) return;
  switch (p.type) {
    case "Identifier": out.push(p); break;
    case "ObjectPattern": for (const prop of p.properties) patternIdentifiers(prop.type === "RestElement" ? prop.argument : prop.value, out); break;
    case "ArrayPattern": for (const el of p.elements) patternIdentifiers(el, out); break;
    case "AssignmentPattern": patternIdentifiers(p.left, out); break;
    case "RestElement": patternIdentifiers(p.argument, out); break;
  }
}

// A fixed text argument: "abc" or `abc` (no ${…}). Returns undefined otherwise.
function stringArg(n: N): string | undefined {
  if (!n) return undefined;
  if (n.type === "Literal" && typeof n.value === "string") return n.value;
  if (n.type === "TemplateLiteral" && n.expressions.length === 0) return n.quasis[0].value.cooked;
  return undefined;
}
function numberArg(n: N): number | undefined {
  return n && n.type === "Literal" && typeof n.value === "number" ? n.value : undefined;
}
// A name glued together from text while the expression runs: "Score " + i, `Player ${n}`
function isBuiltName(n: N): boolean {
  if (!n) return false;
  if (n.type === "TemplateLiteral") return n.expressions.length > 0;
  if (n.type === "BinaryExpression" && n.operator === "+") {
    const hasText = (x: N): boolean => stringArg(x) !== undefined || (x.type === "BinaryExpression" && x.operator === "+" && (hasText(x.left) || hasText(x.right)));
    return hasText(n);
  }
  return false;
}

// ───── The check ─────
export interface CheckOptions { minSeverity?: Severity; maxIssues?: number }

export function checkExpressions(data: ProjectData, opts: CheckOptions = {}) {
  const compsByName = new Map<string, CompInfo[]>();
  for (const c of data.comps) compsByName.set(c.name, [...(compsByName.get(c.name) || []), c]);
  const allCompNames = data.comps.map(c => c.name);

  const issues: Issue[] = [];
  const definedNames = new Set([...AE_GLOBALS, ...JS_GLOBALS]);

  for (const e of data.expressions) {
    const lines = e.expression.split(/\r\n|\r|\n/);
    const add = (severity: Severity, check: string, message: string, node?: N) => {
      const line = node?.loc?.start?.line;
      issues.push({
        severity, check, comp: e.comp, layer: e.layer, property: e.property, message,
        ...(line ? { line, code: lines[line - 1].trim().slice(0, 160) } : {})
      });
    };

    const thisComp = (compsByName.get(e.comp) || [])[0];
    const thisLayer = thisComp?.layers[e.layerIndex - 1];

    if (!e.enabled) add("warning", "expression-off", "This expression is switched off (AE does that after an error, or someone turned it off) - it isn't running.");
    if (e.error) add("error", "ae-error", `After Effects reports: ${e.error.trim()}`);

    let ast: N;
    try {
      ast = parse(e.expression, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true, locations: true });
    } catch (err: any) {
      const line = err?.loc?.line;
      issues.push({
        severity: "error", check: "syntax", comp: e.comp, layer: e.layer, property: e.property,
        message: `Syntax error: ${String(err?.message || err).replace(/\s*\(\d+:\d+\)$/, "")}`,
        ...(line ? { line, code: (lines[line - 1] || "").trim().slice(0, 160) } : {})
      });
      continue;
    }

    // ── 1. Declarations, references, and simple "var x = <layer/comp>" aliases ──
    const declNodes = new Set<N>();
    const declared = new Map<string, N>();          // name -> first declaring identifier
    const declaredCount = new Map<string, number>();
    const varInit = new Map<string, N>();
    // catch(err) and function parameters: often unused on purpose, so never reported as unused
    const neverUnused = new Set<string>();
    walk(ast, null, (n) => {
      const ids: N[] = [];
      if (n.type === "VariableDeclarator") {
        patternIdentifiers(n.id, ids);
        if (n.id.type === "Identifier" && n.init) varInit.set(n.id.name, n.init);
      } else if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") {
        if (n.id) ids.push(n.id);
        const params: N[] = [];
        for (const p of n.params) patternIdentifiers(p, params);
        for (const p of params) neverUnused.add(p.name);
        ids.push(...params);
      } else if (n.type === "CatchClause") {
        const params: N[] = [];
        patternIdentifiers(n.param, params);
        for (const p of params) neverUnused.add(p.name);
        ids.push(...params);
      }
      else if (n.type === "ClassDeclaration" && n.id) ids.push(n.id);
      for (const id of ids) {
        declNodes.add(id);
        if (!declared.has(id.name)) declared.set(id.name, id);
        declaredCount.set(id.name, (declaredCount.get(id.name) || 0) + 1);
      }
    });

    const reads = new Map<string, N[]>();
    const writes = new Set<string>();
    const members: N[] = [];
    walk(ast, null, (n, p) => {
      if (n.type !== "Identifier" || declNodes.has(n)) return;
      if (p) {
        if (p.type === "MemberExpression" && p.property === n && !p.computed) { members.push(n); return; }
        if ((p.type === "Property" || p.type === "PropertyDefinition" || p.type === "MethodDefinition") && p.key === n && !p.computed && !(p.shorthand && p.value === n)) return;
        if ((p.type === "LabeledStatement" || p.type === "BreakStatement" || p.type === "ContinueStatement") && p.label === n) return;
        if (p.type === "AssignmentExpression" && p.left === n && p.operator === "=") { writes.add(n.name); return; }
        if (p.type === "AssignmentExpression" && p.left === n) writes.add(n.name);
        if (p.type === "UpdateExpression") writes.add(n.name);
      }
      reads.set(n.name, [...(reads.get(n.name) || []), n]);
    });
    // An alias is only trusted if it's set once and never changed
    for (const name of Array.from(varInit.keys())) if (writes.has(name) || (declaredCount.get(name) || 0) > 1) varInit.delete(name);

    // ── 2. Names used but never defined (typos, renamed variables) ──
    const localNames = Array.from(declared.keys()).concat(Array.from(writes));
    for (const [name, nodes] of reads) {
      if (definedNames.has(name) || declared.has(name) || writes.has(name)) continue;
      const hint = explainMismatch(name, [...localNames, ...AE_GLOBALS, ...JS_GLOBALS]);
      if (hint) add("error", "undefined-name", `${show(name)} is never defined - looks like a typo: ${hint.replace("the real name is", "did you mean")}.`, nodes[0]);
      else add("warning", "undefined-name", `${show(name)} is never defined in this expression. Fine if it's an AE feature this checker doesn't know; otherwise it will fail when this line runs.`, nodes[0]);
    }

    // ── 3. Defined but never used ──
    for (const [name, id] of declared) {
      if (reads.has(name) || neverUnused.has(name)) continue;
      // The "other spelling" must be truly undefined - not a global, and not set with a plain `x = …`
      const near = Array.from(reads.keys()).find(r => !declared.has(r) && !writes.has(r) && !definedNames.has(r) && levenshtein(r.toLowerCase(), name.toLowerCase()) <= 2);
      add(near ? "warning" : "info", "unused-variable",
        near ? `${show(name)} is defined but never used, while ${show(near)} is used but never defined - probably the same variable spelled two ways.`
             : `${show(name)} is defined but never used.`, id);
    }

    // ── 4. Near-miss names after a dot ──
    for (const m of members) {
      if (m.name.length < 4 || KNOWN_MEMBERS.has(m.name)) continue;
      const lower = m.name.toLowerCase();
      let best: string | null = null, bestD = Infinity;
      for (const k of KNOWN_MEMBERS) {
        if (Math.abs(k.length - m.name.length) > 2) continue;
        const d = k.toLowerCase() === lower ? 0 : levenshtein(k.toLowerCase(), lower);
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best && bestD <= Math.min(2, Math.floor(m.name.length / 3))) add("warning", "member-typo", `.${m.name} looks like a typo of .${best}.`, m);
    }

    // ── 5. Names in comp("…"), layer("…"), effect("…"), mask("…"), footage("…") ──
    const resolveComp = (n: N, depth = 0): CompInfo | undefined => {
      if (!n || depth > 5) return undefined;
      if (n.type === "Identifier" && n.name === "thisComp") return thisComp;
      if (n.type === "Identifier" && varInit.has(n.name)) return resolveComp(varInit.get(n.name), depth + 1);
      if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "comp") {
        const name = stringArg(n.arguments[0]);
        return name !== undefined ? (compsByName.get(name) || [])[0] : undefined;
      }
      return undefined;
    };
    const resolveLayer = (n: N, depth = 0): { comp: CompInfo; layer: LayerInfo } | undefined => {
      if (!n || depth > 5) return undefined;
      if (n.type === "Identifier" && n.name === "thisLayer") return thisComp && thisLayer ? { comp: thisComp, layer: thisLayer } : undefined;
      if (n.type === "Identifier" && varInit.has(n.name)) return resolveLayer(varInit.get(n.name), depth + 1);
      if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && !n.callee.computed && n.callee.property.name === "layer") {
        const comp = resolveComp(n.callee.object);
        if (!comp) return undefined;
        const name = stringArg(n.arguments[0]);
        const num = numberArg(n.arguments[0]);
        const layer = name !== undefined ? comp.layers.find(l => l.name === name) : num !== undefined ? comp.layers[num - 1] : undefined;
        return layer ? { comp, layer } : undefined;
      }
      return undefined;
    };
    // Which layer does `effect(...)` / `mask(...)` act on? Bare = thisLayer; x.effect(...) = x.
    const ownerLayer = (callee: N) => {
      if (callee.type === "Identifier") return thisComp && thisLayer ? { comp: thisComp, layer: thisLayer } : undefined;
      return resolveLayer(callee.object);
    };
    const calleeName = (callee: N): string | undefined =>
      callee.type === "Identifier" ? callee.name
        : callee.type === "MemberExpression" && !callee.computed ? callee.property.name : undefined;
    const resolveEffect = (n: N): { layer: LayerInfo; effect: EffectInfo } | undefined => {
      if (n?.type !== "CallExpression" || calleeName(n.callee) !== "effect") return undefined;
      const owner = ownerLayer(n.callee);
      if (!owner) return undefined;
      const name = stringArg(n.arguments[0]);
      const num = numberArg(n.arguments[0]);
      const effect = name !== undefined ? owner.layer.effects.find(f => f.name === name || f.matchName === name)
        : num !== undefined ? owner.layer.effects[num - 1] : undefined;
      return effect ? { layer: owner.layer, effect } : undefined;
    };

    walk(ast, null, (n) => {
      if (n.type !== "CallExpression") return;
      const callee = n.callee;
      const fn = calleeName(callee);
      const arg = n.arguments[0];
      const name = stringArg(arg);
      const num = numberArg(arg);

      // comp("…") - only the bare global form
      if (fn === "comp" && callee.type === "Identifier") {
        if (name === undefined) {
          if (isBuiltName(arg)) add("info", "built-name", "This comp name is put together while the expression runs, so it can't be checked here.", n);
          return;
        }
        const matches = compsByName.get(name) || [];
        if (matches.length > 1) add("warning", "duplicate-comp-name", `${matches.length} comps are named ${show(name)}; comp() always uses the first one in the project panel, which may not be the one you mean.`, n);
        if (matches.length > 0) return;
        let msg = `No comp named ${show(name)}`;
        const hint = explainMismatch(name, allCompNames);
        if (hint) msg += ` - ${hint}`;
        else if (data.footage.includes(name)) msg += ` - that's a footage item, not a comp; use footage(${show(name)})`;
        else {
          const layerHome = data.comps.find(c => c.layers.some(l => l.name === name));
          if (layerHome) msg += ` - there's a LAYER with that name (in comp ${show(layerHome.name)}); a precomp layer can be renamed so it no longer matches its comp, or the expression should use layer(${show(name)})`;
          else msg += " - it may have been renamed or deleted";
        }
        add("error", "comp-name", msg + ".", n);
        return;
      }

      // footage("…")
      if (fn === "footage" && callee.type === "Identifier" && name !== undefined && !data.footage.includes(name)) {
        const hint = explainMismatch(name, data.footage);
        add("error", "footage-name", `No footage item named ${show(name)}${hint ? ` - ${hint}` : allCompNames.includes(name) ? ` - that's a comp; use comp(${show(name)})` : ""}.`, n);
        return;
      }

      // <comp>.layer("…") / <comp>.layer(n)
      if (fn === "layer" && callee.type === "MemberExpression") {
        const comp = resolveComp(callee.object);
        if (!comp) return;
        if (name === undefined && num === undefined) {
          if (isBuiltName(arg)) add("info", "built-name", `This layer name (in comp ${show(comp.name)}) is put together while the expression runs, so it can't be checked here.`, n);
          return;
        }
        if (num !== undefined) {
          if (num < 1 || num > comp.layers.length) add("error", "layer-index", `layer(${num}) doesn't exist - comp ${show(comp.name)} has ${comp.layers.length} layer(s).`, n);
          return;
        }
        const same = comp.layers.filter(l => l.name === name!);
        if (same.length > 1) add("warning", "duplicate-layer-name", `${same.length} layers in comp ${show(comp.name)} are named ${show(name!)}; layer() always uses the top one (#${same[0].index}).`, n);
        if (same.length > 0) return;
        let msg = `No layer named ${show(name!)} in comp ${show(comp.name)}`;
        const hint = explainMismatch(name!, comp.layers.map(l => l.name));
        if (hint) msg += ` - ${hint}`;
        else {
          const elsewhere = data.comps.filter(c => c !== comp && c.layers.some(l => l.name === name)).map(c => show(c.name));
          if (elsewhere.length) msg += ` - a layer with that name exists in ${elsewhere.slice(0, 3).join(", ")}${elsewhere.length > 3 ? " and others" : ""}; was this expression copied from there, or the layer moved into a precomp?`;
          else if (allCompNames.includes(name!)) msg += " - that's a comp name; if it's used as a precomp layer here, that layer was probably renamed";
          else msg += " - it may have been renamed or deleted";
        }
        add("error", "layer-name", msg.endsWith("?") ? msg : msg + ".", n);
        return;
      }

      // effect("…") on a known layer
      if (fn === "effect") {
        const owner = ownerLayer(callee);
        if (!owner) return;
        const where = `layer ${show(owner.layer.name)}${owner.comp !== thisComp ? ` (comp ${show(owner.comp.name)})` : ""}`;
        if (num !== undefined) {
          if (num < 1 || num > owner.layer.effects.length) add("error", "effect-index", `effect(${num}) doesn't exist - ${where} has ${owner.layer.effects.length} effect(s).`, n);
          return;
        }
        if (name === undefined) {
          if (isBuiltName(arg)) add("info", "built-name", `This effect name is put together while the expression runs, so it can't be checked here.`, n);
          return;
        }
        if (owner.layer.effects.some(f => f.name === name || f.matchName === name)) return;
        const hint = explainMismatch(name, owner.layer.effects.map(f => f.name));
        add("error", "effect-name", `No effect named ${show(name)} on ${where}${hint ? ` - ${hint}` : owner.layer.effects.length ? `. Its effects: ${owner.layer.effects.map(f => show(f.name)).join(", ")}` : " - that layer has no effects"}.`, n);
        return;
      }

      // effect("…")("…") or effect("…").param("…") - an effect control
      const fx = resolveEffect(callee) || (fn === "param" && callee.type === "MemberExpression" ? resolveEffect(callee.object) : undefined);
      if (fx) {
        if (num !== undefined) {
          if (num < 1 || num > fx.effect.params.length) add("error", "effect-control", `Effect ${show(fx.effect.name)} has no control #${num} (it has ${fx.effect.params.length}).`, n);
          return;
        }
        if (name === undefined || fx.effect.params.includes(name) || fx.effect.paramMatchNames.includes(name)) return;
        const hint = explainMismatch(name, fx.effect.params);
        add("error", "effect-control", `Effect ${show(fx.effect.name)} on layer ${show(fx.layer.name)} has no control named ${show(name)}${hint ? ` - ${hint}` : `. Its controls: ${fx.effect.params.slice(0, 8).map(show).join(", ")}`}.`, n);
        return;
      }

      // mask("…")
      if (fn === "mask" && name !== undefined) {
        const owner = ownerLayer(callee);
        if (!owner || owner.layer.masks.includes(name)) return;
        const hint = explainMismatch(name, owner.layer.masks);
        add("error", "mask-name", `No mask named ${show(name)} on layer ${show(owner.layer.name)}${hint ? ` - ${hint}` : owner.layer.masks.length ? `. Its masks: ${owner.layer.masks.map(show).join(", ")}` : " - that layer has no masks"}.`, n);
      }
    });
  }

  // ── Summary ──
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const minRank = rank[opts.minSeverity || "info"];
  const kept = issues.filter(i => rank[i.severity] <= minRank).sort((a, b) => rank[a.severity] - rank[b.severity]);
  const maxIssues = opts.maxIssues ?? 200;
  const byCheck: Record<string, number> = {};
  for (const i of kept) byCheck[i.check] = (byCheck[i.check] || 0) + 1;
  const count = (s: Severity) => kept.filter(i => i.severity === s).length;

  return {
    success: true,
    project: data.projectName,
    expressionsChecked: data.expressions.length,
    expressionsWithIssues: new Set(kept.map(i => `${i.comp}\u0000${i.layer}\u0000${i.property}`)).size,
    errors: count("error"),
    warnings: count("warning"),
    info: count("info"),
    byCheck,
    ...(kept.length > maxIssues ? { note: `Showing the first ${maxIssues} of ${kept.length} issues (errors first). Narrow it down with compName, or raise maxIssues.` } : {}),
    issues: kept.slice(0, maxIssues)
  };
}
