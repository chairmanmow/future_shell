if (typeof Feed === 'undefined') {
    try { load('rss-atom.js'); } catch (_e) { }
}
load("iconshell/lib/subfunctions/subprogram.js");
load('iconshell/lib/shell/icon.js');

function resolveAttr(key, fallback) {
    if (typeof fallback === 'undefined') fallback = 0;
    if (typeof ICSH_ATTR === 'function' && typeof ICSH_VALS !== 'undefined' && ICSH_VALS) {
        try { return ICSH_ATTR(key); } catch (_ignored) { }
    }
    return fallback;
}

var RSS_FEEDS = [
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
    this._resetState();
}
extend(NewsReader, Subprogram);

NewsReader.prototype._resetState = function () {
    LIST_ACTIVE = resolveAttr('FILE_LIST_ACTIVE', (BG_BLUE | WHITE));
    LIST_INACTIVE = resolveAttr('FILE_LIST_INACTIVE', (BG_BLACK | LIGHTGRAY));
    HEADER_ATTR = resolveAttr('FILE_HEADER', (BG_BLUE | WHITE));
    STATUS_ATTR = resolveAttr('FILE_FOOTER', (BG_BLACK | LIGHTGRAY));

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
};

NewsReader.prototype.enter = function (done) {
    log('NewsReader enter');
    Subprogram.prototype.enter.call(this, done);
    this._resetState();
    // Subprogram.prototype.enter.call(this, done);
};

NewsReader.prototype.exit = function (done) {
    log('NewsReader exit');
    this._resetState();
    if (typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (e) { }
    }
    var shell = this.shell;
    Subprogram.prototype.exit.call(this);
    if (shell) {
        if (shell._pendingSubLaunch && shell._pendingSubLaunch.instance === this) {
            shell._pendingSubLaunch = null;
        }
        if (shell.activeSubprogram === this) {
            shell.exitSubprogram();
        }
    }
    // this.draw();
    // Subprogram.prototype.enter.call(this, done);
};

NewsReader.prototype._buildCategories = function () {
    var map = {};
    for (var i = 0; i < RSS_FEEDS.length; i++) {
        var cat = RSS_FEEDS[i].category || 'Misc';
        if (!map[cat]) map[cat] = { name: cat, feeds: [] };
        map[cat].feeds.push(RSS_FEEDS[i]);
    }
    var categories = [];
    for (var key in map) {
        if (!map.hasOwnProperty(key)) continue;
        categories.push(map[key]);
    }
    categories.sort(function (a, b) {
        var A = a.name.toLowerCase(), B = b.name.toLowerCase();
        return A > B ? 1 : (A < B ? -1 : 0);
    });
    return categories;
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
    log('Frames ensured: header ' + (this.headerFrame ? 'yes' : 'no') + ', status ' + (this.statusFrame ? 'yes' : 'no') + ', list ' + (this.listFrame ? 'yes' : 'no'));
};

NewsReader.prototype.draw = function () {
    this._ensureFrames();
    if (!this.listFrame) return;
    log('NewsReader draw, state=' + this.state + ', selectedIndex=' + this.selectedIndex + ', scrollOffset=' + this.scrollOffset);
    this._refreshStatus();
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
        case 'article':
            this._drawArticle();
            break;
        default:
            log('NewsReader in unknown state: ' + this.state);
            break;
    }
    this.parentFrame.cycle();
    log('Cycled parent frame');
};

NewsReader.prototype._drawCategories = function () {
    this._setHeader('Select News Category');
    this._renderList(this.categories, function (category) {
        return category.name + ' (' + category.feeds.length + ')';
    });
    this._setStatus('ENTER=view feeds  ESC=exit');
};

NewsReader.prototype._drawFeeds = function () {
    this._setHeader('Category: ' + (this.currentCategory ? this.currentCategory.name : ''));
    if (!this.currentCategory || !this.currentFeeds.length) {
        this.listFrame.clear();
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No feeds available in this category.');
        return;
    }
    this._renderList(this.currentFeeds, function (feed) {
        return feed.label;
    });
    this._setStatus('ENTER=open feed  BACKSPACE=categories  R=refresh feed cache');
};

NewsReader.prototype._drawArticles = function () {
    this._setHeader((this.currentFeed ? this.currentFeed.label : 'Feed') + ' Articles');
    if (!this.currentArticles.length) {
        this.listFrame.clear();
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No articles available.');
        return;
    }
    var self = this;
    this._renderList(this.currentArticles, function (article, idx) {
        var prefix = (idx + 1) + '. ';
        var title = article.title || '[untitled]';
        return prefix + title;
    });
    this._setStatus('ENTER=view article  BACKSPACE=feeds');
};

NewsReader.prototype._drawArticle = function () {
    var header = 'Article';
    if (this.articleIndex >= 0 && this.articleIndex < this.currentArticles.length) {
        header = this.currentArticles[this.articleIndex].title || header;
    }
    this._setHeader(header);
    this.listFrame.clear();
    if (!this.articleLines.length) {
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No content available.');
        return;
    }
    var height = this.listFrame.height;
    var offset = Math.max(0, this.articleScroll);
    if (offset > Math.max(0, this.articleLines.length - 1)) offset = Math.max(0, this.articleLines.length - 1);
    for (var row = 0; row < height; row++) {
        var lineIndex = offset + row;
        if (lineIndex >= this.articleLines.length) break;
        this.listFrame.gotoxy(1, row + 1);
        this.listFrame.putmsg(this.articleLines[lineIndex]);
    }
    this._setStatus('UP/DOWN=scroll  BACKSPACE=articles');
};

NewsReader.prototype._renderList = function (items, formatter) {
    if (!items) items = [];
    var height = this.listFrame.height;
    if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
    if (this.selectedIndex >= this.scrollOffset + height) this.scrollOffset = Math.max(0, this.selectedIndex - height + 1);
    this.listFrame.clear();
    for (var row = 0; row < height; row++) {
        var idx = this.scrollOffset + row;
        if (idx >= items.length) break;
        var line = formatter(items[idx], idx) || '';
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
    this._resetState();
};

NewsReader.prototype._setHeader = function (text) {
    if (!this.headerFrame) return;
    this.headerFrame.clear();
    this.headerFrame.gotoxy(1, 1);
    if (!text) text = 'News';
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
        var rss = new Feed(feed.url);
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
    var body = article.content || article.description || article.summary || article.body || '';
    var metadata = [];
    metadata.push(title);
    if (authorValue) metadata.push('By: ' + authorValue);
    if (dateValue) metadata.push(this._formatArticleDate(dateValue));
    metadata.push('');
    lines = lines.concat(this._wrapText(metadata.join('\n'), width));
    lines.push('');
    lines = lines.concat(this._wrapText(this._simplifyText(body) || '[No content]', width));
    if (article.link) {
        lines.push('');
        lines.push('Link: ' + article.link);
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
        case 'categories':
            this._handleListNavigation(key, this.categories.length, function () {
                if (this.categories.length === 0) return;
                this.currentCategory = this.categories[this.selectedIndex];
                this.currentFeeds = this._feedsForCategory(this.currentCategory);
                this.state = 'feeds';
                this.selectedIndex = 0;
                this.scrollOffset = 0;
                this._setStatus('Loading feeds...');
                this.draw();
            }.bind(this), this.exit.bind(this));
            break;
        case 'feeds':
            this._handleListNavigation(key, this.currentFeeds.length, function () {
                if (!this.currentFeeds.length) {
                    this._setStatus('No feeds available.');
                    return;
                }
                this._openFeed(this.currentFeeds[this.selectedIndex]);
            }.bind(this), function () {
                this.state = 'categories';
                this.selectedIndex = this.categories.indexOf(this.currentCategory);
                if (this.selectedIndex < 0) this.selectedIndex = 0;
                this.scrollOffset = 0;
                this.currentCategory = null;
                this.currentFeeds = [];
                this.draw();
            }.bind(this));
            if (key === 'R' || key === 'r') {
                if (this.currentFeeds.length) {
                    this._openFeed(this.currentFeeds[this.selectedIndex], true);
                }
            }
            break;
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
        case 'article':
            this._handleArticleNavigation(key);
            break;
    }
};

NewsReader.prototype._handleListNavigation = function (key, length, onEnter, onBack) {
    if (typeof length !== 'number' || length < 0) length = 0;
    var pageSize = this.listFrame ? Math.max(1, this.listFrame.height) : 1;
    switch (key) {
        case KEY_UP:
        case '\x1B[A':
        case KEY_LEFT:
        case '\x1B[D':
            if (length === 0) break;
            if (this.selectedIndex > 0) {
                this.selectedIndex--;
                if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
                this.draw();
            }
            break;
        case KEY_DOWN:
        case '\x1B[B':
        case KEY_RIGHT:
        case '\x1B[C':
            if (length === 0) break;
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
            this.selectedIndex = Math.max(0, this.selectedIndex - pageSize);
            this.scrollOffset = Math.max(0, this.scrollOffset - pageSize);
            this.draw();
            break;
        case KEY_PGDN:
            if (length === 0) break;
            this.selectedIndex = Math.min(length - 1, this.selectedIndex + pageSize);
            if (this.selectedIndex >= this.scrollOffset + pageSize) {
                this.scrollOffset = Math.min(Math.max(0, length - pageSize), this.scrollOffset + pageSize);
            }
            this.draw();
            break;
        case KEY_HOME:
            if (length === 0) break;
            this.selectedIndex = 0;
            this.scrollOffset = 0;
            this.draw();
            break;
        case KEY_END:
            if (length === 0) break;
            this.selectedIndex = length - 1;
            if (this.listFrame) {
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
            if (this.selectedIndex > 0) {
                this.selectedIndex = Math.max(0, this.selectedIndex - 1);
                if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
                this.draw();
            }
            break;
        case 'wheel_down':
            if (length === 0) break;
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
    this._articleListScroll = this.scrollOffset;
    this.state = 'article';
    this.scrollOffset = 0;
    this._setStatus('UP/DOWN=scroll  BACKSPACE=articles');
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
    return normalized.trim();
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
    // TODO: iterate through RSS_FEEDS and render a grid of icons. fallback to colored frame if no icon
    // for our icon naming format, let's create a concatenated lowercase version prefixed by newsfeed_
    // e.g. newsfeed_bbc_world_news
    // icons should be the same size as everywhere else in the app (e.g. 12 x 6) [don't hardcode, use constants in shelllib.js or maybe config.js where we define it]
    // use similar grid rendering and navigation logic to other areas of the app.
    // icons use same loading mechanism and folder as everywhere else in the app, load bin, use ansi fallback

}

NewsReader.prototype._renderCategory = function (category) {
    // TODO: iterate through RSS_FEEDS and filter by category, then render a list of feeds in that category, showing the icons
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
