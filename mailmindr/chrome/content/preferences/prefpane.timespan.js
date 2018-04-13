"use strict";

Components.utils.import("resource://gre/modules/Services.jsm");

var mailmindrPrefPaneTimespan = {
    _initialized: false,
    _name: 'mailmindrPrefpaneTimespan',
    _targetListName: 'mailmindrPrefPaneTimespanList',
    _logger: null,
    _listElement: null,
    _data: [],
    _strings : null,

    initialize: function() {
        this._logger = new mailmindrLogger(this);
        try {
            this._logger.log('initialize : prefpane.timespan.js');

            this._listElement = document.getElementById('mailmindrTimespanList');

            let src = "chrome://mailmindr/locale/preferences/prefpane.timespan.properties";
            let localeService = Components.classes["@mozilla.org/intl/nslocaleservice;1"]
                                    .getService(Components.interfaces.nsILocaleService);
            let appLocale =  localeService.getApplicationLocale();
            let stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
                                    .getService(Components.interfaces.nsIStringBundleService);

            this._strings = stringBundleService.createBundle(src, appLocale);

            this.refresh();

            this._initialized = true;
        } catch (initException) {
            this._logger.error(initException);
        }
    },

    addTimespan: function() {
        this.openTimespanDialog(null);
    },

    get SelectedTimespan() {
        let idx = this._listElement.selectedIndex;
        if (idx < 0) {
            return null;
        }

        let tsid = this._listElement.value;
        return mailmindrKernel.kernel.modules.storage.loadTimespan(tsid);
    },

    editTimespan: function() {
        let timespan = this.SelectedTimespan;
        if (timespan != null) {
            this.openTimespanDialog(timespan);
        }


        // if (this._list && this._list.CurrentIndex() >= 0) {
        //     let timespan = {
        //         id: mailmindrCommon.getSelectedTreeCell(this._targetListName, 0),
        //         name: mailmindrCommon.getSelectedTreeCell(this._targetListName, 2),
        //         days: mailmindrCommon.getSelectedTreeCell(this._targetListName, 1),
        //         hours: mailmindrCommon.getSelectedTreeCell(this._targetListName, 1),
        //         minutes: mailmindrCommon.getSelectedTreeCell(this._targetListName, 1),
        //         out: null
        //     }

        //     let dialog = this.openTimespanDialog(timespan);

        //     if (dialog) {
        //         alert('before name: ' + timespan.name);
        //         alert('after  name: ' + dialog.result.name);
        //     }
        // }
    },

    openTimespanDialog: function(tsElement) {
        var data = tsElement == null ? {} : tsElement;
        document.documentElement.openSubDialog(
            "chrome://mailmindr/content/dialogs/timespaneditor.xul",
            "", data);

        if (data.out && data.out.result != null) {
            this._logger.log('>> REFRESH');
            mailmindrPrefPaneCommon.doRefreshAll();
        }

        return data.out;
    },

    deleteTimespan: function() {
        var timespan = this.SelectedTimespan;
        if (timespan == null) {
            return;
        }

        let promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                              .getService(Components.interfaces.nsIPromptService);

        let title = this._strings.GetStringFromName("mailmindr.prefpane.timespan.delete.title");
        let text = this._strings.GetStringFromName("mailmindr.prefpane.timespan.delete.text");

        if (promptService.confirm(null, title, text)) {
            mailmindrKernel.kernel.modules.storage.deleteTimespan(timespan);
            this.refresh();
        }
    },

    refresh : function() {
        this.loadTimespans();
    },

    loadTimespans: function() {
        try {
            let index = this._listElement.selectedIndex;
            mailmindrCommon.clearChildren(this._listElement);

            this._data = mailmindrKernel.kernel.modules.storage.loadTimespans();

            for each(let item in this._data) {
                let element = document.createElement('listitem');
                element.setAttribute('label', item.text);
                element.setAttribute('value', item.id);
                this._listElement.appendChild(element);
            }
            this._listElement.selectedIndex = index;
        } catch (loadException) {
            this._logger.error(loadException);
        }
    }
}