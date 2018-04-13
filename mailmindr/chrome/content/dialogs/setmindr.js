/* jshint curly: true, strict: true, moz: true, undef: true, unused: true */
/* global Components, mailmindrLogger, mailmindrSearch */
"use strict";

if (!mailmindr) var mailmindr = {};
if (!mailmindr.dialogs) mailmindr.dialogs = {};
if (!mailmindr.controls) mailmindr.controls = {};

Components.utils.import("chrome://mailmindr/content/utils/core.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");
Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");
Components.utils.import("chrome://mailmindr/content/utils/factory.jsm");
Components.utils.import("chrome://mailmindr/content/utils/storage.jsm");
Components.utils.import("chrome://mailmindr/content/utils/search.jsm");
Components.utils.import("chrome://mailmindr/content/modules/kernel.jsm");
Components.utils.import("resource://app/modules/Services.jsm");
Components.utils.import("resource://app/modules/iteratorUtils.jsm");

mailmindr.dialogs.setmindr = {

    _logger: null,
    _name: "mailmindr.dialogs.setMindr",
    _initialized: false,
    _elements: {},
    _controls: {},
    _options: {},
    _data: {},

    /**
     * onLoad - triggered when editor is loaded
     * @returns Returns always true
     */
    onLoad: function() {
        this.Initialize();


        //return true;
    },

    /**
     * onDialogCancel triggered when the user cancels or closes the dialog
     * @returns result is always true;
     */
    onDialogCancel: function() {
        return true;
    },

    /**
     * initialize dialog - set tags, combobox entries, etc
     */
    Initialize: function() {
        let options;

        if (!this._initialized) {
            try {
                let self = this;

                options = window.arguments[0];

                var settings = mailmindrCore.Settings;

                this._logger = new mailmindrLogger(this);
                this._data = options.data;
                this._options = options;

                this._logger.log('attaching error handler.');
                mailmindrKernel.kernel.attachWindowGlobalUiErrorHandler(window, this._logger);
                this._logger.log('error handler attached.');

                this._logger.log('creating datepicker.');
                // this is a fix for bug #516796 - https://bugzilla.mozilla.org/show_bug.cgi?id=516796
                var dtp = document.createElement('datepicker');
                dtp.setAttribute('id', 'mailmindrDatePicker');
                dtp.setAttribute('type', 'popup');
                dtp.setAttribute('firstdayofweek', settings.firstDayOfWeek);

                document.getElementById('mailmindrDatePickerWrapper').appendChild(dtp);
                this._logger.log('datepicker created.');

                this._elements.textMailSubject = document.getElementById("mailmindrMailSubject");
                // this._elements.textMailSubject.value = this._data.selectedMail.mime2DecodedSubject;
                
                this._elements.textMailSender = document.getElementById("mailmindrMailSender");
                
                this._elements.timespans = document.getElementById("mailmindrTimespans");
                //this._elements.datePicker = document.getElementById("mailmindrDatePicker");
                this._elements.datePicker = dtp;
                this._elements.timePicker = document.getElementById("mailmindrTimePicker");
                this._elements.actionPicker = document.getElementById("mailmindrActionPicker");
                this._elements.buttonAccept = document.documentElement.getButton("accept");
                this._elements.doSetReminder = document.getElementById("mailmindrDoSetReminder");
                this._elements.noteTextBox = document.getElementById('mailmindrNotes');

                this._logger.log('creating timepicker.');
                // init 'controls'
                this._controls.timespans = new mailmindr.controls.TimespanPicker(
                    this._elements.timespans,
                    this._elements.datePicker,
                    this._elements.timePicker, {
                        canBeUserDefined: true
                    }
                );
                this._logger.log('timepicker created.');

                this._logger.log('creating actionpicker.');
                this._controls.actions = new mailmindr.controls.ActionPicker(
                    this._elements.actionPicker
                );
                this._logger.log('actionpicker craeted.');

                this._logger.log('set mindr :: type: ' + typeof this._data.mindr);

                let hasMindr = this._hasMindr();
                this._controls.actions.Enabled = hasMindr ? 'true' : 'false';

                // presets
                if (this._data.selectedTimespan == null && !this._hasMindr()) {
                    //
                    // set new mindr
                    //
                    this._logger.log('mindr NOT SET');
                    this._elements.timespans.value = "1;0;0;false";
                    this._elements.doSetReminder.setAttribute(
                        "checked",
                        mailmindrCore.getPreferenceBool("common.showAlertDialog") ? "true" : "false"
                    );
                    this._elements.noteTextBox.value = '';
                } else if (this._data.selectedTimespan == null && this._hasMindr()) {
                    //
                    // modify existing mindr
                    //
                    this._logger.log('mindr IS ALREADY SET (modifying the old one)');
                    this._logger.log('doShowDialog: ' + this._data.mindr.doShowDialog);
                    this._controls.actions.Action = this._data.mindr;
                    this._elements.timespans.value = "-1;-1;-1;false";
                    this._controls.timespans.setDateTime(new Date(this._data.mindr.remindat));
                    this._elements.doSetReminder.setAttribute(
                        "checked",
                        this._data.mindr.doShowDialog ? "true" : "false"
                    );
                    this._elements.noteTextBox.value = this._data.mindr.details.note;
                } else {
                    if (!this._hasMindr()) {
                        this._elements.doSetReminder.setAttribute(
                            "checked",
                            mailmindrCore.getPreferenceBool("common.showAlertDialog") ? "true" : "false"
                        );
                        this._controls.actions.Action = this._data.selectedAction;
                    }

                    this._elements.timespans.value = this._data.selectedTimespan;
                    if (this._elements.timespans.selectedIndex < 0) {
                        // timespan is not in list so set user defined
                        this._elements.timespans.value = "-1;-1;-1;false";
                        this._controls.timespans.setTimespan(
                            this._data.selectedTimespan,
                            this._elements.timePicker,
                            this._elements.datePicker);
                    }
                }

                this.setEventListeners();

                if (!hasMindr) {
                    this._elements.textMailSubject.textContent = this._data.selectedMail.mime2DecodedSubject;
                    this._elements.textMailSender.textContent = this._data.selectedMail.mime2DecodedAuthor;
                } else {
                    this._elements.textMailSubject.textContent = this._data.mindr.details.subject;
                    this._elements.textMailSender.textContent = this._data.mindr.details.author;
                }

                /* check if we have inbox zero support, so we can't move/copy mails */
                this._logger.log('check account/folder for selected mail');
                let key = mailmindrCore.getAccountKeyFromFolder(this._data.selectedMail.folder);
                this.inboxZeroLaterFolder = mailmindrCore.getInboxZeroFolder(key);
                this.enableInboxZero = this.inboxZeroLaterFolder != '';


                let src = "chrome://mailmindr/locale/dialogs/setmindr.properties";
                let localeService = Components.classes["@mozilla.org/intl/nslocaleservice;1"]
                    .getService(Components.interfaces.nsILocaleService);
                let appLocale = localeService.getApplicationLocale();
                let stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
                    .getService(Components.interfaces.nsIStringBundleService);

                this._strings = stringBundleService.createBundle(src, appLocale);

                let notifyMsg = document.getElementById("mailmindrInboxZeroActiveNotificationMessage");
                if (this.enableInboxZero) {
                    let messageIdentifier = "mailmindr.dialog.setmindr.inboxzero.notificationmessage";
                    let information = this._strings.GetStringFromName(messageIdentifier);
                    let folder = mailmindrCore.getFolder(this.inboxZeroLaterFolder);
                    let localJson = [
                        [
                            'strong', 
                            {}, 
                            this._strings.GetStringFromName('mailmindr.dialog.setmindr.inboxzero.notificationmessage.label'),
                            ' '
                        ],
                        [
                            'span', 
                            {}, 
                            this._strings.GetStringFromName('mailmindr.dialog.setmindr.inboxzero.notificationmessage.link_before'),
                            ' '
                        ],
                        [
                            'a', 
                            {
                                'style':  'text-decoration: underline; cursor: pointer;',
                                'onclick': function() { self.openFolderTab(folder); return false; }
                            },
                            folder.prettyName
                        ],
                        [
                            'span',
                            {},
                            this._strings.GetStringFromName('mailmindr.dialog.setmindr.inboxzero.notificationmessage.link_after')
                        ]
                    ];

                    let localNodes = {};
                    let localParsedElement = mailmindrKernel.kernel.modules.common.jsonToDom(localJson, document, localNodes);
                    notifyMsg.appendChild(localParsedElement);
                    notifyMsg.setAttribute("hidden", "false");
                } else {
                    notifyMsg.setAttribute("hidden", "true");
                }

                this._initialized = true;
            } catch (initializeException) {
                this._logger.error(initializeException);
            }

            this.resize();
        }

    },

    resize: function() {
        // window.sizeToContent();
        window.width = 300;
    },

    /**
     * setEventListeners - set the listeners for the timespan/action picker(s)
     */
    setEventListeners: function() {
        let scope = this;

        this._controls.timespans.addEventListener('selectTimespan', function(datetime) {
            scope.onSelectTimespan(scope, datetime);
        });

        this._controls.actions.addEventListener('selectAction', function(action) {
            scope.onSelectAction(scope, action);
        });
    },


    /**
	* get action object from the values of the controls in dialog
	
	getAction: function()
	{
		let action = mailmindrFactory.createActionTemplate();
--
		action.doTagWith = this._elements.checkTagAction.getAttribute("checked") ? this._elements.tags.value : false;
		action.targetFolder = this._elements.checkFolderAction.getAttribute("checked") ? this._elements.folders.value : '';
		action.doMoveOrCopy = this._elements.checkFolderAction.getAttribute("checked") ? (this._elements.radioDoMove.getAttribute("selected") ? 1 : this._elements.radioDoCopy.getAttribute("selected") ? 2 : 0) : 0;
		action.doShowDialog = this._elements.checkDoShowDialog.getAttribute("checked") ? true : false;
		action.doMarkAsUnread = this._elements.checkDoMarkAsUnread.getAttribute("checked") ? true : false;
		action.doMarkFlag = this._elements.checkDoMarkFlag.getAttribute("checked") ? true : false;
--
		return action;
	},
	*/


    /**
     * onSelectTimespan - triggered when a timespan is selected
     */
    onSelectTimespan: function(target, datetime) {
        let pickedTime = datetime.valueOf();
        let disabled = pickedTime + 60 * 1000 < Date.now();

        target._elements.buttonAccept.disabled = disabled;
    },


    onSelectAction: function(target, action) {
        target._elements.doSetReminder.disabled = action.doShowDialog;
        if (action.doShowDialog) {
            target._elements.doSetReminder.checked = true;
        }

        // we can't allow inbox zero AND move/copy
        let disabled = ((action.doMoveOrCopy != 0) && this.enableInboxZero);
        target._elements.buttonAccept.disabled = disabled;
    },


    /**
     * onDialogAccept
     * @returns Returns always true
     * */
    onDialogAccept: function() {
        try {
            let mindr = this._createMindr();

            let result = {
                action: this._controls.actions.Action,
                timespan: this._controls.timespans.dateValue,
                mindr: mindr
            };

            let self = this;
            var serializedMindr = JSON.stringify({ mailmindrGuid : mindr.mailmindrGuid });
            this._persistMindr(mindr, function () {
                Services.obs.notifyObservers(null, "mailmindr-setMindr-success", serializedMindr);
            });

            this._logger.log('dialog::setMindr closing / notifying observers');
        } catch (onDialogAcceptException) {
            this._logger.error('cannot save/update mindr');
            this._logger.error(onDialogAcceptException);
            return false;
        }
        
        return true;
    },


    /**
     * _createMindr - Create mindr for selected mail with the selected action and timespan
     * @returns mindr
     */
    _createMindr: function() {
        let mindr = null;
        if (this._hasMindr()) {
            // we're just modifying
            let dummy = this._data.mindr;
            let action = this._controls.actions.Action;
            if (this._controls.actions.Enabled) {
                this._logger.log('UPDATE mindr set action');
                mindr = action.copyTo(dummy);
            } else {
                this._logger.log('NOTUPDATING mindr');
                mindr = dummy;
            }
        } else {
            // this is a new mindr
            mindr = mailmindrCore.createMindrWithAction(this._controls.actions.Action);
            mindr.mailguid = this._data.selectedMail.messageId;
            mindr.details.subject = this._data.selectedMail.mime2DecodedSubject;
            mindr.details.author = this._data.selectedMail.mime2DecodedAuthor;
            mindr.details.recipients = this._data.selectedMail.recipients;
        }

        mindr.DateTime = this._controls.timespans.dateValue;
        mindr.details.note = this._elements.noteTextBox.value;

        // check if we have to set a reminder        
        mindr.doShowDialog = this._elements.doSetReminder.checked;

        return mindr;
    },

    _persistMindr: function(mindr, onSuccess, onFailure) {
        if (this._hasMindr()) {
            this._logger.log('UPDATE mindr');
            if (mailmindrStorage.updateMindr(mindr)) {
                this._logger.log('call OBSERVER #1');
                onSuccess(mindr);
            }
        } else {
            if (this.enableInboxZero) {
                mindr.originFolderURI = this._data.selectedMail.folder.folderURL;
            }

            this._logger.log('SAVE mindr');
            if (mailmindrStorage.saveMindr(mindr)) {
                // check if we have to move the mindr
                if (!this.enableInboxZero) {
                    onSuccess(mindr);
                } else {
                    try {
                        let message = this._data.selectedMail;
                        this.moveMailToInboxZeroLaterFolder(
                                mindr, 
                                message, 
                                this.inboxZeroLaterFolder, 
                                onSuccess
                            );
                    } catch (exc) {
                        this._logger.log('setMindr._persistMindr > moving the mail failed, because: ' + exc);
                        this._logger.error(exc);
                    }
                } // -- move mail when mindr is set
            }
        }
    },

    _hasMindr: function() {
        return (typeof this._data.mindr != 'undefined' && this._data.mindr != null);
    },

    moveMailToInboxZeroLaterFolder: function(mindr, message, targetFolderURI, onSuccess) {
        let folderURI = targetFolderURI;
        let sourceURI = message.folder.URI;

        this._logger.log(' copy from :: ' + sourceURI);
        this._logger.log(' copy to   :: ' + folderURI);

        if (sourceURI == folderURI) {
            this._logger.log('Destination and source folder is equal - cancel copy.');
            onSuccess();
            return;
        }

        let headers = Components.classes["@mozilla.org/array;1"]
            .createInstance(Components.interfaces.nsIMutableArray);

        headers.appendElement(message, false);

        let copyService = Components.classes["@mozilla.org/messenger/messagecopyservice;1"]
            .getService(Components.interfaces.nsIMsgCopyService);

        let srcFolder = mailmindrCore.getFolder(sourceURI);
        let destFolder = mailmindrCore.getFolder(folderURI);

        let self = this;
        
        // move mail
        var threePaneWindow = mailmindrKernel.kernel.modules.common.getWindow("mail:3pane").msgWindow; 
        if (!threePaneWindow) {
            this._logger.error("threePane: " + threePaneWindow);
            this._logger.error("module:    " + mailmindrKernel.modules.common);
            return false;
        }   
        
        copyService.CopyMessages(
            srcFolder,
            headers,
            destFolder,
            true, // -- move
            {
                OnStartCopy: function() {},
                OnProgress: function(aProgress, aProgressMax) {},
                SetMessageKey: function(aKey) {},
                SetMessageId: function(aMessageId) {},
                OnStopCopy: function(aStatus) {
                    // Check: message successfully copied.
                    try {
                        self._logger.log('releasing DBs');
                        srcFolder.msgDatabase = null;
                        destFolder.msgDatabase = null;
                        //mindr.resetDetails();
                        onSuccess();
                    } catch (cbFailed) {
                        self._logger.log('error on setMindr callback');
                        self._logger.error(cbFailed);
                    }
                    self._logger.log('moved source mail to inbox zero folder.');
                }
            }, // -- copy listener
            threePaneWindow, // -- main window 
            threePaneWindow ? true : false // -- w/ undo
        );
    },

    openFolderTab: function(msgFolder) {
        window.openDialog("chrome://messenger/content/", 
                "_blank",
                "chrome,all,dialog=no", 
                msgFolder.URI
            );
    }
}

window.addEventListener("load", function() {
    mailmindr.dialogs.setmindr.onLoad();
}, false);