"use strict";

Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");
Components.utils.import("chrome://mailmindr/content/utils/core.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

var mailmindrPrefPaneInboxZero = {
    _initialized: false,
    _name: 'mailmindrPrefpaneInboxZero',
    _logger: null,
    _data: [],
    _strings: null,

    initialize: function() {
        this._logger = new mailmindrLogger(this);
        try {
            this._logger.log('initialize : prefpane.inboxzero.js');

            this._inboxMappingList = document.getElementById("mailmindrInboxZeroMappingList");

            let src = "chrome://mailmindr/locale/preferences/prefpane.inboxzero.properties";
            let localeService = Components.classes["@mozilla.org/intl/nslocaleservice;1"]
                .getService(Components.interfaces.nsILocaleService);
            let appLocale = localeService.getApplicationLocale();
            let stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService);

            this._strings = stringBundleService.createBundle(src, appLocale);

            this.refresh();

            // build the UI 
            let accounts = mailmindrCore.getAccounts();
            this._createListMarkup(accounts);

            this._initialized = true;
        } catch (initException) {
            this._logger.error(initException);
        }
    },

    refresh: function() {
        if (!this._initialized) {
            return;
        }
    },

    _createListMarkup: function(accountList) {
        let rows = this._inboxMappingList;

        let index = 0;
        for each(let account in accountList) {
            if (account.isLocal) {
                continue;
            }

            let row = document.createElement('row');

            let labelElement = document.createElement('label');
            labelElement.setAttribute('value', account.displayName);

            let pickerElement = document.createElement('menulist');
            pickerElement.setAttribute('id', 'picker-' + index);
            pickerElement.setAttribute('data-hash', account.key);

            this._createFolderPicker(pickerElement, account.key);

            row.appendChild(labelElement);
            row.appendChild(pickerElement);
            rows.appendChild(row);

            mailmindrCommon.listAllFolders(pickerElement, '', account.account);

            index++;
        }
    },

    _createFolderPicker: function(parent, pickerId) {
        let popup = document.createElement('menupopup');
        let emptyItem = document.createElement('menuitem');
        let emptyLabel = this._strings.GetStringFromName('mailmindr.prefpane.inboxzero.selectfolder.label');
        emptyItem.setAttribute('label', emptyLabel);
        emptyItem.setAttribute('value', '');

        popup.appendChild(emptyItem);
        parent.appendChild(popup);
    },

    savePreferences: function() {
        let selector = 'menulist';
        let elements = this._inboxMappingList.querySelectorAll(selector);

        let accounts = [];
        let data = {};

        this._logger.log('found items: ' + elements.length);

        let index = 0;
        for each(let element in elements) {
            if (element == null || !(element instanceof Components.interfaces.nsIDOMXULElement)) {
                continue;
            };

            let key = element.getAttribute('data-hash');
            accounts.push(key);

            let item = {
                'key': key,
                'folderURI': element.value,
                'folderDisplayName': element.label.trim()
            };

            data[key] = item;
            index++;
        }

        let serializedData = JSON.stringify(data);
        let serializedAccounts = JSON.stringify(accounts);

        mailmindrCore.writePreference('common.inboxZeroAccounts', serializedAccounts);
        mailmindrCore.writePreference('common.inboxZeroPreferences', serializedData);
    },

    loadPreferences: function() {
        this._logger.log('loading preferences - inbox');
        let serializedAccounts = mailmindrCore.readPreference('common.inboxZeroAccounts', '');
        let serializedData = mailmindrCore.readPreference('common.inboxZeroPreferences', '');

        let keys = serializedAccounts.length > 0 ? JSON.parse(serializedAccounts) : [];
        let data = serializedData.length > 0 ? JSON.parse(serializedData) : {};

        for each(let key in keys) {
            let item = data[key];
            if (typeof item == 'undefined') {
                continue;
            }

            let selector = 'menulist[data-hash="' + key + '"]';
            let target = this._inboxMappingList.querySelector(selector);
            if (target) {
                target.value = item.folderURI || '';
                if (target.selectedIndex < 0) {
                    target.value = '';
                }
            }
        }
    }
}