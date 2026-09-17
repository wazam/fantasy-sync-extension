# Roadmap

Tracks two kinds of ideas: planned features actually committed to a future release, and proposed features that are just collected ideas, not yet planned or prioritized.

## Planned Features

Nothing planned right now. All previously planned features have shipped.

## Proposed Features

Collected ideas for future development. Not actively planned or prioritized.

1. **Player Name Scanner**: action button intended for use on other, non-ESPN, non-Fantrax sites (news articles, blogs, forums, etc.) that scans the page content for player names in various formats and underlines matches; hovering a match shows a tooltip with whether that player is a free agent or already rostered in the user's ESPN league, for a quick reference check without leaving the page

2. **Chrome and Edge Support**: investigate porting the extension to Chromium-based browsers; assess API compatibility and required manifest changes

3. **Mobile Testing**: test popup and queue UI on mobile browsers for layout and usability issues

4. **Configurable Keybindings**: allow users to set or disable keyboard shortcuts for the Step and Auto Run actions from the popup settings

5. **Watchlisted Player Notes to Fantrax Watchlist**: mark each player from Player Notes entries tagged "Watchlist" as watched on Fantrax (exact mechanism TBD, likely from the Available Trending Players page), so privately-tracked targets also surface in Fantrax's own watchlist views without ESPN ever exposing that interest to leaguemates

6. **Scheduled ESPN to Fantrax Sync**: automatically check the ESPN league for new transactions on a schedule and import them to Fantrax without manual triggering

7. **Scheduled ESPN Transaction Executor**: queue future roster moves (adds, drops, IL moves) to be executed directly on ESPN at a predetermined time; the extension performs the action on ESPN when the scheduled time arrives

8. **Scheduled ESPN Lineup Moves**: queue internal roster position changes (e.g. moving a SP to bench on a specific day) to execute automatically on ESPN when you cannot make the move yourself

9. **Roster Parity Check**: pull and compare full roster lists from ESPN (`fantasy.espn.com/baseball/league/rosters?leagueId=XXX`) and Fantrax (`fantrax.com/fantasy/league/XXXX/team/chart`) for all teams in the league; flag any mismatches to confirm both platforms are in sync as a sanity check after processing; optionally extend to draft results by comparing ESPN (`fantasy.espn.com/baseball/league/draftrecap?leagueId=XXX`) against Fantrax (`fantrax.com/fantasy/league/XX/draft-results`) for a full historical audit

10. **Fantrax Transaction Date Override**: when processing a transaction, optionally set the period or date/time on the Fantrax Commissioner page to match the original ESPN transaction timestamp; the page supports both a period dropdown (mapped by resolutiondate) and a manual date + time selector
