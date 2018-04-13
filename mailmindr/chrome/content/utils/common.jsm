"use strict";

const Cc = Components.classes;
const Ci = Components.interfaces;

var EXPORTED_SYMBOLS = ["mailmindrCommon", "mailmindrCommonBase"];

Components.utils.import("resource://app/modules/iteratorUtils.jsm");
Components.utils.import("resource://app/modules/PopupNotifications.jsm");
Components.utils.import("resource://gre/modules/PluralForm.jsm");
Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");

function mailmindrCommonBase() {
    this._name = "mailmindrCommonBase";
    this._logger = new mailmindrLogger(this);

    this.initialize();
}

mailmindrCommonBase.prototype = {

    initialize: function() {
        let src = "chrome://mailmindr/locale/utils/core.properties";
        let localeService = Components.classes["@mozilla.org/intl/nslocaleservice;1"]
            .getService(Components.interfaces.nsILocaleService);
        let appLocale = localeService.getApplicationLocale();
        let stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
            .getService(Components.interfaces.nsIStringBundleService);

        this._strings = stringBundleService.createBundle(src, appLocale);
        this._logger.log('------ mailmindrCommon initialized -------');
    },

    capitalize: function(text) {
        if (text.trim().length < 2) {
            return text;
        }

        let t = text.trim();
        return t.slice(0, 1).toUpperCase() + t.slice(1, t.length);
    },

    clearChildren: function(element) {
        while (element.firstChild) {
            element.removeChild(element.lastChild);
        }
    },

    /**
     * toRelativeString - create a string with a relative time string
     */
    toRelativeString: function(dateTimeMS) {
        let now = Date.now();
        let relative = dateTimeMS - now;

        if ('undefined' == typeof dateTimeMS) {
            return "-";
        }

        let millisecondsMinute = (60 * 1000);
        let millisecondsHour = (60 * millisecondsMinute);
        let millisecondsDay = (24 * millisecondsHour);

        let base = Math.abs(relative);

        let days = Math.round(base / millisecondsDay);
        let hours = Math.round((base - days * millisecondsDay) / millisecondsHour);
        let minutes = Math.round((base - days * millisecondsDay - hours * millisecondsHour) / millisecondsMinute);
        let seconds = Math.round((base - days * millisecondsDay - hours * millisecondsHour - minutes * millisecondsMinute) / 1000);

        if (relative > 0) {
            if ((days >= 7) && (days % 7 == 0)) {
                return this._pluralize(days / 7, "mailmindr.utils.core.relative.weeks");
            } else if (days > 0) {
                return this._pluralize(days, "mailmindr.utils.core.relative.days");
            } else if (hours > 0) {
                let hourString = this._pluralize(hours, "mailmindr.utils.core.relative.hours");
                let minuteString = "";
                if (minutes > 0) {
                    minuteString = " " + this._pluralize(minutes, "mailmindr.utils.core.relative.andminutes");
                }

                return hourString + minuteString;
            } else if (minutes > 0) {
                return this._pluralize(minutes, "mailmindr.utils.core.relative.minutes");
            }

            if (seconds > 0) {
                return this._pluralize(seconds, "mailmindr.utils.core.relative.seconds");
            }
        }

        if (relative < 0) {
            if ((days >= 7) && (days % 7 == 0)) {
                return this._pluralize(days / 7, "mailmindr.utils.core.relative.past.weeks");
            } else if (days > 0) {
                return this._pluralize(days, "mailmindr.utils.core.relative.past.days");
            } else if (hours > 0) {
                let hourString = this._pluralize(hours, "mailmindr.utils.core.relative.past.hours");
                let minuteString = "";
                if (minutes > 0) {
                    minuteString = " " + this._pluralize(minutes, "mailmindr.utils.core.relative.past.andminutes");
                }

                return hourString + minuteString;
            } else if (minutes > 0) {
                return this._pluralize(minutes, "mailmindr.utils.core.relative.past.minutes");
            }

            if (seconds > 0) {
                return this._pluralize(seconds, "mailmindr.utils.core.relative.past.seconds");
            }
        }

        return this._strings.GetStringFromName("mailmindr.utils.core.relative.now");
    },


    _pluralize: function(num, identifier) {
        let str = PluralForm.get(num, this._strings.GetStringFromName(identifier));
        return str.replace("#1", num);
    },


    indentor: function(indent) {
        var result = "";
        for (var idx = 0; idx < indent; idx++) {
            result += "  ";
        }
        return result;
    },



    /**
     * list all folders and add all folder items to given combobox (identified by elementId)
     * default list item is set by selectedUri
     */
    getAllFolders: function(listForAccount) {
        var _gFolders = new Array();
        var self = this;
        var selectedAccount = (typeof listForAccount === "undefined") ? '' : listForAccount;

        /** 
         * subFolders - list subfolders for a given folder object
         */
        function subFolders(aFolder, indentLevel) {
            let item = new Array(
                aFolder.name,
                aFolder.URI,
                indentLevel
            );
            _gFolders.push(item);

            if (aFolder.hasSubFolders) {
                for each(let folder in fixIterator(aFolder.subFolders, Components.interfaces.nsIMsgFolder)) {
                    subFolders(folder, indentLevel + 1);
                }
            }
        }

        function gatherSubFolders(forAccount) {
            //self._logger.call('gatherSubFolders()');
            try {
                _gFolders = new Array();

                // /* get accounts */
                if (forAccount == '') {
                    // account is not set - so list all accounts
                    var acctMgr = Components.classes["@mozilla.org/messenger/account-manager;1"]
                        .getService(Components.interfaces.nsIMsgAccountManager);
                    var accounts = acctMgr.accounts;

                    for each(let account in fixIterator(accounts, Components.interfaces.nsIMsgAccount)) {
                        if ((account.incomingServer.type.indexOf('imap') == 0) || (account.incomingServer.type.indexOf('pop') == 0) || (account.incomingServer.type.indexOf('none') == 0)) {
                            let rootFolder = account.incomingServer.rootFolder; // nsIMsgFolder
                            subFolders(rootFolder, 0);
                        }
                    }
                } else {
                    let account = forAccount;
                    if ((account.incomingServer.type.indexOf('imap') == 0) || (account.incomingServer.type.indexOf('pop') == 0) || (account.incomingServer.type.indexOf('none') == 0)) {
                        let rootFolder = account.incomingServer.rootFolder; // nsIMsgFolder
                        subFolders(rootFolder, 0);
                    }
                }

                //self._logger.end();
                return _gFolders;
            } catch (exception) {
                self._logger.error(exception);
            }

            self._logger.warn('gatherSubFolders(): returns an empty array');
            //self._logger.end();
            return new Array();
        }

        //this._logger.log('call listAllFolders');

        /* init function-global array */
        _gFolders = gatherSubFolders(selectedAccount);

        return _gFolders;
    },



    listAllFolders: function(element, selectedUri, listForAccount) {
        let _gFolders = this.getAllFolders(listForAccount);

        /* store all items in picker */
        let selectedUriValue = selectedUri;
        let picker = element;


        /* third parameter is selected index in combobox, if present */
        var selectedIndex = arguments.length == 3 ? arguments[2] : -1;

        for (var idx = 0; idx < _gFolders.length; ++idx) {
            let pickerItem = picker.appendItem(this.indentor(_gFolders[idx][2]) + _gFolders[idx][0], _gFolders[idx][1])

            /* check if we have an account (indention level 0) :: set disabled = true */
            if (_gFolders[idx][2] == 0) {
                pickerItem.setAttribute('disabled', true);

                /* if the selection index is the account item => select next item */
                if (selectedIndex == idx) {
                    selectedIndex += 1;
                }
            }

            /* check if a selection index is present we have to select */
            if (selectedIndex == idx) {
                selectedUriValue = _gFolders[idx][1];
            }
        }

        /* select given value */
        picker.value = selectedUriValue;
    },



    /**
     *
     */
    getAllTags: function() {
        let tagService = Components.classes["@mozilla.org/messenger/tagservice;1"]
            .getService(Components.interfaces.nsIMsgTagService);
        return tagService.getAllTags({});
    },

    /**
     * get all tags and add them to given combo box
     */
    fillTags: function(element, selectedItemIndex, selectedValue) {
        if (typeof element !== "object") {
            this._logger.error("element expected");
            return;
        }

        /* get all tags */
        let tagArray = this.getAllTags();

        var mmreTags = element;

        /* first: clean up all tags in listbox */
        mmreTags.removeAllItems();
        var toSelect = selectedItemIndex;

        /* add the empty key '-': add "select item" thing to combobox */
        let lblSelect = this._strings.GetStringFromName("mailmindr.utils.core.tag.doSelect");
        let mmreSelectItem = mmreTags.appendItem(lblSelect, "-");

        /* second: add all items/tags with colors */
        for (let idx = 0; idx < tagArray.length; ++idx) {
            var currTag = tagArray[idx];
            var mmreNewItem = mmreTags.appendItem(currTag.tag, currTag.key);
            mmreNewItem.style.color = currTag.color;

            if (idx === 0) {
                toSelect = currTag.key;
            }
        }

        this._logger.log("will select: " + selectedValue + "/" + toSelect);
        let selection = selectedValue || toSelect;
        this._logger.log("selection: " + selection);
        mmreTags.value = selection;
    },

    fillTimespanComboBox: function(element, timeSpans) {
        element.removeAllItems();

        for each(let timespan in timeSpans) {
            element.appendItem(timespan.text, timespan.serialize());
        }
    },

    fillActionComboBox: function(element, actions) {
        element.removeAllItems();
        for each(let action in actions) {
            element.appendItem(action.text, action.toJson());
        }
    },

    getSelectedTreeCell: function(element, cellIndex) {
        if (typeof element !== "object") {
            this._logger.error("element expected");
            return null;
        }

        let tree = element;
        return tree.view.getCellText(tree.currentIndex, tree.columns.getColumnAt(cellIndex));
    },

    getWindow: function(windowType) {
        let windowMediator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Components.interfaces.nsIWindowMediator);
        return windowMediator.getMostRecentWindow(windowType);
    },


    // taken from https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/DOM_Building_and_HTML_Insertion#Safely_Using_Remote_HTML
    /**
     * Safely parse an HTML fragment, removing any executable
     * JavaScript, and return a document fragment.
     *
     * @param {Document} doc The document in which to create the
     *     returned DOM tree.
     * @param {string} html The HTML fragment to parse.
     * @param {boolean} allowStyle If true, allow <style> nodes and
     *     style attributes in the parsed fragment. Gecko 14+ only.
     * @param {nsIURI} baseURI The base URI relative to which resource
     *     URLs should be processed. Note that this will not work for
     *     XML fragments.
     * @param {boolean} isXML If true, parse the fragment as XML.
     */
    parseHtml: function parseHTML(doc, html, allowStyle, baseURI, isXML) {
        let PARSER_UTILS = "@mozilla.org/parserutils;1";

        // User the newer nsIParserUtils on versions that support it.
        if (PARSER_UTILS in Cc) {
            let parser = Cc[PARSER_UTILS]
                                   .getService(Ci.nsIParserUtils);
            if ("parseFragment" in parser) {
                return parser.parseFragment(html, allowStyle ? parser.SanitizerAllowStyle : 0,
                                            !!isXML, baseURI, doc.documentElement);
            }
        }

        return Cc["@mozilla.org/feed-unescapehtml;1"]
                         .getService(Ci.nsIScriptableUnescapeHTML)
                         .parseFragment(html, !!isXML, baseURI, doc.documentElement);
    },

    // taken from https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/DOM_Building_and_HTML_Insertion#JSON_Templating
    jsonToDom: function jsonToDOM(jsonTemplate, doc, nodes) {
        let jtd = {};
        jtd.namespaces = {
            html: "http://www.w3.org/1999/xhtml",
            xul: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
        };
        jtd.defaultNamespace = jtd.namespaces.html;

        function namespace(name) {
            var reElemNameParts = /^(?:(.*):)?(.*)$/.exec(name);
            return { namespace: jtd.namespaces[reElemNameParts[1]], shortName: reElemNameParts[2] };
        }

        // Note that 'elemNameOrArray' is: either the full element name (eg. [html:]div) or an array of elements in JSON notation
        function tag(elemNameOrArray, elemAttr) {
            // Array of elements?  Parse each one...
            if (Array.isArray(elemNameOrArray)) {
                var frag = doc.createDocumentFragment();
                Array.forEach(arguments, function(thisElem) {
                    frag.appendChild(tag.apply(null, thisElem));
                });
                return frag;
            }

            // Single element? Parse element namespace prefix (if none exists, default to defaultNamespace), and create element
            var elemNs = namespace(elemNameOrArray);
            var elem = doc.createElementNS(elemNs.namespace || jtd.defaultNamespace, elemNs.shortName);

            // Set element's attributes and/or callback functions (eg. onclick)
            for (var key in elemAttr) {
                var val = elemAttr[key];
                if (nodes && key == "key") {
                    nodes[val] = elem;
                    continue;
                }

                var attrNs = namespace(key);
                if (typeof val == "function") {
                    // Special case for function attributes; don't just add them as 'on...' attributes, but as events, using addEventListener
                    elem.addEventListener(key.replace(/^on/, ""), val, false);
                }
                else {
                    // Note that the default namespace for XML attributes is, and should be, blank (ie. they're not in any namespace)
                    elem.setAttributeNS(attrNs.namespace || "", attrNs.shortName, val);
                }
            }

            // Create and append this element's children
            var childElems = Array.slice(arguments, 2);
            childElems.forEach(function(childElem) {
                if (childElem != null) {
                    elem.appendChild(
                        childElem instanceof doc.defaultView.Node ? childElem :
                            Array.isArray(childElem) ? tag.apply(null, childElem) :
                                doc.createTextNode(childElem));
                }
            });

            return elem;
        }

        return tag.apply(null, jsonTemplate);
    }
}

var mailmindrCommon = mailmindrCommon || new mailmindrCommonBase();