
// show timespans: 0 - system, 1 - user, 2 - user and system defined
pref("extensions.mailmindr.common.showTimespans", 2);

// default reminder time - hour
pref("extensions.mailmindr.common.remindertime.hour", 9);

// default reminder time - minute
pref("extensions.mailmindr.common.remindertime.hour", 0);

// default target folder for incoming mail
pref("extensions.mailmindr.common.targetFolderIncoming", "");

// default target folder for sent mail
pref("extensions.mailmindr.common.targetFolderSent", "");

// default for show pending list (0 - show never, 1 - show always)
pref("extensions.mailmindr.common.uiShowPendingList", 1);

// default bool - firstRun (true will set to false on firstRun)
pref("extensions.mailmindr.common.firstRun", true);

// default for set mindr on tag is false (disabled), so no tag key is present
pref("extensions.mailmindr.common.setMindrOnTag", false);
pref("extensions.mailmindr.common.setMindrOnTagSelectedTag", "-");
pref("extensions.mailmindr.common.setMindrOnTagSelectedTimespan", "#1;0;0;false");

// defaults for (only) dialog
pref("extensions.mailmindr.common.setMindrDefaultSelectedTimespan", "#1;0;0;false");

// enable logging (true|false)
pref("extensions.mailmindr.common.logging", true);

// use alert dialog (YES/no)
pref("extensions.mailmindr.common.showAlertDialog", true);

pref("extensions.mailmindr.common.alertTicksBefore", 15);
pref("extensions.mailmindr.common.alertTickUnit", "minutes");

pref("extensions.mailmindr.common.updated", false);

// first day of week is monday (per default) == 0
pref("extensions.mailmindr.common.firstdayofweek", 0);

// folder where to move the mail when a mindr is set
// good for "inbox zero" - all mindrs are moved to this folder and moved
// to the inbox again when the mindr is getting active
pref("extensions.mailmindr.common.inboxZeroLaterFolder", "");
pref("extensions.mailmindr.common.inboxZeroAccounts", "[]");
pref("extensions.mailmindr.common.inboxZeroPreferences", "{}");


// default action when opening the set mindr dialog
pref("extensions.mailmindr.common.action.default", "");


// default preferences for sorting
pref("extensions.mailmindr.sorting.overlay.pendingList.columnName", "mailmindrPendingListColRemainingTime");
pref("extensions.mailmindr.sorting.overlay.pendingList.order", "ascending");