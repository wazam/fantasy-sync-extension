# Changelog

Release notes for every version, newest first. Each version is tagged in git and has a matching [release on GitHub](https://github.com/wazam/fantasy-sync-extension/releases) with the signed `.xpi` and source `.zip` attached. Changes that haven't been released yet collect under **Unreleased**, and [RELEASING.md](RELEASING.md) covers how to ship them.

## Unreleased

### What's New

- Renamed League Settings' Max Total Roster Size to Max Total Players, the name Fantrax uses, so it's easier to find on Fantrax's settings page.
- Screen readers announce the From and To date fields and each League Settings field by name.
- Clearer wording in tooltips and alerts.

## [v1.2.0](https://github.com/wazam/fantasy-sync-extension/releases/tag/v1.2.0) (2026-09-16)

### What's New

- Added a Skip & Continue flow: when Fantrax can't complete a transaction automatically (an ambiguous name, a missing player, a trade deadline in the way), it explains why and lets you finish manually, then skip past it without reprocessing.
- Added a Fix Broken Transaction modal for ESPN's rare missing-player-name bug, letting you fill in the info manually instead of getting stuck.
- Overhauled League Settings: paste a full ESPN or Fantrax league URL to auto-fill the ID, then use Load/Check League Settings to pull ESPN's roster size and verify Fantrax's Max Total Roster Size and Trade Deadline Date, with checkmarks once confirmed.
- Added a new Manager Stats modal: leaderboards for Most Added, Most Dropped, and Most Trades, plus three "by Hour" views (transactions, roster updates, and both combined) showing when each manager is most active, filterable by team, with mid-season renames rolled up correctly.
- Added Roster Updates tracking: indexes ESPN lineup/roster moves separately from the transaction queue, to power Manager Stats.
- Added a new Player Notes modal: jot down freeform notes per player (watchlist flags, scouting reminders, etc.), search by name or note, and import your ESPN Watch List with one click.
- Added a Processed History viewer to review every transaction already synced to Fantrax.
- Only one Load/Step/Auto Run action can run at a time now, preventing overlapping runs.
- The toolbar badge now turns amber for broken transactions and red for ones needing a manual pick.
- General UI polish: clearer tooltips, consistent light/dark contrast, and cleaner layouts across the queue and settings.

### Bug Fixes

- Fixed Fantrax rejection alerts (like a trade deadline blocking a replay) getting silently marked as processed even though nothing was applied; these now surface for manual resolution.
- Fixed long ESPN scrapes (Load All Activity, Load Roster Updates) hanging or crashing the tab on very long runs; hung pages now retry automatically and the tab recycles periodically.
- Fixed a player's name getting lost entirely when ESPN omits their team and position after a real MLB release; the name is now preserved.
- Fixed Load All Activity stopping early on pages with real activity but no adds, drops, or trades (e.g. all roster moves), cutting historical imports short.
- Fixed the extension retrying forever, or showing a confusing error, when ESPN denies access (wrong League ID, or logged out); it now stops immediately with a clear message.
- Fixed the Fantrax settings checkmarks getting stuck hidden instead of resetting.
- Fixed a small height flicker on the League Settings modal's buttons from inconsistent icon font rendering.

## [v1.1.3](https://github.com/wazam/fantasy-sync-extension/releases/tag/v1.1.3) (2026-08-27)

### What's New

- Already-imported transactions are now remembered across browser reloads and rescrapes, so re-scraping ESPN (even a partial range) no longer re-queues moves you've already processed on Fantrax.

### Bug Fixes

- Fixed the wrong player getting selected (e.g. a hitter instead of a pitcher) when two players share the same name and MLB team; matching now checks position as well as team abbreviation.

## [v1.1.2](https://github.com/wazam/fantasy-sync-extension/releases/tag/v1.1.2) (2026-04-30)

### Bug Fixes

- Fixed the right player not being found when several results share the same name: the team abbreviation could run together with the status text, so the match failed silently and a manual selection popup appeared.

## [v1.1.1](https://github.com/wazam/fantasy-sync-extension/releases/tag/v1.1.1) (2026-04-22)

### Bug Fixes

- Fixed drops that come with a Trade Processed row being silently missed; they're now added to the queue.

## [v1.1.0](https://github.com/wazam/fantasy-sync-extension/releases/tag/v1.1.0) (2026-04-19)

### Upgrading

- Save your ESPN league ID in Quick Links. ESPN pages aren't scraped into the queue until the saved ID matches the page's league.

### What's New

- Auto Run (F8) processes the entire queue automatically, navigating between Fantrax pages as needed
- Trade transaction support on the Fantrax Trade page
- Draft recap scraping from the ESPN Draft Recap page
- Upper cutoff (To field) for date range filtering; drag across queue rows to set both bounds
- Ctrl+click any queue row to exclude it from processing
- Queue search, reset, and clear controls
- Quick Links with saved ESPN and Fantrax league IDs and one-click navigation
- Roster size recommendation display with IL buffer explanation
- Light and dark theme toggle
- Player name search fallbacks for initials, dots, accents, hyphens, and MLB team disambiguation
- League ID guard prevents processing on the wrong Fantrax league
- Queue index persists across browser sessions

## [v1.0.0](https://github.com/wazam/fantasy-sync-extension/releases/tag/v1.0.0) (2026-04-19)

Initial release.

### What's New

- Scrapes ESPN Recent Activity and Draft Recap pages into a transaction queue
- Processes adds and drops on the Fantrax Commissioner Claim/Drop page
- F7 keyboard shortcut processes the next transaction on the current Fantrax tab
- Cutoff date field filters out transactions before a set date
- ESPN-format timestamps auto-convert when pasted into the cutoff field
- Queue display shows all transactions with processed entries marked as strikethrough
