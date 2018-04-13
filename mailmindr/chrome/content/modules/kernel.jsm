/* jshint curly: true, strict: true, multistr: true, moz: true, undef: true, unused: true */
/* global Components, mailmindrLogger, mailmindrSearch */
"use strict";

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://app/modules/mailServices.js");
Components.utils.import("resource://app/modules/Services.jsm");

Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");
Components.utils.import("chrome://mailmindr/content/utils/factory.jsm");
Components.utils.import("chrome://mailmindr/content/utils/storage.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");
Components.utils.import("resource://gre/modules/AddonManager.jsm");

let EXPORTED_SYMBOLS = ["mailmindrKernel"];

/* mailmindr constants */
const MAILMINDR_GLOBAL_INTERVAL = 5000;
const TYPE_REPEATING_PRECISE = Components.interfaces.nsITimer.TYPE_REPEATING_PRECISE;
const TYPE_REPEATING_SLACK = Components.interfaces.nsITimer.TYPE_REPEATING_SLACK;


function MailmindrKernelBase() 
{
    "use strict";

    this._name = "mailmindrKernel";
    this._logger = new mailmindrLogger(this);
    this._mindrs = [];

    let self = this;

    this.initialize = function() {
        "use strict";
        if (self._isInitialized) {
            self._logger.log('-- already initialized --');
            return;
        }

        self.setGlobalListeners();

        ///
        /// initialize the timer
        ///

        /*
        let event = {
            notify: function(aTimer) {
                self.refreshMindrsFromStorage();
            }
        };

        self._timer = Components.classes["@mozilla.org/timer;1"]
            .createInstance(Components.interfaces.nsITimer);
        self._timer.init(event, 3 * 1000, TYPE_REPEATING_SLACK);

        */

        ///
        /// set up modules
        ///
        self.modules = {
            factory : mailmindrFactory,
            storage : mailmindrStorage,
            common  : mailmindrCommon,
            // worker : new ChromeWorker('chrome://mailmindr/content/mailmindrWorker.js')
        };

        // --
        // -- worker diabled so far 
        // --         

        // self.modules.worker.addEventListener('message', function(e) {
        //     self._logger.log('msg from worker:: ' + e.data);
        // }, false);

        // self.modules.worker.addEventListener('error', function(e) {
        //     self._logger.error('err from worker:: ' + e.filename + ' ' + e.lineno + ' // ' + e.message);
        // }, false);

        // self.modules.worker.postMessage({ cmd : 'start', data : { storage : self.modules.storage } });

        // self._logger.log('status worker: ' + self.modules.worker);

        //self._logger.log('--- ' + mailmindr.kernel);
        self._logger.log('------- MailmindrKernel initialized -------');
        

        //scope._logger.log('** sysinfo ** running mailmindr on ' + window.navigator);

        self._isInitialized = true;
    }

    this.initialize();
}

MailmindrKernelBase.prototype =  {

    /**
     * setGlobalListeners - set all global listeners that should be
     * registered just once
     */
    setGlobalListeners : function() {
        let scope = this;

        ///
        /// set listener for incoming mail
        ///
        let incomingMailListener = {
            msgAdded: function(msgHeader) {
                if (!msgHeader.isRead) {
                    scope._logger.log('call ***NEW*** msgAdded()');
                    scope.onIncomingMail(msgHeader);
                }
            }
        };

        let notificationService = Components.classes["@mozilla.org/messenger/msgnotificationservice;1"]
            .getService(Components.interfaces.nsIMsgFolderNotificationService);

        notificationService.addListener(
            incomingMailListener,
            notificationService.msgAdded
        );
    },

    /**
     * onIncomingMail - will be troggered when a new e-mail comes in
     * @param aMsgHdr The headers for the new mail
     */
    onIncomingMail: function(aMsgHdr) {
        function range(begin, end) {
            for (let i = begin; i < end; ++i) {
                yield i;
            }
        }

        this._logger.log('call onIncomingMail( ' + (typeof aMsgHdr) + ' )');
    },

    /**
     * refreshMindrsFromStorage - loads all active mindrs from storage
     * filter them by active and pending mindrs and push then into the
     * execution queue
     */
    refreshMindrsFromStorage: function() {

    },


    globalUiErrorHandler: function(whatLogger, whatError) {
        whatLogger.error(whatError);
    },

    attachWindowGlobalUiErrorHandler: function(whatWindow, whatLogger) {
        let self = this;
        whatWindow.onerror = function(e) { 
            self.globalUiErrorHandler(whatLogger, e);
        }
    },

    /**
     * serializeMindr - serializes a mindr object to a json string
     */
    serializeMindr : function(aMindr) {
        return JSON.stringify(aMindr);
    },

    isMindrInList : function(list, mindr) {
        for each(let item in list) {
            this._logger.log('>> search for: ' + mindr.mailmindrGuid + ' // ' + item.mailmindrGuid);
            if (item.mailmindrGuid == mindr.mailmindrGuid) {
                this._logger.log('>> found! ' + mindr.mailmindrGuid + ' == ' + item.mailmindrGuid);
                return true;
            }
        }

        return false;
    },

    reloadMindrFromStorage: function() {
        let list = mailmindrKernel.kernel.modules.storage.loadMindrs();
        let livingMindrs = [];

        while (list.length > 0) {
            let mindr = list.pop();
            let foundMindr = this.getMindrByGuid(this._mindrs, mindr.mailmindrGuid);

            // mindr is already in list
            if (foundMindr != null) {
                //this._logger.log('       already in list: ' + foundMindr.mailmindrGuid + ' w/ : ' + new Date(foundMindr.remindat));
                livingMindrs.push(foundMindr);
            } else {
                this._logger.log('       push to living mindrs list:    ' + mindr.mailmindrGuid);
                livingMindrs.push(mindr);
            }
        }

        // this._logger.log('-> hazMindrs? ' + livingMindrs.length);

        return livingMindrs;
    },

    /**
     * getMindrByGuid - gets the mindr for the given MINDR id
     * @param array mindrs The list of active mindrs
     * @param String mindrs' GUID we look for
     * @returns Object Returns the mindr for the message id or null, if no such mindr can be found
     */
    getMindrByGuid: function(mindrs, mailmindrGuid) {
        for each(let mindr in mindrs) {
            if (mindr.mailmindrGuid == mailmindrGuid) {
                return mindr;
            }
        }

        return null;
    },

    addMindrToPendingList: function(aMindr) {
        this._logger.log('kernel::addMindr: ' + aMindr.mailmindrGuid);
        if (!this.isMindrInList(this._mindrs, aMindr)) {
            this._mindrs.push(aMindr);
        } else {
            this._logger.log('not added: already in list');
        }
    },

    get currentMindrs() {
        if (this._mindrs.length > 0) {
            this._logger.log('> currentMindrs: ' + this._mindrs.length);
            return this._mindrs;
        }

        // load mindrs only at the initialization
        return (this._mindrs = this.reloadMindrFromStorage());
    },

    deleteMindr: function(mindr) {
        this._logger.log('deleteMindr: ' + mindr.mailmindrGuid);
        this._logger.log(' > living mindr before deletion: ' + this._mindrs.length);
        var serializedMindr = JSON.stringify({ mailmindrGuid : mindr.mailmindrGuid });
        var mindrs = [];
        for (var item of this._mindrs) {
            if (item.mailmindrGuid == mindr.mailmindrGuid) {
                continue;
            }

            mindrs.push(item);
        }
        this._mindrs = mindrs;
        this._logger.log(' > living mindr after deletion: ' + this._mindrs.length);

        this.modules.storage.deleteMindr(mindr);
        Services.obs.notifyObservers(null, "mailmindr-deleteMindr-success", serializedMindr);
    }
};

// -- this is the right place to initialize the logger, I think
mailmindrInitializeLogger();

// kick it
if (!mailmindrKernel)    var mailmindrKernel = {};
if (!mailmindrKernel.kernel) mailmindrKernel.kernel = new MailmindrKernelBase();
