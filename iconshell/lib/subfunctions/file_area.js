// File Area Browser Subprogram (simplified port)
// Browses Libraries -> Directories -> Files using parentFrame supplied by IconShell.
// Keys:
//  UP/DOWN : Move selection
//  ENTER   : Drill down (libs -> dirs -> files)
//  G       : Go back (files->dirs->libs)
//  I       : File info popup (in files list)
//  Q / ESC : Exit subprogram
//  T / Space: Tag/untag file (mark with *)
//  D       : Download tagged files (stub if none)

load('iconshell/lib/subfunctions/subprogram.js');
load('frame.js');
load('file_size.js');
load('sbbsdefs.js');

function FileArea(opts){
    opts = opts || {};
    Subprogram.call(this,{ name:'file-area', parentFrame: opts.parentFrame });
    this.state = 'LIBS'; // LIBS | DIRS | FILES
    this.libs = [];
    this.dirs = [];
    this.files = [];
    this.libIndex = -1;
    this.dirCode = null;
    this.sel = 0;       // selection index within current list
    this.top = 0;       // scroll offset
    this.tagged = {};   // filename -> true
    // Frames
    this.header = null; this.list = null; this.footer = null; this.popup = null; this.popupContent = null;
}
extend(FileArea, Subprogram);

FileArea.prototype.enter = function(done){
    bbs.sys_status |= SS_MOFF; // silence output
    this.loadLibraries();
    Subprogram.prototype.enter.call(this, done);
};

FileArea.prototype.setParentFrame = function(frame){
    this.parentFrame = frame; return this;
};

FileArea.prototype.loadLibraries = function(){
    var libs = [];
    for(var i=0;i<file_area.lib_list.length;i++) libs.push(file_area.lib_list[i]);
    this.libs = libs;
    this.state='LIBS'; this.sel=0; this.top=0;
};

FileArea.prototype.loadDirectories = function(libIdx){
    this.libIndex = libIdx;
    var dirs = file_area.lib_list[libIdx].dir_list;
    this.dirs = dirs;
    this.state='DIRS'; this.sel=0; this.top=0;
};

FileArea.prototype.loadFiles = function(dirCode){
    this.dirCode = dirCode;
    var fb = new FileBase(dirCode); fb.open();
    var list = fb.get_list('', FileBase.DETAIL.NORM); // basic details
    for(var i=0;i<list.length;i++){
        var f = list[i];
        f.sizeStr = file_size_str(f.size);
        f.dateStr = system.datestr(f.added);
    }
    this.files = list; fb.close();
    this.state='FILES'; this.sel=0; this.top=0;
};

FileArea.prototype.ensureFrames = function(){
    if(!this.parentFrame) return;
    if(!this.header){
        this.header = new Frame(this.parentFrame.x, this.parentFrame.y, this.parentFrame.width,1,ICSH_ATTR('FILE_HEADER'),this.parentFrame); this.header.open();
    }
    if(!this.footer){
        this.footer = new Frame(this.parentFrame.x, this.parentFrame.y+this.parentFrame.height-1,this.parentFrame.width,1,ICSH_ATTR('FILE_FOOTER'),this.parentFrame); this.footer.open();
    }
    if(!this.list){
        var h = this.parentFrame.height-2;
        if(h<1) h=1;
        this.list = new Frame(this.parentFrame.x, this.parentFrame.y+1,this.parentFrame.width,h,ICSH_ATTR('FILE_LIST'),this.parentFrame); this.list.open();
        this.setBackgroundFrame(this.list);
    }
};

FileArea.prototype.draw = function(){
    this.ensureFrames();
    if(!this.list) return;
    // header
    this.header.clear();
    var title = 'File Browser - '+this.state;
    if(this.state==='DIRS') title += ' (Lib: '+file_area.lib_list[this.libIndex].name+')';
    if(this.state==='FILES') title += ' ('+file_area.dir[this.dirCode].name+')';
    this.header.putmsg(title.substr(0,this.header.width));
    // footer help
    this.footer.clear();
    var help = 'ENTER=open  G=back  I=info  T=tag  D=download  Q=quit';
    this.footer.putmsg(help.substr(0,this.footer.width));
    // list
    this.list.clear();
    var items = this.currentItems();
    var visible = this.list.height;
    if(this.sel >= items.length) this.sel = items.length?items.length-1:0;
    if(this.sel < 0) this.sel = 0;
    if(this.sel < this.top) this.top = this.sel;
    if(this.sel >= this.top + visible) this.top = this.sel - visible + 1;
    for(var row=0; row<visible; row++){
        var idx = this.top + row;
        if(idx >= items.length) break;
        var it = items[idx];
        var line;
        if(this.state==='LIBS') line = format('%-30s %3d dirs', it.name, it.dir_list.length);
        else if(this.state==='DIRS') line = format('%-30s %3d files', it.name, directory(it.path+'*').length);
        else line = format('%c %-25s %8s %s', this.tagged[it.name]?'*':' ', it.name, it.sizeStr, (it.desc||'').substr(0, this.list.width-40));
        if(line.length>this.list.width) line=line.substr(0,this.list.width);
        if(idx === this.sel){
            this.list.attr = ICSH_ATTR('FILE_LIST_ACTIVE');
            this.list.gotoxy(1,row+1); this.list.putmsg(line);
            this.list.attr = ICSH_ATTR('FILE_LIST_INACTIVE');
        } else {
            this.list.gotoxy(1,row+1); this.list.putmsg(line);
        }
    }
    if(this.popup) this.drawPopup();
    this.parentFrame.cycle();
};

FileArea.prototype.currentItems = function(){
    if(this.state==='LIBS') return this.libs;
    if(this.state==='DIRS') return this.dirs;
    if(this.state==='FILES') return this.files;
    return [];
};

FileArea.prototype.handleKey = function(k){
    if(!k) return;
    if(this.popup){ this.closePopup(); this.draw(); return; }
    switch(k){
        case '\x1B': case 'Q': case 'q': this.exit(); return;
        case KEY_UP: this.sel--; this.draw(); return;
        case KEY_DOWN: this.sel++; this.draw(); return;
        case KEY_PGUP: this.sel -= (this.list?this.list.height:5); this.draw(); return;
        case KEY_PGDN: this.sel += (this.list?this.list.height:5); this.draw(); return;
        case 'G': case 'g': this.goBack(); return;
        case '\r': case '\n': this.openSelection(); return;
        case 'I': case 'i': if(this.state==='FILES') this.showInfo(); return;
        case 'T': case 't': case ' ': if(this.state==='FILES') this.toggleTag(); return;
        case 'D': case 'd': if(this.state==='FILES') this.downloadTagged(); return;
    }
};

FileArea.prototype.openSelection = function(){
    var items = this.currentItems();
    if(!items.length) return;
    var it = items[this.sel];
    if(this.state==='LIBS') this.loadDirectories(it.index);
    else if(this.state==='DIRS') this.loadFiles(it.code);
    else if(this.state==='FILES') this.showInfo();
    this.draw();
};

FileArea.prototype.goBack = function(){
    if(this.state==='FILES'){ this.loadDirectories(this.libIndex); this.draw(); return; }
    if(this.state==='DIRS'){ this.loadLibraries(); this.draw(); return; }
};

FileArea.prototype.toggleTag = function(){
    var items=this.files; if(!items.length) return;
    var f=items[this.sel];
    if(this.tagged[f.name]) delete this.tagged[f.name]; else this.tagged[f.name]=true;
    this.draw();
};

FileArea.prototype.showInfo = function(){
    var items=this.files; if(!items.length) return;
    var f=items[this.sel];
    var w=Math.min(this.parentFrame.width-6, 60), h=8;
    var x=this.parentFrame.x+Math.floor((this.parentFrame.width-w)/2);
    var y=this.parentFrame.y+Math.floor((this.parentFrame.height-h)/2);
    this.popup = new Frame(x,y,w,h,ICSH_ATTR('FILE_POPUP'),this.parentFrame); this.popup.open();
    this.popup.drawBorder = Frame.prototype.drawBorder; // if available
    this.popupContent = new Frame(x+1,y+1,w-2,h-2,ICSH_ATTR('FILE_POPUP_CONTENT'),this.parentFrame); this.popupContent.open();
    var lines = [
        'Name: '+f.name,
        'Size: '+f.sizeStr,
        'Date: '+f.dateStr,
        'Desc: '+(f.desc||'')
    ];
    for(var i=0;i<lines.length && i<h-2;i++){ this.popupContent.gotoxy(1,i+1); this.popupContent.putmsg(lines[i].substr(0,w-2)); }
    this.popupContent.gotoxy(1,h-2); this.popupContent.putmsg('[Any key to close]');
    this.parentFrame.cycle();
};

FileArea.prototype.drawPopup = function(){ /* already rendered */ };

FileArea.prototype.closePopup = function(){
    try{ if(this.popupContent) this.popupContent.close(); }catch(e){}
    try{ if(this.popup) this.popup.close(); }catch(e){}
    this.popup=null; this.popupContent=null;
};

FileArea.prototype.downloadTagged = function(){
    // Placeholder: just show a popup with count
    var names=[]; for(var k in this.tagged) names.push(k);
    if(!names.length) return; // nothing
    var w=Math.min(this.parentFrame.width-6, 50), h=5;
    var x=this.parentFrame.x+Math.floor((this.parentFrame.width-w)/2);
    var y=this.parentFrame.y+Math.floor((this.parentFrame.height-h)/2);
    this.popup = new Frame(x,y,w,h,ICSH_ATTR('FILE_POPUP'),this.parentFrame); this.popup.open();
    this.popupContent = new Frame(x+1,y+1,w-2,h-2,ICSH_ATTR('FILE_POPUP_CONTENT'),this.parentFrame); this.popupContent.open();
    this.popupContent.putmsg('Tagged for download ('+names.length+'):');
    this.popupContent.gotoxy(1,2); this.popupContent.putmsg(names.slice(0,2).join(', '));
    this.popupContent.gotoxy(1,h-2); this.popupContent.putmsg('[Any key]');
    this.parentFrame.cycle();
};

FileArea.prototype.cleanup = function(){
    this.closePopup();
    try{ if(this.list) this.list.close(); }catch(e){}
    try{ if(this.header) this.header.close(); }catch(e){}
    try{ if(this.footer) this.footer.close(); }catch(e){}
    this.list=this.header=this.footer=null;
    Subprogram.prototype.cleanup.call(this);
};

