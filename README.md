# Fantasy Sync Assistant Browser Extension

![alt text](assets/icons/icon-48.png) Fantasy Sync Assistant helps fantasy baseball commissioners maintain a clone league on Fantrax that mirrors their ESPN league. It reads the ESPN Recent Activity page, indexes all add, drop, and add/drop transactions for any team, then automates the Fantrax Commissioner Claim/Drop page to apply those same moves.

## Store Donwload Installation Link

[Firefox Add-ons Link](https://addons.mozilla.org/en-US/firefox/addon/fantasy-sync-assistant/)

## Features

* Scrapes all transactions from one or more ESPN Recent Activity pages (navigate each page and the extension collects them all)
* Displays the full indexed transaction queue in the extension popup, color-coded by type (add in green, drop in red) with oldest-first processing
* Cutoff date/time filter (YYYY-MM-DD HH:MM) so previously synced transactions are skipped, while also supporting pasting ESPN-format timestamps like "Mon Apr 6 6:19 am" which are auto-converted
* Press F8 (or the popup's Next button) on the Fantrax Claim/Drop page to process the next transaction: auto-selects the team, fills the claim search box, highlights the player to drop, and clicks Submit
* A confirmation dialog appears after each submission for review before moving on one-at-a-time and manually confirmed

Designed for personal use by a commissioner who manages a private clone league.

## Screenshots

![alt text](<assets/images/espn ss.png>)<br/>data pulled from ESPN recent activity into extension

![alt text](<assets/images/popup ss.jpg>)<br/>browser extension pop up close up

![alt text](<assets/images/fantrax ss.png>)<br/>extension performing workflow for transaction details

## License

This project is licensed under the [MIT License](LICENSE).
