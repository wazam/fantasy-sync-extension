# Roadmap

## Planned Features

1. **Settings Validation Check** -- on opening the ESPN page, automatically read league settings and cross-check against the Fantrax league settings page to confirm they are valid and in sync before processing

2. **Roster Parity Check** -- pull and compare full roster lists from ESPN (`fantasy.espn.com/baseball/league/rosters?leagueId=XXX`) and Fantrax (`fantrax.com/fantasy/league/XXXX/team/chart`) for all teams in the league; flag any mismatches to confirm both platforms are in sync as a sanity check after processing; optionally extend to draft results by comparing ESPN (`fantasy.espn.com/baseball/league/draftrecap?leagueId=XXX`) against Fantrax (`fantrax.com/fantasy/league/XX/draft-results`) for a full historical audit

3. **Scheduled ESPN to Fantrax Sync** -- automatically check the ESPN league for new transactions on a schedule and import them to Fantrax without manual triggering

4. **Scheduled ESPN Transaction Executor** -- queue future roster moves (adds, drops, IL moves) to be executed directly on ESPN at a predetermined time; the extension performs the action on ESPN when the scheduled time arrives

5. **Load All History Mode** -- detect the last page of ESPN activity, calculate total page count, and automatically load all pages into the queue; chain into auto run mode for full end-to-end automation

6. **Configurable Keybindings** -- allow users to remap or disable the F7 and F8 action shortcuts from the popup settings

7. **Transaction Date/Time Analysis** -- analyze patterns from scraped transaction timestamps; per-manager breakdowns showing transaction counts, most active hours, and weekly acquisition usage relative to league limits; identify managers who consistently use more of their weekly allotted moves; support importing ESPN "Roster Moves" page as an additional data source to extend history and surface busier periods

8. **Player Name Scanner** -- action button on any page that scans the content for player names in various formats, underlines matches, and shows a tooltip on hover with the player's current roster status from Fantrax; allows quick relevance checks when reading news articles or external content without leaving the page

9. **Mobile Testing** -- test popup and queue UI on mobile browsers for layout and usability issues

10. **Fantrax Transaction Date Override** -- when processing a transaction, optionally set the period or date/time on the Fantrax Commissioner page to match the original ESPN transaction timestamp; the page supports both a period dropdown (mapped by resolutiondate) and a manual date + time selector

11. **Chrome and Edge Support** -- investigate porting the extension to Chromium-based browsers; assess API compatibility and required manifest changes
