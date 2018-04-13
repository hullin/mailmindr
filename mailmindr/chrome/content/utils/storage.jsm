/* jshint curly: true, strict: true, multistr: true, moz: true, undef: true, unused: true */
/* global Components, mailmindrLogger, mailmindrSearch */
"use strict";

/* set constants */
const Cc = Components.classes;
const Ci = Components.interfaces;
const MAILMINDR_FILE_DATABASE = "mailmindr.sqlite";

Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");
Components.utils.import("chrome://mailmindr/content/utils/factory.jsm");
Components.utils.import("resource://gre/modules/AddonManager.jsm");

let EXPORTED_SYMBOLS = ["mailmindrStorage"];

function mailmindrStorageBase() {
    mailmindrInitializeLogger();
    this._name = "mailmindrStorage";
    this._logger = new mailmindrLogger(this, MAILMINDR_LOG_DEBUG);

    this.initialize();
}

mailmindrStorageBase.prototype = {

    ///
    /// Private fields
    ///
    _initialized: false,
    _db: null,
    _commands: {},

    ///
    /// table definitions
    ///
    _schema: {
        tableNames: ["mindr", "actionTemplate", "timespan", "replies"],
        tables: {
            mindr: "id INTEGER PRIMARY KEY NOT NULL, \
                mailmindrGuid VARCHAR(255) NOT NULL , \
                mailguid VARCHAR(255) NOT NULL , \
                remindat LONG NOT NULL, \
                waitForReply BOOL DEFAULT false, \
                action INTEGER DEFAULT 0, \
                performed BOOL DEFAULT false, \
                targetFolder VARCHAR(255), \
                doShowDialog BOOL DEFAULT false, \
                doMarkAsUnread BOOL DEFAULT false, \
                doMarkFlag BOOL DEFAULT false, \
                doTagWith VARCHAR(47), \
                doMoveOrCopy INTEGER DEFAULT 0, \
                doTweet BOOL DEFAULT false, \
                doRunCommand VARCHAR(1024), \
                doMailmindrPush BOOL DEFAULT false \
                ",
            actionTemplate: "id INTEGER PRIMARY KEY NOT NULL, \
                isGenerated BOOL DEFAULT false, \
                text VARCHAR(255), \
                description VARCHAR(1024), \
                enabled BOOL DEFAULT true, \
                targetFolder VARCHAR(255), \
                doShowDialog BOOL DEFAULT false, \
                doMarkAsUnread BOOL DEAULT false, \
                doMarkFlag BOOL DEFAULT false, \
                doTagWith VARCHAR(47), \
                doMoveOrCopy INTEGER DEFAULT 0, \
                doTweet BOOL DEFAULT false, \
                doRunCommand VARCHAR(1024), \
                doMailmindrPush BOOL DEFAULT false \
                ",
            timespan: "id INTEGER PRIMARY KEY NOT NULL, \
                isGenerated BOOL DEFAULT false, \
                text VARCHAR(255) NOT NULL, \
                days INTEGER DEFAULT 0, \
                hours INTEGER DEFAULT 0, \
                minutes INTEGER DEFAULT 0 \
                ",
            replies: "id INTEGER PRIMARY KEY NOT NULL, \
                replyForMindrGuid VARCHAR(255) NOT NULL, \
                mailguid VARCHAR(255) NOT NULL, \
                sender, \
                recipients, \
                receivedAt LONG NOT NULL \
                "
        },

        updates: {
            '0.7.1': [],
            '0.7.2': [
                "UPDATE mindr SET performed = 0 WHERE performed = 'false';",
                "CREATE TABLE IF NOT EXISTS settings ( \
                        id INTEGER PRIMARY KEY NOT NULL, \
                        key VARCHAR(255) NOT NULL, \
                        value TEXT, \
                        UNIQUE (key) ON CONFLICT REPLACE \
                        ) \
                    "
            ],
            '0.7.2.1': [],
            '0.7.3': [],
            '0.7.4': [],
            '0.7.5': [
                "ALTER TABLE timespan ADD COLUMN 'isFixedTime' BOOL NOT NULL DEFAULT 0;",
                "ALTER TABLE mindr ADD COLUMN 'isEnabled' BOOL NOT NULL DEFAULT 1;"
            ],
            '0.7.6': [],
            '0.7.7': [],
            '0.7.8': [
                // --  REMOVED "ALTER TABLE mindr ADD COLUMN 'AlarmBeforeEventMinutes' INTEGER NOT NULL DEFAULT 15;",
                "UPDATE mindr SET isEnabled = 0 WHERE performed = 1;",
                "ALTER TABLE mindr ADD COLUMN 'originFolderURI' VARCHAR(255)",
                "CREATE TABLE IF NOT EXISTS mindrDetails ( \
                    mailmindrGuid VARCHAR(255) NOT NULL , \
                    subject TEXT, \
                    author TEXT, \
                    recipients TEXT, \
                    note TEXT)"
            ],
            '0.7.9': [],
            '0.7.9.1': [],
            '0.7.9.2': [],
            '0.7.9.3': [],
            '0.7.9.4': []
        }
    },

    ///
    /// 
    ///
    get Initialized() {
        return this._initialized;
    },

    ///
    /// Private methods
    ///
    /**
     * _createDataBase - called when a new database file was created.
     * opens the connection and call _createTables
     */
    _createDatabase: function(aDBService, aDBFile) {
        let dbConnection = aDBService.openDatabase(aDBFile);
        this._createTables(dbConnection);
        return dbConnection;
    },

    /**
     * _createTables - create all tables in an empty database
     */
    _createTables: function(aDBConnection) {
        for each(let tableName in this._schema.tableNames) {
            aDBConnection.createTable(tableName, this._schema.tables[tableName]);
        }
    },

    /**
     * _ensureDatabase - ensure that the database is there and ready to use.
     * if there's no mailindr.sqlite: create it
     */
    _ensureDatabase: function() {
        try {
            let dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
            let dbFile = dirService.get("ProfD", Ci.nsIFile);

            dbFile.append(MAILMINDR_FILE_DATABASE);

            var dbService = Cc["@mozilla.org/storage/service;1"].getService(Ci.mozIStorageService);
            var dbConnection;

            if (!dbFile.exists()) {
                this._logger.log('!!> mailmindr.sqlite not found. initiating new database file.');
                dbConnection = this._createDatabase(dbService, dbFile);
            } else {
                dbConnection = dbService.openDatabase(dbFile);
            }

            this._db = dbConnection;
        } catch (ex) {
            this._logger.error(ex);
        }
    },

    _runDatabaseUpdate: function(updateFromVersion, updateToVersion) {
        this._logger.log('run database update from version ' + updateFromVersion + ' #> ' + updateToVersion);

        let versions = [];

        for (let version in this._schema.updates) {
            if ((version <= updateFromVersion) || (version > updateToVersion)) {
                this._logger.log('skip version ' + version);

                if (version <= updateFromVersion) {
                    this._logger.log(' upd ' + version + ' < ' + updateFromVersion);
                }

                if (version > updateToVersion) {
                    this._logger.log(' upd ' + version + ' > ' + updateToVersion);
                }
                continue;
            }

            versions.push(version);
        }

        for each(let version in versions) {
            this._logger.log('run update for ' + version);
            try {
                let commands = this._schema.updates[version];

                if (commands.length == 0) {
                    this._logger.log('version ' + version + ' has no updates');
                    this._setDatabaseVersion(version);
                    continue;
                }

                this._db.beginTransaction();

                this._runDatabaseUpdateBatch(commands);
                this._setDatabaseVersion(version);

                this._db.commitTransaction();
            } catch (e) {
                this._logger.error(e);
                this._logger.log('rollback transaction');
                this._db.rollbackTransaction();
                this._logger.log('rollback complete');
            }
        }

        this._logger.log(versions);
    },

    _runDatabaseUpdateBatch: function(commands) {
        for each(let cmd in commands) {
            this._logger.log('       run command: ' + cmd);
            this._db.executeSimpleSQL(cmd);
        }
    },


    _setDatabaseVersion: function(version) {
        let currentVersion = this.getCurrentDatabaseVersion();

        if (version == currentVersion) {
            return;
        }

        if (!this._db.tableExists("settings")) {
            return;
        }

        let versionUpdate = {
            version: version
        };

        if (this._commands.setVersion == null) {
            this._commands.setVersion = this._createStatement(
                "INSERT INTO settings (key, value) VALUES ('version', :version)"
            );
        }

        this._execute(this._commands.setVersion, ["version"], versionUpdate);
    },


    /**
     * _prepareStatements - prepares all SQL statements (ready to use)
     */
    _prepareStatements: function() {
        if (this._db) {
            var queryMindr = 
                "SELECT * FROM mindr " + 
                "LEFT OUTER JOIN mindrDetails ON mindr.mailmindrGuid = mindrDetails.mailmindrGuid ";

            this._commands.getLastInsertId = this._createStatement(
                "SELECT last_insert_rowid() as last_insert_id"
            );

            // SELECTs => get* prefix
            this._commands.getAllActiveMindrs = this._createStatement(
                queryMindr +
                "WHERE isEnabled = 1 ORDER BY remindat ASC"
            );

            this._commands.getMindrByGuid = this._createStatement(
                queryMindr +
                "WHERE mindr.mailmindrGuid = :mailmindrGuid"
            );

            this._commands.getAllRepliesForMindr = this._createStatement(
                "SELECT * FROM replies WHERE replyForMindrGuid = :mailmindrGuid"
            );

            this._commands.getTimespans = this._createStatement(
                "SELECT * FROM timespan"
            );

            this._commands.getTimespan = this._createStatement(
                "SELECT * FROM timespan WHERE id = :id"
            );

            // INSERTs => create* prefix
            this._commands.saveMindr = this._createStatement(
                "INSERT INTO mindr " +
                "(mailmindrGuid, mailguid, remindat, waitForReply, action, performed, targetFolder, doShowDialog, doMarkAsUnread, doMarkFlag, doTagWith, doMoveOrCopy, doTweet, doRunCommand, doMailmindrPush, originFolderURI)" +
                " VALUES " +
                "(:mailmindrGuid, :mailguid, :remindat, :waitForReply, 0, 0, :targetFolder, :doShowDialog, :doMarkAsUnread, :doMarkFlag, :doTagWith, :doMoveOrCopy, :doTweet, :doRunCommand, :doMailmindrPush, :originFolderURI)"
            );

            this._commands.saveReply = this._createStatement(
                "INSERT INTO replies " +
                "(replyForMindrGuid, mailguid, sender, recipients, receivedAt)" +
                " VALUES " +
                "(:replyForMindrGuid, :mailguid, :sender, :recipients, :receivedAt)"
            );

            this._commands.saveTimespan = this._createStatement(
                "INSERT INTO timespan " +
                "(isGenerated, text, days, hours, minutes, isFixedTime) " +
                "VALUES " +
                "(:isGenerated, :text, :days, :hours, :minutes, :isFixedTime)"
            );

            this._commands.saveMindrDetails = this._createStatement(
                "INSERT INTO mindrDetails" + 
                "(mailmindrGuid, subject, author, recipients, note)" + 
                "VALUES " +
                "(:mailmindrGuid, :subject, :author, :recipients, :note)"
            );

            // UPDATEs => modify* prefix
            this._commands.modifyMindr = this._createStatement(
                "UPDATE mindr SET " +
                "remindat = :remindat, waitForReply = :waitForReply, performed = :performed, targetFolder = :targetFolder, doShowDialog = :doShowDialog, doTagWith = :doTagWith, doMarkAsUnread = :doMarkAsUnread, doMarkFlag = :doMarkFlag, doMoveOrCopy = :doMoveOrCopy, doTweet = :doTweet, doRunCommand = :doRunCommand, doMailmindrPush = :doMailmindrPush, originFolderURI = :originFolderURI " +
                "WHERE mailmindrGuid = :mailmindrGuid"
            );

            this._commands.modifyTimespan = this._createStatement(
                "UPDATE timespan SET " +
                "isGenerated = :isGenerated, text = :text, days = :days, hours = :hours, minutes = :minutes, isFixedTime = :isFixedTime " +
                "WHERE id = :id"
            );

            this._commands.updateMindrDetails = this._createStatement(
                "UPDATE mindrDetails SET " +
                "note = :note " + 
                "WHERE mailmindrGuid = :mailmindrGuid"
            );

            // DELETE mindr
            this._commands.deleteMindr = this._createStatement(
                "UPDATE mindr SET " +
                "isEnabled = 0 " +
                "WHERE mailmindrGuid = :mailmindrGuid"
            );

            this._commands.deleteTimespan = this._createStatement(
                "DELETE FROM timespan WHERE id = :id"
            );

            this._commands.deleteMindrDetails = this._createStatement(
                "DELETE FROM mindrDetails WHERE mailmindrGuid = :mailmindrGuid"
            );

            // others..
            this._commands.getPreference = this._createStatement(
                "SELECT value FROM settings WHERE key = :key"
            );

            this._commands.setPreference = this._createStatement(
                "UPDATE settings SET value = :value WHERE key = :key"
            );

            this._commands.initPreference = this._createStatement(
                "INSERT INTO settings (key, value) VALUES (:key, :value)"
            );

        } else {
            this._logger.error('houston, we have a problem: the database is gone.');
        }
    },

    /**
     * _createStatement - wrapper for createStatement stuff
     * @returns the created statemwent or null, if creation failed
     */
    _createStatement: function(query) {
        try {
            let stmt = this._db.createStatement(query);
            return stmt;
        } catch (createException) {
            this._logger.error(createException);
            this._logger.error(' > ' + query);
        }
        this._logger.warn('_createStatement returns null (!)');
        return null;
    },

    _getLastInsertId: function() {
        let query = this._commands.getLastInsertId;

        try {
            if (query.step()) {
                return query.row.last_insert_id;
            }
        } catch (loadException) {
            this._logger.error(loadException);
        } finally {
            if (query) {
                query.reset();
            }
        }

        return -1;
    },

    /**
     * _loadMindrFromRow - load a mindr from a given result/row
     */
    _loadMindrFromRow: function(row) {
        let mindr = mailmindrFactory.createMindr();
        mindr.id = row.id;
        mindr.mailmindrGuid = row.mailmindrGuid;
        mindr.mailguid = row.mailguid;
        mindr.remindat = row.remindat;
        mindr.waitForReply = row.waitForReply;
        mindr.action = row.action;
        mindr.performed = row.performed;
        mindr.targetFolder = row.targetFolder;
        mindr.doShowDialog = row.doShowDialog;
        mindr.doMarkAsUnread = row.doMarkAsUnread;
        mindr.doMarkFlag = row.doMarkFlag;
        mindr.doTagWith = row.doTagWith;
        mindr.doMoveOrCopy = row.doMoveOrCopy;
        mindr.doTweet = row.doTweet;
        mindr.doRunCommand = row.doRunCommand;
        mindr.doMailmindrPush = row.doMailmindrPush;
        mindr.originFolderURI = row.originFolderURI;

        mindr.details = {
            subject: row.subject || '',
            author: row.author || '',
            recipients: row.recipients || '',
            note: row.note || ''
        }

        try {
            // this._logger.log('       checking for replies.');
            let replies = this.loadReplyListForMindr(mindr);
            // this._logger.log('       -> found: ' + replies.length + ' replies);');
            mindr.IsReplyAvailable = (replies.length > 0);
        } catch (ex) {
            this._logger.error('cannot load mindr ' + ex);
        }
        return mindr;
    },

    /**
     * _loadReplyFromRow - loads a reply object from given db table row
     */
    _loadReplyFromRow: function(row) {
        let reply = mailmindrFactory.createReplyObject();
        for (let field in reply) {
            reply[field] = row[field];
        }
        return reply;
    },

    _loadTimespanFromRow: function(row) {
        let timespan = mailmindrFactory.createTimespan();
        let valid = false;
        for each(let field in ['id', 'isGenerated', 'days', 'hours', 'minutes', 'text', 'isFixedTime']) {
            if ('undefined' != typeof row[field]) {
                valid = true;
                timespan[field] = row[field];
            }
        }

        return !valid ? null : timespan;
    },

    /**
     * _bindObjectToParams
     * @returns prepared query
     */
    _bindObjectToParams: function(query, fields, obj) {
        let params = query.newBindingParamsArray();
        let binding = params.newBindingParams();

        try {
            for each(let fieldName in fields) {
                let value = obj[fieldName];

                // let tQuery = typeof query.params[fieldName];
                // let tObject = typeof obj[fieldName];

                binding.bindByName(fieldName, value);
            }
        } catch (e) {
            this._logger.error('parameter binding failed');
            this._logger.error(e);
        }

        params.addParams(binding);
        query.bindParameters(params);

        return query;
    },

    /**
     * _execute - a generic sql execution method for object
     * mappes an object to a table with restriction: obj.fieldName = table.fieldName
     */
    _execute: function(query, fields, obj) {
        let result = true;

        try {
            query = this._bindObjectToParams(query, fields, obj);
            query.execute();

            result = true;
        } catch (executeException) {
            this._logger.error('execute::' + executeException);
            this._logger.error('   > query ' + query);
            this._logger.error('   > fields ' + fields);
            this._logger.error('   > obj ' + obj);
            result = false;
        } finally {
            if (query) {
                query.reset();
            }
        }

        return result;
    },


    ///////////////////////////////////////////////////////////////////////
    /////// public methods
    ///////

    /**
     * loadMindrs - load all mindrs from the db
     * @returns array of all mindrs
     */
    loadMindrs: function() {

        let mindrBuffer = [];
        let query = this._commands.getAllActiveMindrs;

        if (!this._initialized) {
            this._logger.warn('currently _not_ initialized');
            return [];
        }

        try {
            while (query.step()) {
                let mindr = this._loadMindrFromRow(query.row);
                mindrBuffer.push(mindr);
            }
        } catch (loadException) {
            this._logger.error(loadException);
        } finally {
            if (query) {
                query.reset();
            }
        }

        return mindrBuffer;
    },


    /**
     * saveMindr - stores a mindrobject to the database
     * @returns true if mindr was saved, false otherwise
     */
    saveMindr: function(mindr) {
        let query = this._commands.saveMindr;
        let fields = ["mailmindrGuid", "mailguid", "remindat", "waitForReply", "targetFolder", "doShowDialog", "doMarkAsUnread", "doMarkFlag", "doTagWith", "doMoveOrCopy", "doTweet", "doRunCommand", "doMailmindrPush", "originFolderURI"];

        let result = this._execute(query, fields, mindr);
        mindr.id = this._getLastInsertId();

        return result && this.saveMindrDetails(mindr);
    },

    /**
     * updateMindr - updates a mindr with the current object values
     */
    updateMindr: function(mindr) {
        let query = this._commands.modifyMindr;
        let fields = ["remindat", "waitForReply", "performed", "targetFolder", "doShowDialog", "doMarkAsUnread", "doMarkFlag", "doTagWith", "doMoveOrCopy", "doTweet", "doRunCommand", "doMailmindrPush", "originFolderURI", "mailmindrGuid"];

        let queryNotes = this._commands.updateMindrDetails;
        let fieldNotes = ["note", "mailmindrGuid"];
        let obj = {
            note : mindr.details.note,
            mailmindrGuid : mindr.mailmindrGuid
        };

        return this._execute(query, fields, mindr)
            && this._execute(queryNotes, fieldNotes, obj);
    },

    deleteMindr: function(mindr) {
        let query = this._commands.deleteMindr;
        let fields = ["mailmindrGuid"];

        return this._execute(query, fields, mindr);
    },

    findMindrByGuid: function(aMailmindrGuid) {
        let query = this._bindObjectToParams(
                this._commands.getMindrByGuid,
                ['mailmindrGuid'],
                { mailmindrGuid : aMailmindrGuid }
            );

        try {
            while (query.step()) {
                let mindr = this._loadMindrFromRow(query.row);
                if (mindr) {
                    return mindr;
                }
            }
        } catch (loadException) {
            this._logger.error(loadException);
        } finally {
            if (query) {
                query.reset();
            }
        }

        return null;
    },

    /**
     * saveMindrDetails - removes the details and create a new datarecord
     */ 
    saveMindrDetails: function(mindr) {
        this.deleteMindrDetails(mindr);

        let query = this._commands.saveMindrDetails;
        let data = {
            mailmindrGuid: mindr.mailmindrGuid,
            subject: mindr.details.subject,
            author: mindr.details.author,
            recipients: mindr.details.recipients,
            note: mindr.details.note
        }
        let fields = ["mailmindrGuid", "subject", "author", "recipients", "note"];

        return this._execute(query, fields, data);
    },

    deleteMindrDetails: function(mindr) {
        this._execute(this._commands.deleteMindrDetails, ["mailmindrGuid"], mindr);
    },

    saveTimespan: function(data) {
        let query = this._commands.saveTimespan;
        let fields = ["isGenerated", "text", "days", "hours", "minutes", "isFixedTime"];

        let result = this._execute(query, fields, data);
        data.id = this._getLastInsertId();

        return result;
    },

    updateTimespan: function(data) {
        let query = this._commands.modifyTimespan;
        let fields = ["isGenerated", "text", "days", "hours", "minutes", "isFixedTime", "id"];

        return this._execute(query, fields, data);
    },

    deleteTimespan: function(data) {
        let query = this._commands.deleteTimespan;
        let fields = ["id"];

        this._execute(query, fields, data);
    },

    /**
     * loadReplyListForMindr - loads all replies for the given mindr
     * @returns Array An array of reply objects
     */
    loadReplyListForMindr: function(mindr) {
        let buffer = [];
        let query = this._commands.getAllRepliesForMindr;

        try {
            query = this._bindObjectToParams(query, ["mailmindrGuid"], mindr);
            while (query.step()) {
                let mindr = this._loadReplyFromRow(query.row);
                buffer.push(mindr);
            }
        } catch (loadException) {
            this._logger.error(loadException);
        } finally {
            if (query) {
                query.reset();
            }
        }

        return buffer;
    },

    loadTimespans: function() {
        let buffer = [];
        let query = this._commands.getTimespans;

        try {
            while (query.step()) {
                let data = this._loadTimespanFromRow(query.row);
                if (data != null) {
                    buffer.push(data);
                }
            }
        } catch (loadException) {
            this._logger.error('loadTimespans::' + loadException);
        } finally {
            if (query) {
                query.reset();
            }
        }

        return buffer;
    },

    loadTimespan: function(timespanId) {
        let data = null;
        let query = this._commands.getTimespan;
        let field = ["id"];

        this._logger.log('> loading timespan id: ' + timespanId);

        try {
            query = this._bindObjectToParams(query, field, {
                id: timespanId
            });
            if (query.step()) {
                data = this._loadTimespanFromRow(query.row);
            }
        } catch (loadException) {
            this._logger.error('loadTimespan::' + loadException);
        } finally {
            if (query) {
                query.reset();
            }
        }

        return data;
    },

    /**
     * saveReply - save the reply (for a mindr) to the database
     */
    saveReply: function(reply) {
        let query = this._commands.saveReply;
        let fields = ["replyForMindrGuid", "mailguid", "sender", "recipients", "receivedAt"];

        return this._execute(query, fields, reply);
    },

    getCurrentDatabaseVersion: function() {
        let defaultValue = '';

        if (!this._db.tableExists("settings")) {
            return defaultValue;
        }

        let query = this._createStatement("SELECT value FROM settings WHERE key = 'version'");
        try {
            if (query && query.executeStep()) {
                return query.row.value;
            }
        } finally {
            this._logger.log('finalizing query: getCurrentDatabaseVersion.');
            if (query) {
                query.reset();
            }
        }

        return defaultValue;
    },

    setPreference: function(key, value) {
        let query = this._commands.setPreference;
        let previousValue = this.findPreference(key);

        if (typeof previousValue == 'undefined') {
            query = this._commands.initPreference;
        }

        return this._execute(query, ['key', 'value'], {'key': key, 'value': value});
    },

    findPreference: function(key) {
        let query = this._commands.getPreference;

        try {
            query = this._bindObjectToParams(query, ['key'], {'key': key});
            if (query && query.step()) { 
                return query.row.value;
            }
        } finally {
            query.reset();
        }
        return; // -- returns undefined
    },

    getPreference: function(key) {
        let value = this.findPreference(key);
        if (typeof value == 'undefined') {
            throw 'MAILMINDR preference not found (' + key + ')'; 
        }

        return value;
    },


    //        /*
    //         * get all actions from the DB
    //         * performing the following steps:
    //         * - reset list
    //         * - select all actions
    //         * - push actions to result
    //         * - execute a callback function with action list as argument
    //         * */
    // getActionList : function(callback) {
    //     /* 
    //      * todo: 
    //      *   1) reset all mindrs 
    //      *   2) init stmt
    //      *   3) execute stmt with callback
    //      *   4) callback adds object to mindr-queue
    //      */
    //     this._actionLoadComplete = false;
    //     this._actions = new Array();

    //     let stmt = this._dbConnection.createStatement("SELECT * FROM action");  
    //     /*
    //     let params = stmt.newBindingParamsArray();  
    //     stmt.bindParameters(params);
    //     */

    //     stmt.executeAsync({  
    //         handleResult: function(aResultSet) {  
    //             for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow()) 
    //             {
    //                 let action = {};
    //                 action.id = row.getResultByName("id");  
    //                 action.text = row.getResultByName("text");  
    //                 action.description = row.getResultByName("description");  
    //                 action.enabled = row.getResultByName("enabled");  
    //                 action.targetFolder = row.getResultByName("targetFolder");  
    //                 action.doShowDialog = row.getResultByName("doShowDialog");  
    //                 action.doMarkAsUnread = row.getResultByName("doMarkAsUnread");  
    //                 action.doTagWith = row.getResultByName("doTagWith");  
    //                 action.doMoveOrCopy = row.getResultByName("doMoveOrCopy");  
    //                 action.doTweet = row.getResultByName("doTweet");  
    //                 action.doRunCommand = row.getResultByName("doRunCommand");  
    //                 action.doMailmindrPush = row.getResultByName("doMailmindrPush");  

    //                 this._actions.push(action);
    //             }  
    //         },  


    //         handleError: function(aError) {  
    //             print("Error: " + aError.message);  
    //         },  

    //                        /* handle completion when loading all events from db */
    //         handleCompletion: function(aReason) {  
    //             if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED)  
    //             {
    //                 /* we have an error - call our callback, if we have one */
    //                 if (callback != null) 
    //                 {
    //                     callback(null);
    //                 }
    //             }
    //             else
    //             {
    //                 /* loading complete */
    //                 if (callback != null)
    //                 {
    //                     callback(this._actions);
    //                 }
    //             }
    //         }  
    //     });   
    // },

    saveAction: function(action) {},


    /**
     * the objects' initializer
     * wil be called on storage startup
     * */
    initialize: function() {
        this._logger.log('');
        this._logger.log('*************************************************');
        this._logger.log('*** mailmindr started                         ***');
        this._logger.log('*************************************************');
        this._logger.log('check if database has arrived.');
        this._ensureDatabase();
        this._logger.log('database has landed.');

        let currentVersion = this.getCurrentDatabaseVersion();
        this._logger.log('current database version is: ' + currentVersion);

        let scope = this;


        let updateDatabase = function(updateCallback) {
            scope._logger.log('updating database..');
            AddonManager.getAddonByID("mailmindr@arndissler.net", function(addon) {
                
                scope._logger.log('** sysinfo ** running mailmindr v' + addon.version);

                if (currentVersion < addon.version) {
                    scope.safeCall(scope, scope.setUpdateFlag);
                    scope._logger.log('run update from version ' + currentVersion + ' to ' + addon.version);
                    scope._runDatabaseUpdate(currentVersion, addon.version);
                } else {
                    scope._logger.log('database is up to date');
                }
                scope._logger.log('database check: done.');

                scope._logger.log('preparing statements...');
                let result = scope.safeCall(scope, scope._prepareStatements, scope._logger);
                scope._logger.log('preparing statements: done.');

                updateCallback(result);
            });
        }

        let ready = false;

        updateDatabase(function(checkResult) {
            scope._logger.log('>>>> async: updateDatabase returns: ' + checkResult);
            scope._initialized = checkResult;
        });


        this._initialized = ready;
    },

    setUpdateFlag: function() {
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService).getBranch("extensions.mailmindr.");

        prefs.setBoolPref("common.updated", true);
    },

    safeCall: function(obj, func, logger) {
        try {
            func.call(obj);
            return true;
        } catch (safeCallException) {
            loger.error(safeCallException);
            return false;
        }
    }

} // mailmindrStorage


let mailmindrStorage = new mailmindrStorageBase();