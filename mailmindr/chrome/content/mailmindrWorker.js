"use strict";

importScripts("resource://gre/modules/workers/require.js");

var _initialized = false;
var _storageEngine;
var _mindrs = [];

addEventListener('message', function(event) { 

    var data = event.data;
    var mindrs = [];

    switch (data.cmd) {
        case 'start':
            // _storageEngine = data.storageEngine;
            self.postMessage({ cmd : 'start', status : 'started' });
            _initialized = true;
            break;
    }

    // self.postMessage({
    //     cmd: "trigger",
    //     mindrs: mindrs
    // });

}, false);

self.doTick = function() {
    // postback to kernel / caller
    self.postMessage({ cmd : 'tick' });
}

// use setInterval as we have no access to the nsITimer;1 contract
self.setInterval(self.doTick, 2000);