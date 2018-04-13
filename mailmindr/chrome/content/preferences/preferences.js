"use strict";

Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");
Components.utils.import("chrome://mailmindr/content/utils/core.jsm");
// Components.utils.import("chrome://mailmindr/content/utils/storage.jsm");
Components.utils.import("chrome://mailmindr/content/modules/kernel.jsm")

const MAILMINDR_PREFPANES = [mailmindrPrefPaneCommon, mailmindrPrefPaneInboxZero, mailmindrPrefPaneTimespan];

var gRDF = Components.classes["@mozilla.org/rdf/rdf-service;1"].getService(Components.interfaces.nsIRDFService);

var mailmindrPreferences = {
    _name: "mailmindrPreferences",
    _logger: null,
    _initialized: false,
    _elements: {},

    initialize: function() {
        this._logger = new mailmindrLogger(this);

        try {
            mailmindrKernel.kernel.attachWindowGlobalUiErrorHandler(window, this._logger);

            this._elements.tagSelector = document.getElementById("mailmindrOnTagSelector");
            this._elements.tagTimespanSelector = document.getElementById("mailmindrOnTagTimespanSelector");

            this._elements.defaultTimespanSelector = document.getElementById("mailmindrDefaultTimespanSelector");

            this._elements.targetFolderIncoming = document.getElementById("mailmindrTargetFolderIncoming");
            this._elements.targetFolderSent = document.getElementById("mailmindrTargetFolderSent");

            /* now initialize all panes */
            for each(let pane in MAILMINDR_PREFPANES) {
                pane.initialize();

                if (typeof pane.loadPreferences == 'function') {
                    pane.loadPreferences();
                }
            }

            this.refresh();
        } catch (exception) {
            this._logger.error('messup on preferences detected');
            this._logger.error(exception);
        }
        this._initialized = true;
    },

    onLoad: function() {
        this.initialize();
    },

    doRefreshAll: function() {
        for each(let pane in MAILMINDR_PREFPANES) {
            pane.refresh();
        }
    },

    refresh: function() {
        this.doRefreshAll();
    },

    onAccept: function() {
        try {
            this._logger.log('ACCEPT');

            const prefBrowserBranch = "browser.preferences.";

            let prefService = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService);
            let prefs = prefService.getBranch(prefBrowserBranch);

            //if (prefs && prefs.getBoolPref("instantApply") == true) {

                let panes = document.getElementsByTagName("prefpane");
                for each(let pane in panes) {
                    if (pane instanceof Components.interfaces.nsIDOMXULElement) {
                        pane.writePreferences(true);
                    }
                }
                
            //}

            for each(let pane in MAILMINDR_PREFPANES) {
                this._logger.log('save panel: ' + typeof pane.savePreferences);
                if (typeof pane.savePreferences == 'function') {
                    pane.savePreferences();
                }
            }

            window.close();
        } catch (e) {
            this._logger.error("preferences can't be saved: " + e);
        }

        return true;
    }
};