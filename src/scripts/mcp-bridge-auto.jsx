// mcp-bridge-auto.jsx
// Auto-running MCP Bridge panel for After Effects

// $.fileName is a shared, mutable ExtendScript engine property -- it reflects whichever script
// most recently started executing, anywhere in this AE session, not necessarily this one. Captured
// once, right here, at the very top of this script's own execution, before anything else can
// possibly run and overwrite it, so the reload link near the bottom always re-reads the right file.
var THIS_SCRIPT_FILE = $.fileName;

// Remove #include directives as we define functions below
/*
#include "createComposition.jsx"
#include "createTextLayer.jsx"
#include "createShapeLayer.jsx"
#include "createSolidLayer.jsx"
#include "setLayerProperties.jsx"
*/

// --- Function Definitions ---

// --- createComposition (from createComposition.jsx) --- 
function createComposition(args) {
    try {
        var name = args.name || "New Composition";
        var width = parseInt(args.width) || 1920;
        var height = parseInt(args.height) || 1080;
        var pixelAspect = parseFloat(args.pixelAspect) || 1.0;
        var duration = parseFloat(args.duration) || 10.0;
        var frameRate = parseFloat(args.frameRate) || 30.0;
        var bgColor = args.backgroundColor ? [args.backgroundColor.r/255, args.backgroundColor.g/255, args.backgroundColor.b/255] : [0, 0, 0];
        var newComp = app.project.items.addComp(name, width, height, pixelAspect, duration, frameRate);
        if (args.backgroundColor) {
            newComp.bgColor = bgColor;
        }
        return JSON.stringify({
            status: "success", message: "Composition created successfully",
            composition: { name: newComp.name, id: newComp.id, width: newComp.width, height: newComp.height, pixelAspect: newComp.pixelAspect, duration: newComp.duration, frameRate: newComp.frameRate, bgColor: newComp.bgColor }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createTextLayer (from createTextLayer.jsx) ---
function createTextLayer(args) {
    try {
        var compName = args.compName || "";
        var text = args.text || "Text Layer";
        var position = args.position || [960, 540]; 
        var fontSize = args.fontSize || 72;
        var color = args.color || [1, 1, 1]; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var fontFamily = args.fontFamily || "Arial";
        var alignment = args.alignment || "center"; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var textLayer = comp.layers.addText(text);
        var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
        var textDocument = textProp.value;
        textDocument.fontSize = fontSize;
        textDocument.fillColor = color;
        textDocument.font = fontFamily;
        if (alignment === "left") { textDocument.justification = ParagraphJustification.LEFT_JUSTIFY; } 
        else if (alignment === "center") { textDocument.justification = ParagraphJustification.CENTER_JUSTIFY; } 
        else if (alignment === "right") { textDocument.justification = ParagraphJustification.RIGHT_JUSTIFY; }
        textProp.setValue(textDocument);
        textLayer.property("Position").setValue(position);
        textLayer.startTime = startTime;
        if (duration > 0) { textLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: "Text layer created successfully",
            layer: { name: textLayer.name, index: textLayer.index, type: "text", inPoint: textLayer.inPoint, outPoint: textLayer.outPoint, position: textLayer.property("Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createShapeLayer (from createShapeLayer.jsx) --- 
function createShapeLayer(args) {
    try {
        var compName = args.compName || "";
        var shapeType = args.shapeType || "rectangle"; 
        var position = args.position || [960, 540]; 
        var size = args.size || [200, 200]; 
        var fillColor = args.fillColor || [1, 0, 0]; 
        var strokeColor = args.strokeColor || [0, 0, 0]; 
        var strokeWidth = args.strokeWidth || 0; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var name = args.name || "Shape Layer";
        var points = args.points || 5; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = name;
        var contents = shapeLayer.property("Contents"); 
        var shapeGroup = contents.addProperty("ADBE Vector Group");
        var groupContents = shapeGroup.property("Contents"); 
        var shapePathProperty;
        if (shapeType === "rectangle") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Rect");
            shapePathProperty.property("Size").setValue(size);
        } else if (shapeType === "ellipse") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Ellipse");
            shapePathProperty.property("Size").setValue(size);
        } else if (shapeType === "polygon" || shapeType === "star") { 
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Star");
            shapePathProperty.property("Type").setValue(shapeType === "polygon" ? 1 : 2); 
            shapePathProperty.property("Points").setValue(points);
            shapePathProperty.property("Outer Radius").setValue(size[0] / 2);
            if (shapeType === "star") { shapePathProperty.property("Inner Radius").setValue(size[0] / 3); }
        }
        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("Color").setValue(fillColor);
        fill.property("Opacity").setValue(100);
        if (strokeWidth > 0) {
            var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("Color").setValue(strokeColor);
            stroke.property("Stroke Width").setValue(strokeWidth);
            stroke.property("Opacity").setValue(100);
        }
        shapeLayer.property("Position").setValue(position);
        shapeLayer.startTime = startTime;
        if (duration > 0) { shapeLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: "Shape layer created successfully",
            layer: { name: shapeLayer.name, index: shapeLayer.index, type: "shape", shapeType: shapeType, inPoint: shapeLayer.inPoint, outPoint: shapeLayer.outPoint, position: shapeLayer.property("Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createCamera ---
function createCamera(args) {
    try {
        var compName = args.compName || "";
        var name = args.name || "Camera";
        var zoom = args.zoom || 1777.78; // Default ~50mm equivalent
        var position = args.position; // Optional [x, y, z]
        var pointOfInterest = args.pointOfInterest; // Optional [x, y, z]
        var oneNode = args.oneNode || false; // If true, create a one-node camera (no point of interest)

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var centerPoint = [comp.width / 2, comp.height / 2];
        var cameraLayer = comp.layers.addCamera(name, centerPoint);
        cameraLayer.property("Camera Options").property("Zoom").setValue(zoom);

        if (oneNode) {
            cameraLayer.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
        }

        if (position !== undefined && position !== null) {
            cameraLayer.property("Position").setValue(position);
        }

        if (pointOfInterest !== undefined && pointOfInterest !== null && !oneNode) {
            cameraLayer.property("Point of Interest").setValue(pointOfInterest);
        }

        var result = {
            name: cameraLayer.name,
            index: cameraLayer.index,
            zoom: cameraLayer.property("Camera Options").property("Zoom").value,
            position: cameraLayer.property("Position").value,
            oneNode: oneNode
        };
        if (!oneNode) {
            result.pointOfInterest = cameraLayer.property("Point of Interest").value;
        }

        return JSON.stringify({
            status: "success",
            message: "Camera created successfully",
            layer: result
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- duplicateLayer ---
function duplicateLayer(args) {
    try {
        var compName = args.compName || "";
        var layerIndex = args.layerIndex;
        var layerName = args.layerName || "";
        var newName = args.newName; // optional rename

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); }
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }

        var newLayer = layer.duplicate();
        if (newName) { newLayer.name = newName; }

        return JSON.stringify({
            status: "success",
            message: "Layer duplicated successfully",
            original: { name: layer.name, index: layer.index },
            duplicate: { name: newLayer.name, index: newLayer.index }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- deleteLayer ---
function deleteLayer(args) {
    try {
        var compName = args.compName || "";
        var layerIndex = args.layerIndex;
        var layerName = args.layerName || "";

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); }
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }

        var deletedName = layer.name;
        var deletedIndex = layer.index;
        layer.remove();

        return JSON.stringify({
            status: "success",
            message: "Layer deleted successfully",
            deleted: { name: deletedName, index: deletedIndex }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- setLayerMask: create or modify a mask on a layer ---
function setLayerMask(args) {
    try {
        var compName = args.compName || "";
        var layerIndex = args.layerIndex;
        var layerName = args.layerName || "";
        var maskIndex = args.maskIndex; // optional — if provided, modify existing mask
        var maskPath = args.maskPath; // array of [x, y] points defining the mask shape
        var maskRect = args.maskRect; // shorthand: {top, left, width, height} for rectangular masks
        var maskMode = args.maskMode || "add"; // "add", "subtract", "intersect", "none"
        var maskFeather = args.maskFeather; // optional [x, y] feather
        var maskOpacity = args.maskOpacity; // optional 0-100
        var maskExpansion = args.maskExpansion; // optional pixels
        var maskName = args.maskName; // optional rename

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); }
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }

        // Build the mask shape
        var shapePoints = [];
        if (maskRect) {
            // Rectangle shorthand
            var t = maskRect.top || 0;
            var l = maskRect.left || 0;
            var w = maskRect.width || comp.width;
            var h = maskRect.height || comp.height;
            shapePoints = [[l, t], [l + w, t], [l + w, t + h], [l, t + h]];
        } else if (maskPath && maskPath.length >= 3) {
            shapePoints = maskPath;
        } else {
            throw new Error("Must provide either maskRect or maskPath with at least 3 points");
        }

        // Create the shape object
        var myShape = new Shape();
        var vertices = [];
        for (var p = 0; p < shapePoints.length; p++) {
            vertices.push(shapePoints[p]);
        }
        myShape.vertices = vertices;
        myShape.closed = true;

        var changed = [];
        var mask;

        if (maskIndex !== undefined && maskIndex !== null) {
            // Modify existing mask
            if (maskIndex > 0 && maskIndex <= layer.property("Masks").numProperties) {
                mask = layer.property("Masks").property(maskIndex);
            } else {
                throw new Error("Mask index out of bounds: " + maskIndex);
            }
            mask.property("Mask Path").setValue(myShape);
            changed.push("maskPath");
        } else {
            // Create new mask
            mask = layer.property("Masks").addProperty("Mask");
            mask.property("Mask Path").setValue(myShape);
            changed.push("newMask");
        }

        // Set mask mode
        var modes = {
            "none": MaskMode.NONE,
            "add": MaskMode.ADD,
            "subtract": MaskMode.SUBTRACT,
            "intersect": MaskMode.INTERSECT,
            "lighten": MaskMode.LIGHTEN,
            "darken": MaskMode.DARKEN,
            "difference": MaskMode.DIFFERENCE
        };
        if (modes[maskMode] !== undefined) {
            mask.maskMode = modes[maskMode];
            changed.push("maskMode");
        }

        if (maskFeather !== undefined && maskFeather !== null) {
            mask.property("Mask Feather").setValue(maskFeather);
            changed.push("maskFeather");
        }
        if (maskOpacity !== undefined && maskOpacity !== null) {
            mask.property("Mask Opacity").setValue(maskOpacity);
            changed.push("maskOpacity");
        }
        if (maskExpansion !== undefined && maskExpansion !== null) {
            mask.property("Mask Expansion").setValue(maskExpansion);
            changed.push("maskExpansion");
        }
        if (maskName) {
            mask.name = maskName;
            changed.push("maskName");
        }

        return JSON.stringify({
            status: "success",
            message: "Mask set successfully",
            layer: { name: layer.name, index: layer.index },
            mask: {
                name: mask.name,
                index: mask.propertyIndex,
                mode: maskMode,
                changedProperties: changed
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createSolidLayer (from createSolidLayer.jsx) ---
function createSolidLayer(args) {
    try {
        var compName = args.compName || "";
        var color = args.color || [1, 1, 1]; 
        var name = args.name || "Solid Layer";
        var position = args.position || [960, 540]; 
        var size = args.size; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var isAdjustment = args.isAdjustment || false; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        if (!size) { size = [comp.width, comp.height]; }
        var solidLayer;
        if (isAdjustment) {
            solidLayer = comp.layers.addSolid([0, 0, 0], name, size[0], size[1], 1);
            solidLayer.adjustmentLayer = true;
        } else {
            solidLayer = comp.layers.addSolid(color, name, size[0], size[1], 1);
        }
        solidLayer.property("Position").setValue(position);
        solidLayer.startTime = startTime;
        if (duration > 0) { solidLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: isAdjustment ? "Adjustment layer created successfully" : "Solid layer created successfully",
            layer: { name: solidLayer.name, index: solidLayer.index, type: isAdjustment ? "adjustment" : "solid", inPoint: solidLayer.inPoint, outPoint: solidLayer.outPoint, position: solidLayer.property("Position").value, isAdjustment: solidLayer.adjustmentLayer }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- setLayerProperties (modified to handle text properties) ---
function setLayerProperties(args) {
    try {
        var compName = args.compName || "";
        var layerName = args.layerName || "";
        var layerIndex = args.layerIndex; 
        
        // General Properties
        var position = args.position; 
        var scale = args.scale; 
        var rotation = args.rotation; 
        var opacity = args.opacity; 
        var startTime = args.startTime; 
        var duration = args.duration; 

        // Text Specific Properties
        var textContent = args.text; // New: text content
        var fontFamily = args.fontFamily; // New: font family
        var fontSize = args.fontSize; // New: font size
        var fillColor = args.fillColor; // New: font color
        
        // Find the composition (same logic as before)
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        
        // Find the layer (same logic as before)
        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); } 
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }
        
        var changedProperties = [];
        var textDocumentChanged = false;
        var textProp = null;
        var textDocument = null;

        // --- Text Property Handling ---
        if (layer instanceof TextLayer && (textContent !== undefined || fontFamily !== undefined || fontSize !== undefined || fillColor !== undefined)) {
            var sourceTextProp = layer.property("Source Text");
            if (sourceTextProp && sourceTextProp.value) {
                var currentTextDocument = sourceTextProp.value; // Get the current value
                var updated = false;

                if (textContent !== undefined && textContent !== null && currentTextDocument.text !== textContent) {
                    currentTextDocument.text = textContent;
                    changedProperties.push("text");
                    updated = true;
                }
                if (fontFamily !== undefined && fontFamily !== null && currentTextDocument.font !== fontFamily) {
                    // Add basic validation/logging for font existence if needed
                    // try { app.fonts.findFont(fontFamily); } catch (e) { logToPanel("Warning: Font '"+fontFamily+"' might not be installed."); }
                    currentTextDocument.font = fontFamily;
                    changedProperties.push("fontFamily");
                    updated = true;
                }
                if (fontSize !== undefined && fontSize !== null && currentTextDocument.fontSize !== fontSize) {
                    currentTextDocument.fontSize = fontSize;
                    changedProperties.push("fontSize");
                    updated = true;
                }
                // Comparing colors needs care due to potential floating point inaccuracies if set via UI
                // Simple comparison for now
                if (fillColor !== undefined && fillColor !== null && 
                    (currentTextDocument.fillColor[0] !== fillColor[0] || 
                     currentTextDocument.fillColor[1] !== fillColor[1] || 
                     currentTextDocument.fillColor[2] !== fillColor[2])) {
                    currentTextDocument.fillColor = fillColor;
                    changedProperties.push("fillColor");
                    updated = true;
                }

                // Only set the value if something actually changed
                if (updated) {
                    try {
                        sourceTextProp.setValue(currentTextDocument);
                        logToPanel("Applied changes to Text Document for layer: " + layer.name);
                    } catch (e) {
                        logToPanel("ERROR applying Text Document changes: " + e.toString());
                        // Decide if we should throw or just log the error for text properties
                        // For now, just log, other properties might still succeed
                    }
                }
                 // Store the potentially updated document for the return value
                 textDocument = currentTextDocument; 

            } else {
                logToPanel("Warning: Could not access Source Text property for layer: " + layer.name);
            }
        }

        // --- Enabled/Visible ---
        var enabled = args.enabled;
        if (enabled !== undefined && enabled !== null) { layer.enabled = !!enabled; changedProperties.push("enabled"); }

        // --- Blend Mode ---
        var blendMode = args.blendMode;
        if (blendMode !== undefined && blendMode !== null) {
            var modes = {
                "normal": BlendingMode.NORMAL,
                "add": BlendingMode.ADD,
                "multiply": BlendingMode.MULTIPLY,
                "screen": BlendingMode.SCREEN,
                "overlay": BlendingMode.OVERLAY,
                "softLight": BlendingMode.SOFT_LIGHT,
                "hardLight": BlendingMode.HARD_LIGHT,
                "colorDodge": BlendingMode.COLOR_DODGE,
                "colorBurn": BlendingMode.COLOR_BURN,
                "darken": BlendingMode.DARKEN,
                "lighten": BlendingMode.LIGHTEN,
                "difference": BlendingMode.DIFFERENCE,
                "exclusion": BlendingMode.EXCLUSION,
                "hue": BlendingMode.HUE,
                "saturation": BlendingMode.SATURATION,
                "color": BlendingMode.COLOR,
                "luminosity": BlendingMode.LUMINOSITY
            };
            if (modes[blendMode] !== undefined) {
                layer.blendingMode = modes[blendMode];
                changedProperties.push("blendMode");
            }
        }

        // --- Track Matte ---
        var trackMatteType = args.trackMatteType;
        if (trackMatteType !== undefined && trackMatteType !== null) {
            // Values: "none", "alpha", "alphaInverted", "luma", "lumaInverted"
            var matteTypes = {
                "none": TrackMatteType.NO_TRACK_MATTE,
                "alpha": TrackMatteType.ALPHA,
                "alphaInverted": TrackMatteType.ALPHA_INVERTED,
                "luma": TrackMatteType.LUMA,
                "lumaInverted": TrackMatteType.LUMA_INVERTED
            };
            if (matteTypes[trackMatteType] !== undefined) {
                layer.trackMatteType = matteTypes[trackMatteType];
                changedProperties.push("trackMatteType");
            }
        }

        // --- General Property Handling ---
        var threeDLayer = args.threeDLayer;
        if (threeDLayer !== undefined && threeDLayer !== null) { layer.threeDLayer = !!threeDLayer; changedProperties.push("threeDLayer"); }
        if (position !== undefined && position !== null) {
            var posProp = layer.property("Position");
            if (posProp.numKeys > 0) { while (posProp.numKeys > 0) { posProp.removeKey(1); } }
            posProp.setValue(position);
            changedProperties.push("position");
        }
        if (scale !== undefined && scale !== null) { layer.property("Scale").setValue(scale); changedProperties.push("scale"); }
        if (rotation !== undefined && rotation !== null) {
            if (layer.threeDLayer) { 
                // For 3D layers, Z rotation is often what's intended by a single value
                layer.property("Z Rotation").setValue(rotation);
            } else { 
                layer.property("Rotation").setValue(rotation); 
            }
            changedProperties.push("rotation");
        }
        if (opacity !== undefined && opacity !== null) { layer.property("Opacity").setValue(opacity); changedProperties.push("opacity"); }
        if (startTime !== undefined && startTime !== null) { layer.startTime = startTime; changedProperties.push("startTime"); }
        if (duration !== undefined && duration !== null && duration > 0) {
            var actualStartTime = (startTime !== undefined && startTime !== null) ? startTime : layer.startTime;
            layer.outPoint = actualStartTime + duration;
            changedProperties.push("duration");
        }

        // Return success with updated layer details (including text if changed)
        var returnLayerInfo = {
            name: layer.name,
            index: layer.index,
            threeDLayer: layer.threeDLayer,
            position: layer.property("Position").value,
            scale: layer.property("Scale").value,
            rotation: layer.threeDLayer ? layer.property("Z Rotation").value : layer.property("Rotation").value, // Return appropriate rotation
            opacity: layer.property("Opacity").value,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            changedProperties: changedProperties
        };
        // Add text properties to the return object if it was a text layer
        if (layer instanceof TextLayer && textDocument) {
            returnLayerInfo.text = textDocument.text;
            returnLayerInfo.fontFamily = textDocument.font;
            returnLayerInfo.fontSize = textDocument.fontSize;
            returnLayerInfo.fillColor = textDocument.fillColor;
        }

        // *** ADDED LOGGING HERE ***
        logToPanel("Final check before return:");
        logToPanel("  Changed Properties: " + changedProperties.join(", "));
        logToPanel("  Return Layer Info Font: " + (returnLayerInfo.fontFamily || "N/A")); 
        logToPanel("  TextDocument Font: " + (textDocument ? textDocument.font : "N/A"));

        return JSON.stringify({
            status: "success", message: "Layer properties updated successfully",
            layer: returnLayerInfo
        }, null, 2);
    } catch (error) {
        // Error handling remains similar, but add more specific checks if needed
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- batchSetLayerProperties: apply properties to multiple layers in one call ---
function batchSetLayerProperties(args) {
    try {
        var compName = args.compName || "";
        var operations = args.operations; // Array of {layerIndex, threeDLayer, position, scale, rotation, opacity, ...}

        if (!operations || !operations.length) {
            throw new Error("No operations provided. Pass an array of {layerIndex, ...properties}");
        }

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var results = [];
        for (var o = 0; o < operations.length; o++) {
            var op = operations[o];
            var layer = null;
            if (op.layerIndex !== undefined && op.layerIndex !== null) {
                if (op.layerIndex > 0 && op.layerIndex <= comp.numLayers) { layer = comp.layer(op.layerIndex); }
                else { results.push({ layerIndex: op.layerIndex, status: "error", message: "Layer index out of bounds" }); continue; }
            } else if (op.layerName) {
                for (var j = 1; j <= comp.numLayers; j++) {
                    if (comp.layer(j).name === op.layerName) { layer = comp.layer(j); break; }
                }
            }
            if (!layer) { results.push({ layerIndex: op.layerIndex, layerName: op.layerName, status: "error", message: "Layer not found" }); continue; }

            var changed = [];
            if (op.threeDLayer !== undefined && op.threeDLayer !== null) { layer.threeDLayer = !!op.threeDLayer; changed.push("threeDLayer"); }
            if (op.position !== undefined && op.position !== null) {
                var posProp = layer.property("Position");
                if (posProp.numKeys > 0) {
                    while (posProp.numKeys > 0) { posProp.removeKey(1); }
                }
                posProp.setValue(op.position);
                changed.push("position");
            }
            if (op.scale !== undefined && op.scale !== null) { layer.property("Scale").setValue(op.scale); changed.push("scale"); }
            if (op.rotation !== undefined && op.rotation !== null) {
                if (layer.threeDLayer) { layer.property("Z Rotation").setValue(op.rotation); }
                else { layer.property("Rotation").setValue(op.rotation); }
                changed.push("rotation");
            }
            if (op.opacity !== undefined && op.opacity !== null) { layer.property("Opacity").setValue(op.opacity); changed.push("opacity"); }
            if (op.blendMode !== undefined && op.blendMode !== null) {
                var bModes = {"normal":BlendingMode.NORMAL,"add":BlendingMode.ADD,"multiply":BlendingMode.MULTIPLY,"screen":BlendingMode.SCREEN,"overlay":BlendingMode.OVERLAY,"softLight":BlendingMode.SOFT_LIGHT,"hardLight":BlendingMode.HARD_LIGHT,"darken":BlendingMode.DARKEN,"lighten":BlendingMode.LIGHTEN,"difference":BlendingMode.DIFFERENCE};
                if (bModes[op.blendMode] !== undefined) { layer.blendingMode = bModes[op.blendMode]; changed.push("blendMode"); }
            }
            if (op.startTime !== undefined && op.startTime !== null) { layer.startTime = op.startTime; changed.push("startTime"); }
            if (op.outPoint !== undefined && op.outPoint !== null) { layer.outPoint = op.outPoint; changed.push("outPoint"); }

            results.push({
                layerIndex: layer.index,
                name: layer.name,
                status: "success",
                threeDLayer: layer.threeDLayer,
                position: layer.property("Position").value,
                changedProperties: changed
            });
        }

        return JSON.stringify({ status: "success", results: results }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

/**
 * Sets a keyframe for a specific property on a layer.
 * Indices are 1-based for After Effects collections.
 * @param {number} compIndex - The index of the composition (1-based).
 * @param {number} layerIndex - The index of the layer within the composition (1-based).
 * @param {string} propertyName - The name of the property (e.g., "Position", "Scale", "Rotation", "Opacity").
 * @param {number} timeInSeconds - The time (in seconds) for the keyframe.
 * @param {any} value - The value for the keyframe (e.g., [x, y] for Position, [w, h] for Scale, angle for Rotation, percentage for Opacity).
 * @returns {string} JSON string indicating success or error.
 */
function setLayerKeyframe(compIndex, layerIndex, propertyName, timeInSeconds, value) {
    try {
        // Use 1-based indices as per After Effects API
        var comp = app.project.items[compIndex];
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + compIndex });
        }
        var layer = comp.layers[layerIndex];
        if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'"});
        }

        var transformGroup = layer.property("Transform");
        if (!transformGroup) {
             return JSON.stringify({ success: false, message: "Transform properties not found for layer '" + layer.name + "' (type: " + layer.matchName + ")." });
        }

        var property = transformGroup.property(propertyName);
        if (!property) {
            // Check other common property groups if not in Transform
             if (layer.property("Effects") && layer.property("Effects").property(propertyName)) {
                 property = layer.property("Effects").property(propertyName);
             } else if (layer.property("Text") && layer.property("Text").property(propertyName)) {
                 property = layer.property("Text").property(propertyName);
            } // Add more groups if needed (e.g., Masks, Shapes)

            if (!property) {
                 return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
            }
        }


        // Ensure the property can be keyframed
        if (!property.canVaryOverTime) {
             return JSON.stringify({ success: false, message: "Property '" + propertyName + "' cannot be keyframed." });
        }

        // Make sure the property is enabled for keyframing
        if (property.numKeys === 0 && !property.isTimeVarying) {
             property.setValueAtTime(comp.time, property.value); // Set initial keyframe if none exist
        }


        property.setValueAtTime(timeInSeconds, value);

        return JSON.stringify({ success: true, message: "Keyframe set for '" + propertyName + "' on layer '" + layer.name + "' at " + timeInSeconds + "s." });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting keyframe: " + e.toString() + " (Line: " + e.line + ")" });
    }
}


// --- Expression property resolution helpers ---

// Shorthand names for the properties expressions are applied to most often.
var EXPRESSION_PROPERTY_SHORTCUTS = {
    "position": "ADBE Position",
    "scale": "ADBE Scale",
    "rotation": "ADBE Rotate Z",
    "opacity": "ADBE Opacity",
    "anchor point": "ADBE Anchor Point",
    "anchorpoint": "ADBE Anchor Point"
};

// Recursively search a property group for a property matching by matchName or display name.
function findPropertyInTree(group, name) {
    for (var i = 1; i <= group.numProperties; i++) {
        var prop = group.property(i);
        if (prop.matchName === name || prop.name === name) return prop;
        if (prop.propertyType === PropertyType.INDEXED_GROUP ||
            prop.propertyType === PropertyType.NAMED_GROUP) {
            var found = findPropertyInTree(prop, name);
            if (found) return found;
        }
    }
    return null;
}

// Resolve a property on a layer either by an exact path (array of names/matchNames,
// walked down one level at a time - use this to disambiguate, e.g. a Blurriness
// param on one of several applied effects), or by a single name/matchName searched
// anywhere in the layer's property tree (transform shortcuts checked first).
function resolveLayerProperty(layer, propertyName, propertyPath) {
    if (propertyPath && propertyPath.length) {
        var current = layer;
        for (var i = 0; i < propertyPath.length; i++) {
            current = current.property(propertyPath[i]);
            if (!current) return null;
        }
        return current;
    }

    var shortcut = EXPRESSION_PROPERTY_SHORTCUTS[String(propertyName).toLowerCase()];
    if (shortcut) {
        var xf = layer.property("ADBE Transform Group");
        var byShortcut = xf ? xf.property(shortcut) : null;
        if (byShortcut) return byShortcut;
    }

    return findPropertyInTree(layer, propertyName);
}

// expressionError is only populated once AE actually evaluates the expression -
// reading a property's value forces that evaluation so the error is up to date.
function forceExpressionEvaluation(property) {
    try { var v = property.value; } catch (e) { /* evaluation failure surfaces via expressionError */ }
}

/**
 * Sets, removes, and/or enables/disables an expression on a specific layer property.
 * @param {number} compIndex - The index of the composition (1-based).
 * @param {number} layerIndex - The index of the layer within the composition (1-based).
 * @param {string} propertyName - Name or matchName of the property (e.g. "Opacity"). Searched
 *   across the whole property tree (transform, effects, text, masks, layer styles, etc.).
 * @param {string} [expressionString] - The JavaScript expression string. Use "" to remove the
 *   expression. Omit to leave the current expression text untouched (e.g. when only toggling `enabled`).
 * @param {string[]} [propertyPath] - Exact path (e.g. ["Effects", "Gaussian Blur", "Blurriness"])
 *   to disambiguate when propertyName alone could match more than one property.
 * @param {boolean} [enabled] - Enable or disable the expression without changing its text.
 * @returns {string} JSON string with success/error plus the resulting expression state.
 */
function setLayerExpression(compIndex, layerIndex, propertyName, expressionString, propertyPath, enabled) {
    try {
        var comp = app.project.items[compIndex];
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + compIndex });
        }
        var layer = comp.layers[layerIndex];
        if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'" });
        }

        var property = resolveLayerProperty(layer, propertyName, propertyPath);
        if (!property) {
            return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
        }
        if (!property.canSetExpression) {
            return JSON.stringify({ success: false, message: "Property '" + property.name + "' does not support expressions." });
        }

        var actions = [];
        if (typeof expressionString === "string") {
            property.expression = expressionString;
            actions.push(expressionString === "" ? "removed" : "set");
        }
        if (typeof enabled === "boolean" && property.expression !== "") {
            property.expressionEnabled = enabled;
            actions.push(enabled ? "enabled" : "disabled");
        }
        if (actions.length === 0) {
            return JSON.stringify({ success: false, message: "Nothing to do: provide expressionString and/or enabled." });
        }

        forceExpressionEvaluation(property);

        return JSON.stringify({
            success: true,
            message: "Expression " + actions.join(" and ") + " for '" + property.name + "' on layer '" + layer.name + "'.",
            property: property.name,
            matchName: property.matchName,
            expression: property.expression,
            expressionEnabled: property.expression !== "" ? property.expressionEnabled : false,
            expressionError: property.expression !== "" ? property.expressionError : ""
        });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting expression: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

/**
 * Lists every expression-capable property on a layer along with its current
 * expression text, enabled state, and error (if any) - for discovering what can be
 * targeted and for checking/fixing what is already applied.
 * @param {number} compIndex - The index of the composition (1-based).
 * @param {number} layerIndex - The index of the layer within the composition (1-based).
 * @returns {string} JSON string with the layer's expression-capable properties.
 */
function getLayerExpressions(compIndex, layerIndex) {
    try {
        var comp = app.project.items[compIndex];
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + compIndex });
        }
        var layer = comp.layers[layerIndex];
        if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'" });
        }

        var properties = [];

        function walk(group, path) {
            for (var i = 1; i <= group.numProperties; i++) {
                var prop = group.property(i);
                var propPath = path ? (path + " > " + prop.name) : prop.name;
                if (prop.propertyType === PropertyType.PROPERTY) {
                    if (prop.canSetExpression) {
                        var hasExpression = prop.expression !== "";
                        if (hasExpression) forceExpressionEvaluation(prop);
                        properties.push({
                            path: propPath,
                            matchName: prop.matchName,
                            hasExpression: hasExpression,
                            expression: prop.expression,
                            expressionEnabled: hasExpression ? prop.expressionEnabled : false,
                            expressionError: hasExpression ? prop.expressionError : ""
                        });
                    }
                } else if (prop.propertyType === PropertyType.INDEXED_GROUP ||
                           prop.propertyType === PropertyType.NAMED_GROUP) {
                    walk(prop, propPath);
                }
            }
        }

        walk(layer, "");

        return JSON.stringify({ success: true, layer: layer.name, properties: properties });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error getting layer expressions: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

/**
 * Scans for expression errors and disabled expressions across the whole project,
 * a single composition, or a single layer.
 * @param {Object} args
 * @param {string} [args.scope="project"] - "project", "comp", or "layer".
 * @param {number} [args.compIndex] - Required for scope "comp" or "layer" (1-based).
 * @param {number} [args.layerIndex] - Required for scope "layer" (1-based).
 * @returns {string} JSON string with totals plus errors[] and disabled[] lists.
 */
function getExpressionErrors(args) {
    try {
        args = args || {};
        var scope = args.scope || "project";
        var result = { totalExpressions: 0, totalErrors: 0, totalDisabled: 0, errors: [], disabled: [] };

        function scanProperties(propertyGroup, compName, layerName, path) {
            for (var i = 1; i <= propertyGroup.numProperties; i++) {
                var prop = propertyGroup.property(i);
                if (prop.propertyType === PropertyType.PROPERTY) {
                    if (prop.canSetExpression && prop.expression !== "") {
                        result.totalExpressions++;
                        forceExpressionEvaluation(prop);
                        if (!prop.expressionEnabled) {
                            result.totalDisabled++;
                            result.disabled.push({
                                comp: compName,
                                layer: layerName,
                                property: path + " > " + prop.name,
                                matchName: prop.matchName
                            });
                        } else if (prop.expressionError !== "") {
                            result.totalErrors++;
                            result.errors.push({
                                comp: compName,
                                layer: layerName,
                                property: path + " > " + prop.name,
                                matchName: prop.matchName,
                                error: prop.expressionError,
                                expression: prop.expression.substring(0, 200)
                            });
                        }
                    }
                } else if (prop.propertyType === PropertyType.INDEXED_GROUP ||
                           prop.propertyType === PropertyType.NAMED_GROUP) {
                    scanProperties(prop, compName, layerName, path + " > " + prop.name);
                }
            }
        }

        function scanComp(comp) {
            for (var j = 1; j <= comp.numLayers; j++) {
                var layer = comp.layer(j);
                scanProperties(layer, comp.name, layer.name, "");
            }
        }

        if (scope === "project") {
            for (var i = 1; i <= app.project.numItems; i++) {
                var item = app.project.item(i);
                if (item instanceof CompItem) scanComp(item);
            }
        } else if (scope === "comp" || scope === "layer") {
            var comp = app.project.items[args.compIndex];
            if (!comp || !(comp instanceof CompItem)) {
                return JSON.stringify({ success: false, message: "Composition not found at index " + args.compIndex });
            }
            if (scope === "comp") {
                scanComp(comp);
            } else {
                var layer = comp.layers[args.layerIndex];
                if (!layer) {
                    return JSON.stringify({ success: false, message: "Layer not found at index " + args.layerIndex + " in composition '" + comp.name + "'" });
                }
                scanProperties(layer, comp.name, layer.name, "");
            }
        } else {
            return JSON.stringify({ success: false, message: "Invalid scope '" + scope + "'. Use 'project', 'comp', or 'layer'." });
        }

        result.success = true;
        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error scanning expression errors: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

// --- Essential Graphics panel helpers ---
// AE only lets a Checkbox, Color, single-value numerical Slider (e.g. Opacity, Slider Control),
// or Source Text property be exposed here (canAddToMotionGraphicsTemplate enforces this) - and
// there is no scripting API to remove an entry once added; that has to be done by hand in the
// panel (or by deleting the underlying property in the Timeline).

/**
 * Adds a layer property to the Essential Graphics panel for a composition.
 * @param {Object} args
 * @param {number} args.compIndex - 1-based composition index.
 * @param {number} args.layerIndex - 1-based layer index within the composition.
 * @param {string} args.propertyName - Name or matchName of the property to expose.
 * @param {string[]} [args.propertyPath] - Exact path to disambiguate, as in setLayerExpression.
 * @param {string} [args.displayName] - Custom name to show in the Essential Graphics panel.
 * @returns {string} JSON string with success/error plus the resulting EGP state.
 */
function addToEssentialGraphics(args) {
    try {
        var comp = app.project.items[args.compIndex];
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + args.compIndex });
        }
        var layer = comp.layers[args.layerIndex];
        if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + args.layerIndex + " in composition '" + comp.name + "'" });
        }

        var property = resolveLayerProperty(layer, args.propertyName, args.propertyPath);
        if (!property) {
            return JSON.stringify({ success: false, message: "Property '" + args.propertyName + "' not found on layer '" + layer.name + "'." });
        }
        if (!property.canAddToMotionGraphicsTemplate(comp)) {
            return JSON.stringify({ success: false, message: "Property '" + property.name + "' can't be added to Essential Graphics - only a Checkbox, Color, single-value numerical Slider, or Source Text property is supported, and it may already have been added." });
        }

        var added = (typeof args.displayName === "string" && args.displayName !== "")
            ? property.addToMotionGraphicsTemplateAs(comp, args.displayName)
            : property.addToMotionGraphicsTemplate(comp);

        if (!added) {
            return JSON.stringify({ success: false, message: "After Effects declined to add '" + property.name + "' to Essential Graphics." });
        }

        return JSON.stringify({
            success: true,
            message: "Added '" + property.name + "' on layer '" + layer.name + "' to the Essential Graphics panel for '" + comp.name + "'.",
            property: property.name,
            matchName: property.matchName,
            controllerCount: comp.motionGraphicsTemplateControllerCount
        });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error adding to Essential Graphics: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

/**
 * Lists the Essential Graphics panel's template name and every property currently exposed
 * for a composition.
 * @param {Object} args
 * @param {number} args.compIndex - 1-based composition index.
 * @returns {string} JSON string with the template name and an array of {index, name}.
 */
function getEssentialGraphics(args) {
    try {
        var comp = app.project.items[args.compIndex];
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + args.compIndex });
        }

        var properties = [];
        var count = comp.motionGraphicsTemplateControllerCount;
        for (var i = 1; i <= count; i++) {
            properties.push({ index: i, name: comp.getMotionGraphicsTemplateControllerName(i) });
        }

        return JSON.stringify({
            success: true,
            comp: comp.name,
            templateName: comp.motionGraphicsTemplateName,
            controllerCount: count,
            properties: properties
        });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error getting Essential Graphics info: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

/**
 * Renames an existing Essential Graphics entry and/or sets the composition's Motion Graphics
 * template name (used as the exported .mogrt filename).
 * @param {Object} args
 * @param {number} args.compIndex - 1-based composition index.
 * @param {number} [args.controllerIndex] - 1-based index (see getEssentialGraphics) of the entry to rename.
 * @param {string} [args.newName] - New display name for that entry. Required together with controllerIndex.
 * @param {string} [args.templateName] - New Motion Graphics template (.mogrt) name for the composition.
 * @returns {string} JSON string with success/error plus the resulting EGP state.
 */
function setEssentialGraphicsProperty(args) {
    try {
        var comp = app.project.items[args.compIndex];
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + args.compIndex });
        }

        var actions = [];
        if (typeof args.templateName === "string") {
            comp.motionGraphicsTemplateName = args.templateName;
            actions.push("template name set to '" + args.templateName + "'");
        }
        if (args.controllerIndex !== undefined && args.controllerIndex !== null && typeof args.newName === "string") {
            comp.setMotionGraphicsControllerName(args.controllerIndex, args.newName);
            actions.push("property " + args.controllerIndex + " renamed to '" + args.newName + "'");
        }
        if (actions.length === 0) {
            return JSON.stringify({ success: false, message: "Nothing to do: provide templateName, and/or controllerIndex together with newName." });
        }

        return JSON.stringify({
            success: true,
            message: actions.join("; ") + ".",
            comp: comp.name,
            templateName: comp.motionGraphicsTemplateName,
            controllerCount: comp.motionGraphicsTemplateControllerCount
        });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting Essential Graphics property: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

// --- applyEffect (from applyEffect.jsx) ---
function applyEffect(args) {
    try {
        // Extract parameters
        var compIndex = args.compIndex || 1; // Default to first comp
        var layerIndex = args.layerIndex || 1; // Default to first layer
        var effectName = args.effectName; // Name of the effect to apply
        var effectMatchName = args.effectMatchName; // After Effects internal name (more reliable)
        var effectCategory = args.effectCategory || ""; // Optional category for filtering
        var presetPath = args.presetPath; // Optional path to an effect preset
        var effectSettings = args.effectSettings || {}; // Optional effect parameters
        
        if (!effectName && !effectMatchName && !presetPath) {
            throw new Error("You must specify either effectName, effectMatchName, or presetPath");
        }
        
        // Find the composition by index
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        
        // Find the layer by index
        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }
        
        var effectResult;
        
        // Apply preset if a path is provided
        if (presetPath) {
            var presetFile = new File(presetPath);
            if (!presetFile.exists) {
                throw new Error("Effect preset file not found: " + presetPath);
            }
            
            // Apply the preset to the layer
            layer.applyPreset(presetFile);
            effectResult = {
                type: "preset",
                name: presetPath.split('/').pop().split('\\').pop(),
                applied: true
            };
        }
        // Apply effect by match name (more reliable method)
        else if (effectMatchName) {
            var effect = layer.Effects.addProperty(effectMatchName);
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex
            };
            
            // Apply settings if provided
            applyEffectSettings(effect, effectSettings);
        }
        // Apply effect by display name
        else {
            // Get the effect from the Effect menu
            var effect = layer.Effects.addProperty(effectName);
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex
            };
            
            // Apply settings if provided
            applyEffectSettings(effect, effectSettings);
        }
        
        return JSON.stringify({
            status: "success",
            message: "Effect applied successfully",
            effect: effectResult,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                index: compIndex
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

// Helper function to apply effect settings
function applyEffectSettings(effect, settings) {
    // Skip if no settings are provided
    if (!settings) return;
    var hasKeys = false;
    for (var k in settings) { if (settings.hasOwnProperty(k)) { hasKeys = true; break; } }
    if (!hasKeys) return;
    
    // Iterate through all provided settings
    for (var propName in settings) {
        if (settings.hasOwnProperty(propName)) {
            try {
                // Find the property in the effect
                var property = null;
                
                // Try direct property access first
                try {
                    property = effect.property(propName);
                } catch (e) {
                    // If direct access fails, search through all properties
                    for (var i = 1; i <= effect.numProperties; i++) {
                        var prop = effect.property(i);
                        if (prop.name === propName) {
                            property = prop;
                            break;
                        }
                    }
                }
                
                // Set the property value if found
                if (property && property.setValue) {
                    property.setValue(settings[propName]);
                }
            } catch (e) {
                // Log error but continue with other properties
                $.writeln("Error setting effect property '" + propName + "': " + e.toString());
            }
        }
    }
}

// --- applyEffectTemplate (from applyEffectTemplate.jsx) ---
function applyEffectTemplate(args) {
    try {
        // Extract parameters
        var compIndex = args.compIndex || 1; // Default to first comp
        var layerIndex = args.layerIndex || 1; // Default to first layer
        var templateName = args.templateName; // Name of the template to apply
        var customSettings = args.customSettings || {}; // Optional customizations
        
        if (!templateName) {
            throw new Error("You must specify a templateName");
        }
        
        // Find the composition by index
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        
        // Find the layer by index
        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }
        
        // Template definitions
        var templates = {
            // Blur effects
            "gaussian-blur": {
                effectMatchName: "ADBE Gaussian Blur 2",
                settings: {
                    "Blurriness": customSettings.blurriness || 20
                }
            },
            "directional-blur": {
                effectMatchName: "ADBE Directional Blur",
                settings: {
                    "Direction": customSettings.direction || 0,
                    "Blur Length": customSettings.length || 10
                }
            },
            
            // Color correction effects
            "color-balance": {
                effectMatchName: "ADBE Color Balance (HLS)",
                settings: {
                    "Hue": customSettings.hue || 0,
                    "Lightness": customSettings.lightness || 0,
                    "Saturation": customSettings.saturation || 0
                }
            },
            "brightness-contrast": {
                effectMatchName: "ADBE Brightness & Contrast 2",
                settings: {
                    "Brightness": customSettings.brightness || 0,
                    "Contrast": customSettings.contrast || 0,
                    "Use Legacy": false
                }
            },
            "curves": {
                effectMatchName: "ADBE CurvesCustom",
                // Curves are complex and would need special handling
            },
            
            // Stylistic effects
            "glow": {
                effectMatchName: "ADBE Glow",
                settings: {
                    "Glow Threshold": customSettings.threshold || 50,
                    "Glow Radius": customSettings.radius || 15,
                    "Glow Intensity": customSettings.intensity || 1
                }
            },
            "drop-shadow": {
                effectMatchName: "ADBE Drop Shadow",
                settings: {
                    "Shadow Color": customSettings.color || [0, 0, 0, 1],
                    "Opacity": customSettings.opacity || 50,
                    "Direction": customSettings.direction || 135,
                    "Distance": customSettings.distance || 10,
                    "Softness": customSettings.softness || 10
                }
            },
            
            // Common effect chains
            "cinematic-look": {
                effects: [
                    {
                        effectMatchName: "ADBE CurvesCustom",
                        settings: {}
                    },
                    {
                        effectMatchName: "ADBE Vibrance",
                        settings: {
                            "Vibrance": 15,
                            "Saturation": -5
                        }
                    }
                ]
            },
            "text-pop": {
                effects: [
                    {
                        effectMatchName: "ADBE Drop Shadow",
                        settings: {
                            "Shadow Color": [0, 0, 0, 1],
                            "Opacity": 75,
                            "Distance": 5,
                            "Softness": 10
                        }
                    },
                    {
                        effectMatchName: "ADBE Glow",
                        settings: {
                            "Glow Threshold": 50,
                            "Glow Radius": 10,
                            "Glow Intensity": 1.5
                        }
                    }
                ]
            }
        };
        
        // Check if the requested template exists
        var template = templates[templateName];
        if (!template) {
            var availableTemplates = Object.keys(templates).join(", ");
            throw new Error("Template '" + templateName + "' not found. Available templates: " + availableTemplates);
        }
        
        var appliedEffects = [];
        
        // Apply single effect or multiple effects based on template structure
        if (template.effectMatchName) {
            // Single effect template
            var effect = layer.Effects.addProperty(template.effectMatchName);
            
            // Apply settings
            for (var propName in template.settings) {
                try {
                    var property = effect.property(propName);
                    if (property) {
                        property.setValue(template.settings[propName]);
                    }
                } catch (e) {
                    $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                }
            }
            
            appliedEffects.push({
                name: effect.name,
                matchName: effect.matchName
            });
        } else if (template.effects) {
            // Multiple effects template
            for (var i = 0; i < template.effects.length; i++) {
                var effectData = template.effects[i];
                var effect = layer.Effects.addProperty(effectData.effectMatchName);
                
                // Apply settings
                for (var propName in effectData.settings) {
                    try {
                        var property = effect.property(propName);
                        if (property) {
                            property.setValue(effectData.settings[propName]);
                        }
                    } catch (e) {
                        $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                    }
                }
                
                appliedEffects.push({
                    name: effect.name,
                    matchName: effect.matchName
                });
            }
        }
        
        return JSON.stringify({
            status: "success",
            message: "Effect template '" + templateName + "' applied successfully",
            appliedEffects: appliedEffects,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                index: compIndex
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

// --- End of Function Definitions ---

// --- Bridge test function to verify communication and effects application ---
function bridgeTestEffects(args) {
    try {
        var compIndex = (args && args.compIndex) ? args.compIndex : 1;
        var layerIndex = (args && args.layerIndex) ? args.layerIndex : 1;

        // Apply a light Gaussian Blur
        var blurRes = JSON.parse(applyEffect({
            compIndex: compIndex,
            layerIndex: layerIndex,
            effectMatchName: "ADBE Gaussian Blur 2",
            effectSettings: { "Blurriness": 5 }
        }));

        // Apply a simple drop shadow via template
        var shadowRes = JSON.parse(applyEffectTemplate({
            compIndex: compIndex,
            layerIndex: layerIndex,
            templateName: "drop-shadow"
        }));

        return JSON.stringify({
            status: "success",
            message: "Bridge test effects applied.",
            results: [blurRes, shadowRes]
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", message: e.toString() }, null, 2);
    }
}

// JSON polyfill for ExtendScript (when JSON is undefined)
if (typeof JSON === "undefined") {
    JSON = {};
}
if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
        // Safe-ish fallback for trusted input (our own command file)
        return eval("(" + text + ")");
    };
}
if (typeof JSON.stringify !== "function") {
    (function () {
        function esc(str) {
            return (str + "")
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t");
        }
        function toJSON(val) {
            if (val === null) return "null";
            var t = typeof val;
            if (t === "number" || t === "boolean") return String(val);
            if (t === "string") return '"' + esc(val) + '"';
            if (val instanceof Array) {
                var a = [];
                for (var i = 0; i < val.length; i++) a.push(toJSON(val[i]));
                return "[" + a.join(",") + "]";
            }
            if (t === "object") {
                var props = [];
                for (var k in val) {
                    if (val.hasOwnProperty(k) && typeof val[k] !== "function" && typeof val[k] !== "undefined") {
                        props.push('"' + esc(k) + '":' + toJSON(val[k]));
                    }
                }
                return "{" + props.join(",") + "}";
            }
            return "null";
        }
        JSON.stringify = function (value, _replacer, _space) {
            return toJSON(value);
        };
    })();
}

// Panel UI state, kept on $.global rather than as plain script-level vars. The reload link
// further down re-evaluates this whole file via $.evalFile from inside a button handler, and
// ExtendScript's `eval` can shadow top-level var/function redeclarations into that handler's
// own local scope instead of updating the true globals - so a script-level `var panel` could
// silently fail to reach the panel logToPanel/checkForCommands already use. $.global properties
// don't have that ambiguity: every scope reads and writes the exact same shared object.
$.global.mcpBridge = $.global.mcpBridge || {};
var mcpBridge = $.global.mcpBridge;

// Check interval (ms)
var checkInterval = 2000;
var isChecking = false;

// Command file path - use Documents folder for reliable access
function getCommandFilePath() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    return bridgeFolder.fsName + "/ae_command.json";
}

// Result file path - use Documents folder for reliable access
function getResultFilePath() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    return bridgeFolder.fsName + "/ae_mcp_result.json";
}

// --- setCompositionProperties: set duration, frameRate, etc. on active or named comp ---
function setCompositionProperties(args) {
    try {
        var compName = args.compName || "";
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var changed = [];
        if (args.duration !== undefined && args.duration !== null) { comp.duration = args.duration; changed.push("duration"); }
        if (args.frameRate !== undefined && args.frameRate !== null) { comp.frameRate = args.frameRate; changed.push("frameRate"); }
        if (args.width !== undefined && args.width !== null && args.height !== undefined && args.height !== null) {
            comp.width = args.width; comp.height = args.height; changed.push("dimensions");
        }
        return JSON.stringify({
            status: "success",
            composition: { name: comp.name, duration: comp.duration, frameRate: comp.frameRate, width: comp.width, height: comp.height },
            changedProperties: changed
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// Functions for each script type
function getProjectInfo() {
    var project = app.project;
    var result = {
        projectName: project.file ? project.file.name : "Untitled Project",
        path: project.file ? project.file.fsName : "",
        numItems: project.numItems,
        bitsPerChannel: project.bitsPerChannel,
        timeMode: project.timeDisplayType === TimeDisplayType.FRAMES ? "Frames" : "Timecode",
        items: []
    };

    // Count item types
    var countByType = {
        compositions: 0,
        footage: 0,
        folders: 0,
        solids: 0
    };

    // Get item information (limited for performance)
    for (var i = 1; i <= Math.min(project.numItems, 50); i++) {
        var item = project.item(i);
        var itemType = "";
        
        if (item instanceof CompItem) {
            itemType = "Composition";
            countByType.compositions++;
        } else if (item instanceof FolderItem) {
            itemType = "Folder";
            countByType.folders++;
        } else if (item instanceof FootageItem) {
            if (item.mainSource instanceof SolidSource) {
                itemType = "Solid";
                countByType.solids++;
            } else {
                itemType = "Footage";
                countByType.footage++;
            }
        }
        
        result.items.push({
            id: item.id,
            name: item.name,
            type: itemType
        });
    }
    
    result.itemCounts = countByType;

    // Include active composition metadata if available
    if (app.project.activeItem instanceof CompItem) {
        var ac = app.project.activeItem;
        result.activeComp = {
            id: ac.id,
            name: ac.name,
            width: ac.width,
            height: ac.height,
            duration: ac.duration,
            frameRate: ac.frameRate,
            numLayers: ac.numLayers
        };
    }

    return JSON.stringify(result, null, 2);
}

function listCompositions() {
    var project = app.project;
    var result = {
        compositions: []
    };
    
    // Loop through items in the project
    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);
        
        // Check if the item is a composition
        if (item instanceof CompItem) {
            result.compositions.push({
                id: item.id,
                name: item.name,
                duration: item.duration,
                frameRate: item.frameRate,
                width: item.width,
                height: item.height,
                numLayers: item.numLayers
            });
        }
    }
    
    return JSON.stringify(result, null, 2);
}

function getLayerInfo() {
    var project = app.project;
    var result = {
        layers: []
    };
    
    // Get the active composition
    var activeComp = null;
    if (app.project.activeItem instanceof CompItem) {
        activeComp = app.project.activeItem;
    } else {
        return JSON.stringify({ error: "No active composition" }, null, 2);
    }
    
    // Loop through layers in the active composition
    for (var i = 1; i <= activeComp.numLayers; i++) {
        var layer = activeComp.layer(i);
        var layerInfo = {
            index: layer.index,
            name: layer.name,
            enabled: layer.enabled,
            locked: layer.locked,
            threeDLayer: layer.threeDLayer,
            position: layer.property("Position").value,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint
        };
        
        result.layers.push(layerInfo);
    }
    
    return JSON.stringify(result, null, 2);
}

// Execute command
function executeCommand(command, args) {
    var result = "";

    logToPanel("Executing command: " + command);
    mcpBridge.statusText.text = "Running: " + command;
    // .update() only exists on a floating Window, not a docked Panel - only the former needs
    // an explicit repaint anyway.
    if (mcpBridge.panel instanceof Window) mcpBridge.panel.update();

    try {
        logToPanel("Attempting to execute: " + command); // Log before switch
        // Use a switch statement for clarity
        switch (command) {
            case "getProjectInfo":
                result = getProjectInfo();
                break;
            case "listCompositions":
                result = listCompositions();
                break;
            case "getLayerInfo":
                result = getLayerInfo();
                break;
            case "createComposition":
                logToPanel("Calling createComposition function...");
                result = createComposition(args);
                logToPanel("Returned from createComposition.");
                break;
            case "createTextLayer":
                logToPanel("Calling createTextLayer function...");
                result = createTextLayer(args);
                logToPanel("Returned from createTextLayer.");
                break;
            case "createShapeLayer":
                logToPanel("Calling createShapeLayer function...");
                result = createShapeLayer(args);
                logToPanel("Returned from createShapeLayer. Result type: " + typeof result);
                break;
            case "createSolidLayer":
                logToPanel("Calling createSolidLayer function...");
                result = createSolidLayer(args);
                logToPanel("Returned from createSolidLayer.");
                break;
            case "setLayerProperties":
                logToPanel("Calling setLayerProperties function...");
                result = setLayerProperties(args);
                logToPanel("Returned from setLayerProperties.");
                break;
            case "setLayerKeyframe":
                logToPanel("Calling setLayerKeyframe function...");
                result = setLayerKeyframe(args.compIndex, args.layerIndex, args.propertyName, args.timeInSeconds, args.value);
                logToPanel("Returned from setLayerKeyframe.");
                break;
            case "setLayerExpression":
                logToPanel("Calling setLayerExpression function...");
                result = setLayerExpression(args.compIndex, args.layerIndex, args.propertyName, args.expressionString, args.propertyPath, args.enabled);
                logToPanel("Returned from setLayerExpression.");
                break;
            case "getLayerExpressions":
                logToPanel("Calling getLayerExpressions function...");
                result = getLayerExpressions(args.compIndex, args.layerIndex);
                logToPanel("Returned from getLayerExpressions.");
                break;
            case "getExpressionErrors":
                logToPanel("Calling getExpressionErrors function...");
                result = getExpressionErrors(args);
                logToPanel("Returned from getExpressionErrors.");
                break;
            case "addToEssentialGraphics":
                logToPanel("Calling addToEssentialGraphics function...");
                result = addToEssentialGraphics(args);
                logToPanel("Returned from addToEssentialGraphics.");
                break;
            case "getEssentialGraphics":
                logToPanel("Calling getEssentialGraphics function...");
                result = getEssentialGraphics(args);
                logToPanel("Returned from getEssentialGraphics.");
                break;
            case "setEssentialGraphicsProperty":
                logToPanel("Calling setEssentialGraphicsProperty function...");
                result = setEssentialGraphicsProperty(args);
                logToPanel("Returned from setEssentialGraphicsProperty.");
                break;
            case "applyEffect":
                logToPanel("Calling applyEffect function...");
                result = applyEffect(args);
                logToPanel("Returned from applyEffect.");
                break;
            case "applyEffectTemplate":
                logToPanel("Calling applyEffectTemplate function...");
                result = applyEffectTemplate(args);
                logToPanel("Returned from applyEffectTemplate.");
                break;
            case "bridgeTestEffects":
                logToPanel("Calling bridgeTestEffects function...");
                result = bridgeTestEffects(args);
                logToPanel("Returned from bridgeTestEffects.");
                break;
            case "createCamera":
                logToPanel("Calling createCamera function...");
                result = createCamera(args);
                logToPanel("Returned from createCamera.");
                break;
            case "batchSetLayerProperties":
                logToPanel("Calling batchSetLayerProperties function...");
                result = batchSetLayerProperties(args);
                logToPanel("Returned from batchSetLayerProperties.");
                break;
            case "setCompositionProperties":
                logToPanel("Calling setCompositionProperties function...");
                result = setCompositionProperties(args);
                logToPanel("Returned from setCompositionProperties.");
                break;
            case "duplicateLayer":
                logToPanel("Calling duplicateLayer function...");
                result = duplicateLayer(args);
                logToPanel("Returned from duplicateLayer.");
                break;
            case "deleteLayer":
                logToPanel("Calling deleteLayer function...");
                result = deleteLayer(args);
                logToPanel("Returned from deleteLayer.");
                break;
            case "setLayerMask":
                logToPanel("Calling setLayerMask function...");
                result = setLayerMask(args);
                logToPanel("Returned from setLayerMask.");
                break;
            default:
                result = JSON.stringify({ error: "Unknown command: " + command });
        }
        logToPanel("Execution finished for: " + command); // Log after switch
        
        // Save the result (ensure result is always a string)
        logToPanel("Preparing to write result file...");
        var resultString = (typeof result === 'string') ? result : JSON.stringify(result);
        
        // Try to parse the result as JSON to add a timestamp
        try {
            var resultObj = JSON.parse(resultString);
            // Add a timestamp to help identify if we're getting fresh results
            resultObj._responseTimestamp = new Date().toISOString();
            resultObj._commandExecuted = command;
            resultString = JSON.stringify(resultObj, null, 2);
            logToPanel("Added timestamp to result JSON for tracking freshness.");
        } catch (parseError) {
            // If it's not valid JSON, append the timestamp as a comment
            logToPanel("Could not parse result as JSON to add timestamp: " + parseError.toString());
            // We'll still continue with the original string
        }
        
        var resultFile = new File(getResultFilePath());
        resultFile.encoding = "UTF-8"; // Ensure UTF-8 encoding
        logToPanel("Opening result file for writing...");
        var opened = resultFile.open("w");
        if (!opened) {
            logToPanel("ERROR: Failed to open result file for writing: " + resultFile.fsName);
            throw new Error("Failed to open result file for writing.");
        }
        logToPanel("Writing to result file...");
        var written = resultFile.write(resultString);
        if (!written) {
             logToPanel("ERROR: Failed to write to result file (write returned false): " + resultFile.fsName);
             // Still try to close, but log the error
        }
        logToPanel("Closing result file...");
        var closed = resultFile.close();
         if (!closed) {
             logToPanel("ERROR: Failed to close result file: " + resultFile.fsName);
             // Continue, but log the error
        }
        logToPanel("Result file write process complete.");
        
        logToPanel("Command completed successfully: " + command); // Changed log message
        mcpBridge.statusText.text = "Command completed: " + command;
        
        // Update command file status
        logToPanel("Updating command status to completed...");
        updateCommandStatus("completed");
        logToPanel("Command status updated.");
        
    } catch (error) {
        var errorMsg = "ERROR in executeCommand for '" + command + "': " + error.toString() + (error.line ? " (line: " + error.line + ")" : "");
        logToPanel(errorMsg); // Log detailed error
        mcpBridge.statusText.text = "Error: " + error.toString();
        
        // Write detailed error to result file
        try {
            logToPanel("Attempting to write ERROR to result file...");
            var errorResult = JSON.stringify({ 
                status: "error", 
                command: command,
                message: error.toString(),
                line: error.line,
                fileName: error.fileName
            });
            var errorFile = new File(getResultFilePath());
            errorFile.encoding = "UTF-8";
            if (errorFile.open("w")) {
                errorFile.write(errorResult);
                errorFile.close();
                logToPanel("Successfully wrote ERROR to result file.");
            } else {
                 logToPanel("CRITICAL ERROR: Failed to open result file to write error!");
            }
        } catch (writeError) {
             logToPanel("CRITICAL ERROR: Failed to write error to result file: " + writeError.toString());
        }
        
        // Update command file status even after error
        logToPanel("Updating command status to error...");
        updateCommandStatus("error");
        logToPanel("Command status updated to error.");
    }
}

// Update command file status
function updateCommandStatus(status) {
    try {
        var commandFile = new File(getCommandFilePath());
        if (commandFile.exists) {
            commandFile.open("r");
            var content = commandFile.read();
            commandFile.close();
            
            if (content) {
                var commandData = JSON.parse(content);
                commandData.status = status;
                
                commandFile.open("w");
                commandFile.write(JSON.stringify(commandData, null, 2));
                commandFile.close();
            }
        }
    } catch (e) {
        logToPanel("Error updating command status: " + e.toString());
    }
}

// Log message to panel
function logToPanel(message) {
    var timestamp = new Date().toLocaleTimeString();
    mcpBridge.logText.text = timestamp + ": " + message + "\n" + mcpBridge.logText.text;
}

// Check for new commands
function checkForCommands() {
    if (!mcpBridge.autoRunCheckbox.value || isChecking) return;

    isChecking = true;

    try {
        var commandFile = new File(getCommandFilePath());
        if (commandFile.exists) {
            commandFile.open("r");
            var content = commandFile.read();
            commandFile.close();

            if (content) {
                var commandData = (typeof JSON !== "undefined" && JSON.parse)
                    ? JSON.parse(content)
                    : eval("(" + content + ")");

                // Only execute pending commands
                if (commandData.status === "pending") {
                    // Update status to running
                    updateCommandStatus("running");

                    // Execute the command
                    executeCommand(commandData.command, commandData.args || {});
                }
            }
        }
    } catch (e) {
        logToPanel("Error checking for commands: " + e.toString());
    }

    isChecking = false;
}
// Always point $.global.mcpBridge.checkForCommands at the version just defined above, so the
// scheduled task below (which calls it dynamically through $.global, not a lexical reference)
// runs the latest edits after a reload rather than whatever was current at the first AE launch.
mcpBridge.checkForCommands = checkForCommands;

// Set up timer to check for commands. Only ever called once (see the bottom of this file) -
// re-scheduling on every reload would stack duplicate timers, all polling the same files.
function startCommandChecker() {
    app.scheduleTask("$.global.mcpBridge.checkForCommands()", checkInterval, true);
}

// Builds (or, via the reload link, rebuilds) the panel's controls onto `thisObj` - a docked
// Panel when opened from Window > mcp-bridge-auto.jsx, or a new floating palette when run via
// File > Scripts > Run Script File (not a Panel in that case).
function buildBridgeUI(thisObj) {
    var panel = mcpBridge.panel = (thisObj instanceof Panel) ? thisObj : new Window("palette", "MCP Bridge Auto", undefined);
    panel.orientation = "column";
    panel.alignChildren = ["fill", "top"];
    panel.spacing = 10;
    panel.margins = 16;

    // Dev tool: AE only reads a ScriptUI Panels file once when the panel is first opened in a
    // session, so normally you'd have to restart AE to see edits to this script. This re-reads
    // the file from disk and rebuilds the panel's contents in place instead.
    var reloadLink = panel.add("statictext", undefined, "reload script");
    reloadLink.alignment = ["right", "top"];
    reloadLink.addEventListener("mousedown", function () {
        try {
            while (mcpBridge.panel.children.length > 0) {
                mcpBridge.panel.remove(mcpBridge.panel.children[0]);
            }
            // Re-evaluating this file runs the bottom bootstrap again, which finds
            // $.global.mcpBridge.panel already set and calls buildBridgeUI(mcpBridge.panel) -
            // rebuilding onto this same panel rather than creating a new floating window.
            $.evalFile(new File(THIS_SCRIPT_FILE));
        } catch (e) {
            alert("Reload failed: " + e.toString() + " (line " + e.line + ")");
        }
    });

    // Status display
    var statusText = mcpBridge.statusText = panel.add("statictext", undefined, "Waiting for commands...");
    statusText.alignment = ["fill", "top"];

    // Add log area (fills remaining vertical space and grows as the panel/dock is resized)
    var logPanel = panel.add("panel", undefined, "Command Log");
    logPanel.orientation = "column";
    logPanel.alignChildren = ["fill", "fill"];
    logPanel.alignment = ["fill", "fill"];
    var logText = mcpBridge.logText = logPanel.add("edittext", undefined, "", {multiline: true, readonly: true, scrolling: true});
    logText.alignment = ["fill", "fill"];
    logText.minimumSize.height = 150;

    panel.onResizing = panel.onResize = function () {
        this.layout.resize();
    };

    // Auto-run checkbox
    var autoRunCheckbox = mcpBridge.autoRunCheckbox = panel.add("checkbox", undefined, "Auto-run commands");
    autoRunCheckbox.value = true;

    // Add manual check button
    var checkButton = panel.add("button", undefined, "Check for Commands Now");
    checkButton.onClick = function() {
        logToPanel("Manually checking for commands");
        checkForCommands();
    };

    // Log startup
    logToPanel("MCP Bridge Auto started");
    logToPanel("Command file: " + getCommandFilePath());
    statusText.text = "Ready - Auto-run is " + (autoRunCheckbox.value ? "ON" : "OFF");

    // Show the panel (docked panels are shown/positioned by AE itself)
    if (panel instanceof Window) {
        panel.center();
        panel.show();
    } else {
        panel.layout.layout(true);
        panel.layout.resize();
    }

    return panel;
}

// $.global.mcpBridge.panel only gets set once buildBridgeUI has actually run - so this tells
// a true first load (panel not built yet, needs the one-time command-checker task started)
// apart from a reload (panel already exists - reuse it, and don't stack a second task).
if (!mcpBridge.panel) {
    buildBridgeUI(this);
    startCommandChecker();
} else {
    buildBridgeUI(mcpBridge.panel);
}

