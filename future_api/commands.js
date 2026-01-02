// sbbs/mods/future_api/commands.js
//
// Command handlers for FUTURE_API module.
// Loaded by json-service.js into module.commands object.
// Each function receives (client, packet) and returns true if handled.
//
// Architecture:
//   - Generic API via registry.js and resolver.js for Synchronet object access
//   - Custom routes in routes/*.js for specialized functionality
//   - Built-in handlers for ping/__probe

log("FUTURE_API commands.js loading");

var SCOPE = "FUTURE_API";
var DEBUG = true;

function dlog(msg) { 
    if (DEBUG) log("FUTURE_API " + msg); 
}

// =============================================================================
// GENERIC API: Registry + Resolver
// =============================================================================
var registry = null;
var resolver = null;
var genericApiLoaded = false;

function loadGenericApi() {
    if (genericApiLoaded) return;
    genericApiLoaded = true;
    
    try {
        var libPath = system.mods_dir;
        if (libPath && libPath.slice(-1) !== "/" && libPath.slice(-1) !== "\\") libPath += "/";
        libPath += "future_api/lib/";
        
        dlog("loading generic API from " + libPath);
        
        load(libPath + "registry.js");
        load(libPath + "resolver.js");
        
        if (typeof FutureAPIRegistry === "function" && typeof FutureAPIResolver === "function") {
            registry = new FutureAPIRegistry();
            resolver = new FutureAPIResolver(registry);
            dlog("generic API loaded: registry v" + registry.VERSION + ", resolver v" + resolver.VERSION);
        } else {
            log("FUTURE_API: registry/resolver classes not found");
        }
    } catch (e) {
        log("FUTURE_API generic API load error: " + String(e));
    }
}

// =============================================================================
// CUSTOM ROUTES
// =============================================================================
var ROUTES = [];
var routesLoaded = false;

function loadRoutes() {
    if (routesLoaded) return;
    routesLoaded = true;
    
    try {
        var path = system.mods_dir;
        if (path && path.slice(-1) !== "/" && path.slice(-1) !== "\\") path += "/";
        path += "future_api/routes/index.js";
        
        dlog("loading routes from " + path);
        load(path);
        
        if (typeof get_routes === "function") {
            // Create a minimal ctx for route factories
            var ctx = {
                scope: SCOPE,
                debug: DEBUG,
                dlog: dlog
            };
            ROUTES = get_routes(ctx) || [];
            dlog("loaded " + ROUTES.length + " custom routes");
        } else {
            dlog("get_routes not found, using built-in routes only");
        }
    } catch (e) {
        log("FUTURE_API route load error: " + String(e));
    }
}

// Helper: send response back to client
function sendResponse(client, oper, location, data) {
    dlog("sendResponse oper=" + oper + " location=" + location + " data=" + JSON.stringify(data));
    
    // Ensure data is never undefined (would be omitted from JSON)
    if (data === undefined) data = null;
    
    var pkt = {
        scope: SCOPE,
        func: "RESPONSE",
        oper: String(oper || "READ"),
        location: String(location || ""),
        data: data
    };
    
    client.sendJSON(pkt);
}

function sendError(client, location, message, extra) {
    var payload = { error: String(message || "error") };
    if (extra !== undefined) payload.extra = String(extra);
    sendResponse(client, "READ", location, payload);
}

// Built-in handlers (always available)
function handleBuiltin(client, packet) {
    var location = String(packet.location || "");
    
    if (location === "ping") {
        sendResponse(client, "READ", location, { 
            ok: true, 
            pong: Date.now(),
            nick: packet.nick ? String(packet.nick) : null,
            system: packet.system ? String(packet.system) : null
        });
        return true;
    }
    
    if (location === "__probe") {
        var names = [];
        for (var i = 0; i < ROUTES.length; i++) {
            var nm = ROUTES[i] && ROUTES[i].name ? String(ROUTES[i].name) : "(unnamed)";
            names.push(nm);
        }
        
        // Include available API objects
        var apiObjects = [];
        if (registry && registry.objects) {
            for (var key in registry.objects) {
                if (registry.objects.hasOwnProperty(key)) {
                    apiObjects.push(key);
                }
            }
        }
        
        sendResponse(client, "READ", location, {
            ok: true,
            scope: SCOPE,
            routesCount: ROUTES.length,
            routes: names,
            genericApiLoaded: genericApiLoaded,
            apiObjects: apiObjects
        });
        return true;
    }
    
    // Schema/discovery endpoint
    if (location === "__schema" || location.indexOf("__schema/") === 0) {
        if (!resolver) {
            sendError(client, location, "generic API not loaded");
            return true;
        }
        
        var schemaPath = location === "__schema" ? "" : location.substring("__schema/".length);
        
        if (!schemaPath) {
            // Return list of root objects
            var roots = [];
            for (var objKey in registry.objects) {
                if (registry.objects.hasOwnProperty(objKey) && objKey.indexOf(".") === -1) {
                    roots.push({
                        name: objKey,
                        type: registry.objects[objKey].type,
                        description: registry.objects[objKey].description
                    });
                }
            }
            sendResponse(client, "READ", location, { objects: roots });
        } else {
            var schema = resolver.getSchema(schemaPath);
            sendResponse(client, "READ", location, schema);
        }
        return true;
    }
    
    return false;
}

// Main QUERY handler - this intercepts all QUERY func calls
this.QUERY = function(client, packet) {
    dlog("QUERY handler: oper=" + packet.oper + " location=" + packet.location);
    
    // Ensure routes and generic API are loaded
    loadRoutes();
    loadGenericApi();
    
    try {
        var oper = String(packet.oper || "").toUpperCase();
        var location = String(packet.location || "");
        
        // Try built-in routes first (ping, __probe, __schema)
        if (handleBuiltin(client, packet)) {
            return true;
        }
        
        // Try custom routes second
        for (var i = 0; i < ROUTES.length; i++) {
            var r = ROUTES[i];
            if (!r) continue;
            if (typeof r.match !== "function" || typeof r.handle !== "function") continue;
            
            var ok = false;
            try { ok = !!r.match(packet); } catch (e) { ok = false; }
            
            if (ok) {
                dlog("ROUTE MATCH name=" + (r.name || "(unnamed)") + " location=" + location);
                
                // Create context for route handler
                var ctx = {
                    scope: SCOPE,
                    debug: DEBUG,
                    dlog: dlog,
                    sendResponse: sendResponse,
                    sendError: sendError
                };
                
                r.handle(ctx, client, packet);
                return true;
            }
        }
        
        // Try generic API resolution
        if (resolver) {
            // Extract query params from packet.data if present
            var params = {};
            if (packet.data && typeof packet.data === "object") {
                for (var k in packet.data) {
                    if (packet.data.hasOwnProperty(k)) {
                        params[k] = packet.data[k];
                    }
                }
            }
            
            // Also allow params in the location string (e.g., system/username?user_number=1)
            var writeValue = (oper === "WRITE" && packet.data !== undefined) ? packet.data.value : undefined;
            
            var result = resolver.resolve(location, params, oper, writeValue);
            
            if (result.success) {
                dlog("GENERIC API success: " + location + " type=" + result.meta.type);
                sendResponse(client, oper, location, result.data);
                return true;
            }
            
            if (result.error) {
                // Check if it's a "not found" error vs an actual error
                if (result.error.indexOf("path not found") === 0) {
                    // Fall through to "unknown location" below
                    dlog("GENERIC API path not found: " + location);
                } else {
                    dlog("GENERIC API error: " + result.error);
                    sendError(client, location, result.error);
                    return true;
                }
            }
        }
        
        // No route matched - send error
        sendError(client, location, "unknown location");
        return true;
        
    } catch (e) {
        log("FUTURE_API QUERY exception: " + String(e));
        sendError(client, String(packet.location || ""), "exception", String(e));
        return true;
    }
};

log("FUTURE_API commands.js loaded");
