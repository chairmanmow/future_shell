load("sbbsdefs.js");
load("rss-atom.js");
load("frame.js");
load("event-timer.js");


var tickerTimer = new Timer();
var timerCycle = new Timer();
var tickerTimerFeedTime = 15;  // interval in seconds
tickerTimerFeedTime = tickerTimerFeedTime * 1000;

var tickerEvent = tickerTimer.addEvent(tickerTimerFeedTime,true,tickerLoop);
	var f = new Feed("http://www.grudgemirror.com/feed/");
	
	var rssItemIndex = 0;
	var rssChannelIndex = 0;
	var tickerLoopIndex = 0;
	var rssArticleTitle = new Array();
	
	function rssHeadline()
	{
	alertFrame.clear();
	alertFrame.putmsg(f.channels[rssChannelIndex].title + " ", channelTitleBG|channelTitleFG);  
		var chanUpdateTimeTrim = f.channels[rssChannelIndex].updated.substring(0, f.channels[rssChannelIndex].updated.indexOf(" +0000"));
		alertFrame.putmsg("\1rLast Updated " + chanUpdateTimeTrim, channelUpdateTimeBG|channelUpdateTimeFG);
		alertFrame.cycle();
		tickerLoopIndex++;
	}
	
	function rssArticle()
	{
		alertFrame.clear();
			alertFrame.putmsg(f.channels[rssChannelIndex].items[rssItemIndex].title.substring(0,79), BG_MAGENTA|itemUpdateFG);
			//alertFrame.putmsg(f.channels[rssChannelIndex].items[rssItemIndex].author + "");
			var itemUpdateTimeTrim = f.channels[rssChannelIndex].items[rssItemIndex].date.updated.substring(0,f.channels[rssChannelIndex].items[rssItemIndex].date.updated.indexOf(" +0000"));
			alertFrame.putmsg(itemUpdateTimeTrim + "", itemUpdateTimeBG|itemUpdateTimeFG);
			//alertFrame.putmsg(f.channels[rssChannelIndex].items[rssItemIndex].body + "");	
			alertFrame.cycle();
			rssArticleTitle[rssItemIndex] = "\1r" + itemUpdateTimeTrim + "\1y=-="  + f.channels[rssChannelIndex].items[rssItemIndex].title
			tickerLoopIndex++;
			rssItemIndex++;
			
	}
	
	var noOfArticles = f.channels[rssChannelIndex].items.length;
	
		function tickerLoop()
	{
		if (tickerLoopIndex == 0)
		{
		
		rssHeadline();
		return;
		}
		while(tickerLoopIndex >= 1 && rssItemIndex < noOfArticles - 1)
		{
		if(rssItemIndex == noOfArticles - 1)
		{
			rssItemIndex = 0;
			alertFrame.clear();
			rssHeadline();	
			return;
		}
		rssArticle();	
		return;
		}
		if(tickerLoopIndex >= noOfArticles)
			{
			alertFrame.putmsg(rssArticleTitle[rssItemIndex]);
			rssItemIndex++;
			tickerLoopIndex++;
			if(rssItemIndex == noOfArticles)
				{
				alertFrame.clear();
				rssHeadline();
				alertFrame.cycle();
				rssItemIndex = 0;	
				tickerLoopIndex++;				
				}
				tickerLoopIndex++;
				return;
		}
		tickerLoopIndex++;
		return;
		}
	
function changeRSSFeed()
{
	console.clear();
	console.putmsg("Enter a new RSS feed");
	f = console.getstr();
	tickerLoopIndex = 0;
}