"use strict";

let EXPORTED_SYMBOLS = [
    'mailmindrLogger',
    'MAILMINDR_LOG_DISABLED',
    'MAILMINDR_LOG_INFO',
    'MAILMINDR_LOG_ERROR',
    'MAILMINDR_LOG_WARN',
    'MAILMINDR_LOG_DEBUG',
    'mailmindrInitializeLogger'
];

const MAILMINDR_LOG_DISABLED = 0;
const MAILMINDR_LOG_INFO = 1;
const MAILMINDR_LOG_TRACE = 1;
const MAILMINDR_LOG_ERROR = 2;
const MAILMINDR_LOG_WARN = 3;
const MAILMINDR_LOG_DEBUG = 4;
const MAILMINDR_LOG_FILENAME = "mailmindr.log";

Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("chrome://mailmindr/content/utils/log4moz.jsm");

var mailmindrLoggerInitialized = false;
var mailmindrLoggerIndention = 0;

function mailmindrInitializeLogger() {
    if (mailmindrLoggerInitialized) {
        return;
    }

    let formatter = new Log4Moz.BasicFormatter();
    let root = Log4Moz.repository.rootLogger;
    let logfile = FileUtils.getFile('ProfD', ['mailmindr.log']);
    let fileAppender = new Log4Moz.RotatingFileAppender(logfile, formatter, 1024 * 1000, 9);

    fileAppender.level = Log4Moz.Level["All"];

    root.addAppender(fileAppender);

    mailmindrLoggerInitialized = true;
}

function mailmindrLogger(component, logLevel) {
    this._name = 'mailmindrLogger';
    this.initialize(component, logLevel);
    let prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService).getBranch("extensions.mailmindr.");
    this._enabled = prefs.getBoolPref("common.logging");
}

mailmindrLogger.prototype = {

    ///
    /// private fields
    ///
    _initialized: false,
    _logger: null,
    _component: '',
    _enabled: false,

    set enabled(value) {
        this._enabled = value;
    },

    ///
    /// ctor
    ///
    initialize: function(component, logLevel) {
        this._component = component._name;

        this._logger = Log4Moz.repository.getLogger("mailmindr." + this._component);
        this._logger.level = Log4Moz.Level["Debug"];

        if (logLevel != null) {
            switch (logLevel) {
                case MAILMINDR_LOG_INFO:
                case MAILMINDR_LOG_TRACE:
                    this._logger.level = Log4Moz.Level["Trace"];
                    break;
                case MAILMINDR_LOG_DEBUG:
                    this._logger.level = Log4Moz.Level["Debug"];
                    break;
                case MAILMINDR_LOG_WARN:
                    this._logger.level = Log4Moz.Level["Warn"];
                    break;
            }
        }

        // this._logger.log("component " + this._component + " initialized");

        this._initialized = true;
    },


    ///
    /// public methods
    ///
    call: function(what) {
        this.log('[call] ' + what);
        mailmindrLoggerIndention++;
    },

    end: function() {
        this.log('<<end.');
        mailmindrLoggerIndention -= (mailmindrLoggerIndention > 0) ? 1 : 0;
        this.log('[end]');
    },

    log: function(what) {
        if (this._enabled) {
            this.info(what);
        }
    },

    error: function(what) {
        if (this._enabled) {
            this._logger.error(this.space() + what);
            if (what.lineNumber) {
                this._logger.error(this.space() + ' at line: ' + what.lineNumber);
            }
        }
    },

    info: function(what) {
        if (this._enabled) {
            this._logger.info(this.space() + what);
        }
    },

    warn: function(what) {
        if (this._enabled) {
            this._logger.warn(this.space() + what);
        }
    },

    trace: function(what) {
        if (this._enabled) {
            this._logger.trace(what);
        }
    },

    explode: function(obj) {
        if (null == obj) {
            return "null";
        }

        let result = "<<" + (typeof obj) + ">>";;

        for (let attr in obj) {
            try {
                result += "[" + attr + "]  " + obj[attr] + "      " + '<<' + (typeof obj[attr]) + '>>';
            } catch (ex) {
                result += "<<ERROR: " + ex + ">>";
            }
        }

        return result;
    },

    space: function() {
        let spc = "    ";
        return ((function(s, i) {
            let r = s;
            for (let j = 0; j < i; j++) {
                r += s;
            }
            return r;
        })(spc, mailmindrLoggerIndention));
    }

};