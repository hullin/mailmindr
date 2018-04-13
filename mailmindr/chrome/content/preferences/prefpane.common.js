"use strict";

Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");
Components.utils.import("chrome://mailmindr/content/utils/core.jsm");
Components.utils.import("chrome://mailmindr/content/utils/storage.jsm");

var mailmindrPrefPaneCommon = {
    _name: "mailmindrPrefPaneCommon",
    _logger: null,
    _initialized: false,
    _elements: {},
    _controls: {},

    initialize: function() {
        this._logger = new mailmindrLogger(this);
        try {
            this._logger.log('initialize : prefpane.common.js');
            
            this._elements.tagSelector = document.getElementById("mailmindrOnTagSelector");
            this._elements.tagTimespanSelector = document.getElementById("mailmindrOnTagTimespanSelector");

            this._elements.defaultTimespanSelector = document.getElementById("mailmindrDefaultTimespanSelector");
            this._elements.defaultActionSelector = document.getElementById("mailmindrDefaultActionSelector");

            this._elements.targetFolderIncoming = document.getElementById("mailmindrTargetFolderIncoming");
            this._elements.targetFolderSent = document.getElementById("mailmindrTargetFolderSent");
            this._elements.inboxZeroLaterFolder = document.getElementById("mailmindrInboxZeroLaterFolder");

            this._controls.defaultAction = new mailmindr.controls.ActionPicker(
                    this._elements.defaultActionSelector,
                    { canBeDeactivated: true }
                );

            this.refresh();
        } catch (exception) {
            this._logger.error('messup on preferences detected');
            this._logger.error(exception);
        }
        this._initialized = true;
    },

    doRefreshAll : function() {
        let panes = [mailmindrPrefPaneCommon, mailmindrPrefPaneInboxZero, mailmindrPrefPaneTimespan];
        for each(let pane in panes) {
            pane.refresh();
        }
    },

    refresh: function() {
        if (!this._initialized) {
            return; 
        }
        
        // fill in the default values 
        mailmindrCommon.fillTags(this._elements.tagSelector, 0, mailmindrCore.getPreferenceString("common.setMindrOnTagSelectedTag"));

        try {
            mailmindrCommon.listAllFolders(this._elements.targetFolderIncoming);
            mailmindrCommon.listAllFolders(this._elements.targetFolderSent);
            mailmindrCommon.listAllFolders(this._elements.inboxZeroLaterFolder);
        } catch (exce) {
            this._logger.error(exce);
        }

        // set preferences / defaults
        let folderIncoming = mailmindrCore.getPreferenceString("common.targetFolderIncoming");
        let folderSent = mailmindrCore.getPreferenceString("common.targetFolderSent");
        let inboxZeroLaterFolder = mailmindrCore.getPreferenceString("common.inboxZeroLaterFolder");
        let onTagSetTimespan = mailmindrCore.getPreferenceString("common.setMindrOnTagSelectedTimespan");
        let defaultTimespan = mailmindrCore.getPreferenceString("common.setMindrDefaultSelectedTimespan");

        let serializedDefaultAction = mailmindrCore.getPreferenceString("common.action.default");        
        let defaultAction = null;
        if (serializedDefaultAction.length > 2) {
            defaultAction = JSON.parse(serializedDefaultAction);
        }

        this._elements.targetFolderIncoming.value = folderIncoming;
        this._elements.targetFolderSent.value = folderSent;
        this._elements.inboxZeroLaterFolder.value = inboxZeroLaterFolder;

        let timespans = mailmindrCore.createSystemTimespans();
        timespans = timespans.concat(mailmindrStorage.loadTimespans());

        this._elements.tagTimespanSelector.removeAllItems();
        this._elements.defaultTimespanSelector.removeAllItems();

        this._controls.defaultAction.Action = defaultAction;

        for each (let timespan in timespans) {
            let key = timespan.id;
            if (timespan.isGenerated) {
                key = '#' + timespan.serialize();
            }
            this._elements.tagTimespanSelector.appendItem(timespan.text, key);
            this._elements.defaultTimespanSelector.appendItem(timespan.text, key);
        }

        this._elements.tagTimespanSelector.value = onTagSetTimespan;
        this._elements.defaultTimespanSelector.value = defaultTimespan;

        for each(let element in [this._elements.tagTimespanSelector, this._elements.defaultTimespanSelector]) {
            if (element.selectedIndex < 0) {
                element.selectedIndex = 0;
            }
        }
    }
};