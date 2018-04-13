/* jshint curly: true, strict: true, multistr: true, moz: true, undef: true, unused: true */
/* global Components, mailmindrLogger, document, window, mailmindrCore */
"use strict";

if (!mailmindr) var mailmindr = {};
if (!mailmindr.controls) mailmindr.controls = {};

Components.utils.import("chrome://mailmindr/content/utils/core.jsm");
Components.utils.import("chrome://mailmindr/content/utils/factory.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");
Components.utils.import("chrome://mailmindr/content/utils/storage.jsm");
Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");

var mailmindrMessageCompose;

const mailmindrConstObserverOnSendMail = "mail:composeOnSend";

function mailmindrMessageComposeBase() {
    this._name = "mailmindrMessageCompose";
    this._logger = new mailmindrLogger(this);
    this._logger.log('NEW COMPOSE BASE');
    this._initialized = false;
}

mailmindrMessageComposeBase.prototype = {
    _instance: null,
    _actions: [],
    _elements: {},
    _controls: {},
    _strings: null,

    get ObserverService() {
        var observerService = Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService);
        return observerService;
    },

    /**
     * initialize
     * - initialize DOM elements with default values
     * - set listeners
     * - prepare timespans
     */
    initialize: function() {
        try {
            mailmindrCore.safeCall(this, this.initializeNotifications);

            // get all element holders by id
            this._elements.timespans = document.getElementById("mailmindrMessageComposeTimespans");
            this._elements.datepicker = document.getElementById("mailmindrMessageComposeDatePicker");
            this._elements.timepicker = document.getElementById("mailmindrMessageComposeTimePicker");
            this._elements.actions = document.getElementById("mailmindrMessageComposeActions");
            this._elements.window = document.getElementById("msgcomposeWindow");
            this._elements.buttonSend = document.getElementById("button-send");

            this._elements.groupSetDateTime = document.getElementById("mailmindrMessageComposeGroupSetDateTime");
            this._elements.groupSetAction = document.getElementById("mailmindrMessageComposeGroupSetAction");

            this._strings = document.getElementById("mailmindrPromptStrings");

            this.initializeComponents();

            // set listeners
            this.setListeners();

            this._initialized = true;
        } catch (initializeException) {
            this._logger.error(initializeException);
        }
    },

    initializeNotifications: function() {
        this._elements.notificationBox = document.getElementById("mailmindrMessageComposeNotification");
        this._elements.notificationBox.setAttribute("hidden", "true");

        this._elements.notificationText = document.getElementById("mailmindrMessageComposeNotificationText");
    },

    initializeComponents: function() {
        // fill the timespan box
        while (!mailmindrStorage.Initialized);

        this._controls.timespanPicker = new mailmindr.controls.TimespanPicker(
            this._elements.timespans,
            this._elements.datepicker,
            this._elements.timepicker, {
                canBeDeactivated: true,
                canBeUserDefined: true
            }
        );

        // TODO: color up the icons
        // fill the action box
        this._controls.actionPicker = new mailmindr.controls.ActionPicker(
            this._elements.actions, {
                canBeDeactivated: false,
                canBeUserDefined: false
            }
        );

        this._elements.notificationText.value = this._strings.getString("mailmindr.message.compose.cannotset.warning");
    },


    resetUI: function() {
        // set default values
        this._logger.log('call UI reset.');

        this._elements.actions.selectedIndex = 0;
        this._elements.groupSetAction.hidden = "true";
        this._elements.groupSetDateTime.hidden = "true";
        this._elements.timespans.value = "0;0;0;false";
        this._elements.timepicker.dateValue = new Date();

        var settings = mailmindrCore.Settings;

        // this is a fix for bug #516796 - https://bugzilla.mozilla.org/show_bug.cgi?id=516796
        var grid = document.getAnonymousElementByAttribute(this._elements.datepicker, "anonid", "grid");
        this._elements.datepicker.setAttribute("firstdayofweek", settings.firstDayOfWeek);
        grid._init();

        mailmindrCore.safeCall(this, this.showNotification);

        this._logger.log('UI reset done.');
    },


    showNotification: function() {
        this._elements.notificationBox.setAttribute("hidden", this.canSend() ? "true" : "false");
    },


    /**
     * generateMindr - generate mindr with element values
     */
    _generateMindr: function(aMessageId) {

        this._logger.log('call _generateMindr');

        let action = this._controls.actionPicker.Action;
        if ((action != null) && (action.isValid) && (this._controls.timespanPicker.getDateTime() > Date.now())) {
            let mindr = mailmindrCore.createMindrWithAction(action);
            let time = this._controls.timespanPicker.getDateTime();
            let date = time;

            mindr.setDateTime(
                date.getFullYear(),
                date.getMonth(),
                date.getDate(),
                time.getHours(),
                time.getMinutes()
            );

            mindr.waitForReply = true;
            mindr.mailguid = aMessageId;

            mindr.details = {
                author: '',
                subject: gMsgCompose.compFields.subject,
                recipients: gMsgCompose.compFields.to,
                note: ''
            };
            
            this._logger.log('_generateMindr: ' + mindr);

            mailmindrCore.saveMindr(mindr);
        }

        this._logger.log(action);
        this._logger.log('------- _generateMindr.');
    },


    observe: function(subject, topic, state) {
        if (aTopic != mailmindrConstObserverOnSendMail) {
            return;
        }

        let composer = subject.gMsgCompose;
        let msgId = null;

        this._logger.log('------------------------');
        this._logger.log('subject ' + subject);
        this._logger.log('topic   ' + topic);
        this._logger.log('state   ' + state);
        this._logger.log('------------------------');
    },


    /**
     * onLoad - triggered when overlay is loaded
     * will call initialize() when object is not initialized
     */
    onLoad: function() {
        if (!this._initialized) {
            this.initialize();
        }

        this.setSendListener();

        // reset UI and set default values
        this.resetUI();
    },

    onUnload: function() {
        this.ObserverService.removeObserver(mailmindrConstObserverOnSendMail);
        let listener = this.sendListener;
        if (listener) {
            this._logger.log('removing sendListener');
            this.removeMsgSendListener(listener);
        }
    },

    onClose: function() {

    },

    onReopen: function() {
        this.setSendListener();
        this.resetUI();
    },

    /**
     * onSend - triggered when mail is send
     * checks control values
     */
    onSend: function(event, target) {
        let canSend = this.canSend();

        this._logger.log('---');

        if (!canSend) {
            try {
                let promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                    .getService(Components.interfaces.nsIPromptService);

                let dlgButtons = (promptService.BUTTON_TITLE_YES * promptService.BUTTON_POS_0) + (promptService.BUTTON_TITLE_NO * promptService.BUTTON_POS_1);
                let dlgTitle = this._strings.getString("mailmindr.message.compose.cannotset.title");
                let dlgText = this._strings.getString("mailmindr.message.compose.cannotset.text");
                let dlgValue = {
                    value: false
                };

                let result = promptService.confirmEx(
                    parent,
                    dlgTitle,
                    dlgText,
                    dlgButtons,
                    promptService.BUTTON_TITLE_YES,
                    promptService.BUTTON_TITLE_NO,
                    null,
                    null,
                    dlgValue
                );

                if (result != 1) {
                    // send this mail.
                    return;
                }

                canSend = dlgValue.value;

            } catch (promptException) {
                this._logger.error(promptException);
            }
        }

        if (!canSend) {
            event.preventDefault();
        }

        target._logger.log(event);
        target._logger.log('~~~~~~~~~~~~~~~~~~~');
        target._logger.log('send: ' + gMsgCompose.compFields.messageid);
        target._logger.log(gMsgCompose);
        target._logger.log('~~~~~~~~~~~~~~~~~~~');

        // return false;
    },

    /**
     * onSendSuccess - mail was sent successfully, so save mindr
     */
    onSendSuccess: function(messageId, message) {
        this._logger.log('send success >> save mindr');
        this._generateMindr(messageId);
    },

    /**
     * onSelectTimespan - triggers when timespan has selected
     * sets the calculated date and time when resubmission will be triggered
     */
    onSelectTimespan: function(target, selectDateTime) {
        target.updateControlStates(target, selectDateTime);
    },

    onSelectAction: function(target, action) {
        let selectDateTime = this._controls.timespanPicker.getDateTime();
        target.updateControlStates(target, selectDateTime);
    },

    canSend: function() {
        let selectDateTime = this._controls.timespanPicker.getDateTime();
        let pickedTime = selectDateTime.valueOf();
        let disabled = pickedTime + 60 * 1000 < Date.now();
        let selectedTimespan = this._elements.timespans.value;

        this._logger.log(' selectDateTime    ' + selectDateTime);
        this._logger.log(' pickedTime        ' + pickedTime);
        this._logger.log(' selected timespan ' + selectedTimespan);
        this._logger.log(' disabled          ' + disabled);

        return (selectedTimespan == "0;0;0;false") || !disabled;
    },

    updateControlStates: function(target, selectDateTime) {
        let hidePickers = (target._elements.timespans.value == "0;0;0;false");

        target._elements.groupSetDateTime.hidden = hidePickers;
        target._elements.groupSetAction.hidden = hidePickers;

        let pickedTime = selectDateTime.valueOf();
        let disabled = pickedTime + 60 * 1000 < Date.now();

        let enableSendButton = (target._elements.timespans.value == "0;0;0;false") || !disabled;

        // target._elements.buttonSend.disabled = !enableSendButton;
        // TODO: disable the command for sending mail via keyboard;
        // --> try to prevent sending via event hooking

        mailmindrCore.safeCall(this, this.showNotification);
    },

    setSendListener: function() {
        // set listener to the "onStopSending"-event
        // (triggered when a message sending stopped)
        this._logger.log('-------- setSendListener');

        try {
            var scope = this;

            this.sendListener = {
                // nsIMsgSendListener
                onStartSending: function(aMsgID, aMsgSize) {},
                onProgress: function(aMsgID, aProgress, aProgressMax) {},
                onStatus: function(aMsgID, aMsg) {},
                onStopSending: function(aMsgID, aStatus, aMsg, aReturnFile) {
                    scope._logger.log('******* onStopSending');
                    if (Components.isSuccessCode(aStatus)) {
                        // message successfully sent, save mindr with msgID
                        scope.onSendSuccess(aMsgID, aMsg);
                    }
                },
                onGetDraftFolderURI: function(aFolderURI) {},
                onSendNotPerformed: function(aMsgID, aStatus) {}
            };

            gMsgCompose.addMsgSendListener(this.sendListener);

            this._logger.log('-------- OK :: setSendListener');
        } catch (seListenerException) {
            this._logger.log('-------- ERR :: setSendListener');
            this._logger.error(seListenerException);
        }
    },

    /**
     * setListeners - set all listeners to the elements in overlay
     */
    setListeners: function() {
        var scope = this;
        this._logger.log('start setListeners.');

        this._controls.timespanPicker.addEventListener("selectTimespan", function(datetime) {
            scope.onSelectTimespan(scope, datetime);
        }, false);

        this._controls.actionPicker.addEventListener("selectAction", function(action) {
            scope.onSelectAction(scope, action);
        }, false);

        // set listener for the send event
        this._elements.window.addEventListener("compose-send-message", function(event) {
            scope.onSend(event, scope);
        }, true);

        this._elements.window.addEventListener("compose-window-reopen", function() {
            scope._logger.log('-----> window reopen');
            scope.onReopen();
        }, false);

        this._elements.window.addEventListener("compose-window-close", function() {
            scope._logger.log('-----> window close');
            scope.onClose();
        }, false);

        this.ObserverService.addObserver(this, mailmindrConstObserverOnSendMail, false);

        this._logger.log('>      listeners set.');
    }
};


window.addEventListener("load", function onLoad() {
    mailmindrMessageCompose = new mailmindrMessageComposeBase();
    mailmindrMessageCompose.onLoad();
}, false);