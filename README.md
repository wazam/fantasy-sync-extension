# Fantasy Sync Assistant Extension

[![Firefox Add-ons](https://img.shields.io/amo/v/fantasy-sync-assistant?label=Firefox%20Add-ons)](https://addons.mozilla.org/en-US/firefox/addon/fantasy-sync-assistant/)
[![AMO Users](https://img.shields.io/amo/users/fantasy-sync-assistant)](https://addons.mozilla.org/en-US/firefox/addon/fantasy-sync-assistant/)
[![AMO Rating](https://img.shields.io/amo/rating/fantasy-sync-assistant)](https://addons.mozilla.org/en-US/firefox/addon/fantasy-sync-assistant/)
[![AMO Downloads](https://img.shields.io/amo/dw/fantasy-sync-assistant)](https://addons.mozilla.org/en-US/firefox/addon/fantasy-sync-assistant/)
[![Latest Release](https://img.shields.io/github/v/release/wazam/fantasy-sync-extension?sort=semver)](https://github.com/wazam/fantasy-sync-extension/releases)

![Fantasy Sync Assistant icon](assets/icon-48.png) **Fantasy Sync Assistant** is a Firefox extension for competitive fantasy baseball players who mirror their ESPN league on Fantrax. Fantrax's available trending players page becomes accurate only when your Fantrax rosters match ESPN exactly. This extension scrapes ESPN transactions and draft picks into a queue and replays each move on the Fantrax Commissioner pages, keeping your mirror up to date without manual re-entry.

## Installation

Download the extension from the [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/fantasy-sync-assistant/) page.

## Usage

1. Save your ESPN and Fantrax league IDs in the popup Quick Links section, or paste a full league URL to auto-fill the ID
2. Open League Settings and click **Check League Settings** to confirm Fantrax's max roster size covers ESPN's roster + IL, and that no trade deadline is set to block replaying older trades
3. Navigate to an ESPN Recent Activity or Draft Recap page, or click **Load All Activity**, to scrape transactions into the queue
4. Optionally, set the From / To cutoff range to narrow which transactions will be processed
5. Click **Auto Run** to process the entire queue automatically, or **Manual Step** to process the next transaction one at a time; the extension navigates the active tab to the correct Fantrax Commissioner page (Claim/Drop, Trade, or Draft Import) on its own

## Features

* **Transaction Queue**: scrapes transactions from ESPN Recent Activity and Draft Recap pages; processed transactions are marked with strikethrough and out-of-window transactions are shown in grey
* **Exclude Transactions**: Ctrl+click any queue row to skip it during processing; click again to restore it
* **Queue Controls**: search icon filters the queue by player name; funnel icon filters to only broken transactions that need a fix; clock icon opens a read-only history of everything already processed; trash icon clears the entire queue
* **Cutoff Range**: From / To datetime fields define the window of transactions to process; click any queue row to set the lower bound instantly; drag across rows to set both bounds; paste ESPN-format timestamps like "Mon Apr 6 6:19 am" and they auto-convert to the correct format
* **Auto Run**: processes the entire transaction queue automatically, navigating between Fantrax pages as needed; click again while running to stop
* **Manual Step**: processes one transaction at a time, navigating to the right Fantrax page first if needed; click again while Auto Run is active to stop it
* **Fix Broken Transaction**: on the rare occasion ESPN's own page is missing a player's identity, the affected row is highlighted and a modal lets you fill in the name, MLB team, and position manually so the queue can continue
* **Skip & Continue**: when Fantrax can't complete a transaction automatically (an ambiguous name match, a player not found, a trade deadline in the way, and similar cases), the extension shows exactly why and lets you finish it manually on Fantrax, then skip past it without reprocessing
* **Transaction Types**: handles adds, drops, trades, and draft picks; searches for players by name with fallback variants for initials, accents, hyphens, and MLB team disambiguation
* **Quick Links**: ESPN and Fantrax league IDs can be saved by pasting a full league URL or just the extracted ID; one-click buttons open the corresponding league page, walk every page of ESPN activity or roster updates, or import your ESPN Watch List into Player Notes
* **League Settings Verification**: checks Fantrax's max roster size against ESPN's roster + IL requirement and confirms the Trade Deadline Date is blank, since a set deadline blocks replaying trades from earlier in the season
* **Roster Updates Tracking**: indexes ESPN roster/lineup moves separately from adds, drops, and trades, without touching the transaction queue, purely to feed Manager Stats
* **Manager Stats**: Most Dropped, Most Added, and Most Trades leaderboards, plus three "by Hour" breakdowns (transactions, roster updates, and both combined) showing when each manager is most active, all filterable by team
* **Player Notes**: freeform notes per player, independent of the transaction queue, searchable by name or note text, with one-click import from your ESPN Watch List

## Screenshots

![League Settings modal showing ESPN and Fantrax league IDs, roster settings, and verified checkmarks](<docs/screenshot league settings.jpg>)

League Settings modal with both ESPN and Fantrax league IDs saved, ESPN roster/IL sizes loaded, and Fantrax's Max Total Roster Size and Trade Deadline Date both verified with green checkmarks.

![Extension popup in dark mode showing Quick Links and an empty transaction queue](<docs/screenshot dark mode.jpg>)

Main popup in dark mode before any transactions are loaded, showing all ESPN and Fantrax Quick Links along with the cutoff filter and run controls.

![ESPN Recent Activity page with Load All Activity running and transactions filling the queue](<docs/screenshot espn activity indexing.jpg>)

Load All Activity walking ESPN's Recent Activity pages and indexing add/drop transactions into the Transaction Queue in real time.

![Fix Broken Transaction modal for an ESPN row missing player info](<docs/screenshot espn error handling.jpg>)

The Fix Broken Transaction modal appears when ESPN's own Recent Activity page is missing a player's name, letting you fill in the name, MLB team, and position manually so the queue can continue.

![Fantrax Commissioner Claim/Drop page with Auto Run actively processing the queue](<docs/screenshot fantrax activity syncing.jpg>)

Auto Run processing the Transaction Queue automatically on Fantrax's Commissioner Claim/Drop page, adding and dropping players to match ESPN.

![Fantrax alert for a player not found, with the popup's Skip & Continue buttons](<docs/screenshot fantrax error handling.jpg>)

When Fantrax can't complete a transaction automatically (here, a player missing from the roster), the extension surfaces the reason and switches to "Skip & Continue" so you can resolve it manually and move on without reprocessing anything.

![Player Notes modal with saved notes for individual players](<docs/screenshot player notes.jpg>)

Player Notes modal for jotting down personal reminders about specific players, like watchlist flags or scouting notes, searchable independent of the transaction queue.

![Manager Stats modal showing the Most Added leaderboard](<docs/screenshot manager stats most added.jpg>)

Manager Stats' Most Added view, ranking every player by how many times they've been added off waivers or free agency across the league this season.

![Manager Stats modal showing the Most Dropped leaderboard](<docs/screenshot manager stats most dropped.jpg>)

Manager Stats' Most Dropped view, the same idea in reverse: which players have been cut most often this season.

![Manager Stats modal showing each manager's busiest hour](<docs/screenshot manager stats activity by hour.jpg>)

All Activity by Hour, showing each manager's single busiest hour combining transactions and roster updates, useful for spotting who's most active and when.

## Issues and Feature Requests

Report bugs, league setting problems, or feature requests by opening an issue on the GitHub repository. See [ROADMAP.md](ROADMAP.md) for planned and proposed features.

## Build from Source

Standard Firefox requires all add-ons to be signed by Mozilla. Unsigned local builds can only be permanently installed on [Firefox Developer Edition](https://www.mozilla.org/en-US/firefox/developer/) or [Firefox Nightly](https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly) with signature enforcement disabled.

1. Install Firefox Developer Edition or Firefox Nightly
2. Navigate to `about:config`, accept the warning, search for `xpinstall.signatures.required`, and toggle it to `false`
3. Clone the repository and enter the folder:

   ```bash
   git clone https://github.com/wazam/fantasy-sync-extension.git
   cd fantasy-sync-extension
   ```

4. Install dependencies and build the extension package:

   ```bash
   npm install
   npm run build
   ```

   This creates a `.zip` file inside the `web-ext-artifacts/` folder.
5. Open Firefox Developer Edition or Nightly and navigate to `about:addons`
6. Click the gear icon and select **Install Add-on From File...**
7. Select the `.zip` file from the `web-ext-artifacts/` folder
8. The extension will appear in your toolbar and persist across restarts

## Load from Source

Loads the extension directly from source without building. Works in any Firefox version but is removed automatically when Firefox is closed.

1. Download or clone this repository to your computer
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on...**
4. Browse into the downloaded repository folder and select the `manifest.json` file
5. The extension will appear in your toolbar immediately

## Disclaimers

* [ESPN Terms of Use](https://disneytermsofuse.com/english/)
* [Fantrax Terms of Service](https://www.fantrax.com/terms-of-service)

## License

This project is licensed under the [MIT License](LICENSE).
