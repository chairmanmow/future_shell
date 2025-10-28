if (typeof Feed === 'undefined') {
    try { load('rss-atom.js'); } catch (_e) { }
}
if (typeof utf8_cp437 === 'undefined') {
    try { load('utf8_cp437.js'); } catch (_encErr) { }
}
load("future_shell/lib/subprograms/subprogram.js");
load('future_shell/lib/subprograms/subprogram_hotspots.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
load('future_shell/lib/shell/icon.js');
load('future_shell/lib/util/gif2ans/img_loader.js')
load('future_shell/lib/util/layout/button.js');
// Load dissolve animation function
try { load('future_shell/lib/effects/eye_candy.js'); } catch (e) { /* dissolve optional */ }

function newsreaderEnsureTrailingSlash(path) {
    if (!path) return '';
    var last = path.charAt(path.length - 1);
    if (last === '/' || last === '\\') return path;
    return path + '/';
}

function newsreaderEnsureDirectory(path) {
    if (!path) return false;
    var normalized = path;
    while (normalized.length && (normalized.charAt(normalized.length - 1) === '/' || normalized.charAt(normalized.length - 1) === '\\')) {
        normalized = normalized.substring(0, normalized.length - 1);
    }
    if (!normalized.length) return false;
    if (normalized.length === 2 && normalized.charAt(1) === ':') return true;
    if (file_isdir(normalized)) return true;
    var idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    if (idx > 0) {
        var parent = normalized.substring(0, idx);
        if (parent && parent !== normalized) newsreaderEnsureDirectory(parent);
    }
    try { mkdir(normalized); } catch (_mkdirErr) { }
    return file_isdir(normalized);
}

function newsreaderResolveDataBaseDir() {
    var base = '';
    if (typeof system !== 'undefined' && system && system.mods_dir) base = system.mods_dir;
    else if (typeof js !== 'undefined' && js && js.exec_dir) base = js.exec_dir;
    if (!base) return '';
    base = newsreaderEnsureTrailingSlash(base) + 'future_shell/data';
    if (!newsreaderEnsureDirectory(base)) return '';
    return newsreaderEnsureTrailingSlash(base);
}

function newsreaderResolveFavoritesDirectory() {
    var base = newsreaderResolveDataBaseDir();
    if (!base) return '';
    var dir = base + 'newsreader';
    if (!newsreaderEnsureDirectory(dir)) return '';
    return newsreaderEnsureTrailingSlash(dir);
}

function newsreaderResolveUserKey() {
    if (typeof user === 'object' && user) {
        if (typeof user.number === 'number' && user.number > 0) return 'user' + user.number;
        if (user.alias) return 'alias_' + newsreaderSlugify(user.alias);
    }
    return 'guest';
}

function newsreaderResolveFavoritesFile(userKey) {
    var dir = newsreaderResolveFavoritesDirectory();
    if (!dir) return null;
    var key = userKey || newsreaderResolveUserKey();
    return dir + 'favorites_' + key + '.json';
}

function newsreaderReadFavoritesFile(path) {
    if (!path) return [];
    var file = new File(path);
    if (!file.exists) return [];
    if (!file.open('r')) return [];
    var text = '';
    try { text = file.readAll().join('\n'); }
    catch (_favReadErr) { text = ''; }
    file.close();
    if (!text) return [];
    try {
        var parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.feeds)) return parsed.feeds;
    } catch (_favParseErr) { }
    return [];
}

function newsreaderWriteFavoritesFile(path, list) {
    if (!path) return false;
    var file = new File(path);
    if (!file.open('w')) return false;
    try {
        var payload = JSON.stringify({ feeds: list || [] });
        file.write(payload);
    } catch (_favWriteErr) {
        try { file.close(); } catch (_closeErr) { }
        return false;
    }
    file.close();
    return true;
}

function resolveAttr(key, fallback) {
    if (typeof fallback === 'undefined') fallback = 0;
    if (typeof ICSH_ATTR === 'function' && typeof ICSH_VALS !== 'undefined' && ICSH_VALS) {
        try { return ICSH_ATTR(key); } catch (_ignored) { }
    }
    return fallback;
}

var NEWSREADER_DEFAULT_FEEDS = [];

function newsreaderSlugify(label) {
    if (!label) return '';
    return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function newsreaderResolveConfigPath(filename) {
    if (typeof ICSH_resolveConfigPath === 'function') {
        try { return ICSH_resolveConfigPath(filename); } catch (_cfgPathErr) { }
    }
    var base = '';
    if (typeof system !== 'undefined' && system && system.mods_dir) base = system.mods_dir;
    else if (typeof js !== 'undefined' && js && js.exec_dir) base = js.exec_dir;
    if (base && base.charAt(base.length - 1) !== '/' && base.charAt(base.length - 1) !== '\\') base += '/';
    return base + 'future_shell/lib/config/' + filename;
}

function newsreaderReadConfigFile(filename) {
    if (!filename) return null;
    var path = newsreaderResolveConfigPath(filename);
    var file = new File(path);
    if (!file.exists) return null;
    if (!file.open('r')) return null;
    var text = file.readAll().join('\n');
    file.close();
    return text;
}

function newsreaderParseIni(raw) {
    var data = {};
    var order = [];
    if (!raw && raw !== '') return data;
    var lines = String(raw).split(/\r?\n/);
    var current = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.charAt(0) === ';' || line.charAt(0) === '#') continue;
        var sectionMatch = line.match(/^\[(.+?)\]$/);
        if (sectionMatch) {
            current = sectionMatch[1];
            if (!data[current]) data[current] = {};
            order.push(current);
            continue;
        }
        if (!current) continue;
        var eq = line.indexOf('=');
        if (eq === -1) continue;
        var key = line.substring(0, eq).trim();
        var val = line.substring(eq + 1).trim();
        data[current][key] = val;
    }
    data.__order = order;
    return data;
}

function newsreaderGetIniValue(section, key) {
    if (!section || key === undefined || key === null) return undefined;
    if (Object.prototype.hasOwnProperty.call(section, key)) return section[key];
    var target = String(key).toLowerCase();
    for (var prop in section) {
        if (!Object.prototype.hasOwnProperty.call(section, prop)) continue;
        if (prop.toLowerCase() === target) return section[prop];
    }
    return undefined;
}

function newsreaderParseBoolean(value) {
    if (value === undefined || value === null) return undefined;
    var str = String(value).trim().toLowerCase();
    if (!str) return undefined;
    if (str === 'true' || str === 'yes' || str === 'on' || str === '1') return true;
    if (str === 'false' || str === 'no' || str === 'off' || str === '0') return false;
    return undefined;
}

function newsreaderCloneFeed(feed) {
    if (!feed) return null;
    var copy = {};
    for (var key in feed) {
        if (Object.prototype.hasOwnProperty.call(feed, key)) copy[key] = feed[key];
    }
    return copy;
}


function newsreaderCloneFeedList(list) {
    var out = [];
    if (!list || !list.length) return out;
    for (var i = 0; i < list.length; i++) {
        var cloned = newsreaderCloneFeed(list[i]);
        if (cloned) out.push(cloned);
    }
    return out;
}

function newsreaderCloneCategoryMap(map) {
    var out = {};
    if (!map) return out;
    for (var key in map) {
        if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
        var src = map[key];
        var dest = {};
        for (var prop in src) {
            if (Object.prototype.hasOwnProperty.call(src, prop)) dest[prop] = src[prop];
        }
        out[key] = dest;
    }
    return out;
}

function newsreaderCloneCategoryNode(node) {
    if (!node) return null;
    var copy = {
        slug: node.slug || '',
        name: node.name || '',
        icon: node.icon || null,
        order: (typeof node.order === 'number') ? node.order : null,
        hidden: !!node.hidden,
        parentSlug: node.parentSlug || null,
        feeds: newsreaderCloneFeedList(node.feeds),
        children: [],
        meta: {}
    };
    if (node.meta) {
        for (var mk in node.meta) {
            if (Object.prototype.hasOwnProperty.call(node.meta, mk)) copy.meta[mk] = node.meta[mk];
        }
    }
    if (node.children && node.children.length) {
        for (var i = 0; i < node.children.length; i++) {
            var clonedChild = newsreaderCloneCategoryNode(node.children[i]);
            if (clonedChild) {
                clonedChild.parentSlug = clonedChild.parentSlug || copy.slug;
                copy.children.push(clonedChild);
            }
        }
    }
    return copy;
}

function newsreaderLinkCategoryParents(node, parent) {
    if (!node) return;
    node.parent = parent || null;
    if (!node.children || !node.children.length) return;
    for (var i = 0; i < node.children.length; i++) {
        newsreaderLinkCategoryParents(node.children[i], node);
    }
}

function newsreaderCloneCategoryTree(tree) {
    var cloned = newsreaderCloneCategoryNode(tree);
    if (cloned) newsreaderLinkCategoryParents(cloned, null);
    return cloned;
}

function newsreaderFindSectionName(sections, name) {
    if (!sections || !sections.length) return null;
    var target = String(name).toLowerCase();
    for (var i = 0; i < sections.length; i++) {
        if (sections[i] && sections[i].toLowerCase() === target) return sections[i];
    }
    return null;
}

function newsreaderGetSection(ini, sections, name) {
    if (!ini || !name) return null;
    if (ini[name]) return ini[name];
    var actual = newsreaderFindSectionName(sections, name);
    return actual ? ini[actual] : null;
}

function newsreaderUrlLooksLikeTrackingPixel(url) {
    if (!url) return false;
    var lower = String(url).toLowerCase();
    if (/pixel\.gif(?:$|\?)/.test(lower)) return true;
    if (/1x1|onepixel|spacer\.gif|beacon|track\.gif|tracking|stats\//.test(lower)) return true;
    if (/data:image\/(gif|png);base64,/i.test(lower)) {
        if (lower.indexOf('r0lgodlh') !== -1 || lower.indexOf('iVBORw0KGgo') !== -1) return true;
    }
    return false;
}

function newsreaderExtractNumeric(value) {
    if (value === undefined || value === null) return null;
    var num = parseFloat(String(value).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return null;
    return num;
}

function newsreaderEstimateDimensions(tagHtml) {
    if (!tagHtml) return {};
    var dims = {};
    var widthMatch = tagHtml.match(/\bwidth\s*=\s*['"]?([^'"\s>]+)/i);
    if (widthMatch) {
        var w = newsreaderExtractNumeric(widthMatch[1]);
        if (w !== null) dims.width = w;
    }
    var heightMatch = tagHtml.match(/\bheight\s*=\s*['"]?([^'"\s>]+)/i);
    if (heightMatch) {
        var h = newsreaderExtractNumeric(heightMatch[1]);
        if (h !== null) dims.height = h;
    }
    var styleMatch = tagHtml.match(/\bstyle\s*=\s*"([^"]*)"|\bstyle\s*=\s*'([^']*)'/i);
    var styleText = styleMatch ? (styleMatch[1] || styleMatch[2]) : null;
    if (styleText) {
        var widthStyle = styleText.match(/width\s*:\s*([0-9.]+)px/i);
        if (widthStyle) {
            var ws = newsreaderExtractNumeric(widthStyle[1]);
            if (ws !== null) dims.width = ws;
        }
        var heightStyle = styleText.match(/height\s*:\s*([0-9.]+)px/i);
        if (heightStyle) {
            var hs = newsreaderExtractNumeric(heightStyle[1]);
            if (hs !== null) dims.height = hs;
        }
    }
    return dims;
}

function newsreaderIsLikelyTrackingPixel(tagHtml, url) {
    if (newsreaderUrlLooksLikeTrackingPixel(url)) return true;
    var dims = newsreaderEstimateDimensions(tagHtml);
    var width = (dims && typeof dims.width === 'number') ? dims.width : null;
    var height = (dims && typeof dims.height === 'number') ? dims.height : null;
    if (width !== null && width <= 2 && height !== null && height <= 2) return true;
    if (width !== null && width <= 2 && height === null) return true;
    if (height !== null && height <= 2 && width === null) return true;
    return false;
}

var _newsreaderConfigCache = null;

function newsreaderLoadConfig() {
    var raw = newsreaderReadConfigFile('newsreader.ini');
    if (!raw) return null;
    var ini = newsreaderParseIni(raw);
    if (!ini) return null;
    var sections = ini.__order || [];
    var config = { feeds: [], categories: {}, categoryTree: null };

    var categoryNodeSections = [];
    var feedSections = [];

    var nodeLookup = {};
    var nodeSequence = 0;

    function ensureCategoryNode(slug, defaults) {
        defaults = defaults || {};
        var baseSlug = slug ? String(slug) : '';
        if (!baseSlug && defaults.name) baseSlug = defaults.name;
        var normalized = newsreaderSlugify(baseSlug);
        if (!normalized) return null;
        var key = normalized.toLowerCase();
        var node = nodeLookup[key];
        if (!node) {
            node = {
                slug: normalized,
                name: defaults.name || normalized.replace(/_/g, ' '),
                icon: defaults.icon || null,
                order: (typeof defaults.order === 'number') ? defaults.order : null,
                hidden: !!defaults.hidden,
                parentSlug: defaults.parentSlug ? newsreaderSlugify(defaults.parentSlug) : 'root',
                children: [],
                feeds: [],
                meta: {},
                _sequence: (typeof defaults.sequence === 'number') ? defaults.sequence : nodeSequence++
            };
            nodeLookup[key] = node;
        } else {
            if (defaults.name) node.name = defaults.name;
            if (defaults.icon) node.icon = defaults.icon;
            if (typeof defaults.order === 'number') node.order = defaults.order;
            if (defaults.hidden !== undefined) node.hidden = defaults.hidden ? true : false;
            if (defaults.parentSlug) node.parentSlug = newsreaderSlugify(defaults.parentSlug);
            if (typeof defaults.sequence === 'number' && typeof node._sequence !== 'number') node._sequence = defaults.sequence;
        }
        if (defaults.meta) {
            for (var mk in defaults.meta) {
                if (Object.prototype.hasOwnProperty.call(defaults.meta, mk)) node.meta[mk] = defaults.meta[mk];
            }
        }
        return node;
    }

    function resolveCategoryNode(slug) {
        if (!slug) return null;
        var normalized = newsreaderSlugify(slug);
        if (!normalized) return null;
        return nodeLookup[normalized.toLowerCase()] || null;
    }

    var rootNode = ensureCategoryNode('root', { name: 'News Index', parentSlug: null, hidden: true, sequence: -1 });
    if (rootNode) {
        rootNode.parentSlug = null;
        rootNode.hidden = true;
    }

    for (var i = 0; i < sections.length; i++) {
        var secName = sections[i];
        if (!secName) continue;
        var lower = secName.toLowerCase();
        if (lower.indexOf('categorynode.') === 0) {
            categoryNodeSections.push(secName);
            continue;
        }
        if (lower.indexOf('category.') === 0) {
            var catSection = ini[secName];
            if (!catSection) continue;
            var matchName = newsreaderGetIniValue(catSection, 'category');
            if (!matchName) matchName = secName.substring('Category.'.length);
            var slug = newsreaderSlugify(matchName);
            if (!slug) continue;
            var label = newsreaderGetIniValue(catSection, 'label') || newsreaderGetIniValue(catSection, 'name') || matchName.replace(/_/g, ' ');
            var icon = newsreaderGetIniValue(catSection, 'icon');
            config.categories[slug] = {};
            if (label) config.categories[slug].label = label;
            if (icon) config.categories[slug].icon = icon;
            continue;
        }
        if (lower.indexOf('feed.') === 0) {
            feedSections.push(secName);
        }
    }

    for (var c = 0; c < categoryNodeSections.length; c++) {
        var nodeSectionName = categoryNodeSections[c];
        var nodeSection = ini[nodeSectionName];
        if (!nodeSection) continue;
        var slugPart = nodeSectionName.substring('CategoryNode.'.length);
        var labelVal = newsreaderGetIniValue(nodeSection, 'label') || newsreaderGetIniValue(nodeSection, 'name') || slugPart.replace(/_/g, ' ');
        var parentVal = newsreaderGetIniValue(nodeSection, 'parent');
        var iconVal = newsreaderGetIniValue(nodeSection, 'icon');
        var orderVal = newsreaderExtractNumeric(newsreaderGetIniValue(nodeSection, 'order'));
        var hiddenVal = newsreaderParseBoolean(newsreaderGetIniValue(nodeSection, 'hidden'));
        var meta = {};
        var continentVal = newsreaderGetIniValue(nodeSection, 'continent');
        if (continentVal) meta.continent = continentVal;
        var typeVal = newsreaderGetIniValue(nodeSection, 'type');
        if (typeVal) meta.type = typeVal;
        var nodeDefaults = {
            name: labelVal,
            icon: iconVal || null,
            parentSlug: parentVal || null,
            hidden: hiddenVal === true,
            sequence: nodeSequence++,
            meta: meta
        };
        if (orderVal !== null) nodeDefaults.order = orderVal;
        if (!nodeDefaults.parentSlug) nodeDefaults.parentSlug = 'root';
        ensureCategoryNode(slugPart, nodeDefaults);
    }

    for (var overrideSlug in config.categories) {
        if (!Object.prototype.hasOwnProperty.call(config.categories, overrideSlug)) continue;
        var override = config.categories[overrideSlug] || {};
        var overrideNode = ensureCategoryNode(overrideSlug, { parentSlug: 'root' });
        if (!overrideNode) continue;
        if (override.label) overrideNode.name = override.label;
        if (override.icon) overrideNode.icon = override.icon;
    }

    function ensureNodePath(pathValue) {
        if (!pathValue) return null;
        var parts = String(pathValue).split('/');
        var parentSlug = 'root';
        var current = rootNode;
        for (var pi = 0; pi < parts.length; pi++) {
            var part = parts[pi];
            if (!part) continue;
            var label = String(part).trim();
            if (!label) continue;
            var slugPiece = newsreaderSlugify(label);
            if (!slugPiece) continue;
            var composedSlug = parentSlug === 'root' ? slugPiece : parentSlug + '_' + slugPiece;
            var node = resolveCategoryNode(composedSlug);
            if (!node) node = ensureCategoryNode(composedSlug, { name: label, parentSlug: parentSlug });
            if (typeof node._sequence !== 'number') node._sequence = nodeSequence++;
            parentSlug = node.slug;
            current = node;
        }
        return current || rootNode;
    }

    var seen = {};
    for (var f = 0; f < feedSections.length; f++) {
        var sectionName = feedSections[f];
        if (!sectionName) continue;
        var lookup = sectionName.toLowerCase();
        if (seen[lookup]) continue;
        seen[lookup] = true;
        var feedSection = newsreaderGetSection(ini, sections, sectionName);
        if (!feedSection) continue;
        var enabledVal = newsreaderParseBoolean(newsreaderGetIniValue(feedSection, 'enabled'));
        if (enabledVal === false) continue;
        var url = newsreaderGetIniValue(feedSection, 'url');
        if (!url) continue;
        var defaultLabel = sectionName.substring('Feed.'.length).replace(/_/g, ' ');
        var label = newsreaderGetIniValue(feedSection, 'label') || defaultLabel;
        var icon = newsreaderGetIniValue(feedSection, 'icon');
        var categoryIcon = newsreaderGetIniValue(feedSection, 'category_icon');
        var category = newsreaderGetIniValue(feedSection, 'category') || 'Misc';
        var categoryNodeSlug = newsreaderGetIniValue(feedSection, 'category_node') || newsreaderGetIniValue(feedSection, 'category_slug');
        var categoryPath = newsreaderGetIniValue(feedSection, 'category_path');
        var continentVal = newsreaderGetIniValue(feedSection, 'continent');
        var countryVal = newsreaderGetIniValue(feedSection, 'country');
        var subcategoryVal = newsreaderGetIniValue(feedSection, 'subcategory');
        var combinedScoreVal = newsreaderExtractNumeric(newsreaderGetIniValue(feedSection, 'combined_score'));
        var imgScoreVal = newsreaderExtractNumeric(newsreaderGetIniValue(feedSection, 'img_score'));
        var fulltextScoreVal = newsreaderExtractNumeric(newsreaderGetIniValue(feedSection, 'fulltext_score'));

        var feedObj = {
            label: label,
            url: url
        };
        if (icon) feedObj.icon = icon;
        if (categoryIcon) feedObj.category_icon = categoryIcon;
        if (continentVal) feedObj.continent = continentVal;
        if (countryVal) feedObj.country = countryVal;
        if (subcategoryVal) feedObj.subcategory = subcategoryVal;
        if (combinedScoreVal !== null) feedObj.combined_score = combinedScoreVal;
        if (imgScoreVal !== null) feedObj.img_score = imgScoreVal;
        if (fulltextScoreVal !== null) feedObj.fulltext_score = fulltextScoreVal;

        var targetNode = null;
        if (categoryNodeSlug) targetNode = ensureCategoryNode(categoryNodeSlug);
        if (!targetNode && categoryPath) targetNode = ensureNodePath(categoryPath);
        if (!targetNode && category) targetNode = ensureCategoryNode(category, { name: category, parentSlug: 'root' });
        if (!targetNode) targetNode = rootNode;

        if (!targetNode.feeds) targetNode.feeds = [];
        targetNode.feeds.push(feedObj);
        if (!targetNode.icon && categoryIcon) targetNode.icon = categoryIcon;
        feedObj.category_node = targetNode.slug;
        feedObj.category_slug = targetNode.slug;
        feedObj.category = targetNode.name || category;
        config.feeds.push(feedObj);
    }

    for (var nodeKey in nodeLookup) {
        if (!Object.prototype.hasOwnProperty.call(nodeLookup, nodeKey)) continue;
        var nodeRef = nodeLookup[nodeKey];
        if (!nodeRef.feeds) nodeRef.feeds = [];
    }

    function assembleTree() {
        for (var key in nodeLookup) {
            if (!Object.prototype.hasOwnProperty.call(nodeLookup, key)) continue;
            var node = nodeLookup[key];
            node.children = [];
        }
        for (var key2 in nodeLookup) {
            if (!Object.prototype.hasOwnProperty.call(nodeLookup, key2)) continue;
            var node2 = nodeLookup[key2];
            if (!node2 || node2 === rootNode) continue;
            var parentSlug = node2.parentSlug || 'root';
            var parentKey = newsreaderSlugify(parentSlug || '') || 'root';
            parentKey = parentKey.toLowerCase();
            var parentNode = nodeLookup[parentKey] || rootNode;
            if (!parentNode.children) parentNode.children = [];
            parentNode.children.push(node2);
        }
        function sortChildren(list) {
            if (!list || !list.length) return;
            list.sort(function (a, b) {
                var ao = (typeof a.order === 'number') ? a.order : null;
                var bo = (typeof b.order === 'number') ? b.order : null;
                if (ao !== null || bo !== null) {
                    if (ao === null) return 1;
                    if (bo === null) return -1;
                    if (ao !== bo) return ao - bo;
                }
                var asq = (typeof a._sequence === 'number') ? a._sequence : Number.MAX_SAFE_INTEGER;
                var bsq = (typeof b._sequence === 'number') ? b._sequence : Number.MAX_SAFE_INTEGER;
                if (asq !== bsq) return asq - bsq;
                var an = (a.name || a.slug || '').toLowerCase();
                var bn = (b.name || b.slug || '').toLowerCase();
                return an > bn ? 1 : (an < bn ? -1 : 0);
            });
            for (var i = 0; i < list.length; i++) sortChildren(list[i].children);
        }
        sortChildren(rootNode.children);
    }

    assembleTree();

    function assignCategoryPaths(node, pathParts) {
        if (!node) return;
        var parts = pathParts ? pathParts.slice(0) : [];
        if (node.slug !== 'root') parts.push(node.name || node.slug);
        if (node.feeds && node.feeds.length) {
            var pathLabel = parts.join(' / ');
            for (var i = 0; i < node.feeds.length; i++) {
                if (!node.feeds[i]) continue;
                node.feeds[i].category_path = pathLabel;
            }
        }
        if (node.children && node.children.length) {
            for (var j = 0; j < node.children.length; j++) assignCategoryPaths(node.children[j], parts);
        }
    }

    assignCategoryPaths(rootNode, []);
    config.categoryTree = rootNode;
    return config;
}

function getNewsreaderConfig(forceReload) {
    if (forceReload) _newsreaderConfigCache = null;
    if (!_newsreaderConfigCache) {
        var loaded = newsreaderLoadConfig();
        if (!loaded || !loaded.feeds || !loaded.feeds.length) {
            _newsreaderConfigCache = {
                feeds: newsreaderCloneFeedList(NEWSREADER_DEFAULT_FEEDS),
                categories: {},
                categoryTree: null
            };
        } else {
            _newsreaderConfigCache = {
                feeds: newsreaderCloneFeedList(loaded.feeds),
                categories: newsreaderCloneCategoryMap(loaded.categories),
                categoryTree: loaded.categoryTree ? newsreaderCloneCategoryTree(loaded.categoryTree) : null
            };
        }
    }
    return {
        feeds: newsreaderCloneFeedList(_newsreaderConfigCache.feeds),
        categories: newsreaderCloneCategoryMap(_newsreaderConfigCache.categories),
        categoryTree: _newsreaderConfigCache.categoryTree ? newsreaderCloneCategoryTree(_newsreaderConfigCache.categoryTree) : null
    };
}
var IMAGE_CACHE_LIMIT = 1;
var NEWSREADER_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var NEWSREADER_ASCII_ENTITY_MAP = {
    160: ' ',
    169: '(c)',
    174: '(R)',
    215: 'x',
    8211: '-',
    8212: '-',
    8216: "'",
    8217: "'",
    8218: ',',
    8220: '"',
    8221: '"',
    8222: '"',
    8224: '+',
    8226: '*',
    8230: '...',
    8482: '(TM)',
    8722: '-',
    188: '1/4',
    189: '1/2',
    190: '3/4'
};
var NEWSREADER_UNICODE_PUNCT_MAP = {
    '\u00A0': ' ',
    '\u2018': "'",
    '\u2019': "'",
    '\u201A': ',',
    '\u201C': '"',
    '\u201D': '"',
    '\u201E': '"',
    '\u2013': '-',
    '\u2014': '-',
    '\u2022': '*',
    '\u2026': '...',
    '\u2122': '(TM)'
};


function NewsReader(opts) {
    log("!!!  NewsReader ctor called  !!!");
    opts = opts || {};
    Subprogram.call(this, { name: 'newsreader', parentFrame: opts.parentFrame });

    this.feedCache = {};
    this.headerFrame = null;
    this.statusFrame = null;
    this.listFrame = null;
    this.articleIconFrame = null;
    this.articleCategoryIconFrame = null;
    this.articleCategoryLabelFrame = null;
    this.articleHeaderFrame = null;
    this.articleHeaderTextFrame = null;
    this.articleHeaderLabelFrame = null;
    this.articleIconObj = null;
    this.articleCategoryIconObj = null;
    this.articleImagePreviewFrame = null;
    this.articleTextOffset = 1;
    this.articleImages = [];
    this.imageSelection = 0;
    this.imageScrollOffset = 0;
    this._currentIconKey = null;
    this._articleHeaderIconWidth = null;
    this._articleHeaderHeight = null;
    this._articleHeaderHasIcon = null;
    this._articleHeaderHasCategory = null;
    this.categoryIconCells = [];
    this.feedIconCells = [];
    this._categoryGridItems = [];
    this._feedGridItems = [];
    this._hotspotMap = {};
    this._hotspotChars = null;
    this._gridLayout = null;
    this.imageAnsiCache = {};
    this._imageAnsiErrors = {};
    this._loadingOverlayFrame = null;
    this._iconExistCache = {};
    this._imageAnsiOrder = [];
    this._allFeeds = [];
    this._categoryOverrides = {};
    this._categoryTree = null;
    this.categoryStack = [];
    this._pendingHotspotDefs = [];
    try {
        this.hotspots = new SubprogramHotspotHelper({ shell: this.shell, owner: 'newsreader', layerName: 'newsreader', priority: 62 });
    } catch (_) {
        this.hotspots = null;
    }
    this._resetState();
    this.id = 'newsreader';
    this.registerColors({
        LIGHTBAR: { BG: BG_RED, FG: WHITE },
        LIST_ACTIVE: { BG: BG_RED, FG: WHITE },
        LINK_BUTTON: { BG: BG_CYAN, FG: WHITE },
        LIST_INACTIVE: { BG: BG_BLACK, FG: LIGHTGRAY },
        HEADER: { BG: BG_MAGENTA, FG: WHITE },
        STATUS: { BG: BG_BLACK, FG: LIGHTGRAY },
        TITLE_FRAME: { BG: BG_RED, FG: WHITE },
        CONTENT_FRAME: { BG: BG_BLACK, FG: LIGHTGRAY },
        FOOTER_FRAME: { BG: BG_BLACK, FG: LIGHTRED },
        READ_HEADER: { BG: BG_RED, FG: WHITE },
        TEXT_HOTKEY: { FG: YELLOW },
        TEXT_NORMAL: { FG: LIGHTGRAY },
        TEXT_BOLD: { FG: LIGHTMAGENTA },
        LIST_TIME: { FG: CYAN },
        LOADING_MODAL: { BG: BG_RED, FG: WHITE }
    });
}
extend(NewsReader, Subprogram);

function stripBlinkSequences(input) {
    if (!input) return input;
    return String(input).replace(/\x1B\[([0-9;]*?)m/g, function (match, params) {
        if (!params) return match;
        var list = params.split(';').filter(function (p) { return p.length; });
        if (!list.length) return match;
        var filtered = [];
        var changed = false;
        for (var i = 0; i < list.length; i++) {
            if (list[i] === '5') {
                changed = true;
                continue;
            }
            filtered.push(list[i]);
        }
        if (!changed) return match;
        if (!filtered.length) return '\x1B[0m';
        return '\x1B[' + filtered.join(';') + 'm';
    });
}

NewsReader.prototype._resetState = function () {
    this._destroyArticleIcon();
    this._destroyCategoryIcons();
    this._destroyFeedIcons();
    this._releaseHotspots();
    this._pendingHotspotDefs = [];
    this._destroyLoadingOverlay();
    this.categoryIconCells = [];
    this.feedIconCells = [];
    this._categoryGridItems = [];
    this._feedGridItems = [];
    this._gridLayout = null;
    this._hotspotMap = {};
    this._hotspotChars = null;
    this._imageAnsiErrors = {};
    this._iconExistCache = {};
    this._clearImageAnsiCache();
    var feedConfig = getNewsreaderConfig();
    this._allFeeds = feedConfig.feeds || [];
    this._categoryOverrides = feedConfig.categories || {};
    this._categoryTree = feedConfig.categoryTree || null;
    this.categoryStack = [];
    this._favoriteUserKey = newsreaderResolveUserKey();
    this._favoriteStoragePath = newsreaderResolveFavoritesFile(this._favoriteUserKey);
    this._favoriteFeedUrls = newsreaderReadFavoritesFile(this._favoriteStoragePath);
    this._favoriteFeedMap = {};
    this._favoriteFeeds = [];
    this._favoritesCategoryNode = null;
    this._syncFavoritesCategory();
    if (this._categoryTree) {
        this.categoryStack.push(this._categoryTree);
        this.categories = this._visibleChildren(this._categoryTree);
    } else {
        this.categories = this._buildCategories();
    }
    if (!this.categories || !this.categories.length) {
        this.categories = this._buildCategories();
        this.categoryStack = [];
        this._categoryTree = null;
    }
    this.state = 'categories';
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.currentCategory = null;
    this.currentFeeds = [];
    this.currentFeed = null;
    this.currentFeedData = null;
    this.currentArticles = [];
    this.articleLines = [];
    this.articleIndex = -1;
    this.articleScroll = 0;
    this._articleListScroll = 0;
    this.statusMessage = '';
    this.statusMessageTs = 0;
    this.articleImages = [];
    this.imageSelection = 0;
    this.imageScrollOffset = 0;
    this.imagePreviewScroll = 0;
    this.articleTextOffset = 1;
    this._currentIconKey = null;
    this._currentPreviewUrl = null;
    this._imagePreviewScrollMax = 0;
    this._imagePreviewVisibleRows = 0;
    this.articleLinkButton = null;
    this.articleLinkButtonFrame = null;
    this._articleContentStartRow = null;
    this._articleButtonHotkey = null;
    this._articleListVisibleRows = null;
    this._currentArticleLink = '';
    this._articleContentVisibleRows = null;
    this._articleHeaderTextStart = null;
    this._articleHeaderTextWidth = null;
    this._articleHeaderBaseline = null;
    this._articleHeaderAttr = null;
    this._articleLinkButtonWidth = null;
    this._articleLinkButtonX = null;
    this._articleLinkButtonY = null;
    this._articleLinkButtonWidth = null;
    this._articleLinkButtonX = null;
    this._articleLinkButtonY = null;
};

NewsReader.prototype._nodeHasVisibleContent = function (node) {
    if (!node) return false;
    if (node.feeds && node.feeds.length) return true;
    if (!node.children || !node.children.length) return false;
    for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        if (!child || child.hidden) continue;
        if (this._nodeHasVisibleContent(child)) return true;
    }
    return false;
};

NewsReader.prototype._visibleChildren = function (node) {
    var out = [];
    if (node && node.children && node.children.length) {
        for (var i = 0; i < node.children.length; i++) {
            var child = node.children[i];
            if (!child || child.hidden) continue;
            if (!this._nodeHasVisibleContent(child)) continue;
            out.push(child);
        }
    }
    if (this._favoritesCategoryNode && node && (!node.slug || node.slug === 'root' || node === this._categoryTree)) {
        out.unshift(this._favoritesCategoryNode);
    }
    return out;
};

NewsReader.prototype._currentCategoryNode = function () {
    if (this.categoryStack && this.categoryStack.length) return this.categoryStack[this.categoryStack.length - 1];
    if (this._categoryTree) return this._categoryTree;
    return null;
};

NewsReader.prototype._pushCategoryLevel = function (node) {
    if (!node) return;
    if (!this.categoryStack) this.categoryStack = [];
    if (this.categoryStack.indexOf(node) === -1) this.categoryStack.push(node);
    var children = this._visibleChildren(node);
    this.categories = children;
    this._categoryGridItems = [];
    this.selectedIndex = children.length ? (this._canPopCategory() ? 1 : 0) : 0;
    this.scrollOffset = 0;
};

NewsReader.prototype._canPopCategory = function () {
    return !!(this.categoryStack && this.categoryStack.length > 1);
};

NewsReader.prototype._popCategoryLevel = function () {
    if (!this._canPopCategory()) return;
    var leaving = this.categoryStack.pop();
    var parent = this._currentCategoryNode();
    var siblings = parent ? this._visibleChildren(parent) : [];
    this.categories = siblings;
    this._categoryGridItems = [];
    this.scrollOffset = 0;
    if (leaving && siblings.length) {
        var idx = siblings.indexOf(leaving);
        if (idx !== -1) this.selectedIndex = this._canPopCategory() ? idx + 1 : idx;
        else this.selectedIndex = this._canPopCategory() ? 1 : 0;
    } else {
        this.selectedIndex = this._canPopCategory() ? 1 : 0;
    }
    this.currentCategory = null;
    this.currentFeeds = [];
};

NewsReader.prototype._categoryBreadcrumb = function () {
    if (!this.categoryStack || !this.categoryStack.length) return '';
    var parts = [];
    for (var i = 0; i < this.categoryStack.length; i++) {
        var node = this.categoryStack[i];
        if (!node || node.slug === 'root') continue;
        parts.push(node.name || node.slug);
    }
    return parts.join(' > ');
};

NewsReader.prototype.enter = function (done) {
    this._resetState();
    Subprogram.prototype.enter.call(this, done);
};

NewsReader.prototype._buildCategories = function () {
    var map = {};
    var feeds = this._allFeeds || [];
    var overrides = this._categoryOverrides || {};
    for (var i = 0; i < feeds.length; i++) {
        var feed = feeds[i];
        if (!feed || !feed.url) continue;
        var categoryName = feed.category || 'Misc';
        var slug = newsreaderSlugify(categoryName);
        if (!map[categoryName]) {
            var override = overrides[slug];
            var displayName = categoryName;
            var categoryIcon = null;
            if (override) {
                if (override.label) displayName = override.label;
                if (override.icon) categoryIcon = override.icon;
            }
            if (!categoryIcon && feed.category_icon) categoryIcon = feed.category_icon;
            map[categoryName] = {
                name: displayName,
                feeds: [],
                icon: categoryIcon || null,
                _key: categoryName,
                _slug: slug
            };
        } else if (!map[categoryName].icon && feed.category_icon) {
            map[categoryName].icon = feed.category_icon;
        }
        map[categoryName].feeds.push(feed);
    }
    var categories = [];
    for (var key in map) {
        if (!map.hasOwnProperty(key)) continue;
        categories.push(map[key]);
    }
    categories.sort(function (a, b) {
        var A = (a.name || '').toLowerCase();
        var B = (b.name || '').toLowerCase();
        return A > B ? 1 : (A < B ? -1 : 0);
    });
    if (this._favoritesCategoryNode) categories.unshift(this._favoritesCategoryNode);
    return categories;
};

NewsReader.prototype._resolveFavoriteStoragePath = function () {
    if (!this._favoriteStoragePath) {
        this._favoriteUserKey = this._favoriteUserKey || newsreaderResolveUserKey();
        this._favoriteStoragePath = newsreaderResolveFavoritesFile(this._favoriteUserKey);
    }
    return this._favoriteStoragePath;
};

NewsReader.prototype._saveFavoriteFeeds = function () {
    var path = this._resolveFavoriteStoragePath();
    return newsreaderWriteFavoritesFile(path, this._favoriteFeedUrls || []);
};

NewsReader.prototype._syncFavoritesCategory = function () {
    var urls = Array.isArray(this._favoriteFeedUrls) ? this._favoriteFeedUrls.slice(0) : [];
    var map = {};
    var unique = [];
    for (var i = 0; i < urls.length; i++) {
        var url = urls[i];
        if (!url || map[url]) continue;
        map[url] = true;
        unique.push(url);
    }
    this._favoriteFeedUrls = unique;
    this._favoriteFeedMap = map;
    var clones = [];
    if (unique.length && this._allFeeds && this._allFeeds.length) {
        var lookup = {};
        for (var f = 0; f < this._allFeeds.length; f++) {
            var feed = this._allFeeds[f];
            if (!feed || !feed.url) continue;
            if (!lookup[feed.url]) lookup[feed.url] = feed;
        }
        for (var u = 0; u < unique.length; u++) {
            var target = lookup[unique[u]];
            if (target) clones.push(newsreaderCloneFeed(target));
        }
    }
    if (clones.length) {
        if (!this._favoritesCategoryNode) {
            this._favoritesCategoryNode = {
                slug: '__favorites__',
                name: 'Favorite Feeds',
                icon: 'news_favorite',
                feeds: [],
                children: [],
                meta: { isFavorites: true }
            };
        }
        this._favoritesCategoryNode.feeds = clones;
        this._favoritesCategoryNode.hidden = false;
        this._favoriteFeeds = clones;
    } else {
        this._favoritesCategoryNode = null;
        this._favoriteFeeds = [];
    }
};

NewsReader.prototype._isFavoritesCategory = function (category) {
    return !!(category && category.meta && category.meta.isFavorites);
};

NewsReader.prototype._isFeedFavorite = function (feed) {
    if (!feed || !feed.url) return false;
    return !!(this._favoriteFeedMap && this._favoriteFeedMap[feed.url]);
};

NewsReader.prototype._setFavoriteState = function (feed, shouldFavorite) {
    if (!feed || !feed.url) return false;
    var url = feed.url;
    var map = this._favoriteFeedMap || {};
    var list = this._favoriteFeedUrls || [];
    var changed = false;
    if (shouldFavorite) {
        if (!map[url]) {
            map[url] = true;
            list.push(url);
            changed = true;
        }
    } else {
        if (map[url]) {
            delete map[url];
            for (var i = list.length - 1; i >= 0; i--) {
                if (list[i] === url) list.splice(i, 1);
            }
            changed = true;
        }
    }
    if (changed) {
        this._favoriteFeedMap = map;
        this._favoriteFeedUrls = list;
        this._saveFavoriteFeeds();
        this._syncFavoritesCategory();
    }
    return changed;
};

NewsReader.prototype._handleFavoriteViewRefresh = function () {
    if (this.state === 'categories') {
        var node = this._currentCategoryNode();
        if (node) this.categories = this._visibleChildren(node);
        else this.categories = this._buildCategories();
    }
    if (this.state === 'feeds' && this._isFavoritesCategory(this.currentCategory)) {
        if (this._favoritesCategoryNode) {
            this.currentCategory = this._favoritesCategoryNode;
            this.currentFeeds = this._feedsForCategory(this.currentCategory);
            var feedCount = this.currentFeeds ? this.currentFeeds.length : 0;
            var maxIndex = Math.max(0, feedCount);
            if (this.selectedIndex > maxIndex) this.selectedIndex = maxIndex;
            if (this.selectedIndex < 0) this.selectedIndex = 0;
        } else {
            this._destroyFeedIcons();
            this.state = 'categories';
            this.currentCategory = null;
            this.currentFeeds = [];
            this.currentFeed = null;
            this.selectedIndex = this._canPopCategory() ? 1 : 0;
            this.scrollOffset = 0;
        }
    }
};

NewsReader.prototype._toggleFavoriteForSelection = function (items) {
    if (!items || !items.length) return false;
    if (this.selectedIndex < 0 || this.selectedIndex >= items.length) return false;
    var entry = items[this.selectedIndex];
    if (!entry || entry._type === 'back') {
        this._setStatus('Select a feed to toggle favorite.');
        return true;
    }
    if (!entry.url) {
        this._setStatus('Feed is missing a URL.');
        return true;
    }
    var makeFavorite = !this._isFeedFavorite(entry);
    var changed = this._setFavoriteState(entry, makeFavorite);
    if (changed) {
        if (makeFavorite) this._setStatus('Added "' + (entry.label || entry.name || 'Feed') + '" to favorites.');
        else this._setStatus('Removed "' + (entry.label || entry.name || 'Feed') + '" from favorites.');
        this._handleFavoriteViewRefresh();
        this.draw();
    } else {
        this._setStatus('No favorite changes.');
    }
    return true;
};

NewsReader.prototype._deleteFrame = function (frame) {
    if (!frame) return;
    try {
        if (typeof frame.delete === 'function') frame.delete();
        else if (typeof frame.close === 'function') frame.close();
    } catch (_eDel) { }
    if (this._myFrames) {
        var idx = this._myFrames.indexOf(frame);
        if (idx !== -1) this._myFrames.splice(idx, 1);
    }
};

NewsReader.prototype._destroyArticleIcon = function () {
    this._destroyArticlePreviewFrame();
    var frames = [
        'articleHeaderTextFrame',
        'articleHeaderLabelFrame',
        'articleHeaderFrame',
        'articleIconFrame',
        'articleCategoryIconFrame',
        'articleCategoryLabelFrame'
    ];
    for (var i = 0; i < frames.length; i++) {
        var key = frames[i];
        var frame = this[key];
        if (!frame) continue;
        this._deleteFrame(frame);
        this[key] = null;
    }
    this.articleIconObj = null;
    this.articleCategoryIconObj = null;
    this.articleTextOffset = 1;
    this._currentIconKey = null;
    this._articleHeaderIconWidth = null;
    this._articleHeaderHeight = null;
    this._articleHeaderHasIcon = null;
    this._articleHeaderHasCategory = null;
    this._articleHeaderTextStart = null;
    this._articleHeaderTextWidth = null;
    this._articleHeaderBaseline = null;
    this._articleHeaderAttr = null;
    if (this.headerFrame && typeof this._headerDefaultAttr === 'number') {
        try { this.headerFrame.attr = this._headerDefaultAttr; } catch (_eAttr) { }
        try { this.headerFrame.clear(this._headerDefaultAttr); } catch (_eClr) { }
    }
};

NewsReader.prototype._destroyArticlePreviewFrame = function () {
    if (this.articleImagePreviewFrame) {
        this._deleteFrame(this.articleImagePreviewFrame);
        this.articleImagePreviewFrame = null;
    }
    try { if (typeof js !== 'undefined' && js && typeof js.gc === 'function') js.gc(true); } catch (_eGc) { }
};

NewsReader.prototype._destroyArticleLinkButton = function () {
    if (this.articleLinkButton && typeof this.articleLinkButton.destroy === 'function') {
        try { this.articleLinkButton.destroy(); } catch (_eBtn) { }
    }
    this.articleLinkButton = null;
    if (this.articleLinkButtonFrame) {
        this._deleteFrame(this.articleLinkButtonFrame);
    }
    this.articleLinkButtonFrame = null;
    if (this.articleHeaderFrame) {
        var clearX = Math.max(1, this._articleLinkButtonX || this._articleHeaderTextStart || 1);
        var clearY = Math.max(1, this._articleLinkButtonY || (this._articleHeaderBaseline || 1) + 1);
        var clearWidth = this._articleLinkButtonWidth || this._articleHeaderTextWidth || 0;
        this._clearArticleHeaderButtonArea(clearX, clearY, clearWidth, 2);
    }
    this._articleContentStartRow = this.articleTextOffset;
    if (this._articleButtonHotkey && this._hotspotMap) {
        delete this._hotspotMap[this._articleButtonHotkey];
    }
    this._articleButtonHotkey = null;
    this._currentArticleLink = '';
    this._articleContentVisibleRows = null;
    this._articleLinkButtonWidth = null;
    this._articleLinkButtonX = null;
    this._articleLinkButtonY = null;
};
NewsReader.prototype._clearImageAnsiCache = function () {
    this.imageAnsiCache = {};
    this._imageAnsiOrder = [];
    this._imageAnsiErrors = {};
};

NewsReader.prototype._touchImageCacheKey = function (url) {
    if (!url) return;
    this._imageAnsiOrder = this._imageAnsiOrder || [];
    var idx = this._imageAnsiOrder.indexOf(url);
    if (idx !== -1) this._imageAnsiOrder.splice(idx, 1);
    this._imageAnsiOrder.push(url);
};

NewsReader.prototype._cacheImagePreview = function (url, preview) {
    if (!url || !preview) return;
    this.imageAnsiCache = this.imageAnsiCache || {};
    this._imageAnsiOrder = this._imageAnsiOrder || [];
    this.imageAnsiCache[url] = preview;
    this._touchImageCacheKey(url);
    while (this._imageAnsiOrder.length > IMAGE_CACHE_LIMIT) {
        var evict = this._imageAnsiOrder.shift();
        if (evict) delete this.imageAnsiCache[evict];
    }
};



NewsReader.prototype._iconExists = function (iconName) {
    if (!iconName) return false;
    this._iconExistCache = this._iconExistCache || {};
    if (this._iconExistCache.hasOwnProperty(iconName)) {
        return this._iconExistCache[iconName];
    }
    var baseDir = '';
    if (typeof system !== 'undefined' && system && system.mods_dir) baseDir = system.mods_dir;
    else if (typeof js !== 'undefined' && js && js.exec_dir) baseDir = js.exec_dir;
    if (baseDir && baseDir.charAt(baseDir.length - 1) !== '/' && baseDir.charAt(baseDir.length - 1) !== '\\') baseDir += '/';
    var pathBase = baseDir + 'future_shell/assets/' + iconName;
    var exists = false;
    if (typeof file_exists === 'function') {
        try {
            exists = file_exists(pathBase + '.bin') || file_exists(pathBase + '.ans');
        } catch (_iconExistsErr) {
            exists = false;
        }
    }
    this._iconExistCache[iconName] = exists;
    return exists;
};

NewsReader.prototype._destroyLoadingOverlay = function () {
    if (this._loadingModal) {
        try { this._loadingModal.close(); } catch (_e) { }
        this._loadingModal = null;
    }
    // Mitigation (Option 1): ensure any residual background from the loading modal
    // is overwritten with the inactive list background before next render.
    if (this.listFrame && typeof this.paletteAttr('LIST_INACTIVE') !== 'undefined') {
        try { this.listFrame.clear(this.paletteAttr('LIST_INACTIVE')); this.listFrame.home(); } catch (_eClr) { }
    }
    this.parentFrame.cycle();
};

NewsReader.prototype._showLoadingOverlay = function (message) {
    if (!this.listFrame || !this.parentFrame) return false;
    this._destroyLoadingOverlay();
    // Lazy load Modal if not already loaded in environment
    var self = this;
    this._loadingModal = new Modal({
        type: 'spinner',
        title: '',
        message: this._toDisplayText(message || 'Working...'),
        parentFrame: this.parentFrame,
        overlay: true,
        // Mitigation (Option 3): use LIST_INACTIVE so the spinner overlay background
        // matches final surface and does not leave a contrasting (blue) residue.
        attr: this.paletteAttr('LOADING_MODAL'),
        contentAttr: this.paletteAttr('LIST_INACTIVE'),
        buttonAttr: this.paletteAttr('LINK_BUTTON'),
        autoOpen: true,
        spinnerFrames: ['|', '/', '-', '\\'],
        spinnerInterval: 120,
        // custom size to cover listFrame roughly
        width: Math.max(30, Math.min(this.listFrame.width, 60)),
        height: Math.max(6, Math.min(this.listFrame.height, 10)),
        onClose: function () { self._loadingModal = null; }
    });
    return true;
};

NewsReader.prototype._hideLoadingOverlay = function () {
    if (!this._loadingModal) return;
    this._destroyLoadingOverlay();
};

NewsReader.prototype._destroyIconCells = function (cells) {
    if (!cells || !cells.length) return;
    for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (!cell) continue;
        if (cell.borderFrame) this._deleteFrame(cell.borderFrame);
        if (cell.icon) this._deleteFrame(cell.icon);
        if (cell.label) this._deleteFrame(cell.label);
    }
    cells.length = 0;
};

NewsReader.prototype._destroyCategoryIcons = function () {
    this._destroyIconCells(this.categoryIconCells);
    this.categoryIconCells = [];
    this._categoryGridItems = [];
    if (this._gridLayout && this._gridLayout.type === 'categories') {
        this._releaseHotspots();
        this._gridLayout = null;
    }
};

NewsReader.prototype._destroyFeedIcons = function () {
    this._destroyIconCells(this.feedIconCells);
    this.feedIconCells = [];
    this._feedGridItems = [];
    if (this._gridLayout && this._gridLayout.type === 'feeds') {
        this._releaseHotspots();
        this._gridLayout = null;
    }
};

NewsReader.prototype.drawCellBorder = function (cell) {
    if (!cell || !cell.borderFrame) return;
    var borderColor = (typeof CYAN !== 'undefined' ? CYAN : 6);
    try {
        cell.borderFrame.drawBorder(borderColor);
        cell.borderFrame.cycle();
    } catch (e) {
        dbug('drawCellBorder error: ' + e, 'view');
    }
};

NewsReader.prototype.clearCellBorder = function (cell) {
    if (!cell || !cell.borderFrame) return;
    try {
        cell.borderFrame.clear();
        cell.borderFrame.cycle();
    } catch (e) {
        dbug('clearCellBorder error: ' + e, 'view');
    }
};

NewsReader.prototype._resetFrameSurface = function (frame, attr) {
    if (!frame) return;
    var targetAttr = (typeof attr === 'number') ? attr : frame.attr;
    try { frame.attr = targetAttr; } catch (_eAttr) { }
    try { frame.clear(targetAttr); } catch (_eClear) { }
    if (typeof frame.home === 'function') {
        try { frame.home(); } catch (_eHome) { }
    }
    if (frame.__properties__) {
        frame.__properties__.data = [];
        frame.__properties__.data_height = 0;
        if (frame.__position__ && frame.__position__.offset) {
            frame.__position__.offset.x = 0;
            frame.__position__.offset.y = 0;
        }
    }
    if (typeof frame.data_height === 'number') frame.data_height = 0;
};

NewsReader.prototype._normalizeAnsiPreview = function (payload) {
    if (!payload) return null;
    if (payload && typeof payload === 'object' && typeof payload.ansi === 'string') {
        var rows = (typeof payload.rows === 'number' && payload.rows >= 0)
            ? payload.rows
            : this._countAnsiLines(payload.ansi);
        return {
            ansi: payload.ansi,
            cols: (typeof payload.cols === 'number' && payload.cols > 0) ? payload.cols : null,
            rows: rows,
            source: payload.source || payload
        };
    }
    if (typeof payload === 'string') {
        return {
            ansi: payload,
            cols: null,
            rows: this._countAnsiLines(payload),
            source: null
        };
    }
    return null;
};

NewsReader.prototype._renderAnsiPreview = function (frame, payload, opts) {
    if (!frame) return false;
    var normalized = this._normalizeAnsiPreview(payload);
    if (!normalized || typeof normalized.ansi !== 'string') return false;

    opts = opts || {};
    var startRow = (typeof opts.startRow === 'number' && opts.startRow > 0) ? Math.floor(opts.startRow) : 0;
    var maxRows = (typeof opts.maxRows === 'number' && opts.maxRows > 0) ? Math.floor(opts.maxRows) : null;
    var text = stripBlinkSequences(normalized.ansi);
    var width = Math.max(1, normalized.cols || frame.width || 80);
    var totalRows = (typeof normalized.rows === 'number') ? Math.max(0, normalized.rows) : this._countAnsiLines(text);
    if (startRow >= totalRows) startRow = Math.max(0, totalRows - 1);
    var endRow = maxRows ? Math.min(totalRows, startRow + maxRows) : totalRows;

    if (typeof frame.loadAnsiString === 'function' && startRow === 0 && (!maxRows || endRow >= totalRows)) {
        try {
            this._resetFrameSurface(frame, frame.attr);
            frame.loadAnsiString(text, width);
            return true;
        } catch (_loadErr) { }
    }

    this._resetFrameSurface(frame, frame.attr);
    var bgDefault = (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
    var fgDefault = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
    var hiMask = (typeof HIGH === 'number') ? HIGH : 0x08;
    var blinkMask = (typeof BLINK === 'number') ? BLINK : 0x80;
    var bg = bgDefault;
    var fg = fgDefault;
    var hi = 0;
    var attr = bg + fg + hi;
    var x = 0;
    var y = 0;
    var maxLogicalRow = 0;
    var saved = { x: 0, y: 0 };

    function ansiBgToAttr(code) {
        switch (code) {
            case 40: return (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
            case 41: return (typeof BG_RED === 'number') ? BG_RED : 0;
            case 42: return (typeof BG_GREEN === 'number') ? BG_GREEN : 0;
            case 43: return (typeof BG_BROWN === 'number') ? BG_BROWN : 0;
            case 44: return (typeof BG_BLUE === 'number') ? BG_BLUE : 0;
            case 45: return (typeof BG_MAGENTA === 'number') ? BG_MAGENTA : 0;
            case 46: return (typeof BG_CYAN === 'number') ? BG_CYAN : 0;
            case 47: return (typeof BG_LIGHTGRAY === 'number') ? BG_LIGHTGRAY : 0;
            default: return (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
        }
    }

    function ansiFgToAttr(code) {
        switch (code) {
            case 30: return (typeof BLACK === 'number') ? BLACK : 0;
            case 31: return (typeof RED === 'number') ? RED : 4;
            case 32: return (typeof GREEN === 'number') ? GREEN : 2;
            case 33: return (typeof BROWN === 'number') ? BROWN : 6;
            case 34: return (typeof BLUE === 'number') ? BLUE : 1;
            case 35: return (typeof MAGENTA === 'number') ? MAGENTA : 5;
            case 36: return (typeof CYAN === 'number') ? CYAN : 3;
            case 37: return (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
            default: return (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
        }
    }

    function commitChar(ch) {
        if (ch === '\r') {
            x = 0;
            return;
        }
        if (ch === '\n') {
            x = 0;
            y++;
            if (y > maxLogicalRow) maxLogicalRow = y;
            return;
        }
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (x >= width) {
            x = 0;
            y++;
        }
        if (y >= startRow && y < endRow) {
            var displayY = y - startRow;
            if (!maxRows || displayY < maxRows) {
                if (frame.__properties__) {
                    if (!frame.__properties__.data[displayY]) frame.__properties__.data[displayY] = [];
                    if (typeof Char === 'function') frame.__properties__.data[displayY][x] = new Char(ch, attr);
                    else frame.__properties__.data[displayY][x] = { ch: ch, attr: attr };
                }
                if (typeof frame.attr === 'number') {
                    try { frame.attr = attr; } catch (_setAttr) { }
                }
                if (typeof frame.gotoxy === 'function' && typeof frame.putmsg === 'function') {
                    try {
                        frame.gotoxy(x + 1, displayY + 1);
                        frame.putmsg(ch);
                    } catch (_writeErr) { }
                }
            }
        }
        if (y > maxLogicalRow) maxLogicalRow = y;
        x++;
    }

    for (var i = 0; i < text.length;) {
        var ch = text.charAt(i);
        if (ch === '\x1b' && i + 1 < text.length && text.charAt(i + 1) === '[') {
            var j = i + 2;
            while (j < text.length) {
                var code = text.charAt(j);
                if (code >= '@' && code <= '~') break;
                j++;
            }
            if (j >= text.length) break;
            var final = text.charAt(j);
            var paramsText = text.substring(i + 2, j);
            var params = paramsText.length ? paramsText.split(';') : [];
            switch (final) {
                case 'm':
                    if (!params.length) params = ['0'];
                    for (var pi = 0; pi < params.length; pi++) {
                        var codeStr = params[pi];
                        if (!codeStr.length) codeStr = '0';
                        var num = parseInt(codeStr, 10);
                        if (isNaN(num)) num = 0;
                        if (num === 0) {
                            bg = bgDefault;
                            fg = fgDefault;
                            hi = 0;
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num === 1) {
                            hi |= hiMask;
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num === 2 || num === 21 || num === 22) {
                            hi &= ~hiMask;
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num === 5) {
                            hi |= blinkMask;
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num === 25) {
                            hi &= ~blinkMask;
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num === 39) {
                            fg = fgDefault;
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num === 49) {
                            bg = bgDefault;
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num >= 40 && num <= 47) {
                            bg = ansiBgToAttr(num);
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num >= 100 && num <= 107) {
                            bg = ansiBgToAttr(num - 60);
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num >= 30 && num <= 37) {
                            fg = ansiFgToAttr(num);
                            attr = bg + fg + hi;
                            continue;
                        }
                        if (num >= 90 && num <= 97) {
                            fg = ansiFgToAttr(num - 60);
                            hi |= hiMask;
                            attr = bg + fg + hi;
                            continue;
                        }
                        if ((num === 38 || num === 48) && params.length > pi + 1) {
                            var mode = parseInt(params[pi + 1], 10);
                            if (mode === 5 && params.length > pi + 2) {
                                pi += 2;
                                continue;
                            }
                            if (mode === 2 && params.length > pi + 4) {
                                pi += 4;
                                continue;
                            }
                        }
                    }
                    break;
                case 'H':
                case 'f': {
                    var row = params.length && params[0].length ? (parseInt(params[0], 10) - 1) : 0;
                    var col = params.length > 1 && params[1].length ? (parseInt(params[1], 10) - 1) : 0;
                    if (!isNaN(row)) y = Math.max(0, row);
                    if (!isNaN(col)) x = Math.max(0, col);
                    break;
                }
                case 'A': {
                    var up = params.length && params[0].length ? parseInt(params[0], 10) : 1;
                    if (isNaN(up) || up < 0) up = 1;
                    y = Math.max(0, y - up);
                    break;
                }
                case 'B': {
                    var down = params.length && params[0].length ? parseInt(params[0], 10) : 1;
                    if (isNaN(down) || down < 0) down = 1;
                    y += down;
                    if (y > maxLogicalRow) maxLogicalRow = y;
                    break;
                }
                case 'C': {
                    var right = params.length && params[0].length ? parseInt(params[0], 10) : 1;
                    if (isNaN(right) || right < 0) right = 1;
                    x += right;
                    break;
                }
                case 'D': {
                    var left = params.length && params[0].length ? parseInt(params[0], 10) : 1;
                    if (isNaN(left) || left < 0) left = 1;
                    x = Math.max(0, x - left);
                    break;
                }
                case 'J':
                    if (!params.length || params[0] === '' || params[0] === '2') {
                        this._resetFrameSurface(frame, frame.attr);
                        bg = bgDefault;
                        fg = fgDefault;
                        hi = 0;
                        attr = bg + fg + hi;
                        x = 0;
                        y = 0;
                        maxRow = 0;
                    }
                    break;
                case 's':
                    saved.x = x;
                    saved.y = y;
                    break;
                case 'u':
                    x = saved.x || 0;
                    y = saved.y || 0;
                    break;
                default:
                    break;
            }
            i = j + 1;
            continue;
        }
        commitChar(ch);
        i++;
    }

    if (frame.__properties__) frame.__properties__.data_height = totalRows;
    if (typeof frame.data_height === 'number') frame.data_height = totalRows;
    if (typeof frame.cycle === 'function') {
        try { frame.cycle(); } catch (_cycleErr) { }
    }
    return true;
};

NewsReader.prototype._releaseHotspots = function () {
    this._hotspotMap = {};
    this._pendingHotspotDefs = [];
    if (this.hotspots && typeof this.hotspots.clear === 'function') this.hotspots.clear();
    else if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (_e) { }
    }
};

NewsReader.prototype._isImageNavigationKey = function (key) {
    switch (key) {
        case KEY_LEFT:
        case 'KEY_LEFT':
        case 'LEFT':
        case '\u001d':
        case '\x1B[D':
        case KEY_RIGHT:
        case 'KEY_RIGHT':
        case 'RIGHT':
        case '\u0006':
        case '\x1B[C':
        case KEY_UP:
        case 'KEY_UP':
        case 'UP':
        case '\u001e':
        case '\x1B[A':
        case KEY_DOWN:
        case 'KEY_DOWN':
        case 'DOWN':
        case '\u000a':
        case '\x1B[B':
        case KEY_PGUP:
        case 'KEY_PGUP':
        case KEY_PGDN:
        case 'KEY_PGDN':
        case KEY_HOME:
        case 'KEY_HOME':
        case KEY_END:
        case 'KEY_END':
        case KEY_ENTER:
        case 'KEY_ENTER':
        case 'I':
        case 'i':
        case '\x1B':
        case '\b':
        case '\x08':
        case '\x7F':
        case 'wheel_up':
        case 'wheel_down':
            return true;
        default:
            return false;
    }
};

NewsReader.prototype._addHotspotArea = function (key, swallow, minX, maxX, startY, endY, opts) {
    if (key === undefined || key === null) return;
    if (typeof minX !== 'number' || typeof maxX !== 'number' || typeof startY !== 'number') return;
    if (typeof endY !== 'number') endY = startY;
    if (maxX < minX) {
        var tmpX = minX; minX = maxX; maxX = tmpX;
    }
    if (endY < startY) {
        var tmpY = startY; startY = endY; endY = tmpY;
    }
    if (!this._pendingHotspotDefs) this._pendingHotspotDefs = [];
    this._pendingHotspotDefs.push({
        key: key,
        x: minX,
        y: startY,
        width: Math.max(1, Math.floor(maxX - minX + 1)),
        height: Math.max(1, Math.floor(endY - startY + 1)),
        swallow: !!swallow,
        owner: (opts && opts.owner) || 'newsreader',
        data: opts && opts.data || null
    });
};

NewsReader.prototype._applyPendingHotspots = function () {
    if (!this._pendingHotspotDefs) this._pendingHotspotDefs = [];
    if (this.hotspots && typeof this.hotspots.set === 'function') {
        this.hotspots.set(this._pendingHotspotDefs);
    } else if (typeof console !== 'undefined' && typeof console.add_hotspot === 'function') {
        for (var i = 0; i < this._pendingHotspotDefs.length; i++) {
            var def = this._pendingHotspotDefs[i];
            if (!def) continue;
            var key = def.key;
            var swallow = !!def.swallow;
            var startX = def.x;
            var startY = def.y;
            var endX = startX + Math.max(1, def.width || 1) - 1;
            var endY = startY + Math.max(1, def.height || 1) - 1;
            for (var y = startY; y <= endY; y++) {
                try { console.add_hotspot(key, swallow, startX, endX, y); } catch (_) { }
            }
        }
    }
};

NewsReader.prototype._ensureHotspotChars = function () {
    if (this._hotspotChars && this._hotspotChars.length) return this._hotspotChars;
    var chars = [];
    var used = {};
    function add(str) {
        for (var i = 0; i < str.length; i++) {
            var ch = str.charAt(i);
            if (!used[ch]) { chars.push(ch); used[ch] = true; }
        }
    }
    add('1234567890');
    add('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    add('abcdefghijklmnopqrstuvwxyz');
    add('!@#$%^&*()-_=+[]{};:,./?');
    this._hotspotChars = chars;
    return chars;
};

NewsReader.prototype._registerGridHotspots = function (cells) {
    this._releaseHotspots();
    if (!cells || !cells.length) return;
    var chars = this._ensureHotspotChars();
    var max = Math.min(cells.length, chars.length);
    var baseX = this.listFrame ? this.listFrame.x : 1;
    var baseY = this.listFrame ? this.listFrame.y : 1;
    for (var i = 0; i < max; i++) {
        var cell = cells[i];
        if (!cell || !cell.icon) continue;
        var cmd = chars[i];
        var iconFrame = cell.icon;
        var labelFrame = cell.label;
        var minX = baseX + iconFrame.x - 1;
        var maxX = minX + iconFrame.width - 1;
        var minY = baseY + iconFrame.y - 1;
        var maxY = minY + iconFrame.height - 1;
        if (labelFrame) {
            var labelMinY = baseY + labelFrame.y - 1;
            var labelMaxY = labelMinY + labelFrame.height - 1;
            if (labelMinY < minY) minY = labelMinY;
            if (labelMaxY > maxY) maxY = labelMaxY;
        }
        if (minX > maxX || minY > maxY) continue;
        this._addHotspotArea(cmd, false, minX, maxX, minY, maxY);
        this._hotspotMap[cmd] = cell.index;
    }
    this._applyPendingHotspots();
};

NewsReader.prototype._registerListHotspots = function (rows) {
    this._releaseHotspots();
    if (!this.listFrame) return;
    if (!rows || !rows.length) return;

    var chars = this._ensureHotspotChars();
    var baseX = this.listFrame.x;
    var baseY = this.listFrame.y;
    var width = Math.max(1, this.listFrame.width || 1);
    var max = Math.min(rows.length, chars.length);

    for (var i = 0; i < max; i++) {
        var row = rows[i];
        if (!row || typeof row.index !== 'number' || typeof row.y !== 'number') continue;
        var cmd = chars[i];
        var absY = baseY + row.y - 2;
        var minX = baseX;
        var maxX = baseX + width - 1;
        this._addHotspotArea(cmd, false, minX, maxX, absY);
        this._hotspotMap[cmd] = row.index;
    }
    this._applyPendingHotspots();
};

NewsReader.prototype._registerImageHotspots = function (sections, listStart, visibleThumbRows) {
    this._releaseHotspots();
    if (!this.listFrame) return;
    if (!sections || !sections.length) return;

    var chars = this._ensureHotspotChars();
    var baseX = this.listFrame.x;
    var baseY = this.listFrame.y;
    var width = Math.max(1, this.listFrame.width || 1);
    var charIdx = 0;

    for (var i = 0; i < sections.length && charIdx < chars.length; i++) {
        var section = sections[i];
        if (!section) continue;

        if (section.type === 'image') {
            var rows = Math.max(1, section.rows || 1);
            for (var ry = 0; ry < rows && charIdx < chars.length; ry++) {
                var cmdImage = chars[charIdx++];
                var y = baseY + (section.y - 1) + ry;
                this._addHotspotArea(cmdImage, false, baseX, baseX + width - 1, y);
                this._hotspotMap[cmdImage] = { type: 'imageArea' };
            }
        } else if (section.type === 'thumb' && typeof section.index === 'number') {
            var cmdThumb = chars[charIdx++];
            var thumbY = baseY + section.y - 1;
            this._addHotspotArea(cmdThumb, false, baseX, baseX + width - 1, thumbY);
            this._hotspotMap[cmdThumb] = { type: 'thumb', index: section.index };
        }
    }
    this._registerArticleHeaderHotspot();
    this._applyPendingHotspots();
};

NewsReader.prototype._registerArticleHeaderHotspot = function () {
    if (!this.articleHeaderFrame) return;
    if (!this.listFrame) return;

    var chars = this._ensureHotspotChars();
    if (!chars.length) return;

    var baseX = this.listFrame.x;
    var baseY = this.listFrame.y;
    var sections = [];

    if (this.articleCategoryIconFrame) {
        sections.push({
            frame: this.articleCategoryIconFrame,
            type: 'articleHeaderCategory'
        });
    }
    if (this.articleIconFrame) {
        sections.push({
            frame: this.articleIconFrame,
            type: 'articleHeaderBack'
        });
    }
    if (!sections.length) return;

    this._hotspotMap = this._hotspotMap || {};

    for (var s = 0; s < sections.length; s++) {
        var entry = sections[s];
        if (!entry || !entry.frame) continue;
        var cmd = this._reserveHotspotChar();
        if (!cmd) break;
        var frame = entry.frame;
        var minX = baseX + frame.x - 1;
        var maxX = minX + frame.width - 1;
        var minY = baseY + frame.y - 1;
        var maxY = minY + frame.height - 1;
        this._hotspotMap[cmd] = { type: entry.type };
        this._addHotspotArea(cmd, false, minX, maxX, minY, maxY);
    }
};

NewsReader.prototype._getIconMetrics = function () {
    var w = 12, h = 6;
    if (typeof ICSH_CONSTANTS === 'object' && ICSH_CONSTANTS) {
        if (typeof ICSH_CONSTANTS.ICON_W === 'number') w = ICSH_CONSTANTS.ICON_W;
        if (typeof ICSH_CONSTANTS.ICON_H === 'number') h = ICSH_CONSTANTS.ICON_H;
    }
    return { width: Math.max(1, w), height: Math.max(1, h) };
};

NewsReader.prototype._slugifyLabel = function (label) {
    return newsreaderSlugify(label);
};

NewsReader.prototype._iconNameForFeed = function (feed) {
    if (!feed) return '';
    if (feed.icon && this._iconExists(feed.icon)) return feed.icon;
    if (feed.label) {
        var slugIcon = 'newsfeed_' + this._slugifyLabel(feed.label);
        if (this._iconExists(slugIcon)) return slugIcon;
    }
    if (this._iconExists('newsitem')) return 'newsitem';
    if (this._iconExists('newsitems')) return 'newsitems';
    return '';
};

NewsReader.prototype._iconNameForCategory = function (category) {
    if (!category) return '';
    if (category._type === 'back') {
        if (category.icon && this._iconExists(category.icon)) return category.icon;
        if (this._iconExists('back')) return 'back';
        if (this._iconExists('news_back')) return 'news_back';
        return category.icon || 'back';
    }
    if (category._type === 'exit') {
        if (category.icon && this._iconExists(category.icon)) return category.icon;
        if (this._iconExists('back')) return 'back';
        if (this._iconExists('exit')) return 'exit';
        return category.icon || 'back';
    }
    if (category.icon && this._iconExists(category.icon)) return category.icon;
    if (category.name) {
        var slugCat = 'news_cat_' + this._slugifyLabel(category.name);
        if (this._iconExists(slugCat)) return slugCat;
    }
    if (this._iconExists('rssfeed')) return 'rssfeed';
    return '';
};

NewsReader.prototype._renderIconLabel = function (frame, text, isSelected) {
    if (!frame) return;
    var attr = isSelected ? this.paletteAttr('LIST_ACTIVE') : this.paletteAttr('LIST_INACTIVE');
    try { frame.clear(attr); frame.home(); } catch (_e) { }
    var width = frame.width || 0;
    if (width <= 0) return;
    var label = this._toDisplayText(text || '');
    if (label.length > width) label = label.substr(0, width);
    var padLeft = Math.max(0, Math.floor((width - label.length) / 2));
    var padRight = Math.max(0, width - padLeft - label.length);
    if (padLeft) frame.putmsg(new Array(padLeft + 1).join(' '));
    if (label) frame.putmsg(label);
    if (padRight) frame.putmsg(new Array(padRight + 1).join(' '));
};

NewsReader.prototype._adjustGridScroll = function (grid, length) {
    if (!grid) return;
    var cols = Math.max(1, grid.cols || 1);
    var visibleRows = Math.max(1, grid.visibleRows || 1);
    var totalRows = Math.max(1, Math.ceil((length > 0 ? length : 1) / cols));
    var currentRow = Math.floor((this.selectedIndex > 0 ? this.selectedIndex : 0) / cols);
    var maxRowOffset = Math.max(0, totalRows - visibleRows);
    if (currentRow < this.scrollOffset) this.scrollOffset = currentRow;
    if (currentRow >= this.scrollOffset + visibleRows) this.scrollOffset = Math.max(0, currentRow - visibleRows + 1);
    if (this.scrollOffset > maxRowOffset) this.scrollOffset = maxRowOffset;
    if (this.scrollOffset < 0) this.scrollOffset = 0;
};

NewsReader.prototype._renderCategoryIcons = function () {
    this._destroyFeedIcons();
    this._destroyCategoryIcons();
    this._gridLayout = null;
    if (!this.listFrame) return;
    var depth = this.categoryStack ? this.categoryStack.length : 0;
    var items = this.categories ? this.categories.slice(0) : [];
    if (depth > 1) items.unshift({ _type: 'back', name: 'Back', icon: 'news_back' });
    else items.unshift({ _type: 'exit', name: 'Exit', icon: 'back' });
    this._categoryGridItems = items;
    if (!items.length) {
        this.listFrame.clear();
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No categories available.');
        this._releaseHotspots();
        return;
    }
    if (this.selectedIndex >= items.length) this.selectedIndex = items.length - 1;
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    var introItem = items[0];
    if (items.length > 1 && this.selectedIndex === 0 && introItem && (introItem._type === 'exit' || introItem._type === 'back')) {
        this.selectedIndex = 1;
    }

    var metrics = this._getIconMetrics();
    var topPadding = 2;
    var labelHeight = 1;
    var cellW = metrics.width + 4;
    var cellH = metrics.height + labelHeight + 2;
    var frameWidth = this.listFrame.width || (metrics.width + 2);
    var frameHeight = this.listFrame.height || (metrics.height + labelHeight + 2);
    var usableHeight = Math.max(1, frameHeight - topPadding);
    var cols = Math.max(1, Math.floor(frameWidth / cellW));
    var visibleRows = Math.max(1, Math.floor(usableHeight / cellH));
    var total = items.length;
    var totalRows = Math.max(1, Math.ceil(total / cols));

    var maxRowOffset = Math.max(0, totalRows - visibleRows);
    if (this.scrollOffset > maxRowOffset) this.scrollOffset = maxRowOffset;
    if (this.scrollOffset < 0) this.scrollOffset = 0;
    var currentRow = Math.floor(this.selectedIndex / cols);
    if (currentRow < this.scrollOffset) this.scrollOffset = currentRow;
    if (currentRow >= this.scrollOffset + visibleRows) this.scrollOffset = Math.max(0, currentRow - visibleRows + 1);
    maxRowOffset = Math.max(0, totalRows - visibleRows);
    if (this.scrollOffset > maxRowOffset) this.scrollOffset = maxRowOffset;

    this.listFrame.clear();
    var startRow = this.scrollOffset;
    var endRow = Math.min(totalRows, startRow + visibleRows);
    var cells = [];
    // Use the background nibble from LIST_INACTIVE so theme / attr.ini overrides apply.
    var bgVal = this.paletteAttr('LIST_INACTIVE').BG;
    var fgVal = this.paletteAttr('LIST_INACTIVE').FG;

    for (var row = startRow; row < endRow; row++) {
        for (var col = 0; col < cols; col++) {
            var index = row * cols + col;
            if (index >= total) break;
            var item = items[index];
            var x = 2 + col * cellW;
            var y = 1 + topPadding + (row - startRow) * cellH;
            if (y + metrics.height + labelHeight - 1 > frameHeight) continue;

            var iconFrame = new Frame(x, y, metrics.width, metrics.height, this.paletteAttr('LIST_INACTIVE'), this.listFrame);
            var labelFrame = new Frame(x, y + metrics.height, metrics.width, labelHeight, this.paletteAttr('LIST_INACTIVE'), this.listFrame);
            iconFrame.open();
            labelFrame.open();

            // Create border frame for selection highlighting (positioned around icon+label with 1-cell margin)
            var borderFrame = new Frame(x - 1, y - 1, metrics.width + 2, metrics.height + labelHeight + 2, this.paletteAttr('LIST_INACTIVE'), this.listFrame);
            borderFrame.transparent = true;
            if (typeof borderFrame.open === 'function') borderFrame.open();
            if (typeof this.registerFrame === 'function') this.registerFrame(borderFrame);

            var iconName = this._iconNameForCategory(item);
            var iconData = { iconFile: iconName, label: '', iconBg: bgVal, iconFg: fgVal };
            var iconObj = new Icon(iconFrame, labelFrame, iconData);
            try { iconObj.render(); } catch (_eIcon) { }
            if (typeof this.registerFrame === 'function') {
                this.registerFrame(iconFrame);
                this.registerFrame(labelFrame);
            }

            var labelText = 'Category';
            if (item) {
                if (item._type === 'exit') labelText = 'Exit';
                else if (item._type === 'back') labelText = 'Back';
                else if (item.name) labelText = item.name;
            }
            this._renderIconLabel(labelFrame, labelText, index === this.selectedIndex);
            cells.push({ icon: iconFrame, label: labelFrame, index: index, labelText: labelText, iconObj: iconObj, borderFrame: borderFrame });
        }
    }

    this.categoryIconCells = cells;
    this._gridLayout = {
        type: 'categories',
        cols: cols,
        visibleRows: visibleRows,
        total: total,
        rows: totalRows,
        cellHeight: cellH,
        cellWidth: cellW
    };
    if (cells.length) {
        // Draw border on initial selection
        if (this.selectedIndex >= 0 && this.selectedIndex < cells.length) {
            this.drawCellBorder(cells[this.selectedIndex]);
        }
        this._registerGridHotspots(cells);
    } else {
        this._releaseHotspots();
    }
};

NewsReader.prototype._renderFeedIcons = function () {
    this._destroyCategoryIcons();
    this._destroyFeedIcons();
    this._gridLayout = null;
    if (!this.listFrame) return;
    var items = this.currentFeeds ? this.currentFeeds.slice(0) : [];
    items.unshift({ _type: 'back', label: 'Back', icon: 'news_back' });
    this._feedGridItems = items;
    if (!items.length) {
        this.listFrame.clear();
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No feeds available in this category.');
        this._releaseHotspots();
        return;
    }
    if (this.selectedIndex >= items.length) this.selectedIndex = items.length - 1;
    if (this.selectedIndex < 0) this.selectedIndex = 0;

    var metrics = this._getIconMetrics();
    var topPadding = 2;
    var labelHeight = 1;
    var cellW = metrics.width + 4;
    var cellH = metrics.height + labelHeight + 2;
    var frameWidth = this.listFrame.width || (metrics.width + 2);
    var frameHeight = this.listFrame.height || (metrics.height + labelHeight + 2);
    var usableHeight = Math.max(1, frameHeight - topPadding);
    var cols = Math.max(1, Math.floor(frameWidth / cellW));
    var visibleRows = Math.max(1, Math.floor(usableHeight / cellH));
    var total = items.length;
    var totalRows = Math.max(1, Math.ceil(total / cols));

    var maxRowOffset = Math.max(0, totalRows - visibleRows);
    if (this.scrollOffset > maxRowOffset) this.scrollOffset = maxRowOffset;
    if (this.scrollOffset < 0) this.scrollOffset = 0;
    var currentRow = Math.floor(this.selectedIndex / cols);
    if (currentRow < this.scrollOffset) this.scrollOffset = currentRow;
    if (currentRow >= this.scrollOffset + visibleRows) this.scrollOffset = Math.max(0, currentRow - visibleRows + 1);
    maxRowOffset = Math.max(0, totalRows - visibleRows);
    if (this.scrollOffset > maxRowOffset) this.scrollOffset = maxRowOffset;

    this.listFrame.clear();
    var startRow = this.scrollOffset;
    var endRow = Math.min(totalRows, startRow + visibleRows);
    var cells = [];
    // Do not force blue for feed icons either; respect LIST_INACTIVE background.
    var bgVal = this.paletteAttr('LIST_INACTIVE').BG;
    var fgVal = this.paletteAttr('LIST_INACTIVE').FG;

    for (var row = startRow; row < endRow; row++) {
        for (var col = 0; col < cols; col++) {
            var index = row * cols + col;
            if (index >= total) break;
            var item = items[index];
            var x = 2 + col * cellW;
            var y = 1 + topPadding + (row - startRow) * cellH;
            if (y + metrics.height + labelHeight - 1 > frameHeight) continue;

            var iconFrame = new Frame(x, y, metrics.width, metrics.height, this.paletteAttr('LIST_INACTIVE'), this.listFrame);
            var labelFrame = new Frame(x, y + metrics.height, metrics.width, labelHeight, this.paletteAttr('LIST_INACTIVE'), this.listFrame);
            iconFrame.open();
            labelFrame.open();

            // Create border frame for selection highlighting (positioned around icon+label with 1-cell margin)
            var borderFrame = new Frame(x - 1, y - 1, metrics.width + 2, metrics.height + labelHeight + 2, this.paletteAttr('LIST_INACTIVE'), this.listFrame);
            borderFrame.transparent = true;
            if (typeof borderFrame.open === 'function') borderFrame.open();
            if (typeof this.registerFrame === 'function') this.registerFrame(borderFrame);

            var iconName;
            if (item && item._type === 'back') iconName = 'back';
            else iconName = this._iconNameForFeed(item);
            var iconData = { iconFile: iconName, label: '', iconBg: bgVal, iconFg: fgVal };
            var iconObj = new Icon(iconFrame, labelFrame, iconData);
            try { iconObj.render(); } catch (_eIcon) { }
            if (typeof this.registerFrame === 'function') {
                this.registerFrame(iconFrame);
                this.registerFrame(labelFrame);
            }

            var labelText = item && item._type === 'back' ? 'Back' : (item && item.label ? item.label : 'Feed');
            if (item && item._type !== 'back' && this._isFeedFavorite(item)) labelText += ' *';
            this._renderIconLabel(labelFrame, labelText, index === this.selectedIndex);
            cells.push({ icon: iconFrame, label: labelFrame, index: index, labelText: labelText, iconObj: iconObj, borderFrame: borderFrame });
        }
    }

    this.feedIconCells = cells;
    this._gridLayout = {
        type: 'feeds',
        cols: cols,
        visibleRows: visibleRows,
        total: total,
        rows: totalRows,
        cellHeight: cellH,
        cellWidth: cellW
    };
    if (cells.length) {
        // Draw border on initial selection
        if (this.selectedIndex >= 0 && this.selectedIndex < cells.length) {
            this.drawCellBorder(cells[this.selectedIndex]);
        }
        this._registerGridHotspots(cells);
    } else {
        this._releaseHotspots();
    }
};

NewsReader.prototype._gridCellsForLayout = function () {
    if (!this._gridLayout) return null;
    if (this._gridLayout.type === 'categories') return this.categoryIconCells || [];
    if (this._gridLayout.type === 'feeds') return this.feedIconCells || [];
    return null;
};

NewsReader.prototype._refreshGridSelectionHighlight = function (previousIndex, nextIndex) {
    var cells = this._gridCellsForLayout();
    if (!cells || !cells.length) return false;
    var updated = false;

    function repaintCell(index, isSelected) {
        if (index === undefined || index === null) return;
        for (var i = 0; i < cells.length; i++) {
            var cell = cells[i];
            if (cell && cell.index === index) {
                // Update label
                if (cell.label) {
                    this._renderIconLabel(cell.label, cell.labelText, !!isSelected);
                    if (typeof cell.label.cycle === 'function') {
                        try { cell.label.cycle(); } catch (_cycleErr) { }
                    }
                }
                // Update border
                if (isSelected) {
                    this.drawCellBorder(cell);
                } else {
                    this.clearCellBorder(cell);
                }
                updated = true;
                return;
            }
        }
    }
    repaintCell = repaintCell.bind(this);

    if (typeof previousIndex === 'number' && previousIndex !== nextIndex) repaintCell(previousIndex, false);
    if (typeof nextIndex === 'number') repaintCell(nextIndex, true);
    if (updated && this.listFrame && typeof this.listFrame.cycle === 'function') {
        try { this.listFrame.cycle(); } catch (_listCycleErr) { }
    }
    return updated;
};

NewsReader.prototype._finalizeGridSelectionChange = function (previousIndex, previousScrollOffset, length) {
    var grid = this._gridLayout;
    if (!grid) {
        this.draw();
        return;
    }
    this._adjustGridScroll(grid, length);
    if (this.scrollOffset !== previousScrollOffset) {
        this.draw();
        return;
    }
    if (previousIndex === this.selectedIndex) return;
    if (!this._refreshGridSelectionHighlight(previousIndex, this.selectedIndex)) {
        this.draw();
    }
};

NewsReader.prototype._toDisplayText = function (text) {
    if (text == null) return '';
    var str = '' + text;
    if (typeof utf8_cp437 === 'function') {
        try {
            return utf8_cp437(str);
        } catch (_convErr) { }
    }
    return str;
};

NewsReader.prototype._ensureFrames = function () {
    if (!this.parentFrame) return;
    if (!this.headerFrame) {
        this.headerFrame = new Frame(this.parentFrame.x, this.parentFrame.y, this.parentFrame.width, 1, this.paletteAttr('TITLE_FRAME'), this.parentFrame);
        this.headerFrame.open();
        if (typeof this.registerFrame === 'function') this.registerFrame(this.headerFrame);
        this._headerDefaultAttr = this.headerFrame.attr;
    }
    if (!this.listFrame) {
        var h = Math.max(1, this.parentFrame.height - 2);
        this.listFrame = new Frame(this.parentFrame.x, this.parentFrame.y + 1, this.parentFrame.width, h, this.paletteAttr('CONTENT_FRAME'), this.parentFrame);
        this.listFrame.open();
        this.listFrame.word_wrap = true;
        this.setBackgroundFrame(this.listFrame)
        if (typeof this.registerFrame === 'function') this.registerFrame(this.listFrame);
    }
    if (!this.statusFrame) {
        this.statusFrame = new Frame(this.parentFrame.x, this.parentFrame.height, this.parentFrame.width, 1, this.paletteAttr('FOOTER_FRAME'), this.parentFrame);
        this.statusFrame.open();
        if (typeof this.registerFrame === 'function') this.registerFrame(this.statusFrame);
    }

};

NewsReader.prototype.draw = function () {
    this._ensureFrames();
    if (!this.listFrame) return;
    this._refreshStatus();
    if (this.state !== 'categories') this._destroyCategoryIcons();
    if (this.state !== 'feeds') this._destroyFeedIcons();
    switch (this.state) {
        case 'categories':
            this._drawCategories();
            break;
        case 'feeds':
            this._drawFeeds();
            break;
        case 'articles':
            this._drawArticles();
            break;
        case 'article_images':
            this._drawArticleImages();
            break;
        case 'article':
            this._drawArticle();
            break;
        default:
            if (typeof log === 'function') log('NewsReader unknown state: ' + this.state);
            break;
    }
    if (this.parentFrame && typeof this.parentFrame.cycle === 'function') {
        try { this.parentFrame.cycle(); } catch (_eCycle) { }
    }
};

NewsReader.prototype._drawCategories = function () {
    var breadcrumb = this._categoryBreadcrumb();
    this._setHeader(breadcrumb ? breadcrumb : 'News Categories');
    this._renderCategoryIcons();
    var hotkeys = [{ val: 'ENTER', action: 'open' }, { val: 'CLICK', action: 'select' }, { val: 'ESCAPE', action: 'exit' }, { val: 'ESC', action: 'back' }];
    var hint = this._generateHotkeyLine(hotkeys);
    var statusPrefix = 'Select a news category';
    if (breadcrumb) statusPrefix += '  [' + breadcrumb + ']';
    this._setStatus(statusPrefix + '  |  ' + hint);
};

NewsReader.prototype._drawFeeds = function () {
    var name = this.currentCategory ? this.currentCategory.name : '';
    var breadcrumb = this._categoryBreadcrumb();
    if (name) breadcrumb = breadcrumb ? (breadcrumb + ' > ' + name) : name;
    this._setHeader(breadcrumb || '');
    this._renderFeedIcons();
    var hotkeys = [
        { val: 'ENTER', action: 'open feed' },
        { val: 'F', action: 'toggle favorite' },
        { val: 'BACKSPACE', action: 'Categories' },
        { val: 'ESC', action: 'back' }
    ];
    var hint = this._generateHotkeyLine(hotkeys);
    var statusTitle = breadcrumb || name || 'Feeds';
    this._setStatus(statusTitle + '  |  ' + hint);
};

NewsReader.prototype._drawArticles = function () {
    this._destroyCategoryIcons();
    this._destroyFeedIcons();
    this._gridLayout = null;
    this._destroyArticleLinkButton();
    this._setHeader((this.currentFeed ? this.currentFeed.label : 'Feed') + ' Articles');
    if (!this.currentArticles.length) {
        this._resetFrameSurface(this.listFrame, this.paletteAttr('LIST_INACTIVE'));
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No articles available.');
        return;
    }
    for (var i = 0; i < this.currentArticles.length; i++) {
        var art = this.currentArticles[i];
        if (art && typeof art.__newsImages === 'undefined') {
            art.__newsImages = this._extractArticleImages(art);
        }
    }
    this._renderArticleListWithDates();
    var hotkeys = [{ val: 'ENTER', action: 'view article' }, { val: 'BACKSPACE', action: 'Feeds' }];
    var hint = this._generateHotkeyLine(hotkeys);
    this._setStatus(hint);
};


NewsReader.prototype._drawArticleImages = function () {
    this._destroyCategoryIcons();
    this._destroyFeedIcons();
    this._gridLayout = null;
    this._destroyArticleLinkButton();

    var images = this.articleImages || [];
    var article = (this.articleIndex >= 0 && this.articleIndex < this.currentArticles.length) ? this.currentArticles[this.articleIndex] : null;
    var articleTitle = article ? (article.title || '') : '';

    this._setHeader(this._toDisplayText(articleTitle ? 'Images: ' + articleTitle : 'Article Images'));
    this._resetFrameSurface(this.listFrame, this.paletteAttr('LIST_INACTIVE'));

    if (!images.length) {
        this._ensureArticleIcon({ showIcon: false, headerLines: ['No images available'], forceHeight: 1 });
        this._destroyArticlePreviewFrame();
        this.listFrame.gotoxy(1, this._articleHeaderHeight || 1);
        this.listFrame.putmsg('No images found.');
        this._setStatus('ENTER=read article  BACKSPACE=articles');
        return;
    }

    if (this.imageSelection >= images.length) this.imageSelection = images.length - 1;
    if (this.imageSelection < 0) this.imageSelection = 0;

    var selectedImage = images[this.imageSelection];
    var selectedUrl = selectedImage.url;
    var previousPreviewUrl = this._currentPreviewUrl;
    var previewData = this._getImageAnsi(selectedUrl);
    if (selectedUrl !== previousPreviewUrl) this.imagePreviewScroll = 0;
    this._currentPreviewUrl = selectedUrl;


    var headerWidth = this.listFrame.width || 80;
    var headerLines = [];
    var caption = selectedImage.caption || '';
    function pushWrapped(text) {
        if (!text) return;
        var wrapped = this._wrapText(this._toDisplayText(text), headerWidth);
        for (var wi = 0; wi < wrapped.length; wi++) {
            if (headerLines.indexOf(wrapped[wi]) === -1) headerLines.push(wrapped[wi]);
        }
    }
    pushWrapped = pushWrapped.bind(this);
    if (images.length <= 1) {
        if (articleTitle) pushWrapped(articleTitle);
        if (caption) pushWrapped(caption);
    } else {
        if (caption) pushWrapped(caption);
        else if (articleTitle) pushWrapped(articleTitle);
    }
    if (!headerLines.length) headerLines.push(this._toDisplayText(articleTitle || ''));
    headerLines = headerLines.slice(0, 2);
    var headerHeight = Math.max(1, Math.min(2, headerLines.length));
    this._ensureArticleIcon({ showIcon: false, headerLines: headerLines, forceHeight: headerHeight });

    var headerRows = Math.max(1, this._articleHeaderHeight || headerHeight);
    var availableRows = Math.max(1, this.listFrame.height - headerRows);

    var totalPreviewLines = previewData ? Math.max(1, this._countAnsiLines(previewData)) : 2;
    var needThumbnails = images.length > 1;
    var previewRows;
    if (needThumbnails && availableRows > 1) previewRows = Math.max(1, Math.min(availableRows - 1, totalPreviewLines));
    else previewRows = Math.max(1, Math.min(availableRows, totalPreviewLines));
    var maxPreviewScroll = previewData ? Math.max(0, totalPreviewLines - previewRows) : 0;
    if (this.imagePreviewScroll < 0) this.imagePreviewScroll = 0;
    if (this.imagePreviewScroll > maxPreviewScroll) this.imagePreviewScroll = maxPreviewScroll;

    this._destroyArticlePreviewFrame();
    var previewFrame = new Frame(1, headerRows + 1, this.listFrame.width, previewRows, this.paletteAttr('LIST_INACTIVE'), this.listFrame);
    previewFrame.open();
    previewFrame.clear(this.paletteAttr('LIST_INACTIVE'));
    if (typeof this.registerFrame === 'function') this.registerFrame(previewFrame);
    this.articleImagePreviewFrame = previewFrame;

    if (previewData) {
        try {
            this._renderAnsiPreview(previewFrame, previewData, {
                startRow: this.imagePreviewScroll,
                maxRows: previewRows
            });
        } catch (_renderErr) {
            previewData = null;
            previewFrame.clear(this.paletteAttr('LIST_INACTIVE'));
            previewFrame.gotoxy(1, 1);
            previewFrame.putmsg('Preview not available.');
        }
    }
    if (!previewData) {
        this.imagePreviewScroll = 0;
        previewFrame.clear(this.paletteAttr('LIST_INACTIVE'));
        previewFrame.gotoxy(1, 1);
        var errMsg = this._imageAnsiErrors ? this._imageAnsiErrors[selectedUrl] : null;
        previewFrame.putmsg(errMsg ? ('Preview failed: ' + errMsg) : 'Preview not available.');
        maxPreviewScroll = 0;
    }

    this._imagePreviewScrollMax = maxPreviewScroll;
    this._imagePreviewVisibleRows = previewRows;

    var thumbStartRow = headerRows + previewRows + 1;
    if (thumbStartRow > this.listFrame.height) thumbStartRow = this.listFrame.height;

    var previewHotspots = [];
    previewHotspots.push({ type: 'image', y: headerRows + 1, rows: previewRows });

    var visibleRows = 0;
    if (images.length > 1) {
        if (this.imageSelection < this.imageScrollOffset) this.imageScrollOffset = this.imageSelection;
        visibleRows = Math.max(1, this.listFrame.height - (thumbStartRow - 1));
        if (this.imageSelection >= this.imageScrollOffset + visibleRows) {
            this.imageScrollOffset = Math.max(0, this.imageSelection - visibleRows + 1);
        }

        for (var row = 0; row < visibleRows; row++) {
            var idx = this.imageScrollOffset + row;
            if (idx >= images.length) break;
            var targetRow = thumbStartRow + row;
            if (targetRow > this.listFrame.height) break;
            var prefix = '[' + (idx + 1) + '/' + images.length + '] ';
            var lineText = images[idx].caption ? images[idx].caption : images[idx].url;
            var display = prefix + this._toDisplayText(lineText);
            if (display.length > this.listFrame.width) display = display.substr(0, this.listFrame.width);
            this.listFrame.gotoxy(1, targetRow);
            this.listFrame.attr = (idx === this.imageSelection) ? this.paletteAttr('LIST_ACTIVE') : this.paletteAttr('LIST_INACTIVE');
            this.listFrame.putmsg(display);
            previewHotspots.push({ type: 'thumb', index: idx, y: targetRow });
        }
        this.listFrame.attr = this.paletteAttr('LIST_INACTIVE');
    } else {
        this.imageScrollOffset = 0;
        this.listFrame.attr = this.paletteAttr('LIST_INACTIVE');
    }

    var statusIndicator = 'Image ' + (this.imageSelection + 1) + '/' + images.length + '  ';
    var hotkeys = [{ val: 'UP/DOWN', action: 'scroll' }, { val: 'LEFT/RIGHT', action: 'change image' }, { val: 'ENTER', action: 'read article' }, { val: 'BACKSPACE', action: 'articles' }];
    var hint = this._generateHotkeyLine(hotkeys);
    this._setStatus(statusIndicator + hint);

    this._registerImageHotspots(previewHotspots, thumbStartRow, visibleRows);
};
NewsReader.prototype._drawArticle = function () {
    this._destroyCategoryIcons();
    this._destroyFeedIcons();
    this._gridLayout = null;
    this._destroyArticlePreviewFrame();
    this._destroyArticleLinkButton();
    this._ensureArticleIcon({ showIcon: true });
    this._releaseHotspots();
    var header = 'Article';
    var article = (this.articleIndex >= 0 && this.articleIndex < this.currentArticles.length) ? this.currentArticles[this.articleIndex] : null;
    if (article && article.title) {
        header = article.title;
    }
    this._setHeader(this._toDisplayText(header));
    this._resetFrameSurface(this.listFrame, this.paletteAttr('LIST_INACTIVE'));
    if (!this.articleLines.length) {
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No content available.');
        this._articleContentVisibleRows = 0;
        return;
    }
    this._renderArticleLinkButton(article);
    var contentStart = this._articleContentStartRow || this.articleTextOffset;
    var startRow = Math.max(1, contentStart);
    var height = Math.max(0, this.listFrame.height - (startRow - 1));
    if (height <= 0) height = this.listFrame.height;
    this._articleContentVisibleRows = height;
    var offset = Math.max(0, this.articleScroll);
    if (offset > Math.max(0, this.articleLines.length - 1)) offset = Math.max(0, this.articleLines.length - 1);
    for (var row = 0; row < height; row++) {
        var lineIndex = offset + row;
        if (lineIndex >= this.articleLines.length) break;
        this.listFrame.gotoxy(1, startRow + row);
        this.listFrame.putmsg(this._toDisplayText(this.articleLines[lineIndex]));
    }
    this._setStatus(this._composeArticleStatus(article));
    this._registerArticleHeaderHotspot();
    this._applyPendingHotspots();
};

NewsReader.prototype._composeArticleStatus = function (article) {
    var parts = [];
    var pageSize = (typeof this._articleContentVisibleRows === 'number' && this._articleContentVisibleRows > 0)
        ? this._articleContentVisibleRows
        : (this.listFrame ? Math.max(1, this.listFrame.height - 1) : 1);
    var maxScroll = Math.max(0, this.articleLines.length - pageSize);
    if (this.articleScroll < maxScroll) parts.push({ val: 'ENTER', action: 'jump to end' });
    else parts.push({ val: 'RIGHT/ENTER', action: 'next' });
    parts.push({ val: 'LEFT/BACKSPACE', action: 'previous' });
    parts.push({ val: 'ESC', action: 'articles' });
    if (this.articleImages && this.articleImages.length) parts.push({ val: 'I/i', action: 'images' });
    var link = article && article.link ? String(article.link).trim() : '';
    if (link || this._articleButtonHotkey) {
        parts.push({ val: 'R', action: 'read link' });
    }
    return this._generateHotkeyLine(parts);
};

NewsReader.prototype._renderArticleLinkButton = function (article) {
    if (!this.listFrame) {
        this._destroyArticleLinkButton();
        return;
    }
    var link = article && article.link ? String(article.link).trim() : '';
    if (!link) {
        this._destroyArticleLinkButton();
        this._articleContentStartRow = this.articleTextOffset;
        return;
    }
    if (!this.articleHeaderFrame) {
        this._destroyArticleLinkButton();
        return;
    }
    var textStart = (typeof this._articleHeaderTextStart === 'number') ? this._articleHeaderTextStart : 1;
    var baseline = (typeof this._articleHeaderBaseline === 'number' && this._articleHeaderBaseline > 0) ? this._articleHeaderBaseline : 1;
    var maxTextWidth = (typeof this._articleHeaderTextWidth === 'number' && this._articleHeaderTextWidth > 0) ? this._articleHeaderTextWidth : (this.articleHeaderFrame.width - textStart + 1);
    if (!maxTextWidth || maxTextWidth <= 0) {
        this._destroyArticleLinkButton();
        return;
    }
    var buttonWidth = Math.min(Math.max(10, maxTextWidth), 24);
    if (buttonWidth > maxTextWidth) buttonWidth = maxTextWidth;
    if (buttonWidth < 4) buttonWidth = Math.max(4, maxTextWidth);
    var buttonX = textStart + 28;
    if (buttonX + buttonWidth - 1 > this.articleHeaderFrame.width) buttonX = Math.max(textStart, this.articleHeaderFrame.width - buttonWidth + 1);
    if (buttonX < textStart) buttonX = textStart;
    var buttonY = baseline - 1;
    if (buttonY < 1) buttonY = 1;
    if (buttonY + 1 > this.articleHeaderFrame.height) buttonY = Math.max(1, this.articleHeaderFrame.height - 1);
    var baseAttr = this.paletteAttr('LIST_INACTIVE');
    var focusAttr = this.paletteAttr('LINK_BUTTON');
    var fgRead = (typeof WHITE === 'number') ? WHITE : null;
    var buttonAttr = this._composeAttrWithFg(baseAttr, fgRead);
    var shadowFg = (typeof DARKGRAY === 'number') ? DARKGRAY : null;
    var shadowAttr = this._composeAttrWithFg(baseAttr, shadowFg);

    this._clearArticleHeaderButtonArea(buttonX, buttonY, buttonWidth, 2);

    if (!this.articleLinkButtonFrame) {
        try {
            this.articleLinkButtonFrame = new Frame(buttonX, buttonY, buttonWidth, 2, buttonAttr, this.articleHeaderFrame);
            this.articleLinkButtonFrame.open();
            if (typeof this.registerFrame === 'function') this.registerFrame(this.articleLinkButtonFrame);
        } catch (_eBtnFrameCreate) {
            this.articleLinkButtonFrame = null;
        }
    } else {
        try {
            if (typeof this.articleLinkButtonFrame.moveTo === 'function') {
                this.articleLinkButtonFrame.moveTo(buttonX, buttonY);
            }
            this.articleLinkButtonFrame.width = buttonWidth;
            this.articleLinkButtonFrame.height = 2;
            // remove: frame resize is not a function use width / height setters
            // if (typeof this.articleLinkButtonFrame.resize === 'function') {
            //     this.articleLinkButtonFrame.resize(buttonWidth, 2);
            // }
            if (typeof this.articleLinkButtonFrame.clear === 'function') {
                this.articleLinkButtonFrame.clear(buttonAttr);
            }
        } catch (_eBtnFrameMove) { }
    }

    if (!this.articleLinkButtonFrame) {
        this._articleContentStartRow = this.articleTextOffset;
        return;
    }

    var callback = this._createArticleLinkButtonHandler(link);
    if (!this.articleLinkButton) {
        try {
            this.articleLinkButton = new Button({
                frame: this.articleLinkButtonFrame,
                parentFrame: this.articleHeaderFrame,
                label: 'Read Link',
                attr: WHITE | BG_CYAN,
                focusAttr: focusAttr,
                shadowAttr: shadowAttr,
                backgroundColors: [LIGHTGRAY, BG_LIGHTGRAY],
                shadowColors: [BLACK, BG_BLACK],
                onClick: callback
            });
        } catch (_eBtnInit) {
            this._destroyArticleLinkButton();
            this._articleContentStartRow = this.articleTextOffset;
            return;
        }
    } else {
        this.articleLinkButton.setLabel('Read Link');
        this.articleLinkButton.setOnClick(callback);
        this.articleLinkButton.parentFrame = this.articleHeaderFrame || null;
        this.articleLinkButton.backgroundColors = [RED, BG_RED];
        this.articleLinkButton.shadowColors = [BLACK, BG_BLACK];
    }

    this.articleLinkButton.setFocused(true);
    this.articleLinkButton.render();

    this._articleContentStartRow = this.articleTextOffset;

    this._registerArticleLinkButtonHotspot();
    this._currentArticleLink = link;
    this._articleLinkButtonWidth = buttonWidth;
    this._articleLinkButtonX = buttonX;
    this._articleLinkButtonY = buttonY;
};

NewsReader.prototype._clearArticleHeaderButtonArea = function (startX, startY, width, height) {
    if (!this.articleHeaderFrame) return;
    if (!width || width <= 0) return;
    var attr = (typeof this._articleHeaderAttr === 'number') ? this._articleHeaderAttr : this.articleHeaderFrame.attr;
    var clampedWidth = Math.max(1, Math.min(width, this.articleHeaderFrame.width - startX + 1));
    var spaces = new Array(clampedWidth + 1).join(' ');
    var beginY = Math.max(1, startY);
    var endY = Math.min(this.articleHeaderFrame.height, beginY + Math.max(1, height) - 1);
    var x = Math.max(1, Math.min(startX, this.articleHeaderFrame.width));
    for (var y = beginY; y <= endY; y++) {
        try {
            this.articleHeaderFrame.attr = attr;
            this.articleHeaderFrame.gotoxy(x, y);
            this.articleHeaderFrame.putmsg(spaces);
        } catch (_eClrArea) { }
    }
    this.articleHeaderFrame.attr = attr;
};

NewsReader.prototype._registerArticleLinkButtonHotspot = function () {
    if (!this.articleLinkButtonFrame) return;
    this._hotspotMap = this._hotspotMap || {};
    if (this._articleButtonHotkey && this._hotspotMap[this._articleButtonHotkey]) {
        delete this._hotspotMap[this._articleButtonHotkey];
    }
    this._articleButtonHotkey = null;
    var cmd = this._reserveHotspotChar();
    if (!cmd) return;
    var frame = this.articleLinkButtonFrame;
    if (!frame) return;
    var baseX = this.listFrame ? this.listFrame.x : 1;
    var baseY = this.listFrame ? this.listFrame.y : 1;
    if (this.articleHeaderFrame) {
        baseX += this.articleHeaderFrame.x - 1;
        baseY += this.articleHeaderFrame.y - 3;
    }
    var minX = baseX + frame.x - 1;
    var maxX = minX + frame.width - 1;
    var minY = baseY + frame.y - 1;
    var maxY = minY + frame.height - 1;
    this._addHotspotArea(cmd, false, minX, maxX, minY, maxY);
    this._hotspotMap[cmd] = { type: 'articleLinkButton' };
    this._articleButtonHotkey = cmd;
    this._applyPendingHotspots();
};

NewsReader.prototype._reserveHotspotChar = function () {
    var chars = this._ensureHotspotChars();
    if (!chars || !chars.length) return null;
    this._hotspotMap = this._hotspotMap || {};
    for (var i = 0; i < chars.length; i++) {
        if (!this._hotspotMap.hasOwnProperty(chars[i])) return chars[i];
    }
    return null;
};

NewsReader.prototype._createArticleLinkButtonHandler = function (link) {
    var self = this;
    return function () {
        self._handleArticleButtonActivation(link);
    };
};

NewsReader.prototype._handleArticleButtonActivation = function (link) {
    if (!link && this._currentArticleLink) link = this._currentArticleLink;
    if (!link) {
        this._setStatus('No link available for this article.');
        return;
    }
    var message = 'TODO: fetch link and sanitize it -> ' + link;
    if (typeof log === 'function') {
        try { log(message); } catch (_eLog) { }
    }
    if (typeof console !== 'undefined' && typeof console.putmsg === 'function') {
        try { console.putmsg('\r\n' + message + '\r\n'); } catch (_eCon) { }
    }
    this._setStatus('Logged link (TODO sanitize): ' + this._toDisplayText(link));
};

NewsReader.prototype._renderArticleListWithDates = function () {
    if (!this.listFrame) {
        this._releaseHotspots();
        return;
    }
    var articles = this.currentArticles || [];
    var frame = this.listFrame;
    var height = frame.height || 0;

    this._articleListVisibleRows = height;

    this._ensureArticleScrollVisibility(height);
    this._resetFrameSurface(frame, this.paletteAttr('LIST_INACTIVE'));

    var rowHotspots = [];
    if (!articles.length || height <= 0) {
        this._registerListHotspots(rowHotspots);
        return;
    }

    var startIndex = Math.max(0, Math.min(this.scrollOffset, articles.length - 1));
    var idx = startIndex;
    var row = 0;
    var prevInfo = (startIndex > 0) ? this._getArticleDateInfo(articles[startIndex - 1]) : null;
    var lastKey = prevInfo && prevInfo.dateKey ? prevInfo.dateKey : null;
    var forceDateLine = true;

    while (row < height && idx < articles.length) {
        var article = articles[idx];
        var info = this._getArticleDateInfo(article);
        var dateKey = (info && info.dateKey) ? info.dateKey : '__unknown';
        var dateLabel = (info && info.displayDate) ? info.displayDate : 'Unknown Date';

        var shouldRenderDate = forceDateLine || dateKey !== lastKey;
        var rowsRemaining = height - row;
        if (shouldRenderDate && rowsRemaining === 1) shouldRenderDate = false;

        if (shouldRenderDate && rowsRemaining > 0) {
            frame.gotoxy(1, row + 1);
            var dividerAttr = this._composeAttrWithFg(this.paletteAttr('LIST_INACTIVE'), (typeof LIGHTMAGENTA === 'number') ? LIGHTMAGENTA : null);
            frame.attr = dividerAttr;
            var dividerText = this._toDisplayText(dateLabel);
            if (dividerText.length > frame.width) dividerText = dividerText.substr(0, frame.width);
            frame.putmsg(dividerText);
            row++;
            if (row >= height) break;
            lastKey = dateKey;
        }

        forceDateLine = false;

        var baseAttr = (idx === this.selectedIndex) ? this.paletteAttr('LIST_ACTIVE') : this.paletteAttr('LIST_INACTIVE');
        var prefix = (idx + 1) + '. ';
        var numberText = this._toDisplayText(prefix);
        var titleSource = article && article.title ? article.title : '[untitled]';
        var titleText = this._toDisplayText(titleSource);
        var hasImages = article && article.__newsImages && article.__newsImages.length;
        var timeSegment = this._formatArticleTimeSegment(info);

        var frameWidth = frame.width || 0;
        var remaining = frameWidth;

        frame.gotoxy(1, row + 1);

        var writeSegment = function (text, attr) {
            if (!text || !text.length || remaining <= 0) return;
            var output = text;
            if (output.length > remaining) output = output.substr(0, remaining);
            var effectiveAttr = (typeof attr === 'number') ? attr : baseAttr;
            frame.attr = effectiveAttr;
            frame.putmsg(output);
            remaining -= output.length;
        };

        if (timeSegment && timeSegment.length) {
            var timeAttr = this._composeAttrWithFg(baseAttr, this.paletteAttr('LIST_TIME'));
            writeSegment(timeSegment, timeAttr);
        }
        if (timeSegment && timeSegment.length && remaining > 0) {
            writeSegment(' ', baseAttr);
        }

        var numberAttr = this._composeAttrWithFg(baseAttr, (typeof DARKGRAY === 'number') ? DARKGRAY : null);
        var titleAttr = this._composeAttrWithFg(baseAttr, (typeof WHITE === 'number') ? WHITE : null);
        writeSegment(numberText, numberAttr);
        writeSegment(titleText, titleAttr);

        if (hasImages && remaining > 0) {
            var bracketAttr = this._composeAttrWithFg(baseAttr, (typeof YELLOW === 'number') ? YELLOW : null);
            var imgAttr = this._composeAttrWithFg(baseAttr, (typeof LIGHTCYAN === 'number') ? LIGHTCYAN : null);
            writeSegment(' ', baseAttr);
            writeSegment('[', bracketAttr);
            writeSegment('IMG', imgAttr);
            writeSegment(']', bracketAttr);
        }

        frame.attr = this.paletteAttr('LIST_INACTIVE');

        rowHotspots.push({ index: idx, y: row + 1 });
        row++;
        idx++;
        lastKey = dateKey;
    }

    frame.attr = this.paletteAttr('LIST_INACTIVE');
    this._registerListHotspots(rowHotspots);
};

NewsReader.prototype._ensureArticleScrollVisibility = function (height) {
    var articles = this.currentArticles || [];
    if (!articles.length) {
        this.scrollOffset = 0;
        if (this.selectedIndex !== 0) this.selectedIndex = 0;
        return;
    }
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (this.selectedIndex >= articles.length) this.selectedIndex = articles.length - 1;
    if (this.scrollOffset < 0) this.scrollOffset = 0;
    if (this.scrollOffset >= articles.length) this.scrollOffset = Math.max(0, articles.length - 1);
    if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;

    if (height <= 0) height = 1;

    while (this.scrollOffset < this.selectedIndex) {
        var rowsNeeded = this._countArticleRowsInRange(this.scrollOffset, this.selectedIndex);
        if (rowsNeeded <= height) break;
        this.scrollOffset++;
    }

    while (this.scrollOffset > 0) {
        var projected = this.scrollOffset - 1;
        var projectedRows = this._countArticleRowsInRange(projected, this.selectedIndex);
        if (projectedRows > height) break;
        this.scrollOffset = projected;
    }
};

NewsReader.prototype._countArticleRowsInRange = function (startIndex, endIndex) {
    var articles = this.currentArticles || [];
    if (!articles.length) return 0;
    if (typeof startIndex !== 'number') startIndex = 0;
    if (typeof endIndex !== 'number') endIndex = 0;
    if (startIndex < 0) startIndex = 0;
    if (endIndex < 0) endIndex = 0;
    if (startIndex >= articles.length) startIndex = articles.length - 1;
    if (endIndex >= articles.length) endIndex = articles.length - 1;
    var min = Math.min(startIndex, endIndex);
    var max = Math.max(startIndex, endIndex);
    var count = 0;
    var lastKey = null;
    for (var i = min; i <= max; i++) {
        var info = this._getArticleDateInfo(articles[i]);
        var key = (info && info.dateKey) ? info.dateKey : '__unknown';
        if (i === min) {
            count++;
        } else if (key !== lastKey) {
            count++;
        }
        lastKey = key;
        count++;
    }
    return count;
};

NewsReader.prototype._composeAttrWithFg = function (baseAttr, fgAttr) {
    if (typeof baseAttr !== 'number') baseAttr = 0;
    if (typeof fgAttr !== 'number') return baseAttr;
    var blinkBit = baseAttr & 0x80;
    var bgBits = baseAttr & 0x70;
    return (fgAttr & 0x0F) | bgBits | blinkBit;
};

NewsReader.prototype._renderList = function (items, formatter) {
    if (!this.listFrame) {
        this._releaseHotspots();
        return;
    }
    if (!items) items = [];
    var height = this.listFrame.height;
    if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
    if (this.selectedIndex >= this.scrollOffset + height) this.scrollOffset = Math.max(0, this.selectedIndex - height + 1);
    this._resetFrameSurface(this.listFrame, this.paletteAttr('LIST_INACTIVE'));
    var rowHotspots = [];
    for (var row = 0; row < height; row++) {
        var idx = this.scrollOffset + row;
        if (idx >= items.length) break;
        var line = formatter(items[idx], idx) || '';
        line = this._toDisplayText(line);
        if (line.length > this.listFrame.width) line = line.substr(0, this.listFrame.width);
        this.listFrame.gotoxy(1, row + 1);
        this.listFrame.attr = (idx === this.selectedIndex) ? this.paletteAttr('LIST_ACTIVE') : this.paletteAttr('LIST_INACTIVE');
        this.listFrame.putmsg(line);
        rowHotspots.push({ index: idx, y: row + 1 });
    }
    this.listFrame.attr = this.paletteAttr('LIST_INACTIVE');
    this._registerListHotspots(rowHotspots);
};

NewsReader.prototype._cleanup = function () {
    var frames = ['headerFrame', 'statusFrame', 'listFrame'];
    for (var i = 0; i < frames.length; i++) {
        var key = frames[i];
        var frame = this[key];
        this._deleteFrame(frame);
        this[key] = null;
    }
    this._releaseHotspots();
    this._destroyArticleLinkButton();
    this._resetState();
};

NewsReader.prototype._setHeader = function (text) {
    if (!this.headerFrame) return;
    this.headerFrame.clear();
    this.headerFrame.gotoxy(1, 1);
    if (!text) text = 'News';
    text = this._toDisplayText(text);
    if (text.length > this.headerFrame.width) text = text.substr(0, this.headerFrame.width);
    this.headerFrame.center(text);
};

NewsReader.prototype._setStatus = function (text) {
    if (!this.statusFrame) return;
    this.statusMessage = text || '';
    this.statusMessageTs = Date.now();
    this._refreshStatus();
};

NewsReader.prototype._refreshStatus = function () {
    if (!this.statusFrame) return;
    var text = this.statusMessage || '';
    text = this._toDisplayText(text);
    // if (text.length > this.statusFrame.width) text = text.substr(0, this.statusFrame.width);
    this.statusFrame.clear();
    this.statusFrame.gotoxy(1, 1);
    this.statusFrame.putmsg(text);
};

NewsReader.prototype._feedsForCategory = function (category) {
    if (!category) return [];
    var feeds = category.feeds.slice(0);
    feeds.sort(function (a, b) {
        var A = a.label.toLowerCase(), B = b.label.toLowerCase();
        return A > B ? 1 : (A < B ? -1 : 0);
    });
    return feeds;
};

NewsReader.prototype._getFeedData = function (feed, forceRefresh) {
    if (!feed) return { error: true, message: 'Invalid feed selection.' };
    if (!forceRefresh && this.feedCache[feed.url]) return this.feedCache[feed.url];
    var result;
    try {
        var rss = new Feed(feed.url, 5);
        var channel = rss.channels && rss.channels.length ? rss.channels[0] : null;
        var items = channel && channel.items ? channel.items : [];
        result = {
            error: false,
            channel: channel,
            items: items,
            timestamp: Date.now()
        };
    } catch (e) {
        result = {
            error: true,
            message: 'Failed to load feed: ' + e
        };
    }
    this.feedCache[feed.url] = result;
    return result;
};

NewsReader.prototype._prepareArticleLines = function (article) {
    var width = this.listFrame ? this.listFrame.width : 78;
    var lines = [];
    if (!article) return lines;
    var title = (this._stringifyField(article.title) || 'Untitled Article');
    var authorValue = this._stringifyField(article.author);
    var dateValue = article.date || article.pubDate || article.published || article.updated || article.updatedAt || '';
    var bodyParts = [];
    if (article.content) bodyParts.push(article.content);
    if (article.description && bodyParts.indexOf(article.description) === -1) bodyParts.push(article.description);
    if (article.summary && bodyParts.indexOf(article.summary) === -1) bodyParts.push(article.summary);
    if (article.body && bodyParts.indexOf(article.body) === -1) bodyParts.push(article.body);
    var body = bodyParts.join('\n\n');
    var metadata = [];
    metadata.push(this._toDisplayText(title));
    if (authorValue) metadata.push(this._toDisplayText('By: ' + authorValue));
    if (dateValue) metadata.push(this._toDisplayText(this._formatArticleDate(dateValue)));
    metadata.push('');
    lines = lines.concat(this._wrapText(metadata.join('\n'), width));
    lines.push('');
    var simplifiedBody = this._simplifyText(body) || '[No content]';
    lines = lines.concat(this._wrapText(this._toDisplayText(simplifiedBody), width));
    if (article.link) {
        lines.push('');
        lines.push(this._toDisplayText('Link: ' + article.link));
    }
    return this._collapseBlankLines(lines);
};

NewsReader.prototype._stringifyField = function (value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (value.name && typeof value.name === 'string') return value.name;
    if (value.label && typeof value.label === 'string') return value.label;
    if (Array.isArray(value)) return value.join(', ');
    try {
        var primitive = value.toString();
        if (primitive && primitive !== '[object Object]') return primitive;
    } catch (e) { }
    try { return JSON.stringify(value); } catch (_ignored) { }
    return String(value);
};

NewsReader.prototype._formatArticleDate = function (dateValue) {
    try {
        var d;
        if (dateValue instanceof Date) d = dateValue;
        else {
            var parsed = Date.parse(dateValue);
            if (!isNaN(parsed)) d = new Date(parsed);
        }
        if (!d || isNaN(d.getTime())) return 'Published: ' + this._stringifyField(dateValue);
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return 'Published: ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) {
        return 'Published: ' + this._stringifyField(dateValue);
    }
};

NewsReader.prototype._wrapText = function (text, width) {
    var result = [];
    if (!text) return result;
    if (!width || width <= 0) {
        var rawLines = text.split(/\r?\n/);
        for (var j = 0; j < rawLines.length; j++) result.push(rawLines[j]);
        return result;
    }
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        while (line.length > width) {
            var slice = line.substr(0, width);
            var breakIdx = slice.lastIndexOf(' ');
            if (breakIdx === -1) breakIdx = width;
            result.push(slice.substr(0, breakIdx));
            line = line.substr(breakIdx).replace(/^\s+/, '');
        }
        result.push(line);
    }
    return result;
};

NewsReader.prototype._collapseBlankLines = function (lines) {
    if (!Array.isArray(lines)) return [];
    var out = [];
    var blankSeen = false;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var isBlank = !line || !String(line).trim();
        if (isBlank) {
            if (!blankSeen && out.length) {
                out.push('');
            }
            blankSeen = true;
        } else {
            out.push(line);
            blankSeen = false;
        }
    }
    while (out.length && !String(out[0]).trim()) out.shift();
    while (out.length && !String(out[out.length - 1]).trim()) out.pop();
    return out;
};

NewsReader.prototype._asciiCharForCode = function (code) {
    if (code == null || isNaN(code)) return '';
    if (Object.prototype.hasOwnProperty.call(NEWSREADER_ASCII_ENTITY_MAP, code)) {
        return NEWSREADER_ASCII_ENTITY_MAP[code];
    }
    if (code >= 32 && code <= 126) return String.fromCharCode(code);
    if (code === 10) return '\n';
    if (code === 13) return '\r';
    return '';
};

NewsReader.prototype._replaceNumericEntities = function (text) {
    if (!text) return '';
    var self = this;
    return String(text).replace(/&#(x?[0-9a-fA-F]+);/g, function (_match, value) {
        var code;
        if (!value) return '';
        if (value.charAt(0).toLowerCase() === 'x') code = parseInt(value.substr(1), 16);
        else code = parseInt(value, 10);
        if (isNaN(code)) return '';
        return self._asciiCharForCode(code);
    });
};

NewsReader.prototype._replaceUnicodePunctuation = function (text) {
    if (!text) return '';
    var self = this;
    return String(text).replace(/[\u00A0\u2018\u2019\u201A\u201C\u201D\u201E\u2013\u2014\u2022\u2026\u2122]/g, function (ch) {
        if (Object.prototype.hasOwnProperty.call(NEWSREADER_UNICODE_PUNCT_MAP, ch)) {
            return NEWSREADER_UNICODE_PUNCT_MAP[ch];
        }
        return self._asciiCharForCode(ch.charCodeAt(0));
    });
};

NewsReader.prototype.handleKey = function (key) {
    log('NewsReader handleKey: ' + key);
    if (!key) return;

    switch (this.state) {
        case 'categories': {
            var catItems = (this._categoryGridItems && this._categoryGridItems.length) ? this._categoryGridItems : (this.categories || []);
            var catLength = catItems.length;
            var activateCategory = function () {
                var item = catItems[this.selectedIndex];
                if (!item) return;

                // Play dissolve animation before activation
                try {
                    var cells = this._gridCellsForLayout();
                    if (cells && this.selectedIndex >= 0 && this.selectedIndex < cells.length && cells[this.selectedIndex] && cells[this.selectedIndex].icon) {
                        var cell = cells[this.selectedIndex];
                        var wasTransparent = cell.icon.transparent;
                        cell.icon.transparent = false;
                        var fallbackDissolveColor = (typeof BLACK !== 'undefined' ? BLACK : 0);
                        var dissolveColor = fallbackDissolveColor;
                        try {
                            dissolve(cell.icon, dissolveColor, 5);
                        } catch (e) {
                            dbug("dissolve error in activateCategory: " + e, "view");
                        }
                        cell.icon.transparent = wasTransparent;
                        cell.icon.clear();
                        cell.icon.cycle();
                    }
                } catch (e) {
                    dbug("Error in activateCategory dissolve: " + e, "view");
                }

                if (item._type === 'exit') {
                    this.exit();
                    return;
                }
                if (item._type === 'back') {
                    this._popCategoryLevel();
                    this.draw();
                    return;
                }
                var hasChildren = item.children && item.children.length;
                if (hasChildren) {
                    var visibleKids = this._visibleChildren(item);
                    if (visibleKids && visibleKids.length) {
                        this.currentCategory = null;
                        this.currentFeed = null;
                        this.currentFeedData = null;
                        this.currentFeeds = [];
                        this._pushCategoryLevel(item);
                        this.draw();
                        return;
                    }
                }
                this.currentCategory = item;
                this.currentFeed = null;
                this.currentFeedData = null;
                this.currentFeeds = this._feedsForCategory(this.currentCategory);
                this.state = 'feeds';
                this.selectedIndex = (this.currentFeeds && this.currentFeeds.length) ? 1 : 0;
                this.scrollOffset = 0;
                this._setStatus('Loading feeds...');
                this.draw();
            }.bind(this);
            if (this._hotspotMap && this._hotspotMap[key] !== undefined) {
                this.selectedIndex = this._hotspotMap[key];
                this._adjustGridScroll(this._gridLayout, catLength);
                activateCategory();
                break;
            }
            var exitOrBack = function () {
                if (this._canPopCategory()) {
                    this._popCategoryLevel();
                    this.draw();
                } else {
                    this.exit();
                }
            }.bind(this);
            this._handleListNavigation(key, catLength, activateCategory, exitOrBack);
            break;
        }
        case 'feeds': {
            var feedItems = (this._feedGridItems && this._feedGridItems.length) ? this._feedGridItems : (this.currentFeeds || []);
            var feedLength = feedItems.length;
            var feedBack = function () {
                this.currentFeed = null;
                this.currentFeedData = null;
                this.state = 'categories';
                this.scrollOffset = 0;
                var idx = (this.currentCategory && this.categories) ? this.categories.indexOf(this.currentCategory) : -1;
                if (idx < 0) idx = 0;
                this.selectedIndex = this._canPopCategory() ? idx + 1 : idx;
                this.draw();
            }.bind(this);
            var activateFeed = function () {
                var item = feedItems[this.selectedIndex];
                if (!item) return;

                // Play dissolve animation before activation
                try {
                    var cells = this._gridCellsForLayout();
                    if (cells && this.selectedIndex >= 0 && this.selectedIndex < cells.length && cells[this.selectedIndex] && cells[this.selectedIndex].icon) {
                        var cell = cells[this.selectedIndex];
                        var wasTransparent = cell.icon.transparent;
                        cell.icon.transparent = false;
                        var fallbackDissolveColor = (typeof BLACK !== 'undefined' ? BLACK : 0);
                        var dissolveColor = fallbackDissolveColor;
                        try {
                            dissolve(cell.icon, dissolveColor, 5);
                        } catch (e) {
                            dbug("dissolve error in activateFeed: " + e, "view");
                        }
                        cell.icon.transparent = wasTransparent;
                        cell.icon.clear();
                        cell.icon.cycle();
                    }
                } catch (e) {
                    dbug("Error in activateFeed dissolve: " + e, "view");
                }

                if (item._type === 'back') {
                    feedBack();
                    return;
                }
                this._openFeed(item);
            }.bind(this);
            if (key === 'F' || key === 'f') {
                this._toggleFavoriteForSelection(feedItems);
                break;
            }
            if (this._hotspotMap && this._hotspotMap[key] !== undefined) {
                this.selectedIndex = this._hotspotMap[key];
                this._adjustGridScroll(this._gridLayout, feedLength);
                activateFeed();
                break;
            }
            this._handleListNavigation(key, feedLength, activateFeed, feedBack);
            if ((key === 'R' || key === 'r') && feedLength) {
                var selectedFeed = feedItems[this.selectedIndex];
                if (selectedFeed && !selectedFeed._type) {
                    this._openFeed(selectedFeed, true);
                }
            }
            break;
        }
        case 'articles':
            if (this._hotspotMap && this._hotspotMap[key] !== undefined) {
                var targetIndex = this._hotspotMap[key];
                if (typeof targetIndex === 'number' && this.currentArticles[targetIndex]) {
                    this.selectedIndex = targetIndex;
                    if (this.listFrame) {
                        var visibleRows = Math.max(1, this.listFrame.height);
                        if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
                        else if (this.selectedIndex >= this.scrollOffset + visibleRows) this.scrollOffset = Math.max(0, this.selectedIndex - visibleRows + 1);
                    }
                    this._openArticle(this.selectedIndex);
                    break;
                }
            }
            this._handleListNavigation(key, this.currentArticles.length, function () {
                if (!this.currentArticles.length) {
                    this._setStatus('No articles to open.');
                    return;
                }
                this._openArticle(this.selectedIndex);
            }.bind(this), function () {
                this.state = 'feeds';
                this.scrollOffset = 0;
                this.selectedIndex = this.currentFeeds.indexOf(this.currentFeed);
                if (this.selectedIndex < 0) this.selectedIndex = 0;
                this.draw();
            }.bind(this));
            break;
        case 'article_images':
            if (this._isImageNavigationKey(key)) {
                this._handleImageNavigation(key);
                break;
            }
            if (this._hotspotMap && this._hotspotMap[key] !== undefined) {
                var mapping = this._hotspotMap[key];
                if (mapping && mapping.type === 'articleHeaderBack') {
                    this._destroyArticleIcon();
                    this.state = 'articles';
                    if (this.articleIndex >= 0 && this.articleIndex < this.currentArticles.length) {
                        this.selectedIndex = this.articleIndex;
                    }
                    this.scrollOffset = Math.max(0, Math.min(this._articleListScroll || 0, Math.max(0, this.currentArticles.length - 1)));
                    this.articleIndex = -1;
                    this.draw();
                    break;
                }
                if (mapping && mapping.type === 'articleHeaderCategory') {
                    this._returnToFeedsFromArticle();
                    break;
                }
                if (mapping && mapping.type === 'imageArea') {
                    if (this.imageSelection < this.articleImages.length - 1) {
                        this.imageSelection++;
                        this.imagePreviewScroll = 0;
                        this.imageScrollOffset = Math.max(0, Math.min(this.imageSelection, this.imageScrollOffset));
                        this.draw();
                    } else {
                        this._enterArticleContent();
                    }
                    break;
                }
                if (mapping && mapping.type === 'thumb' && typeof mapping.index === 'number') {
                    var target = mapping.index;
                    if (target >= 0 && target < this.articleImages.length) {
                        this.imageSelection = target;
                        if (this.listFrame) {
                            var visible = Math.max(1, this.listFrame.height - Math.max(0, (this._imagePreviewVisibleRows || 0)));
                            if (visible > 0) {
                                var thumbStart = Math.max(0, (this._imagePreviewVisibleRows || 0));
                                var relativeRow = target - this.imageScrollOffset;
                                if (relativeRow < 0) this.imageScrollOffset = target;
                                else if (relativeRow >= visible) this.imageScrollOffset = Math.max(0, target - visible + 1);
                            } else {
                                this.imageScrollOffset = Math.max(0, Math.min(target, this.imageScrollOffset));
                            }
                        }
                        this.imagePreviewScroll = 0;
                        this.draw();
                    }
                    break;
                }
            }
            this._handleImageNavigation(key);
            break;
        case 'article':
            if (this._hotspotMap && this._hotspotMap[key]) {
                var mapEntry = this._hotspotMap[key];
                if (mapEntry && mapEntry.type === 'articleHeaderBack') {
                    this._returnToArticlesFromHeaderBack();
                    break;
                }
                if (mapEntry && mapEntry.type === 'articleHeaderCategory') {
                    this._returnToFeedsFromArticle();
                    break;
                }
                if (mapEntry && mapEntry.type === 'articleLinkButton') {
                    if (!this._triggerArticleLinkButton()) {
                        this._setStatus('No link available for this article.');
                    }
                    break;
                }
            }
            this._handleArticleNavigation(key);
            break;
    }
};

NewsReader.prototype._handleListNavigation = function (key, length, onEnter, onBack) {
    if (typeof length !== 'number' || length < 0) length = 0;
    var grid = null;
    if (this._gridLayout) {
        if ((this.state === 'categories' && this._gridLayout.type === 'categories') ||
            (this.state === 'feeds' && this._gridLayout.type === 'feeds')) {
            grid = this._gridLayout;
        }
    }
    var pageSize = this.listFrame ? Math.max(1, this.listFrame.height) : 1;
    if (grid) pageSize = Math.max(1, grid.cols * grid.visibleRows);
    log("news reader key: " + key);
    switch (key) {
        case KEY_UP:
        case 'KEY_UP':
        case 'UP':
        case "\u001e":
            if (length === 0) break;
            if (grid) {
                var prevIndex = this.selectedIndex;
                var prevScroll = this.scrollOffset;
                if (this.selectedIndex >= grid.cols) this.selectedIndex -= grid.cols;
                else this.selectedIndex = this.selectedIndex % grid.cols;
                this._finalizeGridSelectionChange(prevIndex, prevScroll, length);
                break;
            }
            if (this.selectedIndex > 0) {
                this.selectedIndex--;
                if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
                this.draw();
            }
            break;
        case KEY_DOWN:
        case 'KEY_DOWN':
        case 'DOWN':
        case '\u000a':
            if (length === 0) break;
            if (grid) {
                var nextDown = this.selectedIndex + grid.cols;
                var prevIdx = this.selectedIndex;
                var prevScr = this.scrollOffset;
                if (nextDown < length) this.selectedIndex = nextDown;
                else this.selectedIndex = length - 1;
                this._finalizeGridSelectionChange(prevIdx, prevScr, length);
                break;
            }
            if (this.selectedIndex < length - 1) {
                this.selectedIndex++;
                if (this.selectedIndex >= this.scrollOffset + pageSize) {
                    this.scrollOffset = Math.max(0, this.selectedIndex - pageSize + 1);
                }
                this.draw();
            }
            break;
        case KEY_LEFT:
        case 'KEY_LEFT':
        case 'LEFT':
        case '\u001d':
            // case '\x1B[D':
            if (length === 0) break;
            if (grid) {
                if (this.selectedIndex > 0) {
                    var prevIdxLeft = this.selectedIndex;
                    var prevScrollLeft = this.scrollOffset;
                    this.selectedIndex--;
                    this._finalizeGridSelectionChange(prevIdxLeft, prevScrollLeft, length);
                }
                break;
            }
            if (this.selectedIndex > 0) {
                this.selectedIndex--;
                if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
                this.draw();
            }
            break;
        case KEY_RIGHT:
        case 'KEY_RIGHT':
        case 'RIGHT':
        // case '\x1B[C':
        case '\u0006':
            if (length === 0) break;
            if (grid) {
                if (this.selectedIndex < length - 1) {
                    var prevIdxRight = this.selectedIndex;
                    var prevScrollRight = this.scrollOffset;
                    this.selectedIndex++;
                    this._finalizeGridSelectionChange(prevIdxRight, prevScrollRight, length);
                }
                break;
            }
            if (this.selectedIndex < length - 1) {
                this.selectedIndex++;
                if (this.selectedIndex >= this.scrollOffset + pageSize) {
                    this.scrollOffset = Math.max(0, this.selectedIndex - pageSize + 1);
                }
                this.draw();
            }
            break;
        case KEY_PGUP:
        case 'KEY_PGUP':
            if (length === 0) break;
            if (grid) {
                var prevIdxPgUp = this.selectedIndex;
                var prevScrollPgUp = this.scrollOffset;
                this.selectedIndex = Math.max(0, this.selectedIndex - pageSize);
                this._finalizeGridSelectionChange(prevIdxPgUp, prevScrollPgUp, length);
                break;
            }
            this.selectedIndex = Math.max(0, this.selectedIndex - pageSize);
            this.scrollOffset = Math.max(0, this.scrollOffset - pageSize);
            this.draw();
            break;
        case KEY_PGDN:
        case 'KEY_PGDN':
            if (length === 0) break;
            if (grid) {
                var prevIdxPgDn = this.selectedIndex;
                var prevScrollPgDn = this.scrollOffset;
                this.selectedIndex = Math.min(length - 1, this.selectedIndex + pageSize);
                this._finalizeGridSelectionChange(prevIdxPgDn, prevScrollPgDn, length);
                break;
            }
            this.selectedIndex = Math.min(length - 1, this.selectedIndex + pageSize);
            if (this.selectedIndex >= this.scrollOffset + pageSize) {
                this.scrollOffset = Math.min(Math.max(0, length - pageSize), this.scrollOffset + pageSize);
            }
            this.draw();
            break;
        case KEY_HOME:
        case 'KEY_HOME':
            if (length === 0) break;
            if (grid) {
                var prevIdxHome = this.selectedIndex;
                var prevScrollHome = this.scrollOffset;
                this.selectedIndex = 0;
                this._finalizeGridSelectionChange(prevIdxHome, prevScrollHome, length);
                break;
            }
            this.selectedIndex = 0;
            this.scrollOffset = 0;
            this.draw();
            break;
        case KEY_END:
        case 'KEY_END':
            if (length === 0) break;
            if (grid) {
                var prevIdxEnd = this.selectedIndex;
                var prevScrollEnd = this.scrollOffset;
                this.selectedIndex = length - 1;
                this._finalizeGridSelectionChange(prevIdxEnd, prevScrollEnd, length);
                break;
            }
            this.selectedIndex = length - 1;
            if (this.listFrame) {
                var visible = Math.max(1, this.listFrame.height);
                this.scrollOffset = Math.max(0, length - visible);
            }
            this.draw();
            break;
        case KEY_ENTER:
        case 'KEY_ENTER':
            if (typeof onEnter === 'function') onEnter();
            break;
        case '\x1B':
            if (typeof onBack === 'function') onBack();
            else this.exit();
            break;
        case '\b':
        case '\x08':
        case '\x7F':
            if (typeof onBack === 'function') onBack();
            break;
        case 'wheel_up':
            if (length === 0) break;
            if (grid) {
                if (this.selectedIndex > 0) {
                    var prevIdxWheelUp = this.selectedIndex;
                    var prevScrollWheelUp = this.scrollOffset;
                    this.selectedIndex = Math.max(0, this.selectedIndex - grid.cols);
                    this._finalizeGridSelectionChange(prevIdxWheelUp, prevScrollWheelUp, length);
                }
                break;
            }
            if (this.selectedIndex > 0) {
                this.selectedIndex = Math.max(0, this.selectedIndex - 1);
                if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
                this.draw();
            }
            break;
        case 'wheel_down':
            if (length === 0) break;
            if (grid) {
                if (this.selectedIndex < length - 1) {
                    var nextIdx = this.selectedIndex + grid.cols;
                    if (nextIdx >= length) nextIdx = length - 1;
                    var prevIdxWheelDown = this.selectedIndex;
                    var prevScrollWheelDown = this.scrollOffset;
                    this.selectedIndex = nextIdx;
                    this._finalizeGridSelectionChange(prevIdxWheelDown, prevScrollWheelDown, length);
                }
                break;
            }
            if (this.selectedIndex < length - 1) {
                this.selectedIndex = Math.min(length - 1, this.selectedIndex + 1);
                if (this.selectedIndex >= this.scrollOffset + pageSize) {
                    this.scrollOffset = Math.max(0, this.selectedIndex - pageSize + 1);
                }
                this.draw();
            }
            break;
    }
};

NewsReader.prototype._handleImageNavigation = function (key) {
    var length = this.articleImages.length;
    if (length <= 0) {
        this._enterArticleContent();
        return;
    }
    var pageSize = this.listFrame ? Math.max(1, this.listFrame.height) : 1;
    switch (key) {
        case KEY_UP:
        case 'KEY_UP':
        case 'UP':
        case '\u001e':
        case '\x1B[A': {
            var prevScrollUp = this.imagePreviewScroll;
            this.imagePreviewScroll = Math.max(0, prevScrollUp - 1);
            if (this.imagePreviewScroll !== prevScrollUp) this.draw();
            break;
        }
        case KEY_DOWN:
        case 'KEY_DOWN':
        case 'DOWN':
        case "\u000a":
        case '\x1B[B': {
            var prevScrollDown = this.imagePreviewScroll;
            var maxScrollDown = Math.max(0, this._imagePreviewScrollMax || 0);
            var candidate = prevScrollDown + 1;
            if (candidate > maxScrollDown) candidate = maxScrollDown;
            this.imagePreviewScroll = candidate;
            if (this.imagePreviewScroll !== prevScrollDown) this.draw();
            break;
        }
        case 'wheel_up': {
            var prevWheelUp = this.imagePreviewScroll;
            this.imagePreviewScroll = Math.max(0, prevWheelUp - 1);
            if (this.imagePreviewScroll !== prevWheelUp) this.draw();
            break;
        }
        case 'wheel_down': {
            var prevWheelDown = this.imagePreviewScroll;
            var maxWheelScroll = Math.max(0, this._imagePreviewScrollMax || 0);
            var wheelCandidate = prevWheelDown + 1;
            if (wheelCandidate > maxWheelScroll) wheelCandidate = maxWheelScroll;
            this.imagePreviewScroll = wheelCandidate;
            if (this.imagePreviewScroll !== prevWheelDown) this.draw();
            break;
        }
        case KEY_LEFT:
        case 'KEY_LEFT':
        case 'LEFT':
        case '\u001d':
        case '\x1B[D':
            if (this.imageSelection > 0) {
                this.imageSelection--;
                if (this.imageSelection < this.imageScrollOffset) this.imageScrollOffset = this.imageSelection;
                this.draw();
            }
            break;
        case KEY_RIGHT:
        case 'KEY_RIGHT':
        case 'RIGHT':
        case '\u0006':
        case '\x1B[C':
            if (this.imageSelection < length - 1) {
                this.imageSelection++;
                if (this.imageSelection >= this.imageScrollOffset + pageSize) {
                    this.imageScrollOffset = Math.max(0, this.imageSelection - pageSize + 1);
                }
                this.draw();
            }
            break;
        case KEY_PGUP:
        case 'KEY_PGUP':
            this.imageSelection = Math.max(0, this.imageSelection - pageSize);
            this.imageScrollOffset = Math.max(0, this.imageScrollOffset - pageSize);
            this.draw();
            break;
        case KEY_PGDN:
        case 'KEY_PGDN':
            this.imageSelection = Math.min(length - 1, this.imageSelection + pageSize);
            if (this.imageSelection >= this.imageScrollOffset + pageSize) {
                this.imageScrollOffset = Math.min(Math.max(0, length - pageSize), this.imageScrollOffset + pageSize);
            }
            this.draw();
            break;
        case KEY_HOME:
        case 'KEY_HOME':
            this.imageSelection = 0;
            this.imageScrollOffset = 0;
            this.draw();
            break;
        case KEY_END:
        case 'KEY_END':
            this.imageSelection = length - 1;
            if (this.listFrame) {
                var visible = Math.max(1, this.listFrame.height);
                this.imageScrollOffset = Math.max(0, length - visible);
            }
            this.draw();
            break;
        case KEY_ENTER:
        case 'KEY_ENTER':
            this._enterArticleContent();
            break;
        case 'I':
        case 'i':
            this._enterArticleContent();
            break;
        case '\x1B':
        case '\b':
        case '\x08':
        case '\x7F':
            this._destroyArticleIcon();
            this.state = 'articles';
            this.scrollOffset = this._articleListScroll;
            this.draw();
            break;
    }
};

NewsReader.prototype._enterArticleContent = function () {
    this.state = 'article';
    this.articleScroll = 0;
    this.scrollOffset = 0;
    this._releaseHotspots();
    this._destroyArticlePreviewFrame();
    this._ensureArticleIcon({ showIcon: true });
    this._setStatus('Loading article...');
    this.draw();
};


NewsReader.prototype._ensureArticleIcon = function (options) {
    if (!this.listFrame || !this.currentFeed) {
        this._destroyArticleIcon();
        return;
    }
    if (typeof options === 'boolean') options = { showIcon: options };
    options = options || {};

    var useIcon = (options.showIcon !== false);
    var headerOverride = Array.isArray(options.headerLines) ? options.headerLines.slice() : null;
    var forcedHeight = (typeof options.forceHeight === 'number') ? options.forceHeight : null;

    var metrics = this._getIconMetrics();
    var headerWidth = this.listFrame.width || 80;

    var categoryObj = this.currentCategory || null;
    if (!categoryObj && this.categories && this.categories.length && this.currentFeed && this.currentFeed.category) {
        for (var ci = 0; ci < this.categories.length; ci++) {
            var cat = this.categories[ci];
            if (!cat) continue;
            if (cat._key === this.currentFeed.category || cat.name === this.currentFeed.category) { categoryObj = cat; break; }
        }
    }

    var iconName = this._iconNameForFeed(this.currentFeed) || '';
    if (!iconName) useIcon = false;
    var categoryIconName = categoryObj ? this._iconNameForCategory(categoryObj) : '';
    var hasCategoryIcon = useIcon && !!categoryIconName;

    var containerHeight;
    if (useIcon) containerHeight = Math.max(metrics.height + 1, 2);
    else {
        if (forcedHeight != null) containerHeight = Math.max(1, Math.min(2, forcedHeight));
        else if (headerOverride && headerOverride.length) containerHeight = Math.max(1, Math.min(2, headerOverride.length));
        else containerHeight = 1;
    }
    if (containerHeight > 1) containerHeight -= 1;
    var minHeight = (this.state === 'article') ? 4 : 2;
    containerHeight = Math.max(containerHeight, minHeight);
    this._articleHeaderIconWidth = useIcon ? metrics.width : 0;
    this._articleHeaderHeight = containerHeight;

    var bgRed = BG_RED;
    var fgBlack = (typeof BLACK === 'number') ? BLACK : 0;
    var containerAttr = this.paletteAttr('READ_HEADER');

    var needsRebuild = true;
    if (this.articleHeaderFrame && this._currentIconKey === iconName && this._articleHeaderHasIcon === useIcon && this._articleHeaderHasCategory === hasCategoryIcon) needsRebuild = false;

    if (!needsRebuild) {
        if (this.headerFrame && typeof this.headerFrame.attr === 'number') {
            try { this.headerFrame.attr = containerAttr; } catch (_eAttrHdr) { }
        }
        if (this.headerFrame && typeof this.headerFrame.clear === 'function') {
            try { this.headerFrame.clear(containerAttr); } catch (_eClrHdr) { }
        }
        if (this.headerFrame && typeof this.headerFrame.center === 'function') {
            try { this.headerFrame.center(''); } catch (_eHdrMsg) { }
        }
        if (this.articleHeaderFrame && typeof this.articleHeaderFrame.clear === 'function') {
            try { this.articleHeaderFrame.clear(containerAttr); } catch (_eClrCont) { }
        }
        if (!useIcon) {
            this.articleIconFrame = null;
            this.articleIconObj = null;
            this.articleHeaderLabelFrame = null;
            this.articleCategoryIconFrame = null;
            this.articleCategoryIconObj = null;
            this.articleCategoryLabelFrame = null;
        }
    } else {
        this._destroyArticleIcon();
        try {
            this.articleHeaderFrame = new Frame(1, 1, this.listFrame.width, containerHeight, containerAttr, this.listFrame);
            this.articleHeaderFrame.open();
            this.articleHeaderFrame.clear(containerAttr);
            if (typeof this.registerFrame === 'function') this.registerFrame(this.articleHeaderFrame);

            var cursorX = 1;
            if (useIcon && hasCategoryIcon) {
                this.articleCategoryIconFrame = new Frame(cursorX, 1, metrics.width, metrics.height, containerAttr, this.articleHeaderFrame);
                this.articleCategoryIconFrame.open();
                if (typeof this.registerFrame === 'function') this.registerFrame(this.articleCategoryIconFrame);
                this.articleCategoryLabelFrame = new Frame(cursorX, metrics.height + 1, metrics.width, 1, containerAttr, this.articleHeaderFrame);
                this.articleCategoryLabelFrame.open();
                this.articleCategoryLabelFrame.clear(containerAttr);
                if (typeof this.registerFrame === 'function') this.registerFrame(this.articleCategoryLabelFrame);
                cursorX += metrics.width + 1;
            } else {
                this.articleCategoryIconFrame = null;
                this.articleCategoryLabelFrame = null;
            }

            if (useIcon) {
                this.articleIconFrame = new Frame(cursorX, 1, metrics.width, metrics.height, containerAttr, this.articleHeaderFrame);
                this.articleIconFrame.open();
                if (typeof this.registerFrame === 'function') this.registerFrame(this.articleIconFrame);
                this.articleHeaderLabelFrame = new Frame(cursorX, metrics.height + 1, metrics.width, 1, containerAttr, this.articleHeaderFrame);
                this.articleHeaderLabelFrame.open();
                this.articleHeaderLabelFrame.clear(containerAttr);
                if (typeof this.registerFrame === 'function') this.registerFrame(this.articleHeaderLabelFrame);
                cursorX += metrics.width + 1;
            } else {
                this.articleIconFrame = null;
                this.articleHeaderLabelFrame = null;
            }

            var textStart = cursorX;
            var textWidth = Math.max(1, this.articleHeaderFrame.width - textStart + 1);
            this.articleHeaderTextFrame = new Frame(textStart, 1, textWidth, containerHeight, containerAttr, this.articleHeaderFrame);
            this.articleHeaderTextFrame.open();
            this.articleHeaderTextFrame.clear(containerAttr);
            if (typeof this.registerFrame === 'function') this.registerFrame(this.articleHeaderTextFrame);
        } catch (e) {
            this._destroyArticleIcon();
            this.articleTextOffset = 1;
            return;
        }
    }

    if (this.headerFrame && typeof this.headerFrame.attr === 'number') {
        try { this.headerFrame.attr = containerAttr; } catch (_eAttr) { }
    }
    if (this.headerFrame && typeof this.headerFrame.clear === 'function') {
        try { this.headerFrame.clear(containerAttr); } catch (_eClr) { }
    }

    if (useIcon && this.articleIconFrame) {
        if (!this.articleIconObj) {
            var headerAttr = this.paletteAttr('READ_HEADER');
            this.articleIconObj = new Icon(this.articleIconFrame, this.articleHeaderLabelFrame, { iconFile: iconName, label: '', iconBg: headerAttr.bg, iconFg: headerAttr.fg });
        }
        if (this.articleIconObj && typeof this.articleIconObj.render === 'function') {
            try { this.articleIconObj.render(); } catch (_erIco) { }
        }
    } else {
        this.articleIconObj = null;
        this.articleIconFrame = null;
        this.articleHeaderLabelFrame = null;
    }

    if (useIcon && hasCategoryIcon && this.articleCategoryIconFrame) {
        if (!this.articleCategoryIconObj) {
            this.articleCategoryIconObj = new Icon(this.articleCategoryIconFrame, this.articleCategoryLabelFrame, { iconFile: categoryIconName, label: '', iconBg: bgRed, iconFg: fgBlack });
        }
        if (this.articleCategoryIconObj && typeof this.articleCategoryIconObj.render === 'function') {
            try { this.articleCategoryIconObj.render(); } catch (_eCatIco) { }
        }
    } else {
        this.articleCategoryIconObj = null;
        this.articleCategoryIconFrame = null;
        this.articleCategoryLabelFrame = null;
    }

    var headerLines = [];
    if (headerOverride) {
        for (var ho = 0; ho < headerOverride.length; ho++) {
            var wrapped = this._wrapText(this._toDisplayText(headerOverride[ho]), headerWidth);
            headerLines = headerLines.concat(wrapped);
        }
    } else {
        var article = (this.articleIndex >= 0 && this.articleIndex < this.currentArticles.length) ? this.currentArticles[this.articleIndex] : null;
        var title = '';
        if (article && article.title) title = article.title;
        else if (this.currentFeed && this.currentFeed.label) title = this.currentFeed.label;
        if (title) headerLines = headerLines.concat(this._wrapText(this._toDisplayText(title), headerWidth));
        var author = this._extractArticleAuthor(article);
        var dateStr = this._extractArticleDate(article);
        var metaParts = [];
        if (author) metaParts.push(author);
        if (dateStr) metaParts.push(dateStr);
        if (metaParts.length) headerLines.push(this._toDisplayText(metaParts.join('  ')));
    }
    if (!headerLines.length) headerLines.push('');
    var effectiveHeight = useIcon ? containerHeight : Math.max(1, Math.min(2, containerHeight));
    var reservedRows = (this.state === 'article') ? 1 : 0;
    var maxTextRows = Math.max(1, containerHeight - reservedRows);
    if (headerLines.length > maxTextRows) headerLines = headerLines.slice(0, maxTextRows);
    while (headerLines.length < maxTextRows) headerLines.push('');

    if (this.articleHeaderTextFrame) {
        try {
            this.articleHeaderTextFrame.clear(containerAttr);
            var width = this.articleHeaderTextFrame.width;
            var height = this.articleHeaderTextFrame.height;
            var bgNibble = containerAttr & 0x70;
            var blinkBit = containerAttr & 0x80;
            var baseFg = containerAttr & 0x0F;
            var altFg = (typeof DARKGRAY === 'number') ? DARKGRAY : ((typeof LIGHTGRAY === 'number') ? LIGHTGRAY : baseFg);
            var altAttr = bgNibble | (altFg & 0x0F) | blinkBit;

            for (var i = 0; i < headerLines.length && i < height; i++) {
                var text = headerLines[i];
                if (text.length > width) text = text.substr(0, width);
                this.articleHeaderTextFrame.gotoxy(1, i + 1);
                this.articleHeaderTextFrame.attr = (i % 2 === 0) ? containerAttr : altAttr;
                this.articleHeaderTextFrame.putmsg(text);
            }
            this.articleHeaderTextFrame.attr = containerAttr;
        } catch (_eTxt) { }
    }

    this.articleTextOffset = useIcon ? (containerHeight + 1) : (containerHeight + 1);
    if (!useIcon && containerHeight === 1) this.articleTextOffset = 1;
    if (this.articleTextOffset < 1) this.articleTextOffset = 1;
    this._currentIconKey = iconName;
    this._articleHeaderHasIcon = useIcon;
    this._articleHeaderHasCategory = hasCategoryIcon;
    this._articleHeaderTextStart = textStart;
    this._articleHeaderTextWidth = Math.max(1, textWidth);
    this._articleHeaderBaseline = Math.min(containerHeight, maxTextRows);
    this._articleHeaderAttr = containerAttr;

    this._registerArticleHeaderHotspot();
    this._applyPendingHotspots();
};
NewsReader.prototype._handleArticleNavigation = function (key) {
    var totalLines = this.articleLines.length;
    var pageSize = (typeof this._articleContentVisibleRows === 'number' && this._articleContentVisibleRows > 0)
        ? this._articleContentVisibleRows
        : (this.listFrame ? Math.max(1, this.listFrame.height - 1) : 1);
    var maxScroll = Math.max(0, totalLines - pageSize);
    switch (key) {
        case KEY_UP:
        case '\x1B[A':
        case "\u001e":
            if (this.articleScroll > 0) {
                this.articleScroll--;
                this.draw();
            }
            break;
        case KEY_DOWN:
        case '\x1B[B':
        case '\u000a':
            if (this.articleScroll < maxScroll) {
                this.articleScroll++;
                this.draw();
            }
            break;
        case KEY_PGUP:
            this.articleScroll = Math.max(0, this.articleScroll - pageSize);
            this.draw();
            break;
        case KEY_PGDN:
            this.articleScroll = Math.min(maxScroll, this.articleScroll + pageSize);
            this.draw();
            break;
        case KEY_HOME:
            this.articleScroll = 0;
            this.draw();
            break;
        case KEY_END:
            this.articleScroll = Math.max(0, totalLines - pageSize);
            this.draw();
            break;
        case KEY_LEFT:
        case '\u001d':
        case '\x1B[D':
            if (!this._openAdjacentArticle(-1, { skipImagePreview: true })) {
                this._setStatus('Already at earliest article.');
            }
            break;
        case KEY_RIGHT:
        case '\u0006':
        case '\x1B[C':
            if (!this._openAdjacentArticle(1, { skipImagePreview: true })) {
                this._setStatus('Already at latest article.');
            }
            break;
        case KEY_ENTER:
            if (this.articleScroll < maxScroll) {
                this.articleScroll = maxScroll;
                this.draw();
            } else if (!this._openAdjacentArticle(1, { skipImagePreview: false })) {
                this._setStatus('Already at latest article.');
            }
            break;
        case '\b':
        case '\x08':
        case '\x7F':
            if (!this._openAdjacentArticle(-1, { skipImagePreview: true })) {
                this._setStatus('Already at earliest article.');
            }
            break;
        case '\x1B':
            this._returnToArticleListFromContent();
            break;
        case 'R':
        case 'r':
        case 'O':
        case 'o':
            if (!this._triggerArticleLinkButton()) {
                this._setStatus('No link available for this article.');
            }
            break;
        case 'I':
        case 'i':
            if (this.articleImages && this.articleImages.length) {
                this.state = 'article_images';
                this.imageSelection = 0;
                this.imageScrollOffset = 0;
                var hotkeys = [{ val: 'ENTER', action: 'Read Article' }, { val: 'BACKSPACE', action: 'Articles' }];
                var hint = this._generateHotkeyLine(hotkeys);
                this._setStatus(hint);
                this.draw();
            }
            break;
    }
};


NewsReader.prototype._returnToArticleListFromContent = function () {
    this._destroyArticleIcon();
    this._destroyArticleLinkButton();
    this.state = 'articles';
    var visible = this._articleListVisibleRows || (this.listFrame ? Math.max(1, this.listFrame.height) : 1);
    if (visible <= 0) visible = 1;
    var desiredOffset = (typeof this._articleListScroll === 'number') ? this._articleListScroll : 0;
    if (this.selectedIndex < desiredOffset) desiredOffset = this.selectedIndex;
    if (this.selectedIndex >= desiredOffset + visible) desiredOffset = Math.max(0, this.selectedIndex - visible + 1);
    this.scrollOffset = Math.max(0, desiredOffset);
    this._articleListScroll = this.scrollOffset;
    this.articleIndex = -1;
    this.articleScroll = 0;
    this._articleContentVisibleRows = null;
    this.draw();
};

NewsReader.prototype._returnToArticlesFromHeaderBack = function () {
    this._destroyArticleLinkButton();
    this._destroyArticleIcon();
    this.state = 'articles';
    if (this.articleIndex >= 0 && this.articleIndex < this.currentArticles.length) {
        this.selectedIndex = this.articleIndex;
    }
    this.scrollOffset = Math.max(0, Math.min(this._articleListScroll || 0, Math.max(0, this.currentArticles.length - 1)));
    if (this.listFrame) {
        var visible = Math.max(1, this.listFrame.height);
        if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
        else if (this.selectedIndex >= this.scrollOffset + visible) this.scrollOffset = Math.max(0, this.selectedIndex - visible + 1);
    }
    this.articleIndex = -1;
    this._articleContentVisibleRows = null;
    this.draw();
};

NewsReader.prototype._triggerArticleLinkButton = function () {
    if (this.articleLinkButton && typeof this.articleLinkButton.press === 'function') {
        return this.articleLinkButton.press();
    }
    if (this._currentArticleLink) {
        this._handleArticleButtonActivation(this._currentArticleLink);
        return true;
    }
    return false;
};

NewsReader.prototype._openAdjacentArticle = function (delta, opts) {
    if (!delta || !this.currentArticles || !this.currentArticles.length) return false;
    var currentIndex = (typeof this.articleIndex === 'number' && this.articleIndex >= 0) ? this.articleIndex : this.selectedIndex;
    if (typeof currentIndex !== 'number' || isNaN(currentIndex)) currentIndex = 0;
    var targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= this.currentArticles.length) return false;

    this.selectedIndex = targetIndex;
    var newScroll = this._computeArticleListScrollForIndex(targetIndex);
    this.scrollOffset = newScroll;
    var skipImages = !(opts && opts.skipImagePreview === false);
    this._openArticle(targetIndex, { skipImagePreview: skipImages });
    return true;
};

NewsReader.prototype._computeArticleListScrollForIndex = function (index) {
    var visible = this._articleListVisibleRows || (this.listFrame ? Math.max(1, this.listFrame.height) : 1);
    if (visible <= 0) visible = 1;
    var scroll = (typeof this._articleListScroll === 'number') ? this._articleListScroll : 0;
    if (index < scroll) scroll = index;
    else if (index >= scroll + visible) scroll = Math.max(0, index - visible + 1);
    return scroll;
};

NewsReader.prototype._openFeed = function (feed, forceRefresh) {
    if (!feed) {
        this._setStatus('Invalid feed selection.');
        return;
    }
    this._setStatus('Loading feed...');
    this._clearImageAnsiCache();
    var data = this._getFeedData(feed, forceRefresh);
    this.currentFeed = feed;
    this.currentFeedData = data;
    var statusText;
    if (data.error) {
        this.currentArticles = [];
        this.articleLines = [];
        this.articleIndex = -1;
        this.articleScroll = 0;
        this.state = 'articles';
        this.selectedIndex = 0;
        this.scrollOffset = 0;
        statusText = data.message || 'Unable to load feed.';
        this.draw();
        this._setStatus(statusText);
        return;
    }
    var items = data.items || [];
    this.currentArticles = items;
    for (var ai = 0; ai < this.currentArticles.length; ai++) {
        var art = this.currentArticles[ai];
        if (art) art.__newsImages = undefined;
    }
    this.articleLines = [];
    this.articleIndex = -1;
    this.articleScroll = 0;
    this.state = 'articles';
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this._articleListScroll = 0;
    var statusParts = [];
    statusParts.push('Articles: ' + items.length);
    if (data.timestamp) {
        statusParts.push('Loaded at ' + this._formatTimestamp(data.timestamp));
    }
    var hotkeys = [{ val: 'ENTER', action: 'view article' }, { val: 'BACKSPACE', action: 'articles' }];
    var hint = this._generateHotkeyLine(hotkeys);
    this.draw();
    this._setStatus(hint);
};

NewsReader.prototype._openArticle = function (index, options) {
    if (index < 0 || index >= this.currentArticles.length) {
        this._setStatus('Invalid article selection.');
        return;
    }
    var article = this.currentArticles[index];
    this.articleIndex = index;
    this.articleScroll = 0;
    this.articleLines = this._prepareArticleLines(article);
    this._imageAnsiErrors = {};
    if (!article.__newsImages) article.__newsImages = this._extractArticleImages(article);
    this.articleImages = (article.__newsImages || []).reduce(function (list, img) {
        if (!img) return list;
        if (typeof img === 'object' && img.url) {
            list.push({ url: String(img.url), caption: img.caption ? String(img.caption) : '' });
        } else {
            var key = String(img).trim();
            if (key) list.push({ url: key, caption: '' });
        }
        return list;
    }, []);
    this._articleListScroll = this.scrollOffset;
    this._releaseHotspots();
    this._destroyArticlePreviewFrame();
    var skipImages = options && options.skipImagePreview;
    if (this.articleImages.length && !skipImages) {
        this.state = 'article_images';
        this.imageSelection = 0;
        this.imageScrollOffset = 0;
        this.scrollOffset = 0;
        var hotkeys = [{ val: 'ENTER', action: 'Read article' }, { val: 'BACKSPACE', action: 'articles' }];
        var hint = this._generateHotkeyLine(hotkeys);
        this._setStatus(hint);
        this.draw();
        return;
    }
    this._enterArticleContent();
};

NewsReader.prototype._returnToFeedsFromArticle = function () {
    this._destroyArticleIcon();
    this._destroyArticleLinkButton();
    this.articleIndex = -1;
    this.state = 'feeds';
    this.scrollOffset = 0;
    this._releaseHotspots();
    this._clearImageAnsiCache();
    if (this.currentFeeds && this.currentFeeds.length) {
        var idx = this.currentFeeds.indexOf(this.currentFeed);
        this.selectedIndex = (idx >= 0) ? (idx + 1) : 0;
    } else {
        this.selectedIndex = 0;
    }
    this.draw();
};

NewsReader.prototype._simplifyText = function (text) {
    if (!text) return '';
    var normalized = String(text);
    // Strip basic HTML tags and entities for console display
    normalized = normalized.replace(/<\s*br\s*\/?>/gi, '\n');
    normalized = normalized.replace(/<\s*\/p\s*>/gi, '\n\n');
    normalized = normalized.replace(/<[^>]+>/g, '');
    normalized = normalized.replace(/&nbsp;/gi, ' ');
    normalized = normalized.replace(/&amp;/gi, '&');
    normalized = normalized.replace(/&lt;/gi, '<');
    normalized = normalized.replace(/&gt;/gi, '>');
    normalized = normalized.replace(/&quot;/gi, '"');
    normalized = normalized.replace(/&#39;/g, "'");
    normalized = normalized.replace(/&apos;/gi, "'");
    normalized = normalized.replace(/&#x27;/gi, "'");
    normalized = this._replaceNumericEntities(normalized);
    normalized = this._replaceUnicodePunctuation(normalized);
    return normalized.trim();
};

NewsReader.prototype._extractArticleAuthor = function (article) {
    if (!article) return '';
    var fields = ['author', 'creator', 'dc:creator', 'dc_creator', 'author_name'];
    for (var i = 0; i < fields.length; i++) {
        var val = article[fields[i]];
        if (!val) continue;
        if (typeof val === 'string' && val.trim()) return val.trim();
        if (val && val.name) return String(val.name);
    }
    if (article.authors && article.authors.length) {
        var first = article.authors[0];
        if (typeof first === 'string') return first;
        if (first && first.name) return String(first.name);
    }
    return '';
};

NewsReader.prototype._extractArticleDate = function (article) {
    var info = this._getArticleDateInfo(article);
    if (!info || !info.displayDate) return '';
    return info.displayDate;
};

NewsReader.prototype._getArticleDateInfo = function (article) {
    if (!article) return null;
    if (Object.prototype.hasOwnProperty.call(article, '__newsDateInfo')) {
        return article.__newsDateInfo;
    }
    var fields = ['pubDate', 'published', 'updated', 'date', 'isoDate'];
    for (var i = 0; i < fields.length; i++) {
        var val = article[fields[i]];
        if (!val) continue;
        var info = this._normalizeArticleDateValue(val);
        if (info) {
            article.__newsDateInfo = info;
            return info;
        }
    }
    article.__newsDateInfo = {
        date: null,
        dateKey: '__unknown',
        displayDate: 'Unknown Date',
        timeLabel: '',
        hasTime: false
    };
    return article.__newsDateInfo;
};

NewsReader.prototype._normalizeArticleDateValue = function (value) {
    if (value === undefined || value === null) return null;
    var d = null;
    if (value instanceof Date) {
        if (!isNaN(value.getTime())) d = new Date(value.getTime());
    } else if (typeof value === 'number') {
        d = new Date(value);
    } else if (typeof value === 'string') {
        var trimmed = value.trim();
        if (!trimmed) return null;
        var parsed = Date.parse(trimmed);
        if (!isNaN(parsed)) d = new Date(parsed);
    }
    if (!d || isNaN(d.getTime())) return null;
    var hasTime = false;
    if (value instanceof Date || typeof value === 'number') {
        hasTime = true;
    } else if (typeof value === 'string') {
        hasTime = /(\d{1,2}:\d{2})/.test(value) || /(\d{1,2}\s*(am|pm))/i.test(value) || /T\d{2}:\d{2}/i.test(value);
    }
    return {
        date: d,
        dateKey: this._formatArticleDateKey(d),
        displayDate: this._formatArticleDateDivider(d),
        timeLabel: hasTime ? this._formatArticleTime(d) : '',
        hasTime: hasTime
    };
};

NewsReader.prototype._formatArticleTimeSegment = function (info) {
    var label = (info && info.timeLabel) ? info.timeLabel : '--:--';
    return '[' + label + ']';
};

NewsReader.prototype._formatArticleDateKey = function (dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '__unknown';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return dateObj.getFullYear() + '-' + pad(dateObj.getMonth() + 1) + '-' + pad(dateObj.getDate());
};

NewsReader.prototype._formatArticleDateDivider = function (dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return 'Unknown Date';
    var month = NEWSREADER_MONTH_NAMES[dateObj.getMonth()] || '';
    return (month ? month + ' ' : '') + dateObj.getDate() + ', ' + dateObj.getFullYear();
};

NewsReader.prototype._formatArticleTime = function (dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '--:--';
    var hours = dateObj.getHours();
    var minutes = dateObj.getMinutes();
    var period = hours >= 12 ? 'PM' : 'AM';
    var displayHour = hours % 12;
    if (displayHour === 0) displayHour = 12;
    var minuteStr = minutes < 10 ? '0' + minutes : String(minutes);
    return displayHour + ':' + minuteStr + ' ' + period;
};



NewsReader.prototype._extractArticleImages = function (article) {
    var results = [];
    if (!article) return results;
    var seen = {};
    function pushImage(url, caption) {
        if (!url) return;
        var key = String(url).trim();
        if (!key || seen[key]) return;
        seen[key] = true;
        results.push({ url: key, caption: caption ? String(caption).trim() : '' });
    }
    function captionFromEnclosure(enclosure) {
        if (!enclosure) return '';
        var fields = ['caption', 'title', 'description', 'summary', 'text'];
        for (var i = 0; i < fields.length; i++) {
            if (enclosure[fields[i]]) return enclosure[fields[i]];
        }
        if (enclosure['media:description']) return enclosure['media:description'];
        if (enclosure['media:text']) return enclosure['media:text'];
        return '';
    }
    if (article.enclosures && article.enclosures.length) {
        for (var e = 0; e < article.enclosures.length; e++) {
            var enclosure = article.enclosures[e];
            if (!enclosure || !enclosure.url) continue;
            var type = enclosure.type ? ('' + enclosure.type).toLowerCase() : '';
            if (newsreaderIsLikelyTrackingPixel('', enclosure.url)) continue;
            if (type.indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(enclosure.url)) {
                pushImage(enclosure.url, captionFromEnclosure(enclosure));
            }
        }
    }
    var contentSources = [];
    if (article.content) contentSources.push(article.content);
    if (article.body) contentSources.push(article.body);
    for (var s = 0; s < contentSources.length; s++) {
        var src = contentSources[s];
        if (!src) continue;
        var match;
        var imgRe = /<img[^>]+src=["']([^"'>\s]+)["'][^>]*>/gi;
        while ((match = imgRe.exec(src)) !== null) {
            var tagHtml = match[0] || '';
            var imageUrl = match[1];
            if (newsreaderIsLikelyTrackingPixel(tagHtml, imageUrl)) continue;
            var caption = '';
            var altMatch = tagHtml.match(/alt\s*=\s*["']([^"']+)["']/i);
            if (altMatch && altMatch[1]) caption = altMatch[1];
            if (!caption) {
                var titleMatch = tagHtml.match(/title\s*=\s*["']([^"']+)["']/i);
                if (titleMatch && titleMatch[1]) caption = titleMatch[1];
            }
            pushImage(imageUrl, caption);
        }
    }
    return results;
};

NewsReader.prototype._countAnsiLines = function (ansi) {
    if (!ansi) return 0;
    if (typeof ansi === 'object') {
        if (typeof ansi.rows === 'number') return Math.max(0, ansi.rows);
        if (typeof ansi.ansi === 'string') ansi = ansi.ansi;
        else if (typeof ansi.text === 'string') ansi = ansi.text;
        else if (typeof ansi.bytes === 'string') ansi = ansi.bytes;
        else ansi = '';
    }
    var clean = String(ansi).replace(/\r/g, '');
    var parts = clean.split('\n');
    var count = 0;
    for (var i = 0; i < parts.length; i++) {
        count++;
    }
    return count;
};

NewsReader.prototype._getImageAnsi = function (url) {
    if (!url) return null;
    this.imageAnsiCache = this.imageAnsiCache || {};
    this._imageAnsiErrors = this._imageAnsiErrors || {};
    if (this.imageAnsiCache[url]) {
        this._touchImageCacheKey(url);
        return this.imageAnsiCache[url];
    }
    if (this._imageAnsiErrors[url]) return null;

    if (typeof convertImageToANSI !== 'function') {
        try { load('future_shell/lib/util/gif2ans/img_loader.js'); }
        catch (e) {
            var msg = (e && e.toString) ? e.toString() : e;
            this._imageAnsiErrors[url] = msg;
            log('newsreader image preview: failed to load converter library ' + msg);
            return null;
        }
    }

    var width = this.listFrame ? Math.max(20, this.listFrame.width || 80) : 80;
    var tempPath = null;
    var overlayShown = false;
    var rawBody = null;
    try {
        var source = url;
        rawBody = null;
        if (/^data:image\//i.test(url)) {
            var match = url.match(/^data:(image\/[^;]+);base64,(.+)$/i);
            if (!match) throw 'Unsupported data URI format';
            var mime = match[1].toLowerCase();
            var ext = mime.indexOf('png') !== -1 ? '.png' : (mime.indexOf('gif') !== -1 ? '.gif' : '.jpg');
            var data = base64_decode(match[2]);
            rawBody = data;
            var tempDir = (typeof system !== 'undefined' && system.temp_dir) ? system.temp_dir : (js.exec_dir || '.');
            var fileName = 'news_img_' + Date.now() + '_' + Math.floor(Math.random() * 100000) + ext;
            tempPath = tempDir + fileName;
            var f = new File(tempPath);
            if (!f.open('wb')) throw 'Unable to write temp image: ' + tempPath;
            f.write(data);
            f.close();
            data = null;
            rawBody = null;
            source = tempPath;
        }

        if (!overlayShown) overlayShown = this._showLoadingOverlay('Converting image from :' + url);
        this._setStatus('Rendering image preview...');
        // var ansiResult = convertImageToANSI(source, width, true, null, { returnObject: true, preprocess: 'cga' });
        // var ansiResult = convertImageToANSI(source, width, true, null, {
        //     returnObject: true,
        //     preprocess: 'cga_comic',
        //     preSigmoidal: "8x50%",
        //     preSaturation: 145,
        //     preDither: "o2x2",
        //     prePosterize: 16,
        //     preHeightScale: 200
        // });
        var ansiResult = convertImageToANSI(source, width, true, null, {
            returnObject: true,
            preprocess: 'cga_comic',
            preSigmoidal: "8x50%",
            preSaturation: 145,
            preDither: "none",     // <— disable dithering
            blur: 0.25,            // optional: tiny pre-blur to avoid aliasing
            prePosterize: 20,      // slightly lower to keep edges crisp
            preHeightScale: 100    // let gif2ans do sizing
        });
        var preview = this._normalizeAnsiPreview(ansiResult);
        ansiResult = null;
        if (preview && typeof preview.ansi === 'string' && preview.ansi.length) {
            this._cacheImagePreview(url, preview);
            this._setStatus('Preview ready. ENTER=read article  BACKSPACE=articles');
            return preview;
        }
        this._imageAnsiErrors[url] = 'Unsupported image response';
        log('newsreader image preview unsupported response for ' + url);
    } catch (e) {
        var msg = (e && e.toString) ? e.toString() : e;
        this._imageAnsiErrors[url] = msg;
        this._setStatus('Image preview failed: ' + msg);
        log('newsreader image preview error for ' + url + ': ' + msg);
    } finally {
        if (overlayShown) this._hideLoadingOverlay();
        if (tempPath) {
            try {
                var tmpFile = new File(tempPath);
                if (tmpFile.exists) tmpFile.remove();
            } catch (_eDel) { }
        }
        rawBody = null;
        source = null;
        try { if (typeof js !== 'undefined' && js && typeof js.gc === 'function') js.gc(true); } catch (_eGc) { }
    }
    return null;
};






NewsReader.prototype._formatTimestamp = function (ts) {
    try {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) {
        return '';
    }
};




registerModuleExports({ NewsReader: NewsReader });
