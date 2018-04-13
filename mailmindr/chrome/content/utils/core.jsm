/* jshint curly: true, strict: true, multistr: true, moz: true, undef: true, unused: true */
/* global Components, mailmindrLogger, mailmindrSearch, mailmindrFactory */
"use strict";

let EXPORTED_SYMBOLS = ["mailmindrCore"];

Components.utils.import("resource://gre/modules/PluralForm.jsm");
Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");
Components.utils.import("chrome://mailmindr/content/utils/search.jsm");
Components.utils.import("chrome://mailmindr/content/modules/kernel.jsm");

function MailmindrCoreBase() {
    this._messengerInstances = [];
    this._name = "mailmindrCore";
    this._logger = new mailmindrLogger(this);
    this.initialize();

    let self = this;
    self._logger.enabled = true;
}

MailmindrCoreBase.prototype = {

    data: {
        mindrsInDialog: [],
        mindrExecutionQueue: []
    },

    initialize: function() {
        this._logger.log('mailmindrCore::initialize');
        let src = "chrome://mailmindr/locale/utils/core.properties";
        let localeService = Components.classes["@mozilla.org/intl/nslocaleservice;1"]
            .getService(Components.interfaces.nsILocaleService);
        let appLocale = localeService.getApplicationLocale();
        let stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
            .getService(Components.interfaces.nsIStringBundleService);

        this._strings = stringBundleService.createBundle(src, appLocale);
    },

    require: function(targetNamespace, scriptLocation) {
        let bufferNS = {};
        Components.utils.import(scriptLocation, bufferNS);

        for (let item in bufferNS) {
            targetNamespace[item] = bufferNS[item];
        }
    },


    safeCall: function(caller, func) {
        let name = caller._name;

        this._logger.log('safeCall::from: ' + caller._name || 'undefined');

        try {
            func.call(caller);
        } catch (safeCallException) {
            this._logger.error('ERROR in safeCall :: ' + name);
            this._logger.error(safeCallException);
        }
    },


    /**
     * adds a new messenger instance to the global messenger counter
     * @params messenger A Messenger instance
     * @returns number of registered messengers (without the new messenger)
     */
    registerMessengerInstance: function(instance) {
        this._messengerInstances.push(instance);
        return this._messengerInstances.length - 1;
    },


    /**
     * unregisters a mesenger from the global messenger list
     */
    unregisterMessengerInstance: function(messenger) {
        this._messengerInstances.pop(messenger);
    },

    /** 
     * gets the acive messenger instance
     */
    getMessengerInstance: function() {
        return this._messengerInstances[this._messengerInstances.length - 1];
    },


    /**
     * startNextTimer - starts the timer for the next messenger instance
     */
    startNextTimer: function() {
        if (this._messengerInstances.length > 0) {
            this._messengerInstances[0].startTimer();
        }
    },


    /**
     * createSystemTimespans - creates a list (array) of timespans
     * with 7 days and 7 hours
     */
    createSystemTimespans: function() {
        let systemTimespans = [];

        /* create a seven day lookahead */
        for (let days = 1; days <= 7; days++) {
            let item = mailmindrKernel.kernel.modules.factory.createTimespan();
            item.days = days;
            item.text = item.toRelativeString();
            item.isGenerated = true;
            systemTimespans.push(item);
        }

        /* create a 6 hour window */
        for (let hours = 1; hours < 7; hours++) {
            let item = mailmindrKernel.kernel.modules.factory.createTimespan();
            item.hours = hours;
            item.text = item.toRelativeString();
            item.isGenerated = true;
            systemTimespans.push(item);
        }

        return systemTimespans;
    },

    /**
     * createSystemActions - create an array of system actions:
     * - mark unread
     * - show dialog
     * - tag message with ..
     *
     * tryout: if first argument is a document object we create a colored list of tags
     */
    createSystemActions: function(options) {
        let actions = [];
        let actionTpl = {};
        let mailmindrFactory = mailmindrKernel.kernel.modules.factory;
        // let doc = arguments.length > 0 ? arguments[0] : null;
        let doc = options && typeof(options.document) != "undefined" ? options.document : null;

        // the "noop" action
        if (options && options.canBeDeactivated) {
            actionTpl = mailmindrFactory.createActionTemplate();
            actionTpl.id = -1; // flag the "nop"-action with id -1 
            actionTpl.text = this._strings.GetStringFromName("mailmindr.utils.core.actiontemplate.donothing");
            actionTpl.isGenerated = true;
            actions.push(actionTpl);
        }

        // create a "flag mail" item
        actionTpl = mailmindrFactory.createActionTemplate();
        actionTpl.text = this._strings.GetStringFromName("mailmindr.utils.core.actiontemplate.flag");
        actionTpl.isGenerated = true;
        actionTpl.doMarkFlag = true;
        actions.push(actionTpl);

        // create a "mark mail unread" item
        actionTpl = mailmindrFactory.createActionTemplate();
        actionTpl.text = this._strings.GetStringFromName("mailmindr.utils.core.actiontemplate.markunread");
        actionTpl.isGenerated = true;
        actionTpl.doMarkAsUnread = true;
        actions.push(actionTpl);

        // create a "no action" action - for reminders 
        actionTpl = mailmindrFactory.createActionTemplate();
        actionTpl.text = this._strings.GetStringFromName("mailmindr.utils.core.actiontemplate.reminderonly");
        actionTpl.isGenerated = true;
        actionTpl.doShowDialog = true;
        actionTpl.doMarkFlag = false;
        actions.push(actionTpl);

        // create an action "mark with tag (iterate all tags)"
        let tags = mailmindrCommon.getAllTags();

        for each(let tag in tags) {
            let actionTpl = mailmindrFactory.createActionTemplate();
            let text = this._strings.GetStringFromName("mailmindr.utils.core.actiontemplate.tag");
            let label = tag.tag;

            // TODO: color up the items
            if (doc != null) {
                let item = doc.createElement("menuitem");
                let txt = doc.createTextNode(tag.tag);
                let e = doc.createElement("span");
                let a = doc.createAttribute("style");

                a.nodeValue = "font-weight: bold; color: " + tag.color;
                e.setAttributeNode(a);

                item.appendChild(txt);
                item.appendChild(e);

                actionTpl.htmlElement = item;
            }

            actionTpl.text = text.replace("#1", tag.tag);
            actionTpl.isGenerated = true;
            actionTpl.doTagWith = tag.key;

            actions.push(actionTpl);
        }


        // create tag with "move to folder"
        let folder = (options && options.isSentFolder) ? mailmindrCore.getPreferenceString("common.targetFolderSent") : mailmindrCore.getPreferenceString("common.targetFolderIncoming");

        if (folder.length > 0) {
            let actionTplMove = mailmindrFactory.createActionTemplate();
            let textMove = this._strings.GetStringFromName("mailmindr.utils.core.actiontemplate.domove");
            let textCopy = this._strings.GetStringFromName("mailmindr.utils.core.actiontemplate.docopy");

            actionTplMove.text = textMove.replace("#1", mailmindrCore.getFolder(folder).prettyName);
            actionTplMove.isGenerated = true;
            actionTplMove.doMoveOrCopy = 1;
            actionTplMove.targetFolder = folder;

            actions.push(actionTplMove);

            let actionTplCopy = mailmindrFactory.createActionTemplate();
            actionTplCopy.text = textCopy.replace("#1", mailmindrCore.getFolder(folder).prettyName);
            actionTplCopy.isGenerated = true;
            actionTplCopy.doMoveOrCopy = 2;
            actionTplCopy.targetFolder = folder;

            actions.push(actionTplCopy);
        }


        if (options && options.canBeUserDefined) {
            let actionTpl = mailmindrFactory.createActionTemplate();
            actionTpl.id = -2;
            actionTpl.text = this._strings.GetStringFromName("mailmindr.utils.core.actiontemplate.userdefined");
            actionTpl.isGenerated = true;
            actions.push(actionTpl);
        }

        return actions;
    },


    /**
     * createMindrWithAction - create a mindr object
     * and initializes it with the given action
     * @returns
     */
    createMindrWithAction: function(action) {
        let mindr = mailmindrKernel.kernel.modules.factory.createMindr();
        return action.copyTo(mindr);
    },

    /**
     * saveMindr - save a mindr to the database
     */
    saveMindr: function(mindr) {
        mailmindrKernel.kernel.modules.storage.saveMindr(mindr);
    },

    /**
     * removes a midr from the database
     */
    deleteMindr: function(mindr) {
        mailmindrKernel.kernel.modules.storage.deleteMindr(mindr);
    },

    deleteMindrs: function(mindrList) {
        for each(let item in mindrList) {
            this.deleteMindr(item);
        }
    },

    /**
     * getMindrByLookAhed - gets mindrs within a timespan
     * @returns array of mindrs
     */
    getMindrsByLookAhead: function(mindrs, minTime, maxTime) {
        var pending = new Array();
        var now = Date.parse(new Date());

        return this.getMindrs(mindrs, now + minTime, now + maxTime);
    },

    /**
     * getMindrs - gets mindrs within the absolute timestamps absMin and absMax
     */
    getMindrs: function(mindrs, absMin, absMax) {
        let pending = new Array();
        if (absMin >= absMax) {
            return pending;
        }

        for (var idx = 0; idx < mindrs.length; idx++) {
            var evt = mindrs[idx];
            if ((evt.remindat >= absMin) && (evt.remindat < absMax) && (evt.id > 0)) {
                pending.push(evt);
            }
        }
        return pending;
    },


    /**
     * getMessageIdsWaitingForReply - gets all messageids for outgoing mails with a mindr
     */
    getMessageIdsWaitingForReply: function(mindrs) {
        this._logger.log('call getMessageIdsWaitingForReply(' + (mindrs.length) + ')');
        let result = new Array();

        for each(let mindr in mindrs) {
            if (mindr.waitForReply) {
                result.push(mindr.mailguid);
            }
        }

        this._logger.log('getMessageIdsWaitingForReply -> ' + result.length);
        this._logger.log('reply: ' + this._logger.explode(result));
        return result;
    },

    /**
     * getMindrForMessageId - gets the mindr for the given message id
     * @param array mindrs The list of active mindrs
     * @param String messageId The Message Id we look for
     * @returns Object Returns the mindr for the message id or null, if no such mindr can be found
     */
    getMindrForMessageId: function(mindrs, messageId) {
        if ((mindrs == null) || (mindrs.length == 0)) {
            this._logger.warn('call getMindrForMessageId w/ <null>');
            return null;
        }

        this._logger.log('call getMindrForMessageId(.., ' + messageId + ')');
        for each(let mindr in mindrs) {
            this._logger.log('  .  ' + mindr.mailguid + '/' + mindr.mailmindrGuid);
            if (mindr.mailguid == messageId) {
                this._logger.log('getMindrForMessageId -> ' + mindr.mailguid + ' (by msg id: ' + messageId + ')');
                return mindr;
            }
        }

        this._logger.log('getMindrForMessageId -> <null> (by msg id: ' + messageId + ')');

        return null;
    },

    /**
     * getMindrByGuid - gets the mindr for the given MINDR id
     * @param array mindrs The list of active mindrs
     * @param String messageId The Message Id we look for
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

    queueMindrForExecution: function(mindr) {
        let position = this.data.mindrExecutionQueue.length;
        this._logger.log('queing mindr for execution at pos #' + position);
        this.data.mindrExecutionQueue.push(mindr);

        if (position == 0) {
            this.executeNextMindr();
        }
    },

    executeNextMindr: function() {
        let mindr = this.data.mindrExecutionQueue.shift();
        if (mindr) {
            this._logger.log('mindr from queue, ready for execution');
            this.executeMindr(mindr);
            return;
        } 

        this._logger.log('queue empty');
    },

    /**
     * executes a mindr:
     * - copy to folder
     * - move to folder
     * - flag with keyword
     * - markAsUnread
     * - markFlagged
     * @param object mindr The mindr object to execute
     * @returns true if action object is valid and maybe executed, false otherwise (mindr is null)
     */
    executeMindr: function(mindr) {
        try {
            this._logger.log('exec mindr');
            let self = this;

            /* 
             * if mindr is already executed and we haven't to show a dialog,
             * we can remove it from the storage. this is also done at the end
             * of this routine. this one is here because we have some old mindrs
             * which are already executed but not removed from storage
             */
            let mindrDoNotShowDialog = !mindr.doShowDialog;

            if (mindr.performed && mindrDoNotShowDialog) {
                this._logger.log('mindr ALREADY showed and PERFORMED (will be deleted): ' + mindr.mailmindrGuid);

                mailmindrKernel.kernel.deleteMindr(mindr);

                return false;
            }

            /*
             * get msg headers and execute actions
             */
            if (!mindr.performed) {
                let messages = mailmindrSearch.getMessageHdrByMessageId(mindr.mailguid);

                if (messages == null || messages.length == 0) {
                    this._logger.error('mindr wants to be executed - but the mail is lost. I don\'t know what to do. Will try again later.');
                    return false;
                }

                for each(let msg in messages) {
                    let _logMarker = 'mindr ' + mindr.mailmindrGuid;
                    this._logger.log(_logMarker + ' will be executed');

                    _logMarker = '  ' + _logMarker;
                    
                    let headers = Components.classes["@mozilla.org/array;1"]
                        .createInstance(Components.interfaces.nsIMutableArray);

                    headers.appendElement(msg.hdr, false);

                    // doMarkAsUnread
                    if (mindr.doMarkAsUnread) {
                        this._logger.log(_logMarker + ' mark as unread');
                        msg.folder.markMessagesRead(headers, false);
                    }

                    // flag/star this message
                    if (mindr.doMarkFlag) {
                        this._logger.log(_logMarker + ' mark as flagged');
                        msg.folder.markMessagesFlagged(headers, true);
                    }

                    // doTagWith
                    let tag = mindr.doTagWith;
                    if (tag.length > 0) {
                        this._logger.log(_logMarker + ' mark w/ keyword');
                        msg.folder.addKeywordsToMessages(headers, tag);
                    }

                    // write all operations to folder and release folder database
                    this._logger.log('forcing a closed DB before moving');
                    msg.folder.ForceDBClosed();
                    msg.folder.msgDatabase = null;

                    // start move || copy
                    let moveOrCopy = mindr.doMoveOrCopy || 0;
                    let targetURI = mindr.targetFolder;
                    let sourceURI = msg.folderUri;

                    if (mindr.isInboxZero) {
                        // move mindr back to origin folder - using existing mechanisms.
                        moveOrCopy = 1;
                        targetURI = mindr.originFolderURI;

                        this._logger.log('mindr isInboxZero');
                        // this._logger.log('mindr thinks, mail is here: ' + mindr.details.hdr.folder.)
                        this._logger.log(' move from: ' + sourceURI);
                        this._logger.log(' move to  : ' + targetURI);
                    }

                    // do copy or move mail
                    if (
                        (moveOrCopy > 0) && (targetURI.length > 0) && (targetURI != sourceURI)
                    ) {
                        this._logger.log('try move or copy: ' + moveOrCopy);
                        try {
                            let folderURI = targetURI;

                            let destFolder = this.getFolder(folderURI);
                            let srcFolder = this.getFolder(sourceURI);

                            let copyListener = {
                                OnStartCopy: function() {},
                                OnProgress: function(aProgress, aProgressMax) {},
                                SetMessageKey: function(aKey) {},
                                SetMessageId: function(aMessageId) {},
                                OnStopCopy: function(aStatus) {
                                    self._logger.log('copy stopped: rleleasing msg databases.');
                                    // release db to prevent leaking
                                    destFolder.ForceDBClosed();
                                    srcFolder.ForceDBClosed();
                                    destFolder.msgDatabase = null;
                                    srcFolder.msgDatabase = null;

                                    // refresh information in mindr (hdrs, etc)
                                    //mindr.resetDetails();

                                    // Check: message successfully copied.
                                    self._logger.log('copied successfully. checking for new mindrs to execute.');
                                    self.executeNextMindr();
                                }
                            };

                            let copyService = Components.classes["@mozilla.org/messenger/messagecopyservice;1"]
                                .getService(Components.interfaces.nsIMsgCopyService);

                            if (moveOrCopy == 1) {
                                // move
                                if (folderURI != sourceURI) {
                                    copyService.CopyMessages(
                                        srcFolder,
                                        headers,
                                        destFolder,
                                        true, // -- move
                                        copyListener,
                                        null,
                                        false
                                    );
                                } else {
                                    this._logger.log('move failed, URIs are equal');
                                }
                            } // -- if move

                            if (moveOrCopy == 2) {
                                // copy
                                copyService.CopyMessages(
                                    srcFolder,
                                    headers,
                                    destFolder,
                                    false, // -- copy
                                    copyListener,
                                    null,
                                    false
                                );
                            } // -- if copy
                        } catch (moveOrCopyException) {
                            this._logger.error(moveOrCopyException);
                        }
                        this._logger.log('moveorcopy done.');
                    }

                    this._logger.log(_logMarker + ' executed, db status: ' + msg.folder.msgDatabase);

                    // msg.folder.updateFolder(null);

                    this._logger.log(_logMarker + ' database closed.');
                } // -- end for msg in messages

                this._logger.log('all messages for mindr ' + mindr.mailmindrGuid + ' performed.');

                // set mindr as 'performed' - will be removed from DB on next cleanup
                mindr.performed = true;

                mailmindrKernel.kernel.modules.storage.updateMindr(mindr);
            } // -- end if mindr already performed

            this._logger.log('mindr ' + mindr.mailmindrGuid + ' performed >> set to false');

            // check if we have to show a dialog
            if (!mindr.doShowDialog) {
                // if we don't show a dialog, just execute the mindr and
                // remove it from database
                mailmindrKernel.kernel.deleteMindr(mindr);
            }
        }
        catch (execException) {
            this._logger.error('mindr execution failed: ');
            this._logger.error(execException);
            return false;
        }

        return true;
    },

    /**
     *
     */
    getMessageHeaders: function(messenger, messageGuid) {
        return messenger.messageServiceFromURI(messageGuid).messageURIToMsgHdr(messageGuid);
    },

    /**
     * getMailtags - get all message tags from header
     */
    getMailTags: function(messageHeaders) {
        let keywords = messageHeaders.getStringProperty("keywords");
    },


    /**
     * getPreferenceString - gets a pref string from the mailmindr.-pref branch
     * @returns the string value of preference identified by parameter "id"
     */
    getPreferenceString: function(id) {
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService).getBranch("extensions.mailmindr.");

        return prefs.getCharPref(id);
    },

    /**
     * getPreferenceString - gets a pref string from the mailmindr.-pref branch
     * @returns the string value of preference identified by parameter "id"
     */
    setPreferenceString: function(id, value) {
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService).getBranch("extensions.mailmindr.");

        return prefs.setCharPref(id, value);
    },

    /**
     * getPreferenceString - gets a pref string from the mailmindr.-pref branch
     * @returns the string value of preference identified by parameter "id"
     */
    getPreferenceBool: function(id) {
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService).getBranch("extensions.mailmindr.");

        return prefs.getBoolPref(id);
    },

    setPreferenceBool: function(id, value) {
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService).getBranch("extensions.mailmindr.");

        prefs.setBoolPref(id, value);
    },


    /**
     * getPreferenceInt - gets a pref int value from the mailmindr.-pref branch
     * @returns the integer value of preference identified by parameter "id"
     */
    getPreferenceInt: function(id) {
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService).getBranch("extensions.mailmindr.");

        return prefs.getIntPref(id);
    },

    setPreferenceInt: function(id, value) {
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService).getBranch("extensions.mailmindr.");

        prefs.setIntPref(id, value);
    },


    /** 
     * writePreference - store preference to DB
     */
    writePreference: function(key, value) {
        this._logger.log('DB write preference: ' + key);
         mailmindrKernel.kernel.modules.storage.setPreference(key, value);
    },

    /**
     * readPreferences - read preferences
     */
    readPreference: function(key, defaultValue) {
        this._logger.log('DB read preference: ' + key);
        let value = mailmindrKernel.kernel.modules.storage.findPreference(key);

        this._logger.log('DB read from db w/ key ' + key + ': ' + value);
        return typeof value == 'undefined' ?
            defaultValue : value;
    },


    /**
     * getFolder - gets a nsIMsgFolder object from a given folder URI
     * @returns a nsIMsgFolder object
     */
    getFolder: function(folderURI) {
        let rdf = Components.classes['@mozilla.org/rdf/rdf-service;1']
            .getService(Components.interfaces.nsIRDFService);
        let fldr = rdf.GetResource(folderURI)
            .QueryInterface(Components.interfaces.nsIMsgFolder);

        return fldr;
    },

    get Settings() {
        return {
            firstDayOfWeek: this.getPreferenceInt("common.firstdayofweek"),
        }
    },

    postponeMindrRelative: function(mindr, minutesToAdd) {
        mindr.remindat = mindr.remindat + this.calculateMilliseconds(minutesToAdd);
         mailmindrKernel.kernel.modules.storage.updateMindr(mindr);
    },

    postponeMindrAbsolute: function(mindr, dateTime) {
        mindr.DateTime = dateTime;
         mailmindrKernel.kernel.modules.storage.updateMindr(mindr);
    },

    addMindrToDialog: function(mindr) {
        // if mindr is already in dialog or dialog must not be shown
        if (this.isMindrInDialog(mindr) || !mindr.doShowDialog) {
            this._logger.log('-> must not add ' + mindr.mailmindrGuid + ' to dialog (' + (mindr.doShowDialog ? 'alrady in list' : 'do not show dialog') + ')');
            return false;
        }

        // otherwise: push it to the dialog
        this._logger.log("-> pushing mindr to the reminder dialog list: " + mindr.mailmindrGuid);
        this.data.mindrsInDialog.push(mindr);
        return true;
    },

    clearMindrsInDialog: function() {
        this._logger.log("clearing all mindrs from list");
        this.data.mindrsInDialog = [];
    },

    isMindrInDialog: function(mindr) {
        if (!this.mindrsInDialogAvailable()) {
            this._logger.log("no mindrs in list");
            return false;
        }

        let scope = this;
        let foundMindrs = this.data.mindrsInDialog.filter(function(mindrOne) {
            let result = mindrOne.mailmindrGuid == mindr.mailmindrGuid;
            return result;
        });

        this._logger.log("- mindrs in dialogs list? " + (foundMindrs != 0 ? 'yes' : 'no') + ' ' + mindr.mailmindrGuid);
        return foundMindrs.length != 0;
    },

    mindrsInDialogAvailable: function() {
        return this.data.mindrsInDialog.length > 0;
    },

    getMindrsInDialog: function() {
        this._logger.log("return # list of mindrs: " + this.data.mindrsInDialog.length);
        return this.data.mindrsInDialog;
    },

    removeMindrFromDialog: function(mindr) {
        this._logger.log('remove mindr from dialog list: ' + mindr.mailmindrGuid);
        if (!this.isMindrInDialog(mindr)) {
            return;
        }

        this.data.mindrsInDialog = this.data.mindrsInDialog.filter(function(mindrOne) {
            return mindrOne.mailmindrGuid != mindr.mailmindrGuid;
        });
    },

    calculateMilliseconds: function(minutes) {
        return minutes * 60000;
    },


    getAccounts: function() {
        let self = this;
        var acctMgr = Components.classes["@mozilla.org/messenger/account-manager;1"]
            .getService(Components.interfaces.nsIMsgAccountManager);
        var accounts = acctMgr.accounts;
        var result = [];

        for (let i = 0; i < accounts.length; i++) {
            let accountObject = accounts.queryElementAt(i, Components.interfaces.nsIMsgAccount);
            if ((accountObject.incomingServer.type.indexOf('imap') == 0) || (accountObject.incomingServer.type.indexOf('pop') == 0) || (accountObject.incomingServer.type.indexOf('none') == 0)) {
                let server = accountObject.incomingServer;
                let identity = accountObject.defaultIdentity || {
                    email: '',
                    identityName: ''
                };
                result.push({
                    account: accountObject,
                    displayName: server.prettyName || accountObject.key,
                    identityMail: identity.email,
                    identityName: identity.identityName,
                    internalKey: accountObject.key,
                    key: self.createAccountKey(accountObject.incomingServer),
                    isImap: (accountObject.incomingServer.type.indexOf('imap') == 0),
                    isLocal: (accountObject.incomingServer.type.indexOf('imap') < 0 && accountObject.incomingServer.type.indexOf('pop') < 0)
                });
            }
        }

        return result;
    },

    createAccountKey: function(msgIncomingServer) {
        //let server = msgIncomingServer.incomingServer;
        let dummy = msgIncomingServer.realHostName + '|' + msgIncomingServer.realUsername;
        let encryptedResult = this.createMD5(dummy);

        return encryptedResult;
    },

    ///
    /// Compute hash from a string
    /// source: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsICryptoHash#Computing_the_Hash_of_a_String
    ///
    createMD5: function(data) {
        function toHexString(charCode) {
            return ("0" + charCode.toString(16)).slice(-2);
        }

        var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
            .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);

        converter.charset = "UTF-8";

        let result = {};
        let dummyData = converter.convertToByteArray(data, result);

        let md5 = Components.classes['@mozilla.org/security/hash;1']
            .getService(Components.interfaces.nsICryptoHash);

        md5.init(Components.interfaces.nsICryptoHash.MD5);
        md5.update(dummyData, dummyData.length);
        let hash = md5.finish(false);;

        // convert the binary hash to string
        return Array.from(hash, (current, index) => toHexString(hash.charCodeAt(index))).join("");
    },

    getAccountKeyFromFolder: function(msgFolder) {
        let result = this.createAccountKey(msgFolder.server);

        return result;
    },

    getInboxZeroFolder: function(accountKey) {
        let serializedAccounts = this.readPreference('common.inboxZeroAccounts', '');
        let serializedData = this.readPreference('common.inboxZeroPreferences', '');

        let data = serializedData.length > 0 ? JSON.parse(serializedData) : {};

        if (typeof data[accountKey] == 'undefined' || data[accountKey].folderURI == '') {
            this._logger.log('no folder set, get global fallback');
            return this.getPreferenceString('common.inboxZeroLaterFolder');
        }

        return data[accountKey].folderURI || '';
    },

    navigateToFolder: function(msgFolder) {
        alert('y');
    },
};

var mailmindrCore = mailmindrCore || new MailmindrCoreBase();