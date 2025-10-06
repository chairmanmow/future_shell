if (typeof Feed === 'undefined') {
    try { load('rss-atom.js'); } catch (_e) { }
}
if (typeof utf8_cp437 === 'undefined') {
    try { load('utf8_cp437.js'); } catch (_encErr) { }
}
load("iconshell/lib/subfunctions/subprogram.js");
load('iconshell/lib/shell/icon.js');
load('iconshell/lib/util/gif2ans/img_loader.js')

function resolveAttr(key, fallback) {
    if (typeof fallback === 'undefined') fallback = 0;
    if (typeof ICSH_ATTR === 'function' && typeof ICSH_VALS !== 'undefined' && ICSH_VALS) {
        try { return ICSH_ATTR(key); } catch (_ignored) { }
    }
    return fallback;
}

var NEWSREADER_DEFAULT_FEEDS = [
    { label: "Digital Photography School (png)", url: "https://digital-photography-school.com/feed/", category: "Images", icon: "dps_news" },
    { label: "NASA latest content (png)", url: "https://science.nasa.gov/feed/?science_org=19791%2C20129", category: "Images", icon: "nasa_image_of_the_day" },
    { label: "BBC News - World", url: "http://feeds.bbci.co.uk/news/world/rss.xml", category: "World News", icon: "bbc_world_news" },
    { label: "Reuters: World News", url: "http://feeds.reuters.com/Reuters/worldNews", category: "World News", icon: 'reuters_world_news' },
    { label: "NPR: News", url: "https://www.npr.org/rss/rss.php?id=1001", category: "World News", icon: 'npr_news' },
    { label: "The New York Times - World News", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", category: "World News", icon: 'nyt_world_news' },
    { label: "The Guardian - World News", url: "https://www.theguardian.com/world/rss", category: "World News", icon: 'guardian_world_news' },
    { label: "Al Jazeera English - News", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "World News", icon: 'aljazeera_news' },
    { label: "CNN - World", url: "http://rss.cnn.com/rss/edition_world.rss", category: "World News", icon: 'cnn_world' },
    { label: "Fox News - World", url: "http://feeds.foxnews.com/foxnews/world", category: "World News", icon: 'fox_news' },
    { label: "NPR: Politics", url: "https://www.npr.org/rss/rss.php?id=1014", category: "Politics", icon: 'npr_politics' },
    { label: "The New York Times - Politics", url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml", category: "Politics", icon: 'nyt_politics' },
    { label: "The Guardian - Politics", url: "https://www.theguardian.com/politics/rss", category: "Politics", icon: 'guardian_politics' },
    { label: "Politico - News", url: "https://www.politico.com/rss/politics08.xml", category: "Politics", icon: 'politico_news' },
    { label: "FiveThirtyEight - Politics", url: "https://fivethirtyeight.com/politics/feed/", category: "Politics", icon: 'fivethirtyeight_politics' },
    { label: "NPR: Technology", url: "https://www.npr.org/rss/rss.php?id=1019", category: "Technology", icon: 'npr_technology' },
    { label: "The New York Times - Technology", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", category: "Technology", icon: 'nyt_technology' },
    { label: "The Guardian - Technology", url: "https://www.theguardian.com/uk/technology/rss", category: "Technology", icon: 'guardian_technology' },
    { label: "Wired - Latest Stories", url: "https://www.wired.com/feed/category/science/latest/rss", category: "Technology", icon: 'wired_technology' },
    { label: "TechCrunch - Startups", url: "http://feeds.feedburner.com/TechCrunch/startups", category: "Technology", icon: 'techcrunch_startups' },
    { label: "Ars Technica - All Stories", url: "http://feeds.arstechnica.com/arstechnica/index", category: "Technology", icon: 'ars_technica' },
    { label: "NPR: Science", url: "https://www.npr.org/rss/rss.php?id=1007", category: "Science", icon: 'npr_science' },
    { label: "The New York Times - Science", url: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml", category: "Science", icon: 'nyt_science' },
    { label: "The Guardian - Science", url: "https://www.theguardian.com/science/rss", category: "Science", icon: 'guardian_science' },
];

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
    return base + 'iconshell/lib/config/' + filename;
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
    var config = { feeds: [], categories: {} };

    for (var i = 0; i < sections.length; i++) {
        var secName = sections[i];
        if (!secName) continue;
        var lower = secName.toLowerCase();
        if (lower.indexOf('category.') !== 0) continue;
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
    }

    var feedSections = [];
    for (var k = 0; k < sections.length; k++) {
        var sec = sections[k];
        if (sec && /^feed\./i.test(sec)) feedSections.push(sec);
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
        var label = newsreaderGetIniValue(feedSection, 'label') || sectionName.substring('Feed.'.length).replace(/_/g, ' ');
        var category = newsreaderGetIniValue(feedSection, 'category') || 'Misc';
        var icon = newsreaderGetIniValue(feedSection, 'icon');
        var categoryIcon = newsreaderGetIniValue(feedSection, 'category_icon');
        var feedObj = {
            label: label,
            url: url,
            category: category
        };
        if (icon) feedObj.icon = icon;
        if (categoryIcon) feedObj.category_icon = categoryIcon;
        config.feeds.push(feedObj);
    }

    return config;
}

function getNewsreaderConfig(forceReload) {
    if (forceReload) _newsreaderConfigCache = null;
    if (!_newsreaderConfigCache) {
        var loaded = newsreaderLoadConfig();
        if (!loaded || !loaded.feeds || !loaded.feeds.length) {
            _newsreaderConfigCache = {
                feeds: newsreaderCloneFeedList(NEWSREADER_DEFAULT_FEEDS),
                categories: {}
            };
        } else {
            _newsreaderConfigCache = {
                feeds: newsreaderCloneFeedList(loaded.feeds),
                categories: newsreaderCloneCategoryMap(loaded.categories)
            };
        }
    }
    return {
        feeds: newsreaderCloneFeedList(_newsreaderConfigCache.feeds),
        categories: newsreaderCloneCategoryMap(_newsreaderConfigCache.categories)
    };
}

var LIST_ACTIVE = resolveAttr('FILE_LIST_ACTIVE', (BG_BLUE | WHITE));
var LIST_INACTIVE = resolveAttr('FILE_LIST_INACTIVE', (BG_BLACK | LIGHTGRAY));
var HEADER_ATTR = resolveAttr('FILE_HEADER', (BG_BLUE | WHITE));
var STATUS_ATTR = resolveAttr('FILE_FOOTER', (BG_BLACK | LIGHTGRAY));

function NewsReader(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'newsreader', parentFrame: opts.parentFrame });

    this.feedCache = {};
    this.headerFrame = null;
    this.statusFrame = null;
    this.listFrame = null;
    this.articleIconFrame = null;
    this.articleIconLabelFrame = null;
    this.articleIconObj = null;
    this.articleTextOffset = 1;
    this.articleImages = [];
    this.imageSelection = 0;
    this.imageScrollOffset = 0;
    this._currentIconKey = null;
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
    this._allFeeds = [];
    this._categoryOverrides = {};
    this._resetState();
}
extend(NewsReader, Subprogram);

NewsReader.prototype._resetState = function () {
    LIST_ACTIVE = resolveAttr('FILE_LIST_ACTIVE', (BG_BLUE | WHITE));
    LIST_INACTIVE = resolveAttr('FILE_LIST_INACTIVE', (BG_BLACK | LIGHTGRAY));
    HEADER_ATTR = resolveAttr('FILE_HEADER', (BG_BLUE | WHITE));
    STATUS_ATTR = resolveAttr('FILE_FOOTER', (BG_BLACK | LIGHTGRAY));

    this._destroyArticleIcon();
    this._destroyCategoryIcons();
    this._destroyFeedIcons();
    this._releaseHotspots();
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
    var feedConfig = getNewsreaderConfig();
    this._allFeeds = feedConfig.feeds || [];
    this._categoryOverrides = feedConfig.categories || {};
    this.categories = this._buildCategories();
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
    return categories;
};

NewsReader.prototype._destroyArticleIcon = function () {
    if (this.articleIconObj && typeof this.articleIconObj.iconFrame === 'object') {
        // noop, Icon handles frames we manage below
    }
    if (this.articleIconFrame) {
        try { this.articleIconFrame.close(); } catch (_e1) { }
        if (this._myFrames) {
            var idx1 = this._myFrames.indexOf(this.articleIconFrame);
            if (idx1 !== -1) this._myFrames.splice(idx1, 1);
        }
    }
    if (this.articleIconLabelFrame) {
        try { this.articleIconLabelFrame.close(); } catch (_e2) { }
        if (this._myFrames) {
            var idx2 = this._myFrames.indexOf(this.articleIconLabelFrame);
            if (idx2 !== -1) this._myFrames.splice(idx2, 1);
        }
    }
    this.articleIconFrame = null;
    this.articleIconLabelFrame = null;
    this.articleIconObj = null;
    this.articleTextOffset = 1;
    this._currentIconKey = null;
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
    // if (baseDir && baseDir.charAt(baseDir.length - 1) !== '/' && baseDir.charAt(baseDir.length - 1) !== '\') baseDir += '/';
    var pathBase = baseDir + 'iconshell/lib/icons/' + iconName;
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
    if (!this._loadingOverlayFrame) return;
    try { this._loadingOverlayFrame.close(); } catch (_overlayCloseErr) { }
    if (this._myFrames) {
        var idx = this._myFrames.indexOf(this._loadingOverlayFrame);
        if (idx !== -1) this._myFrames.splice(idx, 1);
    }
    this._loadingOverlayFrame = null;
};

NewsReader.prototype._showLoadingOverlay = function (message) {
    if (!this.listFrame || !this.parentFrame) return false;
    this._destroyLoadingOverlay();
    var overlayAttr = LIST_ACTIVE;
    var frame = new Frame(this.listFrame.x, this.listFrame.y, this.listFrame.width, this.listFrame.height, overlayAttr, this.parentFrame);
    frame.open();
    frame.clear();
    frame.attr = overlayAttr;
    var text = this._toDisplayText(message || 'Converting Image');
    var lines = ('' + text).split(/\r?\n/);
    var blockHeight = lines.length;
    var startY = Math.max(1, Math.floor((frame.height - blockHeight) / 2) + 1);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line) line = '';
        if (line.length > frame.width) line = line.substr(0, frame.width);
        var lineX = Math.max(1, Math.floor((frame.width - line.length) / 2) + 1);
        var lineY = startY + i;
        if (lineY > frame.height) break;
        frame.gotoxy(lineX, lineY);
        frame.putmsg(line);
    }
    this._loadingOverlayFrame = frame;
    if (typeof this.registerFrame === 'function') this.registerFrame(frame);
    if (this.parentFrame && typeof this.parentFrame.cycle === 'function') {
        try { this.parentFrame.cycle(); } catch (_overlayShowCycleErr) { }
    }
    return true;
};

NewsReader.prototype._hideLoadingOverlay = function () {
    if (!this._loadingOverlayFrame) return;
    this._destroyLoadingOverlay();
    if (this.parentFrame && typeof this.parentFrame.cycle === 'function') {
        try { this.parentFrame.cycle(); } catch (_overlayHideCycleErr) { }
    }
};

NewsReader.prototype._destroyIconCells = function (cells) {
    if (!cells || !cells.length) return;
    for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (!cell) continue;
        if (cell.icon) {
            try { cell.icon.close(); } catch (_eA) { }
            if (this._myFrames) {
                var idxA = this._myFrames.indexOf(cell.icon);
                if (idxA !== -1) this._myFrames.splice(idxA, 1);
            }
        }
        if (cell.label) {
            try { cell.label.close(); } catch (_eB) { }
            if (this._myFrames) {
                var idxB = this._myFrames.indexOf(cell.label);
                if (idxB !== -1) this._myFrames.splice(idxB, 1);
            }
        }
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
    var text = normalized.ansi;
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
    if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (_e) { }
    }
    this._hotspotMap = {};
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
    if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
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
        for (var y = minY; y <= maxY; y++) {
            try { console.add_hotspot(cmd, false, minX, maxX, y); } catch (_e) { }
        }
        this._hotspotMap[cmd] = cell.index;
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
    var attr = isSelected ? LIST_ACTIVE : LIST_INACTIVE;
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
    var items = this.categories ? this.categories.slice(0) : [];
    items.unshift({ _type: 'exit', name: 'Exit', icon: 'exit' });
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
    if (items.length > 1 && this.selectedIndex === 0 && items[0] && items[0]._type === 'exit') {
        this.selectedIndex = 1;
    }

    var metrics = this._getIconMetrics();
    var topPadding = 1;
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
    var bgVal = (typeof BG_BLUE === 'number') ? BG_BLUE : ((typeof LIST_INACTIVE === 'number') ? (LIST_INACTIVE & 0x70) : 0);
    var fgVal = (typeof WHITE === 'number') ? WHITE : ((typeof LIST_INACTIVE === 'number') ? (LIST_INACTIVE & 0x0F) : (typeof LIGHTGRAY !== 'undefined' ? LIGHTGRAY : 7));

    for (var row = startRow; row < endRow; row++) {
        for (var col = 0; col < cols; col++) {
            var index = row * cols + col;
            if (index >= total) break;
            var item = items[index];
            var x = 1 + col * cellW;
            var y = 1 + topPadding + (row - startRow) * cellH;
            if (y + metrics.height + labelHeight - 1 > frameHeight) continue;

            var iconFrame = new Frame(x, y, metrics.width, metrics.height, LIST_INACTIVE, this.listFrame);
            var labelFrame = new Frame(x, y + metrics.height, metrics.width, labelHeight, LIST_INACTIVE, this.listFrame);
            iconFrame.open();
            labelFrame.open();

            var iconName = this._iconNameForCategory(item);
            var iconData = { iconFile: iconName, label: '', iconBg: bgVal, iconFg: fgVal };
            var iconObj = new Icon(iconFrame, labelFrame, iconData);
            try { iconObj.render(); } catch (_eIcon) { }
            if (typeof this.registerFrame === 'function') {
                this.registerFrame(iconFrame);
                this.registerFrame(labelFrame);
            }

            var labelText = item && item._type === 'exit' ? 'Exit' : (item && item.name ? item.name : 'Category');
            this._renderIconLabel(labelFrame, labelText, index === this.selectedIndex);
            cells.push({ icon: iconFrame, label: labelFrame, index: index, labelText: labelText, iconObj: iconObj });
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
    if (cells.length) this._registerGridHotspots(cells);
    else this._releaseHotspots();
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
    var topPadding = 1;
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
    var bgVal = (typeof BG_BLUE === 'number') ? BG_BLUE : ((typeof LIST_INACTIVE === 'number') ? (LIST_INACTIVE & 0x70) : 0);
    var fgVal = (typeof WHITE === 'number') ? WHITE : ((typeof LIST_INACTIVE === 'number') ? (LIST_INACTIVE & 0x0F) : (typeof LIGHTGRAY !== 'undefined' ? LIGHTGRAY : 7));

    for (var row = startRow; row < endRow; row++) {
        for (var col = 0; col < cols; col++) {
            var index = row * cols + col;
            if (index >= total) break;
            var item = items[index];
            var x = 1 + col * cellW;
            var y = 1 + topPadding + (row - startRow) * cellH;
            if (y + metrics.height + labelHeight - 1 > frameHeight) continue;

            var iconFrame = new Frame(x, y, metrics.width, metrics.height, LIST_INACTIVE, this.listFrame);
            var labelFrame = new Frame(x, y + metrics.height, metrics.width, labelHeight, LIST_INACTIVE, this.listFrame);
            iconFrame.open();
            labelFrame.open();

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
            this._renderIconLabel(labelFrame, labelText, index === this.selectedIndex);
            cells.push({ icon: iconFrame, label: labelFrame, index: index, labelText: labelText, iconObj: iconObj });
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
    if (cells.length) this._registerGridHotspots(cells);
    else this._releaseHotspots();
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
        this.headerFrame = new Frame(this.parentFrame.x, this.parentFrame.y, this.parentFrame.width, 1, HEADER_ATTR, this.parentFrame);
        this.headerFrame.open();
        if (typeof this.registerFrame === 'function') this.registerFrame(this.headerFrame);
    }
    if (!this.statusFrame) {
        this.statusFrame = new Frame(this.parentFrame.x, this.parentFrame.y + this.parentFrame.height - 1, this.parentFrame.width, 1, STATUS_ATTR, this.parentFrame);
        this.statusFrame.open();
        if (typeof this.registerFrame === 'function') this.registerFrame(this.statusFrame);
    }
    if (!this.listFrame) {
        var h = Math.max(1, this.parentFrame.height - 2);
        this.listFrame = new Frame(this.parentFrame.x, this.parentFrame.y + 1, this.parentFrame.width, h, LIST_INACTIVE, this.parentFrame);
        this.listFrame.open();
        this.listFrame.word_wrap = false;
        if (typeof this.registerFrame === 'function') this.registerFrame(this.listFrame);
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
    this._setHeader('');
    this._renderCategoryIcons();
    this._setStatus('Select a news category  |  ENTER=open  ESC=exit  CLICK=select  Exit tile=leave');
};

NewsReader.prototype._drawFeeds = function () {
    var name = this.currentCategory ? this.currentCategory.name : '';
    this._setHeader('');
    this._renderFeedIcons();
    this._setStatus((name ? name + '  |  ' : '') + 'ENTER=open feed  BACKSPACE=categories  R=refresh  CLICK=select  ESC=back  Back tile=return');
};

NewsReader.prototype._drawArticles = function () {
    this._destroyCategoryIcons();
    this._destroyFeedIcons();
    this._gridLayout = null;
    this._setHeader((this.currentFeed ? this.currentFeed.label : 'Feed') + ' Articles');
    if (!this.currentArticles.length) {
        this._resetFrameSurface(this.listFrame, LIST_INACTIVE);
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No articles available.');
        return;
    }
    var self = this;
    this._renderList(this.currentArticles, function (article, idx) {
        var prefix = (idx + 1) + '. ';
        var title = article.title || '[untitled]';
        if (article && typeof article.__newsImages === 'undefined') {
            article.__newsImages = self._extractArticleImages(article);
        }
        var hasImages = article && article.__newsImages && article.__newsImages.length;
        var suffix = hasImages ? ' [IMG]' : '';
        return prefix + title + suffix;
    });
    this._setStatus('ENTER=view article  BACKSPACE=feeds');
};

NewsReader.prototype._drawArticleImages = function () {
    this._destroyCategoryIcons();
    this._destroyFeedIcons();
    this._gridLayout = null;
    var title = 'Article Images';
    if (this.articleIndex >= 0 && this.articleIndex < this.currentArticles.length) {
        var articleTitle = this.currentArticles[this.articleIndex].title || 'Article';
        title = 'Images: ' + articleTitle;
    }
    this._setHeader(this._toDisplayText(title));
    this._resetFrameSurface(this.listFrame, LIST_INACTIVE);
    var urls = this.articleImages || [];
    if (!urls.length) {
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No images found.');
        this._setStatus('ENTER=read article  BACKSPACE=articles');
        return;
    }
    if (this.imageSelection >= urls.length) this.imageSelection = urls.length - 1;
    if (this.imageSelection < 0) this.imageSelection = 0;

    var previewTop = 1;
    var selectedUrl = urls[this.imageSelection];
    var previousPreviewUrl = this._currentPreviewUrl;
    var previewData = this._getImageAnsi(selectedUrl);
    if (!previewData && urls.length > 1) {
        var originalIndex = this.imageSelection;
        for (var attempt = 1; attempt < urls.length; attempt++) {
            var nextIndex = (originalIndex + attempt) % urls.length;
            if (nextIndex === originalIndex) break;
            var candidateUrl = urls[nextIndex];
            var candidateAnsi = this._getImageAnsi(candidateUrl);
            if (candidateAnsi) {
                this.imageSelection = nextIndex;
                selectedUrl = candidateUrl;
                previewData = candidateAnsi;
                this._setStatus('Preview failed on primary image, showing alternate.');
                break;
            }
        }
    }
    if (selectedUrl !== previousPreviewUrl) this.imagePreviewScroll = 0;
    this._currentPreviewUrl = selectedUrl;

    var totalPreviewLines = previewData ? Math.max(1, this._countAnsiLines(previewData)) : 2;
    var listStart = Math.min(this.listFrame.height, totalPreviewLines + 1);
    if (listStart < 1) listStart = 1;
    var previewDisplayRows = Math.max(1, listStart - 1);
    var maxPreviewScroll = previewData ? Math.max(0, totalPreviewLines - previewDisplayRows) : 0;

    if (!previewData) this.imagePreviewScroll = 0;
    if (this.imagePreviewScroll < 0) this.imagePreviewScroll = 0;
    if (this.imagePreviewScroll > maxPreviewScroll) this.imagePreviewScroll = maxPreviewScroll;

    if (previewData) {
        var previewRendered = false;
        try {
            previewRendered = this._renderAnsiPreview(this.listFrame, previewData, {
                startRow: this.imagePreviewScroll,
                maxRows: previewDisplayRows
            });
        } catch (_renderErr) {
            previewRendered = false;
            log('NewsReader image preview render error: ' + _renderErr);
        }
        if (!previewRendered) {
            previewData = null;
        }
    }

    if (!previewData) {
        this._resetFrameSurface(this.listFrame, LIST_INACTIVE);
        this.imagePreviewScroll = 0;
        totalPreviewLines = 2;
        listStart = Math.min(this.listFrame.height, totalPreviewLines + 1);
        if (listStart < 1) listStart = 1;
        previewDisplayRows = Math.max(1, listStart - 1);
        maxPreviewScroll = 0;
        this.listFrame.attr = LIST_INACTIVE;
        this.listFrame.gotoxy(1, previewTop);
        var errMsg = this._imageAnsiErrors ? this._imageAnsiErrors[selectedUrl] : null;
        if (errMsg) this.listFrame.putmsg('Preview failed: ' + errMsg);
        else this.listFrame.putmsg('Preview not available.');
    }

    this._imagePreviewScrollMax = maxPreviewScroll;
    this._imagePreviewVisibleRows = previewDisplayRows;

    if (this.imageSelection < this.imageScrollOffset) this.imageScrollOffset = this.imageSelection;
    var visibleRows = Math.max(1, this.listFrame.height - (listStart - 1));
    if (this.imageSelection >= this.imageScrollOffset + visibleRows) {
        this.imageScrollOffset = Math.max(0, this.imageSelection - visibleRows + 1);
    }

    for (var row = 0; row < visibleRows; row++) {
        var idx = this.imageScrollOffset + row;
        var targetRow = listStart + row;
        if (row === 0) { this.listFrame.attr = LIST_INACTIVE; }
        if (targetRow > this.listFrame.height) break;
        if (idx >= urls.length) break;
        var prefix = '[' + (idx + 1) + '/' + urls.length + '] ';
        var display = prefix + this._toDisplayText(urls[idx]);
        if (display.length > this.listFrame.width) display = display.substr(0, this.listFrame.width);
        this.listFrame.gotoxy(1, targetRow);
        this.listFrame.attr = (idx === this.imageSelection) ? LIST_ACTIVE : LIST_INACTIVE;
        this.listFrame.putmsg(display);
    }
    this.listFrame.attr = LIST_INACTIVE;
    var statusIndicator = urls.length ? ('Image ' + (this.imageSelection + 1) + '/' + urls.length + '  ') : '';
    this._setStatus(statusIndicator + 'LEFT/RIGHT=change image  UP/DOWN=scroll preview  ENTER=read article  BACKSPACE=articles');
};

NewsReader.prototype._drawArticle = function () {
    this._destroyCategoryIcons();
    this._destroyFeedIcons();
    this._gridLayout = null;
    this._ensureArticleIcon();
    var header = 'Article';
    if (this.articleIndex >= 0 && this.articleIndex < this.currentArticles.length) {
        header = this.currentArticles[this.articleIndex].title || header;
    }
    this._setHeader(this._toDisplayText(header));
    this._resetFrameSurface(this.listFrame, LIST_INACTIVE);
    if (!this.articleLines.length) {
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No content available.');
        return;
    }
    var startRow = Math.max(1, this.articleTextOffset);
    var height = Math.max(0, this.listFrame.height - (startRow - 1));
    if (height <= 0) height = this.listFrame.height;
    var offset = Math.max(0, this.articleScroll);
    if (offset > Math.max(0, this.articleLines.length - 1)) offset = Math.max(0, this.articleLines.length - 1);
    for (var row = 0; row < height; row++) {
        var lineIndex = offset + row;
        if (lineIndex >= this.articleLines.length) break;
        this.listFrame.gotoxy(1, startRow + row);
        this.listFrame.putmsg(this._toDisplayText(this.articleLines[lineIndex]));
    }
    this._setStatus('UP/DOWN=scroll  BACKSPACE=articles');
};

NewsReader.prototype._renderList = function (items, formatter) {
    if (!this.listFrame) return;
    if (!items) items = [];
    var height = this.listFrame.height;
    if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
    if (this.selectedIndex >= this.scrollOffset + height) this.scrollOffset = Math.max(0, this.selectedIndex - height + 1);
    this._resetFrameSurface(this.listFrame, LIST_INACTIVE);
    for (var row = 0; row < height; row++) {
        var idx = this.scrollOffset + row;
        if (idx >= items.length) break;
        var line = formatter(items[idx], idx) || '';
        line = this._toDisplayText(line);
        if (line.length > this.listFrame.width) line = line.substr(0, this.listFrame.width);
        this.listFrame.gotoxy(1, row + 1);
        this.listFrame.attr = (idx === this.selectedIndex) ? LIST_ACTIVE : LIST_INACTIVE;
        this.listFrame.putmsg(line);
    }
    this.listFrame.attr = LIST_INACTIVE;
};

NewsReader.prototype._cleanup = function () {
    var frames = ['headerFrame', 'statusFrame', 'listFrame'];
    for (var i = 0; i < frames.length; i++) {
        var key = frames[i];
        var frame = this[key];
        if (frame && typeof frame.close === 'function') {
            try { frame.close(); } catch (_e) { }
        }
        if (this._myFrames && frame) {
            var idx = this._myFrames.indexOf(frame);
            if (idx !== -1) this._myFrames.splice(idx, 1);
        }
        this[key] = null;
    }
    this._releaseHotspots();
    this._resetState();
};

NewsReader.prototype._setHeader = function (text) {
    if (!this.headerFrame) return;
    this.headerFrame.clear();
    this.headerFrame.gotoxy(1, 1);
    if (!text) text = 'News';
    text = this._toDisplayText(text);
    if (text.length > this.headerFrame.width) text = text.substr(0, this.headerFrame.width);
    this.headerFrame.putmsg(text);
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
    if (text.length > this.statusFrame.width) text = text.substr(0, this.statusFrame.width);
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
    return lines;
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

NewsReader.prototype.handleKey = function (key) {
    if (!key) return;

    switch (this.state) {
        case 'categories': {
            var catItems = (this._categoryGridItems && this._categoryGridItems.length) ? this._categoryGridItems : (this.categories || []);
            var catLength = catItems.length;
            var activateCategory = function () {
                var item = catItems[this.selectedIndex];
                if (!item) return;
                if (item._type === 'exit') {
                    this.exit();
                    return;
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
            this._handleListNavigation(key, catLength, activateCategory, this.exit.bind(this));
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
                if (this.currentCategory) {
                    this.selectedIndex = this.categories.indexOf(this.currentCategory);
                    if (this.selectedIndex < 0) this.selectedIndex = 0;
                } else {
                    this.selectedIndex = 0;
                }
                this.draw();
            }.bind(this);
            var activateFeed = function () {
                var item = feedItems[this.selectedIndex];
                if (!item) return;
                if (item._type === 'back') {
                    feedBack();
                    return;
                }
                this._openFeed(item);
            }.bind(this);
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
            this._handleImageNavigation(key);
            break;
        case 'article':
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
    switch (key) {
        case KEY_UP:
        case '\x1B[A':
            if (length === 0) break;
            if (grid) {
                if (this.selectedIndex >= grid.cols) this.selectedIndex -= grid.cols;
                else this.selectedIndex = this.selectedIndex % grid.cols;
                this._adjustGridScroll(grid, length);
                this.draw();
                break;
            }
            if (this.selectedIndex > 0) {
                this.selectedIndex--;
                if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
                this.draw();
            }
            break;
        case KEY_DOWN:
        case '\x1B[B':
            if (length === 0) break;
            if (grid) {
                var nextDown = this.selectedIndex + grid.cols;
                if (nextDown < length) this.selectedIndex = nextDown;
                else this.selectedIndex = length - 1;
                this._adjustGridScroll(grid, length);
                this.draw();
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
        case '\x1B[D':
            if (length === 0) break;
            if (grid) {
                if (this.selectedIndex > 0) {
                    this.selectedIndex--;
                    this._adjustGridScroll(grid, length);
                    this.draw();
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
        case '\x1B[C':
            if (length === 0) break;
            if (grid) {
                if (this.selectedIndex < length - 1) {
                    this.selectedIndex++;
                    this._adjustGridScroll(grid, length);
                    this.draw();
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
            if (length === 0) break;
            if (grid) {
                this.selectedIndex = Math.max(0, this.selectedIndex - pageSize);
                this._adjustGridScroll(grid, length);
                this.draw();
                break;
            }
            this.selectedIndex = Math.max(0, this.selectedIndex - pageSize);
            this.scrollOffset = Math.max(0, this.scrollOffset - pageSize);
            this.draw();
            break;
        case KEY_PGDN:
            if (length === 0) break;
            if (grid) {
                this.selectedIndex = Math.min(length - 1, this.selectedIndex + pageSize);
                this._adjustGridScroll(grid, length);
                this.draw();
                break;
            }
            this.selectedIndex = Math.min(length - 1, this.selectedIndex + pageSize);
            if (this.selectedIndex >= this.scrollOffset + pageSize) {
                this.scrollOffset = Math.min(Math.max(0, length - pageSize), this.scrollOffset + pageSize);
            }
            this.draw();
            break;
        case KEY_HOME:
            if (length === 0) break;
            this.selectedIndex = 0;
            if (grid) {
                this._adjustGridScroll(grid, length);
            } else {
                this.scrollOffset = 0;
            }
            this.draw();
            break;
        case KEY_END:
            if (length === 0) break;
            this.selectedIndex = length - 1;
            if (grid) {
                this._adjustGridScroll(grid, length);
            } else if (this.listFrame) {
                var visible = Math.max(1, this.listFrame.height);
                this.scrollOffset = Math.max(0, length - visible);
            }
            this.draw();
            break;
        case '\r':
        case '\n':
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
                    this.selectedIndex = Math.max(0, this.selectedIndex - grid.cols);
                    this._adjustGridScroll(grid, length);
                    this.draw();
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
                    this.selectedIndex = nextIdx;
                    this._adjustGridScroll(grid, length);
                    this.draw();
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
        case '\x1B[A': {
            var prevScrollUp = this.imagePreviewScroll;
            this.imagePreviewScroll = Math.max(0, prevScrollUp - 1);
            if (this.imagePreviewScroll !== prevScrollUp) this.draw();
            break;
        }
        case KEY_DOWN:
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
        case '\x1B[D':
            if (this.imageSelection > 0) {
                this.imageSelection--;
                if (this.imageSelection < this.imageScrollOffset) this.imageScrollOffset = this.imageSelection;
                this.draw();
            }
            break;
        case KEY_RIGHT:
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
            this.imageSelection = Math.max(0, this.imageSelection - pageSize);
            this.imageScrollOffset = Math.max(0, this.imageScrollOffset - pageSize);
            this.draw();
            break;
        case KEY_PGDN:
            this.imageSelection = Math.min(length - 1, this.imageSelection + pageSize);
            if (this.imageSelection >= this.imageScrollOffset + pageSize) {
                this.imageScrollOffset = Math.min(Math.max(0, length - pageSize), this.imageScrollOffset + pageSize);
            }
            this.draw();
            break;
        case KEY_HOME:
            this.imageSelection = 0;
            this.imageScrollOffset = 0;
            this.draw();
            break;
        case KEY_END:
            this.imageSelection = length - 1;
            if (this.listFrame) {
                var visible = Math.max(1, this.listFrame.height);
                this.imageScrollOffset = Math.max(0, length - visible);
            }
            this.draw();
            break;
        case '\r':
        case '\n':
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
    this._ensureArticleIcon();
    var status = this.articleImages && this.articleImages.length ? 'UP/DOWN=scroll  I=images  BACKSPACE=articles' : 'UP/DOWN=scroll  BACKSPACE=articles';
    this._setStatus(status);
    this.draw();
};

NewsReader.prototype._ensureArticleIcon = function () {
    if (!this.listFrame || !this.currentFeed) {
        this._destroyArticleIcon();
        return;
    }
    var iconName = this._iconNameForFeed(this.currentFeed);
    if (!iconName) {
        this._destroyArticleIcon();
        return;
    }
    if (this.articleIconFrame && this._currentIconKey === iconName) return;
    this._destroyArticleIcon();
    var metrics = this._getIconMetrics();
    if (metrics.height + 1 >= this.listFrame.height) return;
    var iconAttr = LIST_INACTIVE;
    var iconFrame;
    var labelFrame;
    try {
        iconFrame = new Frame(1, 1, metrics.width, metrics.height, iconAttr, this.listFrame);
        iconFrame.open();
        labelFrame = new Frame(1, metrics.height + 1, metrics.width, 1, iconAttr, this.listFrame);
        labelFrame.open();
        labelFrame.clear();
        var iconBg = (typeof LIST_INACTIVE === 'number') ? (LIST_INACTIVE & 0x70) : 0;
        var iconFg = (typeof LIST_INACTIVE === 'number') ? (LIST_INACTIVE & 0x0F) : 0;
        var iconData = { iconFile: iconName, label: '', iconBg: iconBg, iconFg: iconFg };
        this.articleIconObj = new Icon(iconFrame, labelFrame, iconData);
        this.articleIconObj.render();
        if (typeof this.registerFrame === 'function') {
            this.registerFrame(iconFrame);
            this.registerFrame(labelFrame);
        }
        this.articleIconFrame = iconFrame;
        this.articleIconLabelFrame = labelFrame;
        this.articleTextOffset = metrics.height + 2;
        this._currentIconKey = iconName;
    } catch (e) {
        if (iconFrame) { try { iconFrame.close(); } catch (_e1) { } }
        if (labelFrame) { try { labelFrame.close(); } catch (_e2) { } }
        this.articleIconFrame = null;
        this.articleIconLabelFrame = null;
        this.articleIconObj = null;
        this.articleTextOffset = 1;
    }
};

NewsReader.prototype._handleArticleNavigation = function (key) {
    var totalLines = this.articleLines.length;
    var pageSize = this.listFrame ? Math.max(1, this.listFrame.height - 1) : 1;
    switch (key) {
        case KEY_UP:
        case '\x1B[A':
        case KEY_LEFT:
        case '\x1B[D':
        case 'wheel_up':
            if (this.articleScroll > 0) {
                this.articleScroll--;
                this.draw();
            }
            break;
        case KEY_DOWN:
        case '\x1B[B':
        case KEY_RIGHT:
        case '\x1B[C':
        case 'wheel_down':
            if (this.articleScroll < Math.max(0, totalLines - pageSize)) {
                this.articleScroll++;
                this.draw();
            }
            break;
        case KEY_PGUP:
            this.articleScroll = Math.max(0, this.articleScroll - pageSize);
            this.draw();
            break;
        case KEY_PGDN:
            this.articleScroll = Math.min(Math.max(0, totalLines - pageSize), this.articleScroll + pageSize);
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
        case '\b':
        case '\x08':
        case '\x7F':
        case '\x1B':
            this._destroyArticleIcon();
            this.state = 'articles';
            var visible = this.listFrame ? Math.max(1, this.listFrame.height) : 1;
            var maxOffset = Math.max(0, this.currentArticles.length - visible);
            var desiredOffset = typeof this._articleListScroll === 'number' ? this._articleListScroll : 0;
            if (this.selectedIndex < desiredOffset) desiredOffset = this.selectedIndex;
            if (this.selectedIndex >= desiredOffset + visible) desiredOffset = Math.max(0, this.selectedIndex - visible + 1);
            this.scrollOffset = Math.max(0, Math.min(maxOffset, desiredOffset));
            this.articleIndex = -1;
            this.articleScroll = 0;
            this.draw();
            break;
        case 'O':
        case 'o':
            this._setStatus('Link opening not implemented.');
            break;
        case 'I':
        case 'i':
            if (this.articleImages && this.articleImages.length) {
                this.state = 'article_images';
                this.imageSelection = 0;
                this.imageScrollOffset = 0;
                this._setStatus('ENTER=read article  BACKSPACE=articles');
                this.draw();
            }
            break;
    }
};

NewsReader.prototype._openFeed = function (feed, forceRefresh) {
    if (!feed) {
        this._setStatus('Invalid feed selection.');
        return;
    }
    this._setStatus('Loading feed...');
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
    statusParts.push('ENTER=view article');
    statusParts.push('BACKSPACE=feeds');
    statusText = statusParts.join(' | ');
    this.draw();
    this._setStatus(statusText);
};

NewsReader.prototype._openArticle = function (index) {
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
    this.articleImages = (article.__newsImages || []).slice(0);
    this._articleListScroll = this.scrollOffset;
    if (this.articleImages.length) {
        this.state = 'article_images';
        this.imageSelection = 0;
        this.imageScrollOffset = 0;
        this.scrollOffset = 0;
        this._setStatus('ENTER=read article  BACKSPACE=articles');
        this.draw();
        return;
    }
    this._enterArticleContent();
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
    return normalized.trim();
};

NewsReader.prototype._extractArticleImages = function (article) {
    var results = [];
    if (!article) return results;
    var seen = {};
    var pushUrl = function (url) {
        if (!url) return;
        var key = String(url).trim();
        if (!key || seen[key]) return;
        seen[key] = true;
        results.push(key);
    };
    if (article.enclosures && article.enclosures.length) {
        for (var i = 0; i < article.enclosures.length; i++) {
            var enclosure = article.enclosures[i];
            if (!enclosure || !enclosure.url) continue;
            var type = enclosure.type ? ('' + enclosure.type).toLowerCase() : '';
            if (newsreaderIsLikelyTrackingPixel('', enclosure.url)) continue;
            if (type.indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(enclosure.url)) {
                pushUrl(enclosure.url);
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
            pushUrl(imageUrl);
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
    if (this.imageAnsiCache[url]) return this.imageAnsiCache[url];
    if (this._imageAnsiErrors[url]) return null;

    if (typeof convertImageToANSI !== 'function') {
        try { load('iconshell/lib/util/gif2ans/img_loader.js'); }
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
    try {
        var source = url;
        if (/^data:image\//i.test(url)) {
            var match = url.match(/^data:(image\/[^;]+);base64,(.+)$/i);
            if (!match) throw 'Unsupported data URI format';
            var mime = match[1].toLowerCase();
            var ext = mime.indexOf('png') !== -1 ? '.png' : (mime.indexOf('gif') !== -1 ? '.gif' : '.jpg');
            var data = base64_decode(match[2]);
            var tempDir = (typeof system !== 'undefined' && system.temp_dir) ? system.temp_dir : (js.exec_dir || '.');
            // if (tempDir.charAt(tempDir.length - 1) !== '/' && tempDir.charAt(tempDir.length - 1) !== '\') tempDir += ' / ';
            var fileName = 'news_img_' + Date.now() + '_' + Math.floor(Math.random() * 100000) + ext;
            tempPath = tempDir + fileName;
            var f = new File(tempPath);
            if (!f.open('wb')) throw 'Unable to write temp image: ' + tempPath;
            f.write(data);
            f.close();
            source = tempPath;
        }

        if (!overlayShown) overlayShown = this._showLoadingOverlay('Converting image from :' + url);
        this._setStatus('Rendering image preview...');
        var ansiResult = convertImageToANSI(source, width, true, null, { returnObject: true });
        var preview = this._normalizeAnsiPreview(ansiResult);
        if (preview && typeof preview.ansi === 'string' && preview.ansi.length) {
            this.imageAnsiCache[url] = preview;
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
    }
    return null;
};




NewsReader.prototype._extractArticleImages = function (article) {
    var results = [];
    if (!article) return results;
    var seen = {};
    var pushUrl = function (url) {
        if (!url) return;
        var key = url.trim();
        if (!key || seen[key]) return;
        seen[key] = true;
        results.push(key);
    };
    if (article.enclosures && article.enclosures.length) {
        for (var i = 0; i < article.enclosures.length; i++) {
            var enclosure = article.enclosures[i];
            if (!enclosure) continue;
            var type = enclosure.type ? ('' + enclosure.type).toLowerCase() : '';
            if (newsreaderIsLikelyTrackingPixel('', enclosure.url)) continue;
            if (type.indexOf('image/') === 0) {
                pushUrl(enclosure.url);
                continue;
            }
            if (!type && enclosure.url) {
                if (/\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(enclosure.url)) pushUrl(enclosure.url);
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
            pushUrl(imageUrl);
        }
    }
    return results;
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

NewsReader.prototype._renderCategories = function () {
    // TODO: iterate through configured feeds and render a grid of icons. fallback to colored frame if no icon
    // for our icon naming format, let's create a concatenated lowercase version prefixed by newsfeed_
    // e.g. newsfeed_bbc_world_news
    // icons should be the same size as everywhere else in the app (e.g. 12 x 6) [don't hardcode, use constants in shelllib.js or maybe config.js where we define it]
    // use similar grid rendering and navigation logic to other areas of the app.
    // icons use same loading mechanism and folder as everywhere else in the app, load bin, use ansi fallback

}

NewsReader.prototype._renderCategory = function (category) {
    // TODO: iterate through configured feeds and filter by category, then render a list of feeds in that category, showing the icons
    // user can select a feed to view articles from that feed
    // use a fallback for icons
    // icons should be the same size as everywhere else in the app (e.g. 12 x 6) [don't hardcode, use constants in shelllib.js or maybe config.js where we define it]
    // icons use same loading mechanism and folder as everywhere else in the app, load bin, use ansi fallback
    // If an RSS feed is broken or unreachable, we should indicate that in the UI, and then the user can hit a key to go back.
}

NewsReader.prototype._showArticles = function (feed) {
    // TODO: for now we can implement as a simple list of article titles, user can select one to view more details
    // using a lightbar or tree + mouse navigation would be useful though
    // later we can implement pagination, article summaries, etc.
}

NewsReader.prototype._showArticle = function (article) {
    // TODO: I want to implement this as a two phase view:
    // 1. Show a summary view with the article title and a brief excerpt (I want to expand this later to include images + figlet if possible, but keep simple for now)
    // 2. On selection, show the full article content
}
