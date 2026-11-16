import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { fileURLToPath } from 'url';

// Create an MCP server
const server = new McpServer({
  name: "AfterEffectsServer",
  version: "1.0.0"
});

// ES Modules replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths
const SCRIPTS_DIR = path.join(__dirname, "scripts");
const TEMP_DIR = path.join(__dirname, "temp");

// Get the correct directory for AE bridge files
// Use ~/Documents/ae-mcp-bridge for reliable cross-process access
function getAETempDir(): string {
  const homeDir = os.homedir();
  const bridgeDir = path.join(homeDir, 'Documents', 'ae-mcp-bridge');
  // Ensure the directory exists
  if (!fs.existsSync(bridgeDir)) {
    fs.mkdirSync(bridgeDir, { recursive: true });
  }
  return bridgeDir;
}

// Headless CLI execution has been removed. All interactions are routed through the Bridge panel.

// Helper function to read results from After Effects temp file
function readResultsFromTempFile(): string {
  try {
    const tempFilePath = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    // Add debugging info
    console.error(`Checking for results at: ${tempFilePath}`);
    
    if (fs.existsSync(tempFilePath)) {
      // Get file stats to check modification time
      const stats = fs.statSync(tempFilePath);
      console.error(`Result file exists, last modified: ${stats.mtime.toISOString()}`);
      
      const content = fs.readFileSync(tempFilePath, 'utf8');
      console.error(`Result file content length: ${content.length} bytes`);
      
      // If the result file is older than 30 seconds, warn the user
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      if (stats.mtime < thirtySecondsAgo) {
        console.error(`WARNING: Result file is older than 30 seconds. After Effects may not be updating results.`);
        return JSON.stringify({ 
          warning: "Result file appears to be stale (not recently updated).",
          message: "This could indicate After Effects is not properly writing results or the MCP Bridge Auto panel isn't running.",
          lastModified: stats.mtime.toISOString(),
          originalContent: content
        });
      }
      
      return content;
    } else {
      console.error(`Result file not found at: ${tempFilePath}`);
      return JSON.stringify({ error: "No results file found. Please run a script in After Effects first." });
    }
  } catch (error) {
    console.error("Error reading results file:", error);
    return JSON.stringify({ error: `Failed to read results: ${String(error)}` });
  }
}

// Helper to wait for a fresh result produced by a specific command
async function waitForBridgeResult(expectedCommand?: string, timeoutMs: number = 5000, pollMs: number = 250): Promise<string> {
  const start = Date.now();
  const resultPath = path.join(getAETempDir(), 'ae_mcp_result.json');
  let lastSize = -1;

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(resultPath)) {
      try {
        const content = fs.readFileSync(resultPath, 'utf8');
        if (content && content.length > 0 && content.length !== lastSize) {
          lastSize = content.length;
          try {
            const parsed = JSON.parse(content);
            if (!expectedCommand || parsed._commandExecuted === expectedCommand) {
              return content;
            }
          } catch {
            // not JSON yet; continue polling
          }
        }
      } catch {
        // transient read error; continue polling
      }
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  return JSON.stringify({ error: `Timed out waiting for bridge result${expectedCommand ? ` for command '${expectedCommand}'` : ''}.` });
}

// Helper function to write command to file. Returns the command's id: the panel copies it into the
// result (_commandId), so runBridge can tell this command's result from an older one.
function writeCommandFile(command: string, args: Record<string, any> = {}): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const commandFile = path.join(getAETempDir(), 'ae_command.json');
    const commandData = {
      id,
      command,
      args,
      timestamp: new Date().toISOString(),
      status: "pending"  // pending, running, completed, error
    };
    fs.writeFileSync(commandFile, JSON.stringify(commandData, null, 2));
    console.error(`Command "${command}" (${id}) written to ${commandFile}`);
  } catch (error) {
    console.error("Error writing command file:", error);
  }
  return id;
}

// ───── Run a command and wait for its own result ─────
// The panel in After Effects picks the command up (every 2 s), runs it and writes the result with the
// command's id. One command at a time: the command file has one slot, so calls are queued here.
const BRIDGE_TIMEOUT_MS = 30000;
let bridgeQueue: Promise<unknown> = Promise.resolve();

function runBridge(command: string, args: Record<string, any> = {}, timeoutMs: number = BRIDGE_TIMEOUT_MS): Promise<string> {
  const run = async (): Promise<string> => {
    const id = writeCommandFile(command, args);
    const resultPath = path.join(getAETempDir(), 'ae_mcp_result.json');
    const commandPath = path.join(getAETempDir(), 'ae_command.json');
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const content = fs.readFileSync(resultPath, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed && parsed._commandId === id) return content;
      } catch {
        // not there yet, or being written: try again
      }
      await new Promise(r => setTimeout(r, 150));
    }
    // Timed out: say why, from the command's status (still "pending" = the panel never picked it up)
    let status = '';
    try { status = JSON.parse(fs.readFileSync(commandPath, 'utf8')).status || ''; } catch { /* no command file */ }
    const hint = status === 'pending'
      ? 'After Effects did not pick the command up: is the "MCP Bridge Auto" panel open (Window > mcp-bridge-auto.jsx) with Auto-run on? If the panel was updated, click its reload link.'
      : status === 'running'
        ? 'After Effects is still running it (a long script, or a dialog open in AE?). Use get-results later.'
        : 'No result with this command id (an old panel version that does not return command ids? Reload the panel).';
    return JSON.stringify({ error: `Timed out after ${Math.round(timeoutMs / 1000)} s waiting for '${command}'.`, hint, commandId: id, commandStatus: status });
  };
  const next = bridgeQueue.then(run, run);
  bridgeQueue = next.catch(() => undefined);
  return next;
}

// A tool's reply from a bridge result: the result text, marked as an error when it is one
function bridgeReply(result: string) {
  let isError = false;
  try {
    const r = JSON.parse(result);
    isError = r.error !== undefined || r.success === false || r.status === 'error';
  } catch { /* not JSON: plain text */ }
  return { content: [{ type: "text" as const, text: result }], ...(isError ? { isError: true } : {}) };
}

// Helper function to clear the results file to avoid stale cache
function clearResultsFile(): void {
  try {
    const resultFile = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    // Write a placeholder message to indicate the file is being reset
    const resetData = {
      status: "waiting",
      message: "Waiting for new result from After Effects...",
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(resultFile, JSON.stringify(resetData, null, 2));
    console.error(`Results file cleared at ${resultFile}`);
  } catch (error) {
    console.error("Error clearing results file:", error);
  }
}

// Add a resource to expose project compositions
server.resource(
  "compositions",
  "aftereffects://compositions",
  async (uri) => {
    // Clear old results, queue the command, and wait for bridge output
    const result = await runBridge("listCompositions", {});

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: result
      }]
    };
  }
);

// Add a tool for running read-only scripts
server.tool(
  "run-script",
  "Run a read-only script in After Effects",
  {
    script: z.string().describe("Name of the predefined script to run"),
    parameters: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the script")
  },
  async ({ script, parameters = {} }) => {
    // Validate that script is safe (only allow predefined scripts)
    const allowedScripts = [
      "listCompositions", 
      "getProjectInfo", 
      "getLayerInfo", 
      "createComposition",
      "createTextLayer",
      "createShapeLayer",
      "renderFrame",
      "createSolidLayer",
      "setLayerProperties",
      "setLayerKeyframe",
      "setLayerExpression",
      "applyEffect",
      "applyEffectTemplate",
      "test-animation",
      "bridgeTestEffects",
      "createCamera",
      "batchSetLayerProperties",
      "setCompositionProperties",
      "duplicateLayer",
      "deleteLayer",
      "setLayerMask",
      "getLayerExpressions",
      "getExpressionErrors",
      "addToEssentialGraphics",
      "getEssentialGraphics",
      "setEssentialGraphicsProperty"
    ];
    
    if (!allowedScripts.includes(script)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Script "${script}" is not allowed. Allowed scripts are: ${allowedScripts.join(", ")}`
          }
        ],
        isError: true
      };
    }

    try {
      // Write command to file for After Effects to pick up
      const result = await runBridge(script, parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add a tool to get the results from the last script execution
server.tool(
  "get-results",
  "Get results from the last script executed in After Effects",
  {},
  async () => {
    try {
      const result = readResultsFromTempFile();
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting results: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add prompts for common After Effects tasks
server.prompt(
  "list-compositions",
  "List compositions in the current After Effects project",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "Please list all compositions in the current After Effects project."
        }
      }]
    };
  }
);

server.prompt(
  "analyze-composition",
  {
    compositionName: z.string().describe("Name of the composition to analyze")
  },
  (args) => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please analyze the composition named "${args.compositionName}" in the current After Effects project. Provide details about its duration, frame rate, resolution, and layers.`
        }
      }]
    };
  }
);

// Add a prompt for creating compositions
server.prompt(
  "create-composition",
  "Create a new composition with specified settings",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please create a new composition with custom settings. You can specify parameters like name, width, height, frame rate, etc.`
        }
      }]
    };
  }
);

// Add a tool to provide help and instructions
server.tool(
  "get-help",
  "Get help on using the After Effects MCP integration",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects MCP Integration Help

To use this integration with After Effects, follow these steps:

 1. **Install the scripts in After Effects**
   - Run \`node install-bridge.js\` with administrator privileges
   - This copies the necessary scripts to your After Effects installation

2. **Open After Effects**
   - Launch Adobe After Effects 
   - Open a project that you want to work with

3. **Open the MCP Bridge Auto panel**
   - In After Effects, go to Window > mcp-bridge-auto.jsx
   - The panel will automatically check for commands every few seconds

4. **Run commands through MCP**
   - Every tool queues its command, the panel runs it, and the tool waits for that command's own result
     (matched by a command id) and returns it. No separate get-results step.
   - Comps can be given by \`compName\` instead of \`compIndex\` (the item number in the project panel).
   - \`run-jsx\`: any ExtendScript (code or a .jsx file). \`run-skill-script\`: the after-effects skill's scripts.

5. **get-results**
   - Only for a command that timed out (a long script): returns the last result written.

Available scripts:
- getProjectInfo: Information about the current project
- listCompositions: List all compositions in the project
- getLayerInfo: Information about layers in the active composition
- createComposition: Create a new composition
- createTextLayer: Create a new text layer
- createShapeLayer: Create a new shape layer
- renderFrame: Save a single composition frame to a PNG for visual verification (returns a pngPath to read)
- createSolidLayer: Create a new solid layer
- setLayerProperties: Set properties for a layer
- setLayerKeyframe: Set a keyframe for a layer property
- setLayerExpression: Set, remove, and/or enable/disable an expression on a layer property
- getLayerExpressions: List every expression-capable property on a layer with its current state
- getExpressionErrors: Scan the project, a composition, or a layer for expression errors/disabled expressions
- addToEssentialGraphics: Add a layer property (Checkbox/Color/Slider/Source Text) to the Essential Graphics panel
- getEssentialGraphics: List a composition's Motion Graphics template name and exposed Essential Graphics properties
- setEssentialGraphicsProperty: Rename an Essential Graphics entry and/or set the Motion Graphics template name
- applyEffect: Apply an effect to a layer
- applyEffectTemplate: Apply a predefined effect template to a layer
- createCamera: Create a new camera layer
- duplicateLayer: Duplicate a layer
- deleteLayer: Delete a layer
- setLayerMask: Add or edit a mask on a layer
- batchSetLayerProperties: Set properties across multiple layers at once
- setCompositionProperties: Change settings on an existing composition

Effect Templates:
- gaussian-blur: Simple Gaussian blur effect
- directional-blur: Motion blur in a specific direction
- color-balance: Adjust hue, lightness, and saturation
- brightness-contrast: Basic brightness and contrast adjustment
- curves: Advanced color adjustment using curves
- glow: Add a glow effect to elements
- drop-shadow: Add a customizable drop shadow
- cinematic-look: Combination of effects for a cinematic appearance
- text-pop: Effects to make text stand out (glow and shadow)

Note: The auto-running panel can be left open in After Effects to continuously listen for commands from external applications.`
        }
      ]
    };
  }
);

// Add a tool specifically for creating compositions
server.tool(
  "create-composition",
  "Create a new composition in After Effects with specified parameters",
  {
    name: z.string().describe("Name of the composition"),
    width: z.number().int().positive().describe("Width of the composition in pixels"),
    height: z.number().int().positive().describe("Height of the composition in pixels"),
    pixelAspect: z.number().positive().optional().describe("Pixel aspect ratio (default: 1.0)"),
    duration: z.number().positive().optional().describe("Duration in seconds (default: 10.0)"),
    frameRate: z.number().positive().optional().describe("Frame rate in frames per second (default: 30.0)"),
    backgroundColor: z.object({
      r: z.number().int().min(0).max(255),
      g: z.number().int().min(0).max(255),
      b: z.number().int().min(0).max(255)
    }).optional().describe("Background color of the composition (RGB values 0-255)")
  },
  async (params) => {
    try {
      // Write command to file for After Effects to pick up
      const result = await runBridge("createComposition", params);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing composition creation: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// --- BEGIN NEW TOOLS --- 

// Zod schema for common layer identification
const LayerIdentifierSchema = {
  compIndex: z.number().int().positive().optional().describe("1-based index of the composition in the project panel (its item number, folders and footage included; listCompositions shows it). Or give compName."),
    compName: z.string().optional().describe("The composition's exact name, instead of compIndex (the first comp with that name)."),
  layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
};

// Zod schema for keyframe value (more specific types might be needed depending on property)
// Using z.any() for flexibility, but can be refined (e.g., z.array(z.number()) for position/scale)
const KeyframeValueSchema = z.unknown().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");

// Tool for setting a layer keyframe
server.tool(
  "setLayerKeyframe", // Corresponds to the function name in ExtendScript
  "Set a keyframe for a specific layer property at a given time.",
  {
    ...LayerIdentifierSchema, // Reuse common identifiers
    propertyName: z.string().describe("Name of the property to keyframe (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    timeInSeconds: z.number().describe("The time (in seconds) for the keyframe."),
    value: KeyframeValueSchema
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      const result = await runBridge("setLayerKeyframe", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerKeyframe command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool for setting a layer expression
server.tool(
  "setLayerExpression", // Corresponds to the function name in ExtendScript
  "Set, remove, and/or enable/disable an expression on a specific layer property. " +
  "propertyName is searched across the layer's whole property tree (transform, effects, text, masks, etc.), " +
  "not just Transform - use propertyPath to disambiguate if more than one property could match.",
  {
    ...LayerIdentifierSchema, // Reuse common identifiers
    propertyName: z.string().describe("Name or matchName of the property to target (e.g., 'Opacity', 'Blurriness', 'ADBE Position')."),
    expressionString: z.string().optional().describe("The JavaScript expression string. Provide an empty string (\"\") to remove the expression. Omit to leave the current expression text untouched (e.g. when only toggling `enabled`)."),
    propertyPath: z.array(z.string()).optional().describe("Exact path from the layer down to the property (e.g. ['Effects', 'Gaussian Blur', 'Blurriness']), to disambiguate when propertyName alone could match more than one property."),
    enabled: z.boolean().optional().describe("Enable or disable the expression without changing its text.")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      const result = await runBridge("setLayerExpression", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerExpression command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool for listing every expression-capable property on a layer, with current state
server.tool(
  "getLayerExpressions",
  "List every expression-capable property on a layer (transform, effects, text, masks, etc.) along with its " +
  "current expression text, enabled state, and expressionError if any. Use this to discover what can be targeted " +
  "with setLayerExpression, or to check/fix an expression that's already applied. Layer Styles, Geometry Options and " +
  "Audio properties without expressions are left out unless all is true.",
  {
    ...LayerIdentifierSchema,
    all: z.boolean().optional().describe("Also list the Layer Styles / Geometry Options / Audio properties that have no expression.")
  },
  async (parameters) => {
    try {
      const result = await runBridge("getLayerExpressions", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing getLayerExpressions command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool for scanning expression errors and disabled expressions
server.tool(
  "getExpressionErrors",
  "Scan for expression errors and disabled expressions across the whole project, a single composition, " +
  "or a single layer. Use scope 'project' for a broad audit, or 'comp'/'layer' to narrow down while fixing something specific.",
  {
    scope: z.enum(["project", "comp", "layer"]).default("project").describe("How broadly to scan."),
    compIndex: z.number().int().positive().optional().describe("1-based composition index. Required for scope 'comp' or 'layer' (or give compName)."),
    compName: z.string().optional().describe("The composition's exact name, instead of compIndex."),
    layerIndex: z.number().int().positive().optional().describe("1-based layer index within the composition. Required for scope 'layer'.")
  },
  async (parameters) => {
    try {
      const result = await runBridge("getExpressionErrors", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing getExpressionErrors command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Zod schema for identifying a composition (Essential Graphics tools operate at the comp level)
const CompIdentifierSchema = {
  compIndex: z.number().int().positive().optional().describe("1-based index of the composition in the project panel (its item number, folders and footage included; listCompositions shows it). Or give compName."),
    compName: z.string().optional().describe("The composition's exact name, instead of compIndex (the first comp with that name).")
};

// Tool for adding a layer property to the Essential Graphics panel
server.tool(
  "addToEssentialGraphics",
  "Add a layer property to the Essential Graphics panel for a composition. Only a Checkbox, Color, " +
  "single-value numerical Slider (e.g. Opacity, Slider Control), or Source Text property can be added - " +
  "check with the property first if unsure. There is no scripting API to remove an entry once added; " +
  "that has to be done by hand in the panel.",
  {
    ...LayerIdentifierSchema,
    propertyName: z.string().describe("Name or matchName of the property to expose (e.g., 'Opacity', 'Source Text')."),
    propertyPath: z.array(z.string()).optional().describe("Exact path from the layer down to the property, to disambiguate when propertyName alone could match more than one property."),
    displayName: z.string().optional().describe("Custom name to show in the Essential Graphics panel. Omit to use the property's own name.")
  },
  async (parameters) => {
    try {
      const result = await runBridge("addToEssentialGraphics", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing addToEssentialGraphics command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool for listing a composition's Essential Graphics panel contents
server.tool(
  "getEssentialGraphics",
  "List the Motion Graphics template name and every property currently exposed in the Essential Graphics panel for a composition.",
  {
    ...CompIdentifierSchema
  },
  async (parameters) => {
    try {
      const result = await runBridge("getEssentialGraphics", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing getEssentialGraphics command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool for renaming an Essential Graphics entry and/or the Motion Graphics template name
server.tool(
  "setEssentialGraphicsProperty",
  "Rename an existing Essential Graphics panel entry and/or set the composition's Motion Graphics " +
  "template name (used as the exported .mogrt filename). Use getEssentialGraphics first to find a property's controllerIndex.",
  {
    ...CompIdentifierSchema,
    controllerIndex: z.number().int().positive().optional().describe("1-based index (from getEssentialGraphics) of the Essential Graphics entry to rename. Provide together with newName."),
    newName: z.string().optional().describe("New display name for the entry at controllerIndex."),
    templateName: z.string().optional().describe("New Motion Graphics template (.mogrt) name for the composition.")
  },
  async (parameters) => {
    try {
      const result = await runBridge("setEssentialGraphicsProperty", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setEssentialGraphicsProperty command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// --- END NEW TOOLS ---

// --- BEGIN NEW TESTING TOOL --- 
// Add a special tool for directly testing the keyframe functionality
server.tool(
  "test-animation",
  "Test animation functionality in After Effects",
  {
    operation: z.enum(["keyframe", "expression"]).describe("The animation operation to test"),
    compIndex: z.number().int().positive().describe("Composition index (usually 1)"),
    layerIndex: z.number().int().positive().describe("Layer index (usually 1)")
  },
  async (params) => {
    try {
      // Generate a unique timestamp
      const timestamp = new Date().getTime();
      const tempFile = path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `ae_test_${timestamp}.jsx`);
      
      // Create a direct test script that doesn't rely on command files
      let scriptContent = "";
      if (params.operation === "keyframe") {
        scriptContent = `
          // Direct keyframe test script
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Opacity");
            var time = 1; // 1 second
            var value = 25; // 25% opacity
            
            // Set a keyframe
            prop.setValueAtTime(time, value);
            
            // Write direct result
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added keyframe at time " + time + " with value " + value);
            resultFile.close();
            
            // Visual feedback
            alert("Test successful: Added opacity keyframe at " + time + "s with value " + value + "%");
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      } else if (params.operation === "expression") {
        scriptContent = `
          // Direct expression test script
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Position");
            var expression = "wiggle(3, 30)";
            
            // Set the expression
            prop.expression = expression;
            
            // Write direct result
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added expression: " + expression);
            resultFile.close();
            
            // Visual feedback
            alert("Test successful: Added position expression: " + expression);
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      }
      
      // Write the script to a temp file
      fs.writeFileSync(tempFile, scriptContent);
      console.error(`Written test script to: ${tempFile}`);
      
      // Tell the user what to do
      return {
        content: [
          {
            type: "text",
            text: `I've created a direct test script for the ${params.operation} operation.

Please run this script manually in After Effects:
1. In After Effects, go to File > Scripts > Run Script File...
2. Navigate to: ${tempFile}
3. You should see an alert confirming the result.

This bypasses the MCP Bridge Auto panel and will directly modify the specified layer.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating test script: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);
// --- END NEW TESTING TOOL --- 

// --- BEGIN NEW EFFECTS TOOLS ---

// Add a tool for applying effects to layers
server.tool(
  "apply-effect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().optional().describe("1-based index of the composition in the project panel (its item number, folders and footage included; listCompositions shows it). Or give compName."),
    compName: z.string().optional().describe("The composition's exact name, instead of compIndex (the first comp with that name)."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectCategory: z.string().optional().describe("Optional category for filtering effects."),
    presetPath: z.string().optional().describe("Optional path to an effect preset file (.ffx)."),
    effectSettings: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      const result = await runBridge("applyEffect", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add a tool for applying effect templates
server.tool(
  "apply-effect-template",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().optional().describe("1-based index of the composition in the project panel (its item number, folders and footage included; listCompositions shows it). Or give compName."),
    compName: z.string().optional().describe("The composition's exact name, instead of compIndex (the first comp with that name)."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur", 
      "directional-blur", 
      "color-balance", 
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      const result = await runBridge("applyEffectTemplate", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect-template command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// --- END NEW EFFECTS TOOLS ---

// Add direct MCP function for applying effects
server.tool(
  "mcp_aftereffects_applyEffect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().optional().describe("1-based index of the composition in the project panel (its item number, folders and footage included; listCompositions shows it). Or give compName."),
    compName: z.string().optional().describe("The composition's exact name, instead of compIndex (the first comp with that name)."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectSettings: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      const result = await runBridge("applyEffect", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error applying effect: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add direct MCP function for applying effect templates
server.tool(
  "mcp_aftereffects_applyEffectTemplate",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().optional().describe("1-based index of the composition in the project panel (its item number, folders and footage included; listCompositions shows it). Or give compName."),
    compName: z.string().optional().describe("The composition's exact name, instead of compIndex (the first comp with that name)."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur", 
      "directional-blur", 
      "color-balance", 
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      const result = await runBridge("applyEffectTemplate", parameters);
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error applying effect template: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Update help information to include the new effects tools
server.tool(
  "mcp_aftereffects_get_effects_help",
  "Get help on using After Effects effects",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects Effects Help

## Common Effect Match Names
These are internal names used by After Effects that can be used with the \`effectMatchName\` parameter:

### Blur & Sharpen
- Gaussian Blur: "ADBE Gaussian Blur 2"
- Camera Lens Blur: "ADBE Camera Lens Blur"
- Directional Blur: "ADBE Directional Blur"
- Radial Blur: "ADBE Radial Blur"
- Smart Blur: "ADBE Smart Blur"
- Unsharp Mask: "ADBE Unsharp Mask"

### Color Correction
- Brightness & Contrast: "ADBE Brightness & Contrast 2"
- Color Balance: "ADBE Color Balance (HLS)"
- Color Balance (RGB): "ADBE Pro Levels2"
- Curves: "ADBE CurvesCustom"
- Exposure: "ADBE Exposure2"
- Hue/Saturation: "ADBE HUE SATURATION"
- Levels: "ADBE Pro Levels2"
- Vibrance: "ADBE Vibrance"

### Stylistic
- Glow: "ADBE Glow"
- Drop Shadow: "ADBE Drop Shadow"
- Bevel Alpha: "ADBE Bevel Alpha"
- Noise: "ADBE Noise"
- Fractal Noise: "ADBE Fractal Noise"
- CC Particle World: "CC Particle World"
- CC Light Sweep: "CC Light Sweep"

## Effect Templates
The following predefined effect templates are available:

- \`gaussian-blur\`: Simple Gaussian blur effect
- \`directional-blur\`: Motion blur in a specific direction
- \`color-balance\`: Adjust hue, lightness, and saturation
- \`brightness-contrast\`: Basic brightness and contrast adjustment
- \`curves\`: Advanced color adjustment using curves
- \`glow\`: Add a glow effect to elements
- \`drop-shadow\`: Add a customizable drop shadow
- \`cinematic-look\`: Combination of effects for a cinematic appearance
- \`text-pop\`: Effects to make text stand out (glow and shadow)

## Example Usage
To apply a Gaussian blur effect:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "effectMatchName": "ADBE Gaussian Blur 2",
  "effectSettings": {
    "Blurriness": 25
  }
}
\`\`\`

To apply the "cinematic-look" template:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "templateName": "cinematic-look"
}
\`\`\`
`
        }
      ]
    };
  }
);

// Add a direct tool for our bridge test effects
server.tool(
  "run-bridge-test",
  "Run the bridge test effects script to verify communication and apply test effects",
  {},
  async () => {
    try {
      // Write command to file for After Effects to pick up
      const result = await runBridge("bridgeTestEffects", {});
      return bridgeReply(result);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing bridge test command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// ───── Any ExtendScript, and the after-effects skill's scripts ─────
// run-jsx runs code (or a .jsx file) inside After Effects through the panel. A file written for the
// after-effects skill (readArgs() / writeResult() in lib/utils.jsx) works as is: its args go to
// /tmp/ae-assistant-args.json and its /tmp/ae-assistant-result.json comes back as the result.
const SKILL_ARGS_FILE = '/tmp/ae-assistant-args.json';
const SKILL_RESULT_FILE = '/tmp/ae-assistant-result.json';

function skillScriptsDir(): string | null {
  const candidates = [path.join(os.homedir(), '.claude', 'skills', 'after-effects', 'scripts'),
                      path.join(os.homedir(), '.agents', 'skills', 'after-effects', 'scripts')];
  for (const c of candidates) {
    try { return fs.realpathSync(c); } catch { /* not there */ }   // the real path: #include can't follow symlinks
  }
  return null;
}
function skillScriptNames(): string[] {
  const dir = skillScriptsDir();
  if (!dir) return [];
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.jsx') && f !== 'ae-action.jsx').map(f => f.replace(/\.jsx$/, '')).sort(); }
  catch { return []; }
}

async function runJsx(opts: { code?: string; file?: string; args?: Record<string, unknown>; undoName?: string; timeoutSeconds?: number }): Promise<string> {
  if (!opts.code && !opts.file) return JSON.stringify({ error: 'Give code or file.' });
  if (opts.file && !fs.existsSync(opts.file)) return JSON.stringify({ error: `No such file: ${opts.file}` });
  // For skill-style files: their args, and no old result lying around
  try { fs.writeFileSync(SKILL_ARGS_FILE, JSON.stringify(opts.args || {})); } catch { /* not needed for code */ }
  try { fs.rmSync(SKILL_RESULT_FILE, { force: true }); } catch { /* none */ }
  const timeout = Math.min(Math.max(opts.timeoutSeconds || 60, 5), 600) * 1000;
  const raw = await runBridge('runJsx', { code: opts.code || '', file: opts.file || '', args: opts.args || {}, undoName: opts.undoName || '' }, timeout);
  // A skill-style script answered in its own result file: that is the result
  try {
    const r = JSON.parse(raw);
    if (r.success !== false && !r.error && fs.existsSync(SKILL_RESULT_FILE)) {
      const text = fs.readFileSync(SKILL_RESULT_FILE, 'utf8');
      try { return JSON.stringify(JSON.parse(text), null, 1); } catch { return text; }
    }
  } catch { /* plain text */ }
  return raw;
}

server.tool(
  "run-jsx",
  "Run ExtendScript (ES3) inside After Effects and return its result. Give `code`: the body of a function that gets `args` " +
  "and returns plain data (numbers, strings, arrays, plain objects - not AE objects), e.g. " +
  "\"var c = app.project.activeItem; return { name: c.name, layers: c.numLayers };\". Or give `file`: a .jsx file to run " +
  "($.evalFile); a file written for the after-effects skill (readArgs/writeResult) gets `args` and its result back. " +
  "It can change the project: give `undoName` to make the changes one undo step.",
  {
    code: z.string().optional().describe("ExtendScript function body; `args` is available; `return` the result."),
    file: z.string().optional().describe("Absolute path of a .jsx file to run instead of code."),
    args: z.record(z.string(), z.unknown()).optional().describe("Arguments: `args` in code, or readArgs() in a skill-style file."),
    undoName: z.string().optional().describe("Wrap the run in one undo group with this name (for changes)."),
    timeoutSeconds: z.number().positive().optional().describe("How long to wait for the result (default 60, max 600).")
  },
  async (opts) => {
    try {
      return bridgeReply(await runJsx(opts));
    } catch (error) {
      return { content: [{ type: "text", text: `Error running jsx: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "run-skill-script",
  "Run one of the after-effects skill's scripts (~/.claude/skills/after-effects/scripts) through the panel, with its args. " +
  "Read-only queries: active-state, project-overview ({mode: 'summary'|'folder'|'full', folderName}), comp-detail ({compName}), " +
  "layer-detail ({compName, layerNames}), expression-errors ({compName}), font-inventory, project-audit. Others change the project " +
  "(batch-rename, expression-replace, project-cleanup, … - use dryRun first where they have it). Available now: " +
  (skillScriptNames().join(', ') || '(skill not found)') + ".",
  {
    script: z.string().describe("The script's name without .jsx, e.g. 'project-overview'."),
    args: z.record(z.string(), z.unknown()).optional().describe("The script's args (what runner.sh would get as JSON)."),
    timeoutSeconds: z.number().positive().optional().describe("How long to wait (default 60, max 600).")
  },
  async ({ script, args, timeoutSeconds }) => {
    const dir = skillScriptsDir();
    if (!dir) return { content: [{ type: "text", text: "The after-effects skill's scripts folder isn't there (~/.claude/skills/after-effects/scripts)." }], isError: true };
    const name = script.replace(/\.jsx$/, '');
    if (!/^[A-Za-z0-9_-]+$/.test(name) || !fs.existsSync(path.join(dir, name + '.jsx')))
      return { content: [{ type: "text", text: `No skill script '${name}'. Available: ${skillScriptNames().join(', ')}` }], isError: true };
    try {
      return bridgeReply(await runJsx({ file: path.join(dir, name + '.jsx'), args: args || {}, timeoutSeconds }));
    } catch (error) {
      return { content: [{ type: "text", text: `Error running skill script: ${String(error)}` }], isError: true };
    }
  }
);

// Start the MCP server
async function main() {
  console.error("After Effects MCP Server starting...");
  console.error(`Scripts directory: ${SCRIPTS_DIR}`);
  console.error(`Temp directory: ${TEMP_DIR}`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("After Effects MCP Server running...");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
