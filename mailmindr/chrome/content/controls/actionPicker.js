"use strict";

if (!mailmindr) var mailmindr = {};
if (!mailmindr.controls) mailmindr.controls = {};

Components.utils.import("chrome://mailmindr/content/utils/core.jsm");
Components.utils.import("chrome://mailmindr/content/utils/common.jsm");
Components.utils.import("chrome://mailmindr/content/utils/factory.jsm");
Components.utils.import("chrome://mailmindr/content/utils/logger.jsm");

mailmindr.controls.ActionPicker = function ActionPicker(actionCombo, options) {
    this._name = "controls.ActionPicker";
    this._logger = new mailmindrLogger(this);
    this._userAction = null;

    // init private data holders
    this._elements = {
        actions: actionCombo
    };

    this._events = {
        onSelectAction: []
    };

    this._actions = mailmindrCore.createSystemActions(options || {
        canBeUserDefined: false,
        canBeDeactivated: false
    });

    mailmindrCommon.fillActionComboBox(this._elements.actions, this._actions);

    this.setEventListeners();

    this._elements.actions.selectedIndex = 0;
}

mailmindr.controls.ActionPicker.prototype = {
    setEventListeners: function() {
        var scope = this;
        this._elements.actions.addEventListener("select", function() {
            scope.onSelectAction(scope);
        }, false);
    },

    /**
     * addEventListener - adds the given trigger to the events trigger chain.
     * @returns bool True, if event can be pushed to trigger chain, false otherwise
     */
    addEventListener: function(event, trigger) {
        switch (event) {
            case "selectAction":
                this._events.onSelectAction.push(trigger);
                return true;
                break;
        }

        return false;
    },

    onSelectAction: function(target) {
        this._logger.log('action selected!');

        let value = target._elements.actions.value;

        if (value == -2) {
            let data = {
                standalone: true
            };

            window.openDialog(
                "chrome://mailmindr/content/dialogs/actioneditor.xul",
                "setAction",
                "chrome, resizeable=false, dependent=true, chrome=yes, centerscreen=yes, modal=true",
                data
            );
        }

        target.triggerOnSelectAction();
    },

    /**
     * triggerOnSelectAction - triggers all registered event handlers for
     * event 'selectAction'
     */
    triggerOnSelectAction: function() {
        let action = this.Action;

        for each(let trigger in this._events.onSelectAction) {
            trigger(action);
        }
    },

    /**
     * _getActionFromList - returns an action from the actionlist
     * @returns action object if id was found, null otherwise
     */
    _getActionFromList: function(action) {
        let actionId = action.id;

        if (actionId == "-1") {
            return null;
        }

        if (actionId == "-2") {
            // user defined action
            return this._userAction;
        }

        for each(let action in this._actions) {
            if (action.id == actionId) {
                return action;
            }
        }

        return null;
    },

    _isEqual: function(action, target) {
        function normalize(a) {
            return typeof a == typeof false ? a ? 1 : 0 : a;
        }

        function eq(a, b) {
            return normalize(a) == normalize(b);
        }

        if (typeof target == 'undefined' || target == null) {
            return false;
        }

        // when searching for the right action, skip the following fields.
        let skipped = ['id', 'doShowDialog', 'text', 'isGenerated', 'copyTo', 'description', 'enabled', 'isValid'];
        let equal = true;

        for (let p in action) {
            if (p.substring(0, 1) == '_' ||  skipped.indexOf(p) >= 0 || typeof action[p] == 'function') {
                continue;
            }

            //-- this._logger.log('=> ' + p + ' ("' + action[p] + '" == "' + target[p] + '")');
            equal = equal && eq(action[p], target[p]);
        }

        this._logger.log('EQ: ' + (equal ? ' yes' : ' nope'));
        return equal;
    },

    get Action() {
        let actionJson = this._elements.actions.value;
        let action = JSON.parse(actionJson);
        return this._getActionFromList(action);
    },

    set Action(action) {
        let scope = this;
        let comparer = function(comp) {
            return scope._isEqual(comp, action);
        }

        // get given acton from this._actions
        this._logger.log('__SEARCH ACTION__');
        let selected = this._actions.filter(comparer, action);

        if (selected.length > 0) {
            this._elements.actions.value = selected[0].toJson();
            if (this._elements.actions.selectedIndex < 0) {
                this._elements.actions.selectedIndex = 0;
            }
            this._elements.actions.setAttribute('disabled', 'false');
        }

        this._logger.log('>>> ' + selected);
        this._logger.log('__DONE__');
    },

    set Enabled(enabled) {
        this._elements.actions.setAttribute('disabled', enabled);
    },

    get Enabled() {
        this._logger.log('hasAttribue:  ' + this._elements.actions.hasAttribute('disabled'));
        this._logger.log('getAttribute: ' + this._elements.actions.getAttribute('disabled'));

        return this._elements.actions.hasAttribute('disabled') && this._elements.actions.getAttribute('disabled') == 'false';
    }
};