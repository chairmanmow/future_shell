// mouse_hotspot_test.js
// Minimal Synchronet JS test for mouse hotspot support


function MouseTest(){
if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true;
if (typeof console.clear_hotspots === 'function') console.clear_hotspots();

// Draw a box and add a hotspot
var x1 = 10, x2 = 30, y = 5;
console.gotoxy(x1, y);
console.putmsg("[ CLICK HERE WITH MOUSE ]");

if (typeof console.add_hotspot === 'function') {
    console.add_hotspot("M", true, x1, x2, y);
    console.putmsg("Hotspot added: x1="+x1+", x2="+x2+", y="+y);
} else {
    console.putmsg("console.add_hotspot not available");
}

console.putmsg("\r\nWaiting for mouse click (or press Q to quit)...\r\n");

while (!js.terminated) {
    var key = console.inkey(K_NOECHO|K_NOSPIN, 5000);
    if (key) {
        console.putmsg("Key received: " + JSON.stringify(key) + " (charCode: " + (typeof key === 'string' ? key.charCodeAt(0) : key) + ")");
        if (key === 'Q' || key === 'q') break;
        if (key === 'M') {
            console.putmsg("\r\nMouse hotspot clicked!\r\n");
        }
    }
    yield();
}

if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = false;
if (typeof console.clear_hotspots === 'function') console.clear_hotspots();
console.putmsg("\r\nTest complete.\r\n");

}
