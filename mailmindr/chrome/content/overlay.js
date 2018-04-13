/* jshint curly: true, strict: true, multistr: true, moz: true, undef: true, unused: true */
/* global Components, mailmindrLogger, mailmindrSearch */
"use strict";

Components.utils.import("resource://app/modules/Promise.jsm");
Components.utils.import("resource://app/modules/gloda/dbview.js");
Components.utils.import("resource://app/modules/mailServices.js");
Components.utils.import("resource://app/modules/Services.jsm");
Components.utils.import("resource://app/modules/MailUtils.js");
Components.utils.import("resource://app/modules/MailConsts.js");
Components.utils.import("resource://app/modules/folderUtils.jsm");
Components.utils.import("resource://app/modules/iteratorUtils.jsm");

Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");
Components.utils.import("chrome://mailmindr/content/utils/log4moz.jsm");
Components.utils.import("chrome://mailmindr/content/modules/kernel.jsm");
Components.utils.import("chrome://mailmindr/content/utils/core.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");
Components.utils.import("chrome://mailmindr/content/utils/search.jsm");
Components.utils.import("chrome://mailmindr/content/modules/linq.jsm");

if (!mailmindr) var mailmindr = {};
if (!mailmindr.kernel) mailmindr.kernel = [];
if (!mailmindr.worker) {
    mailmindr.worker = new ChromeWorker("chrome://mailmindr/content/mailmindrWorker.js");
    mailmindr.worker.onmessage = function(event) {
        var data = event.data;
        if (data.cmd == 'tick') {
            Services.obs.notifyObservers(null, 'mailmindr-ui-refreshPendingList', null);
        }
    }
}

const MAILMINDR_TIMESPAN_MINUTE = 60000;
const MAILMINDR_TIMESPAN_HOUR = 600000;
const MAILMINDR_GLOBAL_INTERVAL = 5000;

// mailmindr.core.onSelectPendingMindrEnabled = true;

function mailmindrBase(messengerObj, window) {
    this._targetWindow = window;
    this._messenger = messengerObj;
    this._name = "overlay";
    this._instanceName = this._name + Math.random();
    this._initialized = false;
    this._logger = new mailmindrLogger(this, MAILMINDR_LOG_INFO);
}

mailmindrBase.prototype = {
    _service: null,
    _timer: null,
    _count: 0,
    _lastHeaders: "",
    _dialogs: {
        setmindr: null,
        mindralert: null
    },
    _controls: {
        pendingList: null
    },
    _elements: {},
    _viewPendingMindrs: null,

    // handle all data that we have to hold for lists, optionboxes, etc.
    _data: {
        pendingMindrs: [],
        // mindrsInDialog : [],
        // guidInDialog : [],
    },

    // handle all listener functions 
    // _flags: {
    //     onSelectPendingMindrEnabled: true
    // },


    initialize: function() {
        let scope = this;

        this._instanceID = Math.random(7);

        mailmindrKernel.kernel.attachWindowGlobalUiErrorHandler(window, scope._logger);

        /*
		 * okay, webworkers won't work here.
		 * maybe we keep this code and give it another try in next release
		this._service = new Worker("chrome://mailmindr/content/mailmindrWorker.js");
		this._service.addEventListener("message", function onMessage(event) {
				scope.onMessage(event);
			}, false);
		
		this._service.postMessage({});
		*/

        this._logger.log('-- waiting for the storage engine to come up --');
        while (!mailmindrKernel.kernel.modules.storage.Initialized);
        this._logger.log('-- storage up and running --');
        this._logger.log('** sysinfo ** mailmindr running on: ' + window.navigator.userAgent);


        let src = "chrome://mailmindr/locale/utils/overlay.properties";
        let localeService = Components.classes["@mozilla.org/intl/nslocaleservice;1"]
            .getService(Components.interfaces.nsILocaleService);
        let appLocale = localeService.getApplicationLocale();
        let stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
            .getService(Components.interfaces.nsIStringBundleService);

        this._strings = stringBundleService.createBundle(src, appLocale);


        // -- set controls and elements first
        // this._controls.pendingList = new mailmindr.controls.list(document, "mailmindrPendingList"); 
        this._elements.pendingList = document.getElementById("mailmindrPendingList");
        this._elements.list = document.getElementById("mailmindrReplies");
        this._elements.buttonEdit = document.getElementById("mailmindrPendingMindrEditButton");
        this._elements.buttonView = document.getElementById("mailmindrPendingMindrViewButton");
        this._elements.buttonDelete = document.getElementById("mailmindrPendingMindrDeleteButton");

        // -- after that, we initialize the UI
        this.uxSetup();

        // -- now start the engines
        this._reloadMindrs();
        this.setListeners();

        try {
        this._viewPendingMindrs = new mailmindrListView();
        this._elements.pendingList.treeBoxObject.view = this._viewPendingMindrs;

        } catch (x) {
            this._logger.error('--->');
            this._logger.error(x);
        }

        // initilaize sorted mindr list
        var columnName = mailmindrCore.getPreferenceString('sorting.overlay.pendingList.columnName');
        var sortOrder = mailmindrCore.getPreferenceString('sorting.overlay.pendingList.order');
        var sortColumn = document.getElementById(columnName);

        this.sortList(this._elements.pendingList, sortColumn, sortOrder);

        this._logger.log("******* mailmindr successfully initialized the messagewindow *******");

        mailmindr.worker.postmessage({ cmd : 'start' });

        this._initialized = true;
    },

    /**
     * uxSetup - will set all UI elements / initialize with settings
     */
    uxSetup: function() {
        let pendingListSetting = mailmindrCore.getPreferenceInt("common.uiShowPendingList");
        let pendingListIsHidden = false;
        switch (pendingListSetting) {
            case 0: // -- show never
                pendingListIsHidden = true;
                break;
            case 1: // -- show always
                pendingListIsHidden = false;
                break;
        }
        this._elements.list.setAttribute("hidden", pendingListIsHidden);

        // let folderPane = document.getElementById('folderPaneBox');
        // let wrapper = document.getElementById('mailmindrFolderPaneBoxWrapper');

        // wrapper.insertBefore(folderPane, wrapper.firstChild);
        if (mailmindrCore.getPreferenceBool("common.updated")) {
            // mailmindrCore.safeCall(this, this.openVersionChangelog);
        }
    },


    refreshPendingList: function() {
        this._logger.log('overlay::refreshPendingList');
        var _mindrs = this._reloadMindrs();

        // copy lists 
        this._data.pendingList = _mindrs;

        // save selection
        let selectedMindrId = this._viewPendingMindrs.getSelectedMindrGuid();

        // begin update
        //--this._elements.pendingList.treeBoxObject.beginUpdateBatch();

        //--this._viewPendingMindrs.clear();

        let selectedMindrInList = false;
        let activeMindrs = [];
        let listed = [];

        for each(let mindr in _mindrs) {
            if (mindr.RemainingMilliseconds > 0) {
                // check if we have this item already in list
                //--this._viewPendingMindrs.appendData(mindr);
                mindr._details.author = mindr._details.author; //+ this._instanceID;

                listed.push(mindr);
                selectedMindrInList = selectedMindrInList ||  (mindr.mailmindrGuid == selectedMindrId);
            } else {
                activeMindrs.push(mindr);
            }
        }

        this._elements.pendingList.treeBoxObject.beginUpdateBatch();
        this._viewPendingMindrs.updateItems(listed);
        this._elements.pendingList.treeBoxObject.endUpdateBatch();

        var sortOrder = this._elements.pendingList.getAttribute("sortDirection");
        var sortColumn;
        this.sortPendingList(sortColumn, sortOrder);

        //  end update
        //--this._elements.pendingList.treeBoxObject.endUpdateBatch();

        // restore selection: 
        //        if selected mindr is in list, re-select it
        //        select none, otherwise
        /*--
        if (selectedMindrInList) {
            this._viewPendingMindrs.selectMindrByGuid(selectedMindrId);
        } else {
            this._viewPendingMindrs.selection.select(-1);
        }
        --*/
    },


    setListeners: function() {
        var scope = this;

        /*-- >> kernel
        ///
        /// set listener for incoming mail
        ///
        let incomingMailListener = {
            msgAdded: function(msgHeader) {
                if (!msgHeader.isRead) {
                    scope._logger.log('call msgAdded()');
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
        --*/


        ///
        /// set listener for msg selection
        ///
        let threadTree = document.getElementById("threadTree");
        if (threadTree) {
            threadTree.addEventListener('select', function(event) {
                scope.onSelectMessage(event);
            }, false);
        }


        ///
        /// set listener for pending mindr list and its buttons
        ///
        this._elements.pendingList.addEventListener('select', function(event) {
            scope.onSelectPendingMindr(event);
        }, false);
        this._elements.buttonView.addEventListener('click', function(event) {
            scope.onClickMailmindrViewMail();
        }, false);
        this._elements.buttonDelete.addEventListener('click', function(event) {
            scope.onClickMailmindrDeleteMindr();
        }, false);
        this._elements.buttonEdit.addEventListener('click', function(event) {
            scope.onClickMailmindrEditMindr();
        }, false);

        this._elements.pendingList.addEventListener('dblclick', function() {
            mailmindrCore.safeCall(scope, scope.onClickMailmindrViewMail);
        }, false);


        ///
        /// parse X.Message headers
        ///
        this.HeaderStreamListener = {
            onStartRequest: function() {
                scope._lastHeaders = "";
            },

            onStopRequest: function() {},

            onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
                let stream = Components.classes["@mozilla.org/scriptableinputstream;1"]
                    .createInstance(Components.interfaces.nsIScriptableInputStream);
                stream.init(aInputStream);

                let data = stream.read(aCount).replace(/\r/g, "");
                scope._lastHeaders += data;

                let endOfHeader = scope._lastHeaders.indexOf("\n\n");
                if (endOfHeader > 0) {
                    scope._lastHeaders = scope._lastHeaders.substring(0, endOfHeader);

                    let regEx = /X-Message-Flag: (.*)$/img;
                    let xMsgFlagContent = regEx.exec(scope._lastHeaders);

                    if (xMsgFlagContent) {
                        scope._showXMsgHdr(true, xMsgFlagContent[1]);
                        return;
                    }

                    scope._showXMsgHdr(false, '');
                }
            }
        };


        ///
        /// set observers
        ///
        var setMindrSuccessObserver = {
            observe : function(aSubject, aTopic, aData) {
                scope._logger.log('-- [observer] -- new mindr set : ' + aData + ' --');
                var tmp = JSON.parse(aData);
                var newMindr = mailmindrKernel.kernel.modules.storage.findMindrByGuid(tmp.mailmindrGuid);
                if (!newMindr) { scope._logger.log('cannot find mindr for: ' + tmp.mailmindrGuid); return; }
                mailmindrKernel.kernel.addMindrToPendingList(newMindr);
                scope._reloadMindrs();
                scope.refreshPendingList();
            }
        };

        var setMindrDeleteSuccessObserver = {
            observe : function(aSubject, aTopic, aData) {
                scope._logger.log('-- [observer] -- mindr deleted : ' + aData + ' --');
                scope._logger.log(' > TODO: refresh pending list');
            }
        };

        var setUIpendingListRefresh = {
            observe : function(aSubject, aTopic, aData) {
                scope._logger.log('-- [observer] -- rui:refreshPendingList :  --');
                scope._logger.log(' > refresh pending list');
                scope.refreshPendingList();
            }
        };

        Services.obs.addObserver(setMindrSuccessObserver, "mailmindr-setMindr-success", false);
        Services.obs.addObserver(setMindrDeleteSuccessObserver, "mailmindr-deleteMindr-success", false);
        Services.obs.addObserver(setUIpendingListRefresh, 'mailmindr-ui-refreshPendingList', false);
    },

    /**
     * FOR DEBUGGING PURPOSE
     *
	onClickTestButton : function() {
		try
		{
            let msgHdr = gFolderDisplay.selectedMessage;
            MailUtils.displayMessage(msgHdr);
		}
		catch (openException) {
			this._logger.log(openException);
		}

		window.openDialog(
				"chrome://mailmindr/content/windows/pendingMindrs.xul", 
				"testWindow", 
				""
			);
	},
    */

    /**
     * startTimer - will start the (global) timer for mindr execution
     */
    startTimer: function() {
        this._logger.log('START TIMER');
        let scope = this;
        window.setInterval(function() {
            scope.onTick();
        }, MAILMINDR_GLOBAL_INTERVAL);
    },


    /**
     * _enableElement - enabled/disables the target elemnt given by id
     * @returns Returns true if element was found, false otherwise
     */
    _enableElement: function(id, enabled) {
        let target = document.getElementById(id);
        if (target) {
            target.setAttribute('disabled', !enabled);
            return true;
        }
        return false;
    },


    /**
     * onLoad - triggered when mailmindr is loaded
     * intitalization of timers and "first run activities",
     * e.g. setup the toolbar buttons
     */
    onLoad: function() {
        if (!this._initialized) {
            mailmindrCore.safeCall(this, this.initialize);
        }

        let count = mailmindrCore.registerMessengerInstance(this);
        if (count == 0) {
            mailmindrCore.startNextTimer();
        }

        let isFirstRun = mailmindrCore.getPreferenceBool("common.firstRun");
        if (isFirstRun) {
            this.onFirstRun();
        }
    },

    /**
     * onUnload - triggered when a message window instance is closed
     * seems to be a little bit tricky: we only need ONE mailmindr instance
     * connected to a single message window
     *
     * approach:  - if user opens messenger window,
     * 				it will itself register at mailmindrs wnd list
     *			  - if active is closed, we look at the next instance in list
     * 				and start a new mailmindr instance
     */
    onUnload: function() {
        this._logger.info("unregister messenger instance");
        mailmindrCore.unregisterMessengerInstance(this);
        mailmindrCore.startNextTimer();
        this._logger.info("messenger instance unloaded");
        this._logger.info("---------------------------");
    },


    /**
     * onTick - interval trigger for checking mindrs to be executed
     */
    onTick: function() {
        this._count += 1;

        // TODO:
        //  1) reload mindrs
        //  2) execute mindrs
        //  3) set mindrs to performed

        var _mindrs = this._reloadMindrs();
        let activeMindrs = mailmindrCore.getMindrs(_mindrs, 0, Date.now()); // + MAILMINDR_TIMESPAN_MINUTE);

        this._logger.log('reloaded/active: ' + _mindrs.length + '/' + activeMindrs.length);

        // merge mindrs:
        // active mindrs and mindrs already shown in dialog
        let showActiveMindrs = false;
        for each(let mindr in activeMindrs) {

            if (mailmindrCore.addMindrToDialog(mindr)) {
                showActiveMindrs = true;
            }
            // let guid = mindr.mailmindrGuid;

            // if (this._data.guidInDialog.indexOf(guid) < 0) {
            // 	this._data.mindrsInDialog.push(mindr);
            // 	this._data.guidInDialog.push(guid);

            // 	showActiveMindrs = true;
            // } else {
            //              this._logger.log('onTick :: mindr is already in list: ' + guid);
            //          }
        }

        if (showActiveMindrs) {
            // this._logger.log('show reminder alert for: ' + this._data.mindrsInDialog);
            this.showMindrAlert(mailmindrCore.getMindrsInDialog());
        }

        for each(let mindr in activeMindrs) {
            mailmindrCore.queueMindrForExecution(mindr);
        }

        this.refreshPendingList();
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

        let pendingList = this._reloadMindrs();

        let msgId = aMsgHdr.messageId;
        let waitingMessages = mailmindrCore.getMessageIdsWaitingForReply(pendingList);

        this._logger.log(' #> try getting references');
        let refCount = aMsgHdr.numReferences;
        this._logger.log(' #> (ok)');


        if (refCount == 0) {
            //
            // we got no references, so leave here
            // 

            this._logger.log("## message has no references");
            return;

            // unreachable code -- let incomingSubject = aMsgHdr.mime2DecodedSubject;

            /*
             * TODO: get feedback from users - if reference stuff won't work,
             * check
             * - subjects
             * - X-Reply-To
             */
        }

        if (refCount > 0) {
            // we have some references, so get folder and DB
            let folder = aMsgHdr.folder;
            let folderURI = folder.URI;
            let messageURI = folder.getUriForMsg(aMsgHdr);
        }

        let isReplyForWaitingMail = false;

        this._logger.log('   refCount: ' + refCount);

        // parse thru references
        let references = [];
        try {
            this._logger.log('get ref by gloda');
            if (amsgHeader.numReferences > 0) {
                let numberOfReferences = [0, ...aMsgHdr.numReferences];
                // references = [aMsgHdr.getStringReference(i) for each(i in range(0, aMsgHdr.numReferences))];
                references = numberOfReferences.map(i => aMsgHdr.getStringReference(i));
                this._logger.log('gloda successful.');
                this._logger.log(this._logger.explode(references));
                this._logger.log('gloda exploded.');
            } else {
                this._logger.log('no references');
            }
        } catch (referenceException) {
            this._logger.error('cannot get reference(s)');
            this._logger.error(referenceException);
        }

        this._logger.log('found # references: ' + references.length);
        try {
            for each(let[, reference] in Iterator(references)) {
                this._logger.log('  #> searching for reference "' + reference + '"');

                let index = waitingMessages.indexOf(reference);

                if (index < 0) {
                    this._logger.log('     reference search index less than zero');
                    this._logger.log('     next reference.');
                    continue;
                }

                this._logger.log('reference found.');

                try {
                    let mindr = mailmindrCore.getMindrForMessageId(pendingList, reference);
                    if (mindr == null) {
                        this._logger.log("no mindr found for " + reference);
                        continue;
                    }

                    mindr.IsReplyAvailable = true;

                    let reply = mailmindrKernel.kernel.modules.factory.createReplyObject();
                    reply.mailguid = msgId;
                    reply.replyForMindrGuid = mindr.mailmindrGuid;
                    reply.receivedAt = aMsgHdr.dateInSeconds;
                    reply.sender = aMsgHdr.mime2DecodedAuthor;
                    reply.recipients = aMsgHdr.recipients;

                    this._logger.log('reference found. created reply: ');
                    this._logger.log(' ' + this._logger.explode(reply));
                    this._logger.log('reply exploded.');

                    mailmindrKernel.kernel.modules.storage.saveReply(reply);
                } catch (ex) {
                    this._logger.error('+>');
                    this._logger.error(ex);
                }


                this._reloadMindrs();

            } // -- end for
        } catch (iterex) {
            this._logger.error('iteration failed.');
            this._logger.error(iterex);
        }

    },


    /**
     * FOR FUTURE USE WITH A DOM WORKER
     * triggered when one or more mindrs should be performed
     */
    onMindr: function(event) {
        if (!event.data) {
            return;
        }
    },


    /**
     * onToggleMessageTagKey - Triggered when a tag/flag key is pressed
     * checks if user configured the "set mindr on tag key" feature in settings
     */
    onToggleMessageTagKey: function(aKey) {
        /* check if message is tagged by this key, if not, tag it and raise event */

        // found the key, now toggle its state
        let msgHdr = gFolderDisplay.selectedMessage;
        let currentKeys = msgHdr.getStringProperty("keywords");

        // check if the mail has got the label, if not, toggle 
        if ((" " + currentKeys + " ").indexOf(" $label" + aKey + " ") < 0) {
            /* raise event */
            if (mailmindrCore.getPreferenceBool('common.setMindrOnTag') && (mailmindrCore.getPreferenceString('common.setMindrOnTagSelectedTag') == '$label' + aKey)) {
                let timespan = mailmindrCore.getPreferenceString('common.setMindrOnTagSelectedTimespan');
                this.onToggleMindr(timespan);
            }
        }

        return ToggleMessageTagKey(aKey);
    },


    /**
     * activate mindr for selected message(s)
     */
    onToggleMindr: function() {
        if (gFolderDisplay.selectedCount != 1) {
            this._logger.log('no mail for resubmission selected.');
            return;
        }

        this.doSetMindrForMsg(gFolderDisplay.selectedMessage);
    },

    onToggleMindrFromMailHeader: function() {
        this.doSetMindrForMsg(gFolderDisplay.selectedMessage);
    },

    doSetMindrForMsg: function(aMsg) {
        let tsid = mailmindrCore.getPreferenceString('common.setMindrDefaultSelectedTimespan');
        if (arguments.length > 1) {
            tsid = arguments[1];
        }

        let actionJson = mailmindrCore.getPreferenceString('common.action.default');
        let action = null;
        if (actionJson.length > 0) {
            action = JSON.parse(actionJson);
        }

        let timespan = this._getSerializedTimespanFromSettings(tsid);
        let selected = aMsg; 
        let scope = this;
        let data = {
            data: {
                selectedMail: selected,
                selectedTimespan: timespan,
                selectedAction: action,
                mindr: null
            },
            out: null
        };

        this.setMindr(data);
    },

    setMindr: function(data) {
        var dialog = mailmindrCommon.getWindow("mailmindr:setmindr");
        if (dialog) {
            this._logger.log('recycling setMindr dialog');
            this._dialogs.setmindr.focus();
        } else {
            // this cannot be a modal dialog - mindrs can raise a dialog to show during execution
            try {
            this._dialogs.setmindr = window.openDialog(
                "chrome://mailmindr/content/dialogs/setmindr.xul",
                "setMindr",
                "chrome, resizeable=false, dependent=true, chrome=yes, centerscreen=yes",
                data
            );
            } catch (x) {
                this._logger.error('exception thrown in set mindr dlg');
                this._logger.error(x);
            }
        }
    },


    /**
     * onSelectMessage - triggered when one or more messages in messenger window
     * are selected by the user. In case of only one selected message the routine
     * is looking for the outlook headers. This process is started with the CopyMessage-stuff.
     */
    onSelectMessage: function(event) {
        this._logger.log('msg selected');
        if (gFolderDisplay.selectedCount != 1) {
            this._logger.log('disable button');
            this._enableElement("mailmindrCmdToggleMindr", false);
            return;
        }

        // activate mailmindr buttons
        this._enableElement("mailmindrCmdToggleMindr", true);

        // check if we have an X-Message-Flag
        let msgHdr = gFolderDisplay.selectedMessage;
        let msgURI = gDBView.URIForFirstSelectedMessage;

        // check if we have a mindr set for this message
        let mindrList = this._reloadMindrs();
        let messageId = msgHdr.messageId;
        let mindr = mailmindrCore.getMindrForMessageId(mindrList, messageId);

        if (mindr) {
            this.showMindrNotes(mindr);
        } else {
            this.showMindrNotes(null);
        }

        if (msgURI == null) {
            return;
        }

        let msgService = messenger.messageServiceFromURI(msgURI);

        msgService.CopyMessage(
            msgURI,
            this.HeaderStreamListener,
            false,
            null,
            msgWindow, {}
        );
    },

    /**
     * onSelectPendingMindr - triggered when a mindr in pending list is selected
     * tasks: 	- select the mindr's message and folder
     */
    onSelectPendingMindr: function(event) {
        let mindrGuid = this._viewPendingMindrs.getSelectedMindrGuid();
        let buttonDisabled = mindrGuid == null;

        this._elements.buttonEdit.disabled = buttonDisabled;
        this._elements.buttonView.disabled = buttonDisabled;
        this._elements.buttonDelete.disabled = buttonDisabled;

        return;
    },


    /**
     * triggered when a mindr is selected and the view mail button is pressed
     */
    onClickMailmindrViewMail: function() {
        let mindr = this._viewPendingMindrs.findSelectedMindr();
        this._logger.log('trying to open message for mindr: ' + mindr);
        if (mindr && mindr.details) {
            this._logger.log('open mail for mindr: ' + mindr);
            let headers = mailmindrSearch.getMessageHdrByMessageId(mindr.mailguid);
            if (headers.length == 0) {
                return;
            }

            let hdr = headers[0];
            this.openMessageInNewWindow(hdr);
        }
    },


    /**
     * triggered when a mindr is selected and the 'delete mindr' button is pressed
     */
    onClickMailmindrDeleteMindr: function() {
        let mindrGuid = this._viewPendingMindrs.getSelectedMindrGuid();

        if (null == mindrGuid) {
            return;
        }

        var _mindrs = this._reloadMindrs();
        let mindr = mailmindrCore.getMindrByGuid(_mindrs, mindrGuid);

        let promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);

        let title = this._strings.GetStringFromName("mailmindr.overlay.mindr.delete.title");
        let text = this._strings.GetStringFromName("mailmindr.overlay.mindr.delete.text");

        if (promptService.confirm(null, title, text)) {
            mailmindrKernel.kernel.deleteMindr(mindr);
        }
    },


    onClickMailmindrEditMindr: function() {
        try {
            let mindrGuid = this._viewPendingMindrs.getSelectedMindrGuid();

            if (null == mindrGuid) {
                this._logger.log('no mindr selected for edit');
                return;
            }

            let scope = this;
            let _mindrs = this._reloadMindrs();
            let mindr = mailmindrCore.getMindrByGuid(_mindrs, mindrGuid);
            let msgGuid = mindr.mailguid;
            let headers = mailmindrSearch.getMessageHdrByMessageId(msgGuid);
            
            if (headers.length == 0) {
                this._logger.log('cannot edit mindr - the message is gone.');
                return;
            }

            // we just need the first mail header
            let msghdr = headers[0];

            /* calc timespan */
            let delta = mindr.RemainingMilliseconds;
            let ts = this._calculateDaysHoursMinutes(delta);

            let timespan = ts.days + ";" + ts.hours + ";" + ts.minutes + ";false";
            this._logger.log('edit: ' + timespan);

            let data = {
                callback: function(result) {
                    scope.onSetMindrCallback(result);
                },
                data: {
                    selectedMail: msghdr,
                    selectedTimespan: null,
                    mindr: mindr
                },
                out: null
            };

            this._logger.log('show edit mindr dialog');
            this.setMindr(data);
        } catch (editException) {
            this._logger.error(editException);
        }
    },


    selectMailMessageByMindr: function(mindr) {
        let msgGuid = mindr.mailguid;
        let headers = mailmindrSearch.getMessageHdrByMessageId(msgGuid);

        if (headers.length == 0) {
            this._logger.log('cannot select the message - the message seems to be gone. sorry.');
            return;
        }

        let msg = headers[0];
        this.selectMessageByMessageHeader(msg);
    },


    selectMessageByMessageHeader: function(messageHeader) {
        this._logger.log('trying to select message for mindr: ' + messageHeader);
        SelectFolder(messageHeader.folderUri);
        gFolderDisplay.selectMessage(messageHeader.hdr);
    },


    openMessageInNewWindow: function(messageHeader) {
        let folder = messageHeader.folder;
        let folderURI = folder.URI;
        let messageURI = folder.getUriForMsg(messageHeader);

        try {
            //MailUtils.openMessageInNewWindow(messageHeader.hdr); //, gFolderDisplay);
            MailUtils.displayMessage(messageHeader.hdr);
        } catch (e) {
            this._logger.error(e);
        }
    },

    showMindrAlert: function(mindrs) {
        let dead = [];
        let scope = this;

        /*
            we assume that all mindrs are active mindrs,
            because we cannot really decide whether a mail
            still exists or not
         */
        let living = mindrs;


        
        // let living = mindrs.filter(function(mindr) {
        //     // mial for this mindr still exists
        //     if (mindr.MailExists) {
        //         // do we have to show a dialog? if not >> don't add to list
        //         scope._logger.log('LIVING mindr: ' + mindr.mailmindrGuid);
        //         return mindr.doShowDialog;
        //     }

        //     // we can't find a mail for this mindr >> remove from storage
        //     dead.push(mindr);
        //     return false;
        // });

        // if (dead.length > 0) {
        //     mailmindrCore.deleteMindrs(dead);
        // }
        

        if (living.length == 0) {
            return;
        }

        let data = {
            list: living,
            openMessageFunction: this.openMessageInNewWindow,
            selectMessageFunction: this.selectMessageByMessageHeader,
            sender: this,
            out: null
        };

        let wnd = mailmindrCommon.getWindow("mailmindr:alert");
        let alertDialog;
        
        if (wnd) {
            this._logger.log('alert window already open, must reload data');
            var listOfGuids = Enumerable.from(mindrs).select(mindr => mindr.mailmindrGuid).toArray();
            var serializedMindrs = JSON.stringify(listOfGuids);

            Services.obs.notifyObservers(null, "mailmindr-mindrAlert-pushMindrsToDialog", serializedMindrs);
        } else {
            alertDialog = window.openDialog(
                "chrome://mailmindr/content/dialogs/mindrAlert.xul",
                "mindrAlert",
                "chrome, resizeable=true, dependent=true, chrome=yes, centerscreen=yes, width=650, height=300",
                data
            );
        }

        (wnd || alertDialog).focus();
    },


    doCmdPreferences: function() {
        window.openDialog('chrome://mailmindr/content/preferences/preferences.xul', 'Preferences', '', 'mmrPaneActions');
    },

    /** 
     * onFirstRun - triggered only on the FIRST(!) run of mailmindr
     * setup the toolbar buttons, etc.
     */
    onFirstRun: function() {
        /* TODO: set up all buttons/toolbars */
        this._installButton("mail-bar3", "mailmindrButtonToggleMindr");

        mailmindrCore.setPreferenceBool("common.firstRun", false);
    },

    openVersionChangelog: function() {
        AddonManager.getAddonByID("mailmindr@arndissler.net", function(addon) {
            // Add tab, then make active
            let tab = document.getElementById("");
            let tabmail = window.document.getElementById("tabmail");
            let newTab = tabmail.openTab("contentTab", {
                contentPage: "http://mailmindr.net/jump/v" + addon.version
            });
        });
    },


    /**
     * _showXMsgHdr - shows the additional header with outlooks x-message
     */
    _showXMsgHdr: function(show, value) {
        let xMsgHeaderPane = document.getElementById("mailmindrShowXMsg");
        let xMsgHeaderLabel = document.getElementById("mailmindrXMsgLabel");

        xMsgHeaderPane.setAttribute("hidden", !show);
        xMsgHeaderLabel.value = value;
    },

    showMindrNotes: function(aMindr) {
        let pane = document.getElementById("mailmindrNotes");
        let label = document.getElementById("mailmindrNotesLabel");
        let value = aMindr == null ? '' : aMindr.details.note;
        let show = aMindr != null && value.length > 0;

        pane.setAttribute("hidden", !show);
        // label.innerHTML = value.replace("\n", "<html:br/>");
        label.textContent = value;
    },


    _getSerializedTimespanFromSettings: function(timespanId) {
        if (timespanId.substr(0, 1) == '#') {
            return timespanId.substr(1);
        }

        let timespan = mailmindrKernel.kernel.modules.storage.loadTimespan(timespanId);
        if (timespan != null) {
            return timespan.serialize();
        }

        return null;
    },

    _calculateDaysHoursMinutes: function(delta) {
        let x = delta / 1000
        let seconds = x % 60
        x = Math.floor(Math.abs(x / 60));
        let minutes = x % 60
        x = Math.floor(Math.abs(x / 60));
        let hours = x % 24
        x = Math.floor(Math.abs(x / 24));
        let days = x;

        return {
            days: days,
            hours: hours,
            minutes: minutes,
            seconds: seconds
        }
    },

    /**
     * _reloadMindrs - shortcut for mailmindrKernel.kernel.modules.storage.loadMindrs();
     */
    _reloadMindrs: function() {
        return mailmindrKernel.kernel.currentMindrs;
    },


    /**
     * Installs the toolbar button with the given ID into the given
     * toolbar, if it is not already present in the document.
     *
     * URL: https://developer.mozilla.org/en/Code_snippets/Toolbar
     *
     * @param {string} toolbarId The ID of the toolbar to install to.
     * @param {string} id The ID of the button to install.
     * @param {string} afterId The ID of the element to insert after. @optional
     */
    _installButton: function(toolbarId, id, afterId) {
        if (!document.getElementById(id)) {
            var toolbar = document.getElementById(toolbarId);

            // If no afterId is given, then append the item to the toolbar
            var before = null;
            if (afterId) {
                let elem = document.getElementById(afterId);
                if (elem && elem.parentNode == toolbar) {
                    before = elem.nextElementSibling;
                }
            }

            toolbar.insertItem(id, before);
            toolbar.setAttribute("currentset", toolbar.currentSet);
            document.persist(toolbar.id, "currentset");

            if (toolbarId == "addon-bar") {
                toolbar.collapsed = false;
            }
        } else {
            this._logger.log('cannot find toolbar');
        }
    },

    /**
     * sort(column) - 
     * 
     * core code taken from: https://developer.mozilla.org/en/docs/Sorting_and_filtering_a_custom_tree_view
     */
    sortList: function(aTree, aColumn, aSortOrder) {
        try { 
            var columnName;
            var order = (aSortOrder ? aSortOrder : aTree.getAttribute("sortDirection")) == "ascending" ? 1 : -1;
            var treeView = aTree.treeBoxObject.view;
            var getSortOrder = function(aOrder) {
                return aOrder == 1 ? "ascending" : "descending";
            }
            
            //if the column is passed and it's already sorted by that column, reverse sort
            if (aColumn) {
                columnName = aColumn.id;
                if (aTree.getAttribute("sortResource") == columnName) {
                    if (!aSortOrder) {
                        order *= -1;
                    }
                }
            } else {
                columnName = aTree.getAttribute("sortResource");
            }

            // do the sort
            this._logger.log('---=======---');
            //this._logger.log(this._logger.explode(treeView));
            this._logger.log('sort by' + columnName + ' ' + getSortOrder(order));
            this._viewPendingMindrs.sortByColumn(columnName, order);
            this._logger.log('---=======---');

            //setting these will make the sort option persist
            aTree.setAttribute("sortDirection", getSortOrder(order));
            aTree.setAttribute("sortResource", columnName);

            //set the appropriate attributes to show to indicator
            var cols = aTree.getElementsByTagName("treecol");
            for (var i = 0; i < cols.length; i++) {
                cols[i].removeAttribute("sortDirection");
            }

            var sortDirection = getSortOrder(order);
            aColumn.setAttribute("sortDirection", sortDirection);

            mailmindrCore.setPreferenceString('sorting.overlay.pendingList.columnName', columnName);
            mailmindrCore.setPreferenceString('sorting.overlay.pendingList.order', sortDirection);
        } catch (sortException) {
            this._logger.error(sortException);
        }
    },

    sortPendingList: function(aColumn, aSortOrder) {
        var column = aColumn || document.getElementById(this._elements.pendingList.getAttribute('sortResource'));
        this.sortList(this._elements.pendingList, column, aSortOrder);
    }
}

window.addEventListener("load", function onLoad() {
    mailmindr.base = /* mailmindr.base || */ new mailmindrBase(messenger, window);
    mailmindr.base.onLoad();
}, false);

window.addEventListener("unload", function onLoad() {
    mailmindr.base.onUnload();
}, false);