// sbbs/mods/future_api/lib/resolver.js
//
// Path resolver and safe invocation for FUTURE_API.
// Handles path parsing, query parameter extraction, type coercion, and dynamic invocation.
//
// Usage:
//   load(system.mods_dir + "future_api/lib/registry.js");
//   load(system.mods_dir + "future_api/lib/resolver.js");
//   var registry = new FutureAPIRegistry();
//   var resolver = new FutureAPIResolver(registry);
//   var result = resolver.resolve("system/username", { user_number: 1 }, "READ");

function FutureAPIResolver(registry) {
    this.registry = registry;
    this.VERSION = "1.0.0";
}

// =============================================================================
// TYPE COERCION
// =============================================================================

/**
 * Coerce a value to the expected type
 * @param {*} value - Input value
 * @param {string} targetType - Expected type ("string", "number", "boolean")
 * @returns {*} Coerced value
 */
FutureAPIResolver.prototype.coerceType = function(value, targetType) {
    if (value === null || value === undefined) {
        return value;
    }
    
    switch (targetType) {
        case "string":
            return String(value);
            
        case "number":
            var n = Number(value);
            return isNaN(n) ? null : n;
            
        case "boolean":
            if (typeof value === "boolean") return value;
            if (typeof value === "string") {
                var lower = value.toLowerCase();
                if (lower === "true" || lower === "1" || lower === "yes") return true;
                if (lower === "false" || lower === "0" || lower === "no") return false;
            }
            if (typeof value === "number") return value !== 0;
            return Boolean(value);
            
        default:
            return value;
    }
};

/**
 * Parse query parameters from a location string or object
 * @param {string|object} input - Query string or params object
 * @returns {object} Parsed parameters
 */
FutureAPIResolver.prototype.parseQueryParams = function(input) {
    if (!input) return {};
    
    // If already an object, return it
    if (typeof input === "object" && !Array.isArray(input)) {
        return input;
    }
    
    // Parse query string format: "key1=value1&key2=value2"
    var result = {};
    var str = String(input);
    
    // Handle "location?params" format
    var qIndex = str.indexOf("?");
    if (qIndex !== -1) {
        str = str.substring(qIndex + 1);
    }
    
    var pairs = str.split("&");
    for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split("=");
        if (pair.length >= 2) {
            var key = decodeURIComponent(pair[0]);
            var value = decodeURIComponent(pair.slice(1).join("="));
            result[key] = value;
        }
    }
    
    return result;
};

/**
 * Extract location path without query string
 * @param {string} location - Full location with possible query string
 * @returns {string} Clean path
 */
FutureAPIResolver.prototype.extractPath = function(location) {
    var loc = String(location || "");
    var qIndex = loc.indexOf("?");
    if (qIndex !== -1) {
        return loc.substring(0, qIndex);
    }
    return loc;
};

// =============================================================================
// SAFE SERIALIZATION
// =============================================================================

/**
 * Safely serialize a value for JSON response
 * Handles circular references, functions, and Synchronet-specific objects
 * @param {*} value - Value to serialize
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {*} Serializable value
 */
FutureAPIResolver.prototype.safeSerialize = function(value, depth, maxDepth) {
    depth = depth || 0;
    maxDepth = maxDepth || 3;
    
    // Primitives pass through
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return value;
    if (typeof value === "number") return isNaN(value) ? null : value;
    if (typeof value === "boolean") return value;
    
    // Functions are not serializable
    if (typeof value === "function") return "[function]";
    
    // Prevent infinite recursion
    if (depth >= maxDepth) {
        if (Array.isArray(value)) return "[array]";
        if (typeof value === "object") return "[object]";
        return String(value);
    }
    
    // Arrays
    if (Array.isArray(value)) {
        var arr = [];
        var len = Math.min(value.length, 100); // Limit array size
        for (var i = 0; i < len; i++) {
            arr.push(this.safeSerialize(value[i], depth + 1, maxDepth));
        }
        if (value.length > 100) {
            arr.push("... (" + (value.length - 100) + " more items)");
        }
        return arr;
    }
    
    // Objects
    if (typeof value === "object") {
        var obj = {};
        var count = 0;
        var maxProps = 50;
        
        for (var key in value) {
            if (count >= maxProps) {
                obj["..."] = "(truncated)";
                break;
            }
            
            // Skip internal/private properties
            if (key.charAt(0) === "_") continue;
            
            try {
                var propVal = value[key];
                // Skip functions in objects
                if (typeof propVal === "function") continue;
                
                obj[key] = this.safeSerialize(propVal, depth + 1, maxDepth);
                count++;
            } catch (e) {
                obj[key] = "[error: " + String(e) + "]";
            }
        }
        
        return obj;
    }
    
    return String(value);
};

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Resolve a path and return the value or invoke a method
 * @param {string} location - URL path (e.g., "system/stats/total_users" or "system/username?user_number=1")
 * @param {object} params - Query parameters (can also be embedded in location)
 * @param {string} oper - Operation type: "READ", "WRITE", "KEYS", "CALL"
 * @param {*} writeValue - Value to write (for WRITE operations)
 * @returns {object} { success: boolean, data: *, error: string|null, meta: object }
 */
FutureAPIResolver.prototype.resolve = function(location, params, oper, writeValue) {
    var self = this;
    
    // Normalize inputs
    var cleanPath = this.extractPath(location);
    var queryParams = this.parseQueryParams(location);
    
    // Merge explicit params with query string params (explicit takes precedence)
    if (params && typeof params === "object") {
        for (var k in params) {
            if (params.hasOwnProperty(k)) {
                queryParams[k] = params[k];
            }
        }
    }
    
    oper = String(oper || "READ").toUpperCase();
    
    var result = {
        success: false,
        data: null,
        error: null,
        meta: {
            path: cleanPath,
            oper: oper,
            type: null
        }
    };
    
    // Lookup in registry
    var lookup = this.registry.lookup(cleanPath);
    
    if (!lookup.found) {
        result.error = "path not found: " + cleanPath;
        return result;
    }
    
    result.meta.type = lookup.type;
    result.meta.dotPath = lookup.dotPath;
    
    // Security check: blacklist
    if (this.registry.isBlacklisted(lookup.dotPath)) {
        result.error = "access denied: " + lookup.dotPath;
        return result;
    }
    
    // Security check: write blacklist
    if (oper === "WRITE" && this.registry.isWriteBlacklisted(lookup.dotPath)) {
        result.error = "write access denied: " + lookup.dotPath;
        return result;
    }
    
    // Get the actual object instance
    var targetObj = null;
    var objDef = lookup.objectDef;
    
    try {
        if (objDef.resolver) {
            // For instantiable objects (like User), pass the instance param
            if (objDef.type === "instantiable" && objDef.instanceParam) {
                var instanceVal = queryParams[objDef.instanceParam];
                targetObj = objDef.resolver(instanceVal);
            } else if (objDef.type === "array" && lookup.arrayIndex !== null) {
                targetObj = objDef.resolver(lookup.arrayIndex);
            } else {
                targetObj = objDef.resolver();
            }
        }
    } catch (e) {
        result.error = "resolver error: " + String(e);
        return result;
    }
    
    if (targetObj === null || targetObj === undefined) {
        // For child objects, we need to resolve from parent
        if (objDef.type === "child" && objDef.parent) {
            var parentDef = this.registry.getObject(objDef.parent);
            if (parentDef && parentDef.resolver) {
                try {
                    var parentObj;
                    if (parentDef.type === "instantiable" && parentDef.instanceParam) {
                        var parentInstanceVal = queryParams[parentDef.instanceParam];
                        parentObj = parentDef.resolver(parentInstanceVal);
                    } else {
                        parentObj = parentDef.resolver();
                    }
                    
                    if (parentObj && objDef.resolver) {
                        targetObj = objDef.resolver(parentObj);
                    }
                } catch (e) {
                    result.error = "parent resolver error: " + String(e);
                    return result;
                }
            }
        }
        
        if (targetObj === null || targetObj === undefined) {
            result.error = "object not available";
            return result;
        }
    }
    
    // Handle KEYS operation
    if (oper === "KEYS") {
        var paths = this.registry.listPaths(lookup.objectKey);
        result.success = true;
        result.data = paths;
        return result;
    }
    
    // Handle based on lookup type
    switch (lookup.type) {
        case "object":
            return this.resolveObject(targetObj, objDef, oper, result);
            
        case "property":
            return this.resolveProperty(targetObj, lookup.property, lookup.meta, oper, writeValue, result);
            
        case "method":
            return this.resolveMethod(targetObj, lookup.property, lookup.meta, queryParams, result);
            
        case "array":
            return this.resolveArray(targetObj, objDef, oper, result);
            
        case "array_item":
            if (lookup.property && objDef.itemProperties) {
                // Access property on array item
                return this.resolveProperty(targetObj, lookup.property, lookup.meta, oper, writeValue, result);
            }
            return this.resolveObject(targetObj, objDef, oper, result);
            
        default:
            result.error = "unsupported type: " + lookup.type;
            return result;
    }
};

/**
 * Resolve an object (return all readable properties)
 */
FutureAPIResolver.prototype.resolveObject = function(obj, objDef, oper, result) {
    if (oper !== "READ") {
        result.error = "objects only support READ operation";
        return result;
    }
    
    var data = {};
    var props = objDef.properties || objDef.itemProperties || {};
    
    for (var propName in props) {
        if (!props.hasOwnProperty(propName)) continue;
        
        try {
            var val = obj[propName];
            data[propName] = this.safeSerialize(val, 0, 2);
        } catch (e) {
            data[propName] = "[error: " + String(e) + "]";
        }
    }
    
    // Include children references
    if (objDef.children) {
        data._children = [];
        for (var childName in objDef.children) {
            if (objDef.children.hasOwnProperty(childName)) {
                data._children.push(childName);
            }
        }
    }
    
    result.success = true;
    result.data = data;
    return result;
};

/**
 * Resolve a property access or write
 */
FutureAPIResolver.prototype.resolveProperty = function(obj, propName, propMeta, oper, writeValue, result) {
    if (oper === "READ") {
        try {
            var val = obj[propName];
            result.success = true;
            result.data = this.safeSerialize(val, 0, 3);
        } catch (e) {
            result.error = "read error: " + String(e);
        }
        return result;
    }
    
    if (oper === "WRITE") {
        if (propMeta && propMeta.readOnly) {
            result.error = "property is read-only: " + propName;
            return result;
        }
        
        try {
            // Coerce value to expected type
            var coercedValue = writeValue;
            if (propMeta && propMeta.type) {
                coercedValue = this.coerceType(writeValue, propMeta.type);
            }
            
            obj[propName] = coercedValue;
            result.success = true;
            result.data = { written: true, property: propName, value: coercedValue };
        } catch (e) {
            result.error = "write error: " + String(e);
        }
        return result;
    }
    
    result.error = "unsupported operation on property: " + oper;
    return result;
};

/**
 * Resolve a method invocation
 */
FutureAPIResolver.prototype.resolveMethod = function(obj, methodName, methodMeta, params, result) {
    if (!methodMeta) {
        result.error = "method metadata not found: " + methodName;
        return result;
    }
    
    if (methodMeta.safe === false) {
        result.error = "method not available via API: " + methodName;
        return result;
    }
    
    // Build arguments array from params
    var args = [];
    var argDefs = methodMeta.args || [];
    
    for (var i = 0; i < argDefs.length; i++) {
        var argDef = argDefs[i];
        var argValue = params[argDef.name];
        
        if (argValue === undefined) {
            if (argDef.required) {
                result.error = "missing required argument: " + argDef.name;
                return result;
            }
            // Use default if available
            argValue = argDef.default;
        } else {
            // Coerce to expected type
            argValue = this.coerceType(argValue, argDef.type);
        }
        
        args.push(argValue);
    }
    
    // Invoke the method
    try {
        var fn = obj[methodName];
        if (typeof fn !== "function") {
            result.error = "not a function: " + methodName;
            return result;
        }
        
        var returnVal = fn.apply(obj, args);
        result.success = true;
        result.data = this.safeSerialize(returnVal, 0, 3);
    } catch (e) {
        result.error = "method error: " + String(e);
    }
    
    return result;
};

/**
 * Resolve an array (return array info or items)
 */
FutureAPIResolver.prototype.resolveArray = function(arr, objDef, oper, result) {
    if (oper !== "READ") {
        result.error = "arrays only support READ operation";
        return result;
    }
    
    if (!arr || typeof arr.length !== "number") {
        result.error = "not an array";
        return result;
    }
    
    // Return array summary with items
    var data = {
        length: arr.length,
        items: []
    };
    
    var maxItems = Math.min(arr.length, 20); // Limit returned items
    for (var i = 0; i < maxItems; i++) {
        data.items.push(this.safeSerialize(arr[i], 0, 2));
    }
    
    if (arr.length > maxItems) {
        data.truncated = true;
        data.totalItems = arr.length;
    }
    
    result.success = true;
    result.data = data;
    return result;
};

// =============================================================================
// UTILITY METHODS
// =============================================================================

/**
 * Get schema information for a path (for documentation/discovery)
 */
FutureAPIResolver.prototype.getSchema = function(location) {
    var cleanPath = this.extractPath(location);
    var lookup = this.registry.lookup(cleanPath);
    
    if (!lookup.found) {
        return { found: false, path: cleanPath };
    }
    
    var schema = {
        found: true,
        path: cleanPath,
        type: lookup.type,
        objectKey: lookup.objectKey
    };
    
    if (lookup.meta) {
        schema.meta = lookup.meta;
    }
    
    if (lookup.objectDef) {
        schema.description = lookup.objectDef.description;
        
        if (lookup.type === "object") {
            schema.properties = [];
            schema.methods = [];
            schema.children = [];
            
            var props = lookup.objectDef.properties || {};
            for (var p in props) {
                if (props.hasOwnProperty(p)) {
                    schema.properties.push({
                        name: p,
                        type: props[p].type,
                        readOnly: props[p].readOnly,
                        desc: props[p].desc
                    });
                }
            }
            
            var methods = lookup.objectDef.methods || {};
            for (var m in methods) {
                if (methods.hasOwnProperty(m) && methods[m].safe !== false) {
                    schema.methods.push({
                        name: m,
                        args: methods[m].args,
                        returns: methods[m].returns,
                        desc: methods[m].desc
                    });
                }
            }
            
            var children = lookup.objectDef.children || {};
            for (var c in children) {
                if (children.hasOwnProperty(c)) {
                    schema.children.push(c);
                }
            }
        }
    }
    
    return schema;
};

// Export for use with load()
if (typeof module !== "undefined") module.exports = FutureAPIResolver;
