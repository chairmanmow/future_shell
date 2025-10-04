load('rss-atom.js');
load('tdfiglet.js');
load("iconshell/lib/subfunctions/subprogram.js");

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
]


function NewsReader(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'newsreader', parentFrame: opts.parentFrame });
}

NewsReader.prototype._handleKey = function (key) {
    // TODO: implement key handling for navigation
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
