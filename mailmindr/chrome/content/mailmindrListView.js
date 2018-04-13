function mailmindrListView(aName) {
    this.treeBox = null;
    this.selection = null;
    this.data = new Array();
    this._name = "mailmindrListView (" + (aName || 'default') + ')';
    this._logger = new mailmindrLogger(this);

    this._getMindrAt = function(idx) {
        if (idx >= this.data.length) {
            return null;
        }
        let mindr = this.data[idx];
        return mindr;
    };

    this.setTree = function(treeBox) {
        this.treeBox = treeBox;
    };

    this.getCellText = function(idx, column) {
        let mindr = this._getMindrAt(idx);
        let details = mindr.details;

        if (column.id == "mailmindrPendingListColSubject") {
            return details.subject;
        }

        if (column.id == "mailmindrPendingListColFrom") {
            if (mindr.waitForReply == 1) {
                return details.recipients;
            }

            return details.author;
        }

        if (column.id == "mailmindrPendingListColRemainingTime") {
            return mailmindrCommon.toRelativeString(mindr.remindat);
        }

        return "";
    };

    this.isContainer = function(idx) {
        return false;
    };
    this.isContainerOpen = function(idx) {
        return false;
    };
    this.isContainerEmpty = function(idx) {
        return false;
    };
    this.isSeparator = function(idx) {
        return false;
    };
    this.isSorted = function() {
        return false;
    };
    this.isEditable = function(idx, column) {
        return false;
    };

    this.getParentIndex = function(idx) {
        if (this.isContainer(idx)) return -1;
        for (var t = idx - 1; t >= 0; t--) {
            if (this.isContainer(t)) {
                return t;
            }
        }
    };

    this.getLevel = function(idx) {
        if (this.isContainer(idx)) {
            return 0;
        }
        return 1;
    };

    this.hasNextSibling = function(idx, after) {
        var thisLevel = this.getLevel(idx);
        for (var t = after + 1; t < this.data.length; t++) {
            var nextLevel = this.getLevel(t);

            if (nextLevel == thisLevel) {
                return true;
            }

            if (nextLevel < thisLevel) {
                break;
            }
        }
        return false;
    };

    this.toggleOpenState = function(idx) {};
    this.getImageSrc = function(idx, column) {};
    this.getProgressMode = function(idx, column) {};

    this.getCellValue = function(idx, column) {
        if ((null == column) && (this.data.length > 0)) {
            let result = this.data[idx].mailmindrGuid;
            return result;
        }

        if ((-1 == column) && (this.data.length > 0)) {
            let result = this.data[idx];
            return result;
        }
    };

    this.cycleHeader = function(col, elem) {};
    this.selectionChanged = function() {};
    this.cycleCell = function(idx, column) {};
    this.performAction = function(action) {};
    this.performActionOnCell = function(action, index, column) {};

    this.getRowProperties = function(idx) {};

    this.getCellProperties = function(idx, column) {
        let props = [];
        let mindr = this._getMindrAt(idx);

        if (mindr) {

            if ((mindr.waitForReply == 1) && (mindr.IsReplyAvailable)) {
                props.push("reply-available");
            }

            if (mindr.remindat < Date.now()) {
                props.push("overdue");
            }
        }

        return props.join(' ').trim();
    };

    this.getColumnProperties = function(column) {};

    this.clear = function() {
        this.selection.clearSelection();
        this.data = new Array();
        this.treeBox.invalidate();
    };

    this.selectMindrByGuid = function(mindrGuid) {
        if ((null == mindrGuid) || (mindrGuid == "")) {
            return;
        }

        this.selection.clearSelection();

        for (let idx in this.data) {
            if (this.data[idx].mailmindrGuid == mindrGuid) {
                this.selection.select(idx);
            }
        }
    };

    this.getSelectedMindrGuid = function() {
        let idx = this.selection.currentIndex;
        if (idx < 0) {
            return null;
        }

        return this.getCellValue(idx, null);
    };

    this.findSelectedMindr = function() {
        let idx = this.selection.currentIndex;
        if (idx < 0) {
            return null;
        }

        return this.getCellValue(idx, -1);
    };
}

mailmindrListView.prototype = {
    get rowCount() {
        return this.data.length;
    },

    appendData: function(item) {
        this.data.push(item);
    },

    remove: function(item) {
        let idx = this.data.indexOf(item);
        if (idx >= 0) {
            this.data.splice(idx, 1);
            this.treeBox.rowCountChanged(idx + 1, (-1));
            this.treeBox.invalidateRow(idx);
            this.treeBox.invalidate();
        }
    },

    hasData: function() {
        return this.data.length > 0;
    },

    getItemAt: function(idx) {
        if (idx >= 0 && idx < this.data.length) {
            return this.data[idx];
        }

        return;
    },

    inList: function(list, mindr) {
        for each(let item in list) {
            if (item.mailmindrGuid == mindr.mailmindrGuid) {
                return true;
            }
        }

        return false;
    },

    updateItems: function(mindrs) {
        let added = [];
        let unchanged = [];
        let self = this;

        this._logger.log('update items in ' + this._name + ' : ' + mindrs.length);

        for each(let mindr in mindrs) {
            if (this.inList(this.data, mindr)) {
                unchanged.push(mindr);
            } else {
                added.push(mindr);
            }
        }

        let deleted = this.data.filter(function(mindr) {
            if (self.inList(unchanged, mindr)) {
                return false;
            }
            return true;
        });

        for each(let deletedMindr in deleted) {
            this._logger.log('delete: ' + deletedMindr);
            this.remove(deletedMindr);
        }

        for each(let addedMindr in added) {
            this._logger.log('add: ' + addedMindr + "/" + addedMindr.mailmindrGuid);
            this.appendData(addedMindr);
        }
    },

    clear: function() {
        while (this.hasData()) {
            let item = this.getItemAt(0);
            this.remove(item);
        }
    },

    /// sort column index by direction: 1 = ascending, -1 descending
    sortByColumn: function(aColumnName, aDirection) {
        var self = this;
        var normalize = (o => (typeof o == 'string') ? o.toLowerCase() : o);
        var getValue = function(obj, aColumnName) { 
            switch (aColumnName) {
                case 'mailmindrPendingListColSubject':
                    return normalize(obj.details.subject);
                    break;
                case 'mailmindrPendingListColFrom':
                    if (obj.waitForReply == 1) {
                        return normalize(obj.details.recipients);
                    }

                    return normalize(obj.details.author);
                    break;
                case 'mailmindrPendingListColRemainingTime':
                    return normalize(obj.remindat);
                    break;
            }
            return '';
        }

        var sortFunction = ((a, b) => {
            if (getValue(a, aColumnName) < getValue(b, aColumnName)) {
                return 1 * aDirection;
            }
            if (getValue(a, aColumnName) > getValue(b, aColumnName)) {
                return -1 * aDirection;
            }
            return 0;
        });

        this.data.sort(sortFunction);
    },
}