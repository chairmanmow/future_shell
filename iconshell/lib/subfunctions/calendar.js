// Calendar Subprogram (ported & simplified from legacy event calendar)
// Keys: Arrow keys move selection, PgUp/PgDn change month, Home=Today, Q/ESC exit.
// Future extension: highlight events (birthdays, resets) via this.highlights[day]=true.

load('iconshell/lib/subfunctions/subprogram.js');

function CalendarSub(opts){
    opts = opts || {};
    Subprogram.call(this,{ name:'calendar', parentFrame: opts.parentFrame });
    var now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth(); // 0-11
    this.selDay = now.getDate();
    this.todayY = this.year; this.todayM = this.month; this.todayD = this.selDay;
    this.highlights = {}; // day -> true
    this.gridFrame=null; this.infoFrame=null; this.header=null; this.footer=null;
}
extend(CalendarSub, Subprogram);

CalendarSub.prototype.enter = function(done){
    Subprogram.prototype.enter.call(this, done);
};

CalendarSub.prototype.ensureFrames = function(){
    if(!this.parentFrame) return;
    if(!this.header){
        this.header = new Frame(this.parentFrame.x, this.parentFrame.y, this.parentFrame.width,1,ICSH_ATTR('CAL_HEADER'),this.parentFrame); this.header.open();
    }
    if(!this.footer){
        this.footer = new Frame(this.parentFrame.x, this.parentFrame.y+this.parentFrame.height-1,this.parentFrame.width,1,ICSH_ATTR('CAL_FOOTER'),this.parentFrame); this.footer.open();
    }
    if(!this.gridFrame){
        var h=this.parentFrame.height-2; if(h<6) h=6;
        this.gridFrame = new Frame(this.parentFrame.x, this.parentFrame.y+1,this.parentFrame.width,h,ICSH_ATTR('CAL_GRID'),this.parentFrame); this.gridFrame.open();
    }
};

CalendarSub.prototype.daysInMonth = function(y,m){ return new Date(y,m+1,0).getDate(); };
CalendarSub.prototype.firstWeekday = function(y,m){ return new Date(y,m,1).getDay(); };
CalendarSub.prototype.monthName = function(m){ return ['January','February','March','April','May','June','July','August','September','October','November','December'][m]; };

CalendarSub.prototype.draw = function(){
    this.ensureFrames(); if(!this.gridFrame) return;
    // header
    this.header.clear();
    var title = 'Calendar: '+this.monthName(this.month)+' '+this.year;
    this.header.putmsg(title.substr(0,this.header.width));
    this.footer.clear();
    this.footer.putmsg('Arrows=Move PgUp/PgDn=Month Home=Today Q=Quit');
    // grid
    var g=this.gridFrame; g.clear();
    var cols=['Su','Mo','Tu','We','Th','Fr','Sa'];
    var wCell = Math.floor((g.width-1)/7); if(wCell<3) wCell=3;
    var xOff=1;
    // Column headers
    for(var c=0;c<7;c++){
        var label=cols[c];
        g.gotoxy(xOff + c*wCell,1); g.putmsg(label);
    }
    var first=this.firstWeekday(this.year,this.month);
    var dim=this.daysInMonth(this.year,this.month);
    var row=0,col=first;
    for(var day=1; day<=dim; day++){
        var gx = xOff + col*wCell;
        var gy = 3 + row*2;
        var isSel = (day===this.selDay);
        var isToday = (this.year===this.todayY && this.month===this.todayM && day===this.todayD);
        var hl = this.highlights[day];
        var attr;
        if(isSel) attr = ICSH_ATTR('CAL_DAY_SELECTED'); else if(isToday) attr = ICSH_ATTR('CAL_DAY_TODAY'); else if(hl) attr = ICSH_ATTR('CAL_DAY_HOLIDAY'); else attr = ICSH_ATTR('CAL_DAY_NORMAL');
        g.attr = attr;
        var ds = (day<10?'0'+day:day.toString());
        g.gotoxy(gx,gy); g.putmsg(ds);
        g.attr = ICSH_ATTR('CAL_GRID');
        col++; if(col>6){ col=0; row++; }
    }
    this.parentFrame.cycle();
};

CalendarSub.prototype.adjustSelection = function(delta){
    var dim=this.daysInMonth(this.year,this.month);
    this.selDay += delta;
    if(this.selDay < 1) this.selDay = 1;
    if(this.selDay > dim) this.selDay = dim;
};

CalendarSub.prototype.changeMonth = function(delta){
    this.month += delta;
    if(this.month<0){ this.month=11; this.year--; }
    else if(this.month>11){ this.month=0; this.year++; }
    var dim=this.daysInMonth(this.year,this.month);
    if(this.selDay>dim) this.selDay=dim;
};

CalendarSub.prototype.handleKey = function(k){
    if(!k) return;
    switch(k){
        case '\x1B': case 'Q': case 'q': this.exit(); return;
        case KEY_LEFT: this.adjustSelection(-1); this.draw(); return;
        case KEY_RIGHT: this.adjustSelection(1); this.draw(); return;
        case KEY_UP: this.adjustSelection(-7); this.draw(); return;
        case KEY_DOWN: this.adjustSelection(7); this.draw(); return;
        case KEY_PGUP: this.changeMonth(-1); this.draw(); return;
        case KEY_PGDN: this.changeMonth(1); this.draw(); return;
        case KEY_HOME: this.year=this.todayY; this.month=this.todayM; this.selDay=this.todayD; this.draw(); return;
    }
};

CalendarSub.prototype.cleanup = function(){
    try{ if(this.gridFrame) this.gridFrame.close(); }catch(e){}
    try{ if(this.header) this.header.close(); }catch(e){}
    try{ if(this.footer) this.footer.close(); }catch(e){}
    this.gridFrame=this.header=this.footer=null;
    Subprogram.prototype.cleanup.call(this);
};

this.CalendarSub = CalendarSub;