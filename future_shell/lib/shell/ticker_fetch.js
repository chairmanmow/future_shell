// ticker_fetch.js — Background RSS fetch for the shell header ticker
// Spawned via: load(true, 'future_shell/lib/shell/ticker_fetch.js', feedUrl)
// Writes a result object to parent_queue and exits.
"use strict";

load('sbbsdefs.js');
load('rss-atom.js');

var url = argv[0] || '';
var result = { error: false, headlines: [], url: url };

try {
    if (!url) throw new Error('No feed URL provided');
    var feed = new Feed(url, 5);
    var channel = (feed.channels && feed.channels.length) ? feed.channels[0] : null;
    if (channel && channel.items) {
        var source = channel.title || '';
        for (var i = 0; i < channel.items.length; i++) {
            var item = channel.items[i];
            var title = item.title || '';
            if (!title) continue;
            result.headlines.push({ title: title, source: source });
        }
    }
} catch (e) {
    result.error = true;
    result.message = String(e);
}

parent_queue.write(result);
