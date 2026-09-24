// renderFrame.jsx
// Saves a single frame of a composition to a PNG file, for visual verification
// of script-driven changes (shape paths, layer positions, etc.) rather than
// trusting a script's own "success" report alone.

function renderFrame(args) {
    try {
        var compName = args.compName || "";
        var time = (args.time !== undefined) ? args.time : 0;

        // Find the composition by name
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) {
                comp = item;
                break;
            }
        }

        // If no composition was found by name, use the active composition
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) {
                comp = app.project.activeItem;
            } else {
                throw new Error("No composition found with name '" + compName + "' and no active composition");
            }
        }

        // Same temp folder the Node side uses (~/Documents/ae-mcp-bridge) so
        // the file is always in a known, discoverable location.
        var userFolder = Folder.myDocuments;
        var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
        if (!bridgeFolder.exists) bridgeFolder.create();

        var fileName = args.fileName || "render-preview.png";
        var outFile = new File(bridgeFolder.fsName + "/" + fileName);
        // Remove any stale file first so we can reliably detect the NEW one
        // landing, rather than reading a leftover from a previous call.
        if (outFile.exists) outFile.remove();

        comp.saveFrameToPng(time, outFile);

        // saveFrameToPng is undocumented and asynchronous -- it can return
        // before the file actually exists on disk. Poll briefly rather than
        // assuming it's there immediately.
        var waitedMs = 0;
        var maxWaitMs = 5000;
        var stepMs = 150;
        while (waitedMs < maxWaitMs) {
            if (outFile.exists && outFile.length > 0) break;
            $.sleep(stepMs);
            waitedMs += stepMs;
        }

        if (!outFile.exists) {
            throw new Error("saveFrameToPng did not produce a file within " + maxWaitMs + "ms at " + outFile.fsName);
        }

        return JSON.stringify({
            status: "success",
            message: "Frame rendered",
            comp: comp.name,
            time: time,
            pngPath: outFile.fsName,
            waitedMs: waitedMs
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

// Read arguments from the file (passed by the Node.js script)
var argsFile = new File($.fileName.replace(/[^\\\/]*$/, '') + "../temp/args.json");
var args = {};
if (argsFile.exists) {
    argsFile.open("r");
    var content = argsFile.read();
    argsFile.close();
    if (content) {
        try {
            args = JSON.parse(content);
        } catch (e) {
            $.write(JSON.stringify({
                status: "error",
                message: "Failed to parse arguments: " + e.toString()
            }, null, 2));
        }
    }
}

var result = renderFrame(args);
$.write(result);
