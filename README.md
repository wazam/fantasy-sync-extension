# Fantasy Sync Assistant Extension

![alt text](assets/icon-48.png) Fantasy Sync Assistant is a Firefox extension for competitive fantasy baseball players who mirror their ESPN league on Fantrax. Fantrax's available trending players page becomes accurate only when your Fantrax rosters match ESPN exactly. This extension scrapes ESPN transactions and draft picks into a queue and replays each move on the Fantrax Commissioner pages, keeping your mirror up to date without manual re-entry.

## Installation

Download the extension from the [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/fantasy-sync-assistant/) page.

## Usage

1. Save your ESPN and Fantrax league IDs in the popup Quick Links section
2. Navigate to an ESPN Recent Activity or Draft Recap page to scrape transactions into the queue
3. Set the From / To cutoff range to narrow which transactions will be processed
4. Open the Fantrax Commissioner page (Claim/Drop, Trade, or Draft Import) in the same browser tab
5. Press **F8** to process the entire queue automatically, or **F7** to step through the next transaction one at a time

## Features

* **Transaction Queue** -- scrapes transactions from ESPN Recent Activity and Draft Recap pages; processed transactions are marked with strikethrough and out-of-window transactions are shown in grey
* **Exclude Transactions** -- Ctrl+click any queue row to skip it during processing; click again to restore it
* **Queue Controls** -- search icon filters the queue by player name; reset icon marks all transactions as unprocessed; trash icon clears the entire queue
* **Cutoff Range** -- From / To datetime fields define the window of transactions to process; click any queue row to set the lower bound instantly; drag across rows to set both bounds; paste ESPN-format timestamps like "Mon Apr 6 6:19 am" and they auto-convert to the correct format
* **Auto Run (F8)** -- processes the entire transaction queue automatically, navigating between Fantrax pages as needed
* **Next (F7)** -- processes one transaction on the current Fantrax tab; also stops auto-run while it is active
* **Transaction Types** -- handles adds, drops, trades, and draft picks; searches for players by name with fallback variants for initials, accents, hyphens, and MLB team disambiguation
* **Quick Links** -- ESPN and Fantrax league IDs can be saved by pasting a full league URL or just the extracted ID; one-click buttons open the corresponding league page once an ID is saved
* **Roster Size** -- displays a recommended Fantrax max roster size that accounts for players who were on the Injured List at the time of an ESPN transaction but are healthy when replaying; set Fantrax's max roster size to this number to avoid roster-full errors

## Screenshots

![alt text](<docs/screenshot startup.png>)

Extension popup on first open showing the queue, cutoff controls, and quick links before any transactions are loaded.

![alt text](<docs/screenshot espn.png>)

ESPN Recent Activity page with transactions scraped into the queue. Cutoff range set to filter out older moves.

![alt text](<docs/screenshot fantrax.png>)

Fantrax Commissioner page after the extension has automatically processed a batch of add/drop transactions.

## Issues and Feature Requests

Report bugs, league setting problems, or feature requests by opening an issue on the GitHub repository. See [ROADMAP.md](ROADMAP.md) for planned features.

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
