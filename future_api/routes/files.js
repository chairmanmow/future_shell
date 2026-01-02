// sbbs/mods/future_api/routes/files.js
//
// File area routes for FUTURE_API.
// Provides file library/directory listings and file info suitable for LLM consumption.
// CREATE operations are supported for whitelisted directories only.

// Load whitelist for CREATE operations
var whitelist = null;
try {
	var wlPath = system.mods_dir;
	if (wlPath && wlPath.slice(-1) !== "/" && wlPath.slice(-1) !== "\\") wlPath += "/";
	wlPath += "future_api/lib/whitelist.js";
	load(wlPath);
	if (typeof FutureAPIWhitelist !== "undefined") {
		whitelist = FutureAPIWhitelist;
	}
} catch (e) {
	log("FUTURE_API files.js: failed to load whitelist: " + e);
}

function make_files_route(ctx) {
var name = "files";

// ---- Helper functions ----
function safeKeys(obj) {
	if (!obj || typeof obj !== "object") return [];
	var keys = [];
	for (var k in obj) {
		if (obj.hasOwnProperty(k)) keys.push(k);
	}
	return keys;
}

function coerceNum(x) { 
	var n = Number(x); 
	return isNaN(n) ? 0 : n; 
}

// Get overview of all file areas
function getFileAreaSummary() {
	var libs = [];
	var totalDirs = 0;
	var totalFiles = 0;

	for (var li = 0; li < file_area.lib_list.length; li++) {
		var lib = file_area.lib_list[li];
		var dirs = [];
		var libFiles = 0;

		for (var di = 0; di < lib.dir_list.length; di++) {
			var dir = lib.dir_list[di];
			var files = coerceNum(dir.files);
			libFiles += files;
			dirs.push({
				code: dir.code,
				name: dir.name,
				files: files
			});
		}

		libs.push({
			number: lib.number,
			name: lib.name,
			description: lib.description,
			dirCount: dirs.length,
			totalFiles: libFiles,
			dirs: dirs.slice(0, 10) // Top 10 dirs
		});

		totalDirs += dirs.length;
		totalFiles += libFiles;
	}

	return {
		libCount: libs.length,
		dirCount: totalDirs,
		totalFiles: totalFiles,
		libs: libs.slice(0, 20) // Top 20 libraries
	};
}

// List all directories for discovery
function listDirs() {
	var dirs = [];
	var keys = safeKeys(file_area.dir);

	for (var i = 0; i < keys.length; i++) {
		var dir = file_area.dir[keys[i]];
		dirs.push({
			code: dir.code,
			name: dir.name,
			libName: dir.lib_name,
			files: coerceNum(dir.files)
		});
	}

	// Sort by file count descending
	dirs.sort(function(a, b) { return b.files - a.files; });

	return {
		count: dirs.length,
		dirs: dirs.slice(0, 50) // Top 50 by file count
	};
}

// Find a directory by code (case-insensitive, fuzzy match)
function findDir(code) {
	var codeLower = code.toLowerCase().replace(/[^a-z0-9]/g, "");

	// Exact match first
	if (file_area.dir[code]) {
		return file_area.dir[code];
	}

	// Case-insensitive exact match
	var keys = safeKeys(file_area.dir);
	for (var i = 0; i < keys.length; i++) {
		if (keys[i].toLowerCase() === code.toLowerCase()) {
			return file_area.dir[keys[i]];
		}
	}

	// Normalized contains match
	for (var i = 0; i < keys.length; i++) {
		var keyNorm = keys[i].toLowerCase().replace(/[^a-z0-9]/g, "");
		if (keyNorm.indexOf(codeLower) !== -1 || codeLower.indexOf(keyNorm) !== -1) {
			return file_area.dir[keys[i]];
		}
	}

	// Name contains match
	for (var i = 0; i < keys.length; i++) {
		var dir = file_area.dir[keys[i]];
		var nameNorm = (dir.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
		if (nameNorm.indexOf(codeLower) !== -1 || codeLower.indexOf(nameNorm) !== -1) {
			return dir;
		}
	}

	return null;
}

// Find a library by name (case-insensitive, fuzzy match)
function findLib(name) {
	var nameLower = name.toLowerCase().replace(/[^a-z0-9]/g, "");

	for (var li = 0; li < file_area.lib_list.length; li++) {
		var lib = file_area.lib_list[li];
		// Exact match
		if (lib.name.toLowerCase() === name.toLowerCase()) {
			return lib;
		}
	}

	// Normalized contains match
	for (var li = 0; li < file_area.lib_list.length; li++) {
		var lib = file_area.lib_list[li];
		var libNorm = lib.name.toLowerCase().replace(/[^a-z0-9]/g, "");
		if (libNorm.indexOf(nameLower) !== -1 || nameLower.indexOf(libNorm) !== -1) {
			return lib;
		}
	}

	return null;
}

// Get stats for a specific directory
function getDirStats(dirCode) {
	var dir = findDir(dirCode);
	if (!dir) return null;

	var result = {
		code: dir.code,
		name: dir.name,
		description: dir.description,
		libName: dir.lib_name,
		files: coerceNum(dir.files),
		path: dir.path,
		maxFiles: dir.max_files,
		maxAge: dir.max_age,
		canAccess: dir.can_access,
		canUpload: dir.can_upload,
		canDownload: dir.can_download
	};

	// Try to get more info from FileBase
	try {
		var fb = new FileBase(dir.code);
		if (fb.open()) {
			result.firstFile = fb.first_file;
			result.lastFile = fb.last_file;
			result.lastFileTime = fb.last_file_time;
			result.totalFiles = fb.files;
			fb.close();
		}
	} catch (e) {
		ctx.dlog("files getDirStats FileBase error: " + e);
	}

	return result;
}

// Get recent files from a directory
function getDirRecent(dirCode, limit) {
	limit = Math.min(coerceNum(limit) || 20, 50);

	var dir = findDir(dirCode);
	if (!dir) return null;

	var files = [];

	try {
		var fb = new FileBase(dir.code);
		if (!fb.open()) {
			return { dirCode: dir.code, dirName: dir.name, count: 0, files: [], error: "failed to open: " + fb.error };
		}

		// Get file list sorted by date descending (most recent first)
		var fileList = fb.get_list("*", FileBase.DETAIL.NORM, 0, true, FileBase.SORT.DATE_D);
		
		if (fileList && fileList.length > 0) {
			for (var i = 0; i < Math.min(fileList.length, limit); i++) {
				var f = fileList[i];
				files.push({
					name: f.name,
					desc: f.desc || null,
					size: coerceNum(f.size),
					time: coerceNum(f.time),
					added: coerceNum(f.added),
					from: f.from || null,
					downloads: coerceNum(f.times_downloaded)
				});
			}
		}

		fb.close();
	} catch (e) {
		ctx.dlog("files getDirRecent error: " + e);
		return { dirCode: dir.code, dirName: dir.name, count: 0, files: [], error: String(e) };
	}

	return {
		dirCode: dir.code,
		dirName: dir.name,
		count: files.length,
		files: files
	};
}

// Get recent files across all directories
function getRecentFiles(limit, libFilter) {
	limit = Math.min(coerceNum(limit) || 20, 50);

	var allFiles = [];
	var matchedLib = null;

	// Build list of directories to scan
	var dirsToScan = [];

	if (libFilter) {
		var lib = findLib(libFilter);
		if (!lib) {
			// Return available libraries as suggestions
			var libNames = [];
			for (var li = 0; li < file_area.lib_list.length; li++) {
				libNames.push(file_area.lib_list[li].name);
			}
			return { count: 0, files: [], error: "library not found: " + libFilter + ". Available: " + libNames.join(", ") };
		}
		matchedLib = lib.name;
		for (var di = 0; di < lib.dir_list.length; di++) {
			var dir = lib.dir_list[di];
			if (coerceNum(dir.files) > 0) {
				dirsToScan.push(dir);
			}
		}
	} else {
		var keys = safeKeys(file_area.dir);
		for (var i = 0; i < keys.length; i++) {
			var dir = file_area.dir[keys[i]];
			if (coerceNum(dir.files) > 0) {
				dirsToScan.push(dir);
			}
		}
	}

	// Sort dirs by file count descending for efficiency
	dirsToScan.sort(function(a, b) { return coerceNum(b.files) - coerceNum(a.files); });

	// Scan up to 20 directories
	var maxDirs = Math.min(dirsToScan.length, 20);

	for (var i = 0; i < maxDirs; i++) {
		var dir = dirsToScan[i];

		try {
			var fb = new FileBase(dir.code);
			if (!fb.open()) continue;

			var fileList = fb.get_list("*", FileBase.DETAIL.NORM, 0, true, FileBase.SORT.DATE_D);
			
			if (fileList && fileList.length > 0) {
				for (var j = 0; j < Math.min(fileList.length, 10); j++) {
					var f = fileList[j];
					allFiles.push({
						dirCode: dir.code,
						dirName: dir.name,
						name: f.name,
						desc: f.desc || null,
						size: coerceNum(f.size),
						added: coerceNum(f.added),
						from: f.from || null
					});
				}
			}

			fb.close();
		} catch (e) {
			ctx.dlog("getRecentFiles error on " + dir.code + ": " + e);
		}
	}

	// Sort all by added date descending
	allFiles.sort(function(a, b) { return b.added - a.added; });

	var result = {
		count: Math.min(allFiles.length, limit),
		files: allFiles.slice(0, limit)
	};

	if (matchedLib) {
		result.lib = matchedLib;
	}

	return result;
}

// Search for files by name/description
function searchFiles(query, limit) {
	limit = Math.min(coerceNum(limit) || 20, 100);
	
	if (!query || !query.trim()) {
		return { error: "query required", count: 0, files: [] };
	}

	var queryLower = query.toLowerCase();
	var matches = [];

	var keys = safeKeys(file_area.dir);
	var dirsWithFiles = [];

	for (var i = 0; i < keys.length; i++) {
		var dir = file_area.dir[keys[i]];
		if (coerceNum(dir.files) > 0) {
			dirsWithFiles.push(dir);
		}
	}

	// Sort by file count descending
	dirsWithFiles.sort(function(a, b) { return coerceNum(b.files) - coerceNum(a.files); });

	var maxDirs = Math.min(dirsWithFiles.length, 30);

	for (var i = 0; i < maxDirs && matches.length < limit; i++) {
		var dir = dirsWithFiles[i];

		try {
			var fb = new FileBase(dir.code);
			if (!fb.open()) continue;

			// Get all files
			var fileList = fb.get_list("*", FileBase.DETAIL.NORM);
			
			if (fileList) {
				for (var j = 0; j < fileList.length && matches.length < limit; j++) {
					var f = fileList[j];
					var nameLower = (f.name || "").toLowerCase();
					var descLower = (f.desc || "").toLowerCase();

					if (nameLower.indexOf(queryLower) !== -1 || descLower.indexOf(queryLower) !== -1) {
						matches.push({
							dirCode: dir.code,
							dirName: dir.name,
							name: f.name,
							desc: f.desc || null,
							size: coerceNum(f.size),
							added: coerceNum(f.added),
							from: f.from || null,
							downloads: coerceNum(f.times_downloaded)
						});
					}
				}
			}

			fb.close();
		} catch (e) {
			ctx.dlog("searchFiles error on " + dir.code + ": " + e);
		}
	}

	// Sort by most downloads (most popular matches first)
	matches.sort(function(a, b) { return b.downloads - a.downloads; });

	return {
		query: query,
		count: matches.length,
		files: matches.slice(0, limit)
	};
}

// Get library details with its directories
function getLibDetails(libName) {
	var lib = findLib(libName);
	if (!lib) return null;

	var dirs = [];
	for (var di = 0; di < lib.dir_list.length; di++) {
		var dir = lib.dir_list[di];
		dirs.push({
			code: dir.code,
			name: dir.name,
			description: dir.description,
			files: coerceNum(dir.files)
		});
	}

	// Sort dirs by file count
	dirs.sort(function(a, b) { return b.files - a.files; });

	return {
		number: lib.number,
		name: lib.name,
		description: lib.description,
		vdir: lib.vdir,
		codePrefix: lib.code_prefix,
		dirCount: dirs.length,
		dirs: dirs
	};
}

// =========================================================================
// CREATE OPERATIONS - Add a file to a whitelisted directory
// =========================================================================

// Get list of directories that allow uploads via API
function getWritableDirs() {
	if (!whitelist) return [];
	var codes = whitelist.getWhitelistedDirs();
	var result = [];
	for (var i = 0; i < codes.length; i++) {
		var dir = findDir(codes[i]);
		if (dir) {
			result.push({
				code: dir.code,
				name: dir.name,
				libName: dir.lib_name,
				path: dir.path
			});
		}
	}
	return result;
}

// Add a file entry to a whitelisted directory
// This creates a file record in the filebase - the actual file must already exist on disk
// Options:
//   dirCode     - the directory code to add to (required)
//   filename    - the filename (required, must exist in dir.path)
//   description - file description (required)
//   from        - uploader name (required)
//   extDesc     - extended description (optional, multi-line)
//   tags        - comma-separated tags (optional)
//   cost        - credit cost (optional, default 0)
function addFileEntry(options) {
	// Validate required fields
	if (!options.dirCode) {
		return { success: false, error: "dirCode is required" };
	}
	if (!options.filename || !String(options.filename).trim()) {
		return { success: false, error: "filename is required" };
	}
	if (!options.description || !String(options.description).trim()) {
		return { success: false, error: "description is required" };
	}
	if (!options.from || !String(options.from).trim()) {
		return { success: false, error: "from (uploader name) is required" };
	}

	var dirCode = String(options.dirCode);
	var filename = String(options.filename).trim();
	var description = String(options.description).trim();
	var from = String(options.from).trim();
	var extDesc = options.extDesc ? String(options.extDesc) : null;
	var tags = options.tags ? String(options.tags) : null;
	var cost = options.cost ? coerceNum(options.cost) : 0;

	// Check whitelist
	if (!whitelist) {
		return { success: false, error: "whitelist not loaded - CREATE operations disabled" };
	}
	if (!whitelist.isDirWhitelisted(dirCode)) {
		var allowed = whitelist.getWhitelistedDirs();
		return { 
			success: false, 
			error: "directory '" + dirCode + "' is not whitelisted for uploads",
			allowedDirs: allowed
		};
	}

	// Find the directory
	var dir = findDir(dirCode);
	if (!dir) {
		return { success: false, error: "directory not found: " + dirCode };
	}

	// Validate field lengths
	if (filename.length > 64) {
		return { success: false, error: "filename too long (max 64 chars)" };
	}
	if (description.length > 58) {
		return { success: false, error: "description too long (max 58 chars)" };
	}
	if (from.length > 25) {
		return { success: false, error: "from name too long (max 25 chars)" };
	}

	// Check if the file exists on disk
	var filePath = dir.path + filename;
	if (!file_exists(filePath)) {
		return { 
			success: false, 
			error: "file not found on disk: " + filename,
			expectedPath: filePath,
			note: "The file must be uploaded to the directory path before adding to the filebase"
		};
	}

	// Get file stats
	var fileSize = file_size(filePath);
	var fileDate = file_date(filePath);

	// Open the filebase
	var fb;
	try {
		fb = new FileBase(dir.code);
		if (!fb.open()) {
			return { success: false, error: "failed to open filebase: " + fb.error };
		}
	} catch (e) {
		return { success: false, error: "exception opening filebase: " + String(e) };
	}

	try {
		// Check if file already exists in filebase
		var existing = fb.get(filename);
		if (existing) {
			fb.close();
			return { 
				success: false, 
				error: "file already exists in filebase: " + filename,
				existingFile: {
					name: existing.name,
					desc: existing.desc,
					from: existing.from,
					added: existing.added
				}
			};
		}

		// Build the file object
		var fileObj = {
			name: filename,
			desc: description,
			from: from,
			cost: cost
		};

		if (extDesc) {
			fileObj.extdesc = extDesc;
		}

		if (tags) {
			// Tags can be set as an array
			fileObj.tags = tags.split(",").map(function(t) { return t.trim(); }).filter(function(t) { return t; });
		}

		// Add the file
		var result = fb.add(fileObj);
		
		if (!result) {
			var err = fb.error || "unknown error";
			fb.close();
			return { success: false, error: "failed to add file: " + err };
		}

		fb.close();

		return {
			success: true,
			dirCode: dir.code,
			dirName: dir.name,
			filename: filename,
			description: description,
			from: from,
			size: fileSize,
			fileDate: fileDate,
			cost: cost,
			tags: tags || null
		};

	} catch (e) {
		try { fb.close(); } catch (e2) {}
		return { success: false, error: "exception adding file: " + String(e) };
	}
}

// Create a text file and add it to the filebase in one operation
// This is useful for adding README files, text documents, etc.
// Options:
//   dirCode     - the directory code to add to (required)
//   filename    - the filename to create (required)
//   content     - the text content of the file (required)
//   description - file description (required)
//   from        - uploader name (required)
//   extDesc     - extended description (optional)
//   tags        - comma-separated tags (optional)
//   overwrite   - if true, overwrite existing file (default false)
function createTextFile(options) {
	// Validate required fields
	if (!options.dirCode) {
		return { success: false, error: "dirCode is required" };
	}
	if (!options.filename || !String(options.filename).trim()) {
		return { success: false, error: "filename is required" };
	}
	if (!options.content) {
		return { success: false, error: "content is required" };
	}
	if (!options.description || !String(options.description).trim()) {
		return { success: false, error: "description is required" };
	}
	if (!options.from || !String(options.from).trim()) {
		return { success: false, error: "from (uploader name) is required" };
	}

	var dirCode = String(options.dirCode);
	var filename = String(options.filename).trim();
	var content = String(options.content);
	var description = String(options.description).trim();
	var from = String(options.from).trim();
	var extDesc = options.extDesc ? String(options.extDesc) : null;
	var tags = options.tags ? String(options.tags) : null;
	var overwrite = Boolean(options.overwrite);

	// Check whitelist
	if (!whitelist) {
		return { success: false, error: "whitelist not loaded - CREATE operations disabled" };
	}
	if (!whitelist.isDirWhitelisted(dirCode)) {
		var allowed = whitelist.getWhitelistedDirs();
		return { 
			success: false, 
			error: "directory '" + dirCode + "' is not whitelisted for uploads",
			allowedDirs: allowed
		};
	}

	// Find the directory
	var dir = findDir(dirCode);
	if (!dir) {
		return { success: false, error: "directory not found: " + dirCode };
	}

	// Validate field lengths
	if (filename.length > 64) {
		return { success: false, error: "filename too long (max 64 chars)" };
	}
	if (description.length > 58) {
		return { success: false, error: "description too long (max 58 chars)" };
	}
	if (from.length > 25) {
		return { success: false, error: "from name too long (max 25 chars)" };
	}

	// Safety check on filename - no path traversal
	if (filename.indexOf("/") !== -1 || filename.indexOf("\\") !== -1 || filename.indexOf("..") !== -1) {
		return { success: false, error: "invalid filename - cannot contain path characters" };
	}

	// Limit content size (1MB max for text files)
	if (content.length > 1048576) {
		return { success: false, error: "content too large (max 1MB)" };
	}

	var filePath = dir.path + filename;

	// Check if file already exists
	if (file_exists(filePath) && !overwrite) {
		return { 
			success: false, 
			error: "file already exists on disk: " + filename,
			path: filePath,
			note: "Use overwrite=true to replace existing file"
		};
	}

	// Open filebase first to check if entry exists
	var fb;
	try {
		fb = new FileBase(dir.code);
		if (!fb.open()) {
			return { success: false, error: "failed to open filebase: " + fb.error };
		}
	} catch (e) {
		return { success: false, error: "exception opening filebase: " + String(e) };
	}

	try {
		// Check if file already exists in filebase
		var existing = fb.get(filename);
		if (existing && !overwrite) {
			fb.close();
			return { 
				success: false, 
				error: "file already exists in filebase: " + filename,
				existingFile: {
					name: existing.name,
					desc: existing.desc,
					from: existing.from
				},
				note: "Use overwrite=true to replace existing entry"
			};
		}

		// If overwriting, remove existing entry first
		if (existing && overwrite) {
			fb.remove(filename);
		}

		fb.close();

		// Write the file to disk
		var f = new File(filePath);
		if (!f.open("w")) {
			return { success: false, error: "failed to open file for writing: " + f.error };
		}
		f.write(content);
		f.close();

		// Now add to filebase
		fb = new FileBase(dir.code);
		if (!fb.open()) {
			// File is on disk but we couldn't add to filebase - report partial success
			return { 
				success: false, 
				error: "file written to disk but failed to open filebase: " + fb.error,
				filePath: filePath,
				note: "File exists on disk but is not in filebase"
			};
		}

		// Build the file object
		var fileObj = {
			name: filename,
			desc: description,
			from: from,
			cost: 0
		};

		if (extDesc) {
			fileObj.extdesc = extDesc;
		}

		if (tags) {
			fileObj.tags = tags.split(",").map(function(t) { return t.trim(); }).filter(function(t) { return t; });
		}

		// Add the file
		var result = fb.add(fileObj);
		
		if (!result) {
			var err = fb.error || "unknown error";
			fb.close();
			return { 
				success: false, 
				error: "file written to disk but failed to add to filebase: " + err,
				filePath: filePath
			};
		}

		fb.close();

		return {
			success: true,
			dirCode: dir.code,
			dirName: dir.name,
			filename: filename,
			description: description,
			from: from,
			size: content.length,
			path: filePath,
			tags: tags || null,
			overwritten: existing ? true : false
		};

	} catch (e) {
		try { fb.close(); } catch (e2) {}
		return { success: false, error: "exception creating file: " + String(e) };
	}
}

function match(packet) {
	var loc = String(packet.location || "");
	var oper = String(packet.oper || "").toUpperCase();

	// CREATE operations
	if (oper === "CREATE" || oper === "WRITE") {
		if (loc === "files/add" || 
		    loc === "files/create" ||
		    loc.indexOf("files/dir/") === 0) {
			return true;
		}
	}

	// READ operations
	return (loc === "files/summary" ||
		loc === "files/dirs" ||
		loc === "files/writable" ||
		loc === "files/recent" ||
		loc === "files/search" ||
		loc.indexOf("files/lib/") === 0 ||
		loc.indexOf("files/dir/") === 0 ||
		loc === "__files_probe");
}

function handle(ctx, client, packet) {
	var location = String(packet.location || "");
	var oper = String(packet.oper || "").toUpperCase();

	// Handle CREATE/WRITE operations
	if (oper === "CREATE" || oper === "WRITE") {
		// Add existing file to filebase: files/add
		if (location === "files/add") {
			var data = packet.data || {};
			var result = addFileEntry({
				dirCode: data.dirCode,
				filename: data.filename,
				description: data.description,
				from: data.from,
				extDesc: data.extDesc,
				tags: data.tags,
				cost: data.cost
			});
			ctx.sendResponse(client, "CREATE", location, result);
			return;
		}

		// Create text file and add to filebase: files/create
		if (location === "files/create") {
			var data = packet.data || {};
			var result = createTextFile({
				dirCode: data.dirCode,
				filename: data.filename,
				content: data.content,
				description: data.description,
				from: data.from,
				extDesc: data.extDesc,
				tags: data.tags,
				overwrite: data.overwrite
			});
			ctx.sendResponse(client, "CREATE", location, result);
			return;
		}

		// POST to files/dir/{code}/add or files/dir/{code}/create
		if (location.indexOf("files/dir/") === 0) {
			var path = location.substr("files/dir/".length);
			var parts = path.split("/");
			var dirCode = decodeURIComponent(parts[0]);
			var action = parts[1];

			if (action === "add") {
				var data = packet.data || {};
				var result = addFileEntry({
					dirCode: dirCode,
					filename: data.filename,
					description: data.description,
					from: data.from,
					extDesc: data.extDesc,
					tags: data.tags,
					cost: data.cost
				});
				ctx.sendResponse(client, "CREATE", location, result);
				return;
			}

			if (action === "create") {
				var data = packet.data || {};
				var result = createTextFile({
					dirCode: dirCode,
					filename: data.filename,
					content: data.content,
					description: data.description,
					from: data.from,
					extDesc: data.extDesc,
					tags: data.tags,
					overwrite: data.overwrite
				});
				ctx.sendResponse(client, "CREATE", location, result);
				return;
			}
		}

		ctx.sendError(client, location, "CREATE not supported for this endpoint");
		return;
	}

	if (location === "__files_probe") {
		ctx.sendResponse(client, "READ", location, {
			route: "files",
			endpoints: ["files/summary", "files/dirs", "files/writable", "files/recent", "files/search",
			            "files/lib/{libName}", "files/dir/{code}", "files/dir/{code}/recent"],
			createEndpoints: ["files/add", "files/create", "files/dir/{code}/add", "files/dir/{code}/create"],
			note: "CREATE operations require oper='CREATE' and are limited to whitelisted directories"
		});
		return;
	}

	if (location === "files/summary") {
		ctx.sendResponse(client, "READ", location, getFileAreaSummary());
		return;
	}

	if (location === "files/dirs") {
		ctx.sendResponse(client, "READ", location, listDirs());
		return;
	}

	if (location === "files/writable") {
		var writable = getWritableDirs();
		ctx.sendResponse(client, "READ", location, {
			count: writable.length,
			dirs: writable,
			note: "These directories are whitelisted for CREATE operations"
		});
		return;
	}

	if (location === "files/recent") {
		var limit = packet.data && packet.data.limit ? coerceNum(packet.data.limit) : 20;
		var lib = packet.data && packet.data.lib ? String(packet.data.lib) : null;
		ctx.sendResponse(client, "READ", location, getRecentFiles(limit, lib));
		return;
	}

	if (location === "files/search") {
		var data = packet.data || {};
		var query = data.query ? String(data.query) : "";
		if (!query) {
			ctx.sendError(client, location, "query parameter required");
			return;
		}
		var limit = data.limit ? coerceNum(data.limit) : 20;
		ctx.sendResponse(client, "READ", location, searchFiles(query, limit));
		return;
	}

	// Library details: files/lib/{libName}
	if (location.indexOf("files/lib/") === 0) {
		var libName = decodeURIComponent(location.substr("files/lib/".length));
		if (!libName) {
			ctx.sendError(client, location, "missing library name");
			return;
		}
		var lib = getLibDetails(libName);
		if (!lib) {
			var libNames = [];
			for (var li = 0; li < file_area.lib_list.length; li++) {
				libNames.push(file_area.lib_list[li].name);
			}
			ctx.sendError(client, location, "library not found: " + libName + ". Available: " + libNames.join(", "));
			return;
		}
		ctx.sendResponse(client, "READ", location, lib);
		return;
	}

	// Directory routes: files/dir/{code} or files/dir/{code}/recent
	if (location.indexOf("files/dir/") === 0) {
		var path = location.substr("files/dir/".length);
		var parts = path.split("/");
		var dirCode = decodeURIComponent(parts[0]);
		var action = parts[1] || "stats";

		if (!dirCode) {
			ctx.sendError(client, location, "missing directory code");
			return;
		}

		if (action === "recent") {
			var limit = packet.data && packet.data.limit ? coerceNum(packet.data.limit) : 20;
			var result = getDirRecent(dirCode, limit);
			if (!result) {
				var dirs = listDirs();
				var suggestions = dirs.dirs.slice(0, 10).map(function(d) { return d.code; });
				ctx.sendError(client, location, "directory not found: " + dirCode + ". Try: " + suggestions.join(", "));
				return;
			}
			ctx.sendResponse(client, "READ", location, result);
			return;
		}

		// Default: get stats
		var stats = getDirStats(dirCode);
		if (!stats) {
			var dirs = listDirs();
			var suggestions = dirs.dirs.slice(0, 10).map(function(d) { return d.code; });
			ctx.sendError(client, location, "directory not found: " + dirCode + ". Try: " + suggestions.join(", "));
			return;
		}
		ctx.sendResponse(client, "READ", location, stats);
		return;
	}

	ctx.sendError(client, location, "unknown files location");
}

return { name: name, match: match, handle: handle };
}
