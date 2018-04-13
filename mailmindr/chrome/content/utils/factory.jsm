/* jshint curly: true, strict: true, moz: true, undef: true, unused: true */
/* global Components, mailmindrLogger, mailmindrSearch */
"use strict";

let EXPORTED_SYMBOLS = ["mailmindrFactory"];

Components.utils.import("resource://gre/modules/PluralForm.jsm");
Components.utils.import("chrome://mailmindr/content/utils/search.jsm");
Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");


function mailmindrFactoryBase() {
    this._name = "mailmindrFactory";
    this._logger = new mailmindrLogger(this);
    this.initialize();
}

mailmindrFactoryBase.prototype = {

    initialize: function() {
        let src = "chrome://mailmindr/locale/utils/core.properties";
        let localeService = Components.classes["@mozilla.org/intl/nslocaleservice;1"]
            .getService(Components.interfaces.nsILocaleService);
        let appLocale = localeService.getApplicationLocale();
        let stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
            .getService(Components.interfaces.nsIStringBundleService);

        this._strings = stringBundleService.createBundle(src, appLocale);
    },



    ///////////////////////////////////////////////////////////////////////
    /////// mindr
    ///////

    /**
     * createTimeSpan - creates an empty mindr object
     * @returns a mindr object
     */
    createMindr: function() {
        let uuidGenerator = Components.classes["@mozilla.org/uuid-generator;1"]
            .getService(Components.interfaces.nsIUUIDGenerator);

        function mailmindrMindr() {
            this._name = "mailmindrDataMindr";
            this._logger = new mailmindrLogger(this);
        }

        mailmindrMindr.prototype = {
            id: -1,
            mailmindrGuid: uuidGenerator.generateUUID().toString(),
            _mailguid: "",
            set mailguid(messageId) {
                this._mailguid = messageId.replace('<', '').replace('>', '');
            },

            get mailguid() {
                return this._mailguid;
            },

            remindat: -1,
            waitForReply: false,
            action: null,
            performed: false,
            targetFolder: "",
            doShowDialog: false,
            doMarkAsUnread: false,
            doMarkFlag: false,
            doTagWith: "",
            doMoveOrCopy: 0,
            doTweet: false,
            doRunCommand: "",
            doMailmindrPush: false,
            originFolderURI: "",
            lastSeenURI: "",

            _valid: false,
            _lastError: "",
            _details: {
                author: '',
                subject: '',
                recipients: '',
                note: ''
            },
            _isReplyAvailable: null,

            set Action(action) {
                this.setActionTemplate(action);
            },

            set DateTime(datetime) {
                this.remindat = datetime.getTime();
            },

            get RemainingMilliseconds() {
                return this.remindat - Date.now();
            },

            set IsReplyAvailable(replayAvailable) {
                this._isReplyAvailable = replayAvailable;
            },

            get IsReplyAvailable() {
                // TODO: get replies when this._isReplyAvailable == null;
                /*
					if (this._isReplyAvailable == null) {
						mailmindrStorage.loadReplyListForMindr(this);
					}
					*/

                return this._isReplyAvailable;
            },

            ///
            /// alias for mailguid
            ///
            get MessageId() {
                return this.mailguid;
            },

            setActionTemplate: function(actionTemplate) {
                this.targetFolder = actionTemplate.targetFolder;
                this.doShowDialog = actionTemplate.doShowDialog;
                this.doMarkAsUnread = actionTemplate.doMarkAsUnread;
                this.doMarkFlag = actionTemplate.doMarkFlag;
                this.doTagWith = actionTemplate.doTagWith;
                this.doMoveOrCopy = actionTemplate.doMoveOrCopy;
                this.doTweet = actionTemplate.doTweet;
                this.doRunCommand = actionTemplate.doRunCommand;
                this.doMailmindrPush = actionTemplate.doMailmindrPush;
            },

            setDateTime: function(yyyy, mm, dd, hh, min) {
                let when = new Date();
                when.setFullYear(yyyy, mm, dd);
                when.setHours(hh);
                when.setMinutes(min);

                this.remindat = when.getTime();
            },

            validate: function() {
                let valid = true;

                // check if reminder is in future
                let at = new Date(this.remindat);
                if ((Date.now() >= at)) {
                    this._valid = false;
                    this._lastError = "mailmindr.utils.core.mailmindrmindr.ispast";

                    return false;
                }

                return this._valid;
            },

            get details() {
                return this._details;
            },

            set details(detailObject) {
                this._details = detailObject;
            },

            get isInboxZero() {
                return ((typeof this.originFolderURI != 'undefined') && (this.originFolderURI != ''));
            },

            /**
             * property isValid
             * @returns true, when mindr is valid, false otherwise
             */
            get isValid() {
                return this.validate();
            }
        };

        return new mailmindrMindr();
    },

    ///////////////////////////////////////////////////////////////////////
    /////// actiontemplate
    ///////

    /**
     * createActionTemplate - creates an empty action object
     * @returns a action object
     */
    createActionTemplate: function() {
        let uuidGenerator = Components.classes["@mozilla.org/uuid-generator;1"]
            .getService(Components.interfaces.nsIUUIDGenerator);

        function mailmindrAction() {
            this._name = "mailmindrDataAction";
            this._logger = new mailmindrLogger(this);
        }

        mailmindrAction.prototype = {
            id: uuidGenerator.generateUUID().toString(),
            isGenerated: false,
            text: "",
            description: "",
            enabled: true,
            targetFolder: "",
            doShowDialog: false,
            doMarkAsUnread: false,
            doMarkFlag: false,
            doTagWith: "",
            doMoveOrCopy: 0,
            doTweet: false,
            doRunCommand: "",
            doMailmindrPush: false,

            /**
             * copyTo - copies action to target object
             * copies only 'public' fields, 'privates' (prefixed with _) wil be ignored
             * @returns the given object filled up with the actions' values
             */
            copyTo: function(obj) {
                for (let field in this) {
                    // copy only public fields
                    if ((field.indexOf("_") != 0) && (field != "id") && (field != "isValid") && (field != "text") && (typeof this[field] != "function") && (typeof obj[field] != "undefined")) {
                        obj[field] = this[field];
                    }
                }

                return obj;
            },


            /**
             * validate - validates the action
             * @returns true, if action is valid, false otherwise
             */
            validate: function() {
                return true;
            },


            /**
             * property isValid
             * @returns true, when mindr is valid, false otherwise
             */
            get isValid() {
                return this.validate();
            },

            toJson: function() {
                let includedProperties = [
                    'id',
                    'isGenerated',
                    'text', 
                    'description',
                    'targetFolder',
                    'doShowDialog', 
                    'doMarkAsUnread', 
                    'doMarkFlag',
                    'doTagWith', 
                    'doMoveOrCopy', 
                    'doTweet', 
                    'doRunCommand', 
                    'doMailmindrPush'
                ];

                let data = {};
                for each(let property in includedProperties) {
                    data[property] = this[property];
                }

                return JSON.stringify(data);
            },

            

        };

        return new mailmindrAction();
    },

    ///////////////////////////////////////////////////////////////////////
    /////// timespan
    ///////

    /**
     * createTimeSpan - creates an empty timespan object
     * @returns a timespan object
     */
    createTimespan: function() {
        let parentStrings = this._strings;

        function mailmindrTimespan() {
            this._name = "mailmindrDataTimespan";
            this._strings = parentStrings;
            this._logger = new mailmindrLogger(this);
        }

        mailmindrTimespan.prototype = {
            _preset: false,
            _isFixedTime: false,
            days: 0,
            hours: 0,
            minutes: 0,
            text: "",

            set isFixedTime(value) {
                if ('string' == typeof value) {
                    this._isFixedTime = 'true' == value;
                } else if ('number' == typeof value) {
                    this._isFixedTime = 1 == value;
                } else {
                    this._isFixedTime = value;
                }
            },
            get isFixedTime() {
                return this._isFixedTime;
            },

            /**
             * will create something like
             * 		"2 days, 5 minutes"
             *  	" 1 day, 5 hours, 2 minutes"
             */
            toString: function() {
                if (this._preset) {
                    return this.text;
                }

                let pair = this._strings.GetStringFromName("mailmindr.utils.core.timePair");
                let buffer = "";
                let fields = this.isFixedTime ? ['days'] : ['days', 'hours', 'minutes'];
                for each(let field in fields) {
                    let value = this[field];
                    if (value > 0) {
                        buffer += ", " + pair
                            .replace("#1", value)
                            .replace("#2", this._pluralize(value, "mailmindr.utils.core." + field));
                    }
                }
                let span = (buffer.replace(/^, /, ""));

                if (!this.isFixedTime) {
                    return span;
                }

                buffer = this._strings.GetStringFromName("mailmindr.utils.core.fix.tostringpattern");

                return buffer.replace('#1', span).replace('#2', this.getLocalizedTime());
            },

            /**
             * will create something like
             * 		"tomorrow"
             *  	"in 5 seconds"
             */
            toRelativeString: function() {
                if (this._preset) {
                    return this.text;
                }

                let daysPluralized = '';
                if (this._isFixedTime) {
                    if ((this.days >= 7) && (this.days % 7 == 0)) {
                        daysPluralized = this._pluralize(this.days / 7, "mailmindr.utils.core.relative.weeks");
                    } else if (this.days > 0) {
                        daysPluralized = this._pluralize(this.days, "mailmindr.utils.core.relative.days");
                    } else if (this.days == 0) {
                        daysPluralized = this._strings.GetStringFromName("mailmindr.utils.core.relative.today");
                    }

                    if (this._isFixedTime && this.days >= 0) {
                        let buffer = this._strings.GetStringFromName('mailmindr.utils.core.fix.tostringpattern');
                        return buffer.replace('#1', daysPluralized).replace('#2', this.getLocalizedTime());
                    }
                } else {
                    return this.toString();
                    /*
					if ((this.days >= 7) && (this.days % 7 == 0)) {
						return this._pluralize(this.days / 7, "mailmindr.utils.core.relative.weeks");
					} else if (this.days > 0) {
						return this._pluralize(this.days, "mailmindr.utils.core.relative.days");
					} else if (this.hours > 0) {
						return this._pluralize(this.hours, "mailmindr.utils.core.relative.hours");
					}
					*/
                }
            },

            _pluralize: function(num, identifier) {
                let str = PluralForm.get(num, this._strings.GetStringFromName(identifier));
                return str.replace("#1", num);
            },

            serialize: function() {
                let buffer = [this.days, this.hours, this.minutes, this.isFixedTime];
                return buffer.join(';');
            },

            getLocalizedTime: function() {
                let time = new Date();
                time.setHours(this.hours);
                time.setMinutes(this.minutes);
                return time.toLocaleFormat('%H:%M');
            },

            /**
             * create a combobox entry with
             */
            setPreset: function(preset) {
                this._preset = true;

                this.days = preset;
                this.minutes = preset;
                this.hours = preset;
                this.isFixedTime = false;

                this.text = this._strings.GetStringFromName("mailmindr.utils.core.timespan.preset." + Math.abs(preset));
            }
        };

        let result = new mailmindrTimespan();
        if (arguments.length > 0) {
            result.setPreset(arguments[0]);
        }
        return result;
    },


    ///////////////////////////////////////////////////////////////////////
    /////// reply-object
    ///////

    createReplyForMindr: function(mindr) {
        let result = this.createReplyObject();
        result.replyForMindrGuid = mindr.mailmindrGuid;
        return result;
    },

    createReplyObject: function() {
        return {
            replyForMindrGuid: "",
            mailguid: "",
            sender: "",
            recipients: "",
            receivedAt: 0
        }
    },


    ///////////////////////////////////////////////////////////////////////
    /////// RDF Service
    ///////

    getRDFService: function() {
        return Components.classes["@mozilla.org/rdf/rdf-service;1"].getService(Components.interfaces.nsIRDFService);
    }
}


var mailmindrFactory = new mailmindrFactoryBase();