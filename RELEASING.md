# Releasing

How to ship a new version of Fantasy Sync Assistant. Versions follow semver (`vX.Y.Z`), and the release notes live in [CHANGELOG.md](CHANGELOG.md).

## 1. Bump the version

The version appears in three places, and all of them must match:

- `manifest.json`: `"version": "X.Y.Z"`
- `package.json` and `package-lock.json`: both updated by `npm version X.Y.Z --no-git-tag-version`

Check that they match. This should print `X.Y.Z` four times (`package-lock.json` carries it twice):

```bash
grep -m2 -n '"version"' manifest.json package.json package-lock.json
```

Only if this release relies on a newer Firefox API, also bump `browser_specific_settings.gecko.strict_min_version` in `manifest.json` (e.g. `"A.B"`, Firefox's own major.minor, independent of the extension's version), and add an Upgrading entry telling users which Firefox version they need.

## 2. Write the release notes in CHANGELOG.md

Rename the `## Unreleased` heading to the new version, and go over its notes against the rules below. If there's no Unreleased section, add the version's section at the top, under the intro paragraph:

```markdown
## [vX.Y.Z](https://github.com/wazam/fantasy-sync-extension/releases/tag/vX.Y.Z) (YYYY-MM-DD)

### Upgrading

- ...

### What's New

- ...

### Bug Fixes

- ...
```

- Use the date the release goes live, in local time.
- Leave out an empty section.
- After the release, start a new `## Unreleased` section only when the next change lands, so the top of the file never shows an empty heading.
- The heading link stays broken until the GitHub Release exists (step 8).

Rules for the notes:

- Write them fresh for the people who use the extension. Never copy commit messages. Group by what changed for the user, put the most significant changes first, and use plain language instead of commit-speak (a `fix:` bullet about a gating flag becomes a plain sentence about a redirect no longer happening).
- Call out anything users have to do after updating (approve a new permission, update Firefox, save or re-enter a league ID, re-check League Settings) under `### Upgrading`, which always comes first. Say what to do, not just what changed. When something was renamed, name the old and new values. A change in behavior that users have to act on counts too, and goes only under Upgrading so it isn't listed twice.
- This section is the only source of the notes. AMO (step 6) and GitHub (step 8) both copy it. If AMO's character limit forces a trim, shorten only the AMO copy; CHANGELOG.md and GitHub keep the full text.

## 3. Test the package

If Node or web-ext needs updating, do it first (see [Updating Node and web-ext](#updating-node-and-web-ext)).

```bash
npm run lint
npm run build
```

`npm run lint` runs `web-ext lint`, the same checks AMO runs on upload. Fix any errors before going on. `npm run build` zips the extension into `web-ext-artifacts/fantasy_sync_assistant-X.Y.Z.zip` (ignored by git). That zip is what step 6 uploads, so test it rather than the source folder, and what ships is what you tested.

Load the zip as a temporary add-on: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on...** and select the zip. For day-to-day development, select `manifest.json` instead, so **Reload** picks up code changes without a rebuild.

The package is an allowlist in [web-ext-config.mjs](web-ext-config.mjs): only the files it names ship. A file the extension needs but the allowlist leaves out will break this test.

Check that:

- The popup opens with no errors in the extension's console (**Inspect** on the same page).
- **Load All Activity** fills the queue from ESPN.
- **Check League Settings** shows both checkmarks.
- **Manual Step** processes the next queued transaction on Fantrax.
- Every entry in this version's notes works as described.

If you change code after testing, go back to the start of this step.

## 4. Commit and tag

```bash
git add manifest.json package.json package-lock.json CHANGELOG.md
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
```

Add any other files that are part of the release to the `git add` line. When the release commit bundles other changes, give each one its own prefixed line:

```bash
git commit -m "release: vX.Y.Z" -m "feat: ..." -m "fix: ..."
```

## 5. Push

```bash
git push origin main vX.Y.Z
```

## 6. Submit to Mozilla (AMO) for signing

1. Go to the submission page: <https://addons.mozilla.org/en-US/developers/addon/fantasy-sync-assistant/versions/submit/>
2. Upload the `.zip` you tested in step 3, with no rebuild.
3. For the release notes, paste this version's section from CHANGELOG.md without its `##` heading line (trimmed if AMO's character limit requires it; see step 2).
4. Submit for review.

AMO's automated review usually signs it within minutes; a manual review, if flagged, can take longer. Check email for the approval notice.

## 7. Download the signed .xpi from Mozilla

Once approved, go to the versions page: <https://addons.mozilla.org/en-US/developers/addon/fantasy-sync-assistant/versions/>

Find the new version and download the signed `.xpi` Mozilla generated. Its filename may not match the `.zip` you uploaded. This is the officially signed file people install, and it goes on GitHub in the next step.

## 8. Create the GitHub Release

Every release since v1.0.0 has attached both the signed `.xpi` and the raw `.zip` from step 3, so anyone can see the exact source that was submitted to Mozilla alongside the file people actually install.

The notes come straight from this version's section in CHANGELOG.md, `###` headings and all. This pulls that section out and passes it to `gh`:

```bash
awk '/^## \[vX.Y.Z\]/{f=1;next} /^## /{f=0} f' CHANGELOG.md \
  | gh release create vX.Y.Z path/to/downloaded-signed.xpi web-ext-artifacts/fantasy_sync_assistant-X.Y.Z.zip \
      --title "vX.Y.Z" --latest --notes-file -
```

Or without the CLI: create the release at <https://github.com/wazam/fantasy-sync-extension/releases/new>, pick tag `vX.Y.Z`, set the title to `vX.Y.Z`, paste this version's section from CHANGELOG.md without its `##` heading line, and drag both the signed `.xpi` and the `.zip` into the assets area.

## 9. Update the AMO listing and GitHub About

They copy the README and don't update on their own. Do this after AMO has approved the version, so the listing describes what people can install.

- **AMO listing:** if this release changed the README's intro, Usage, Features or Screenshots, open the Developer Hub, choose **Edit Product Page**, and update the summary, description and screenshots to match. The listing is separate from the version's release notes.
- **GitHub About:** one sentence of at most 100 characters that says what the README's first sentence says. Change it only when that sentence changes, through the gear icon next to About or `gh repo edit wazam/fantasy-sync-extension --description "..."`.

## 10. Verify

- The AMO listing shows the new version live: <https://addons.mozilla.org/en-US/firefox/addon/fantasy-sync-assistant/>
- The GitHub Release shows the `.xpi` and `.zip` attached and downloadable: <https://github.com/wazam/fantasy-sync-extension/releases>
- The version's heading link in CHANGELOG.md opens its GitHub Release.
- Every release page matches CHANGELOG.md:

  ```bash
  for v in $(git tag -l 'v*'); do
    diff <(gh release view $v --json body -q .body | tr -d '\r' | sed '/^$/d') \
         <(awk "/^## \\[$v\\]/{f=1;next} /^## /{f=0} f" CHANGELOG.md | sed '/^$/d') >/dev/null \
      && echo "$v matches" || echo "$v DIFFERS"
  done
  ```

  For a page that differs, move anything better on the page into CHANGELOG.md first, then overwrite the page: `awk "/^## \\[$v\\]/{f=1;next} /^## /{f=0} f" CHANGELOG.md | gh release edit $v --notes-file -`.
- The README badges need no edits: they're shields.io endpoints pulling live from AMO and GitHub, so they update on their own once both of the above are live.
- The README still matches the extension, and the AMO listing matches the README. Unlike the badges, neither updates itself.

## Updating Node and web-ext

Neither ships: the zip holds only the files named in `web-ext-config.mjs`. Update them on purpose (an `npm audit` alert, Node leaving support, or the start of a new round of work), and only before step 3, never between the test and the tag.

- **Node** lives only in `.tool-versions`. Use the current LTS line (an even major version): `asdf install nodejs <version>`, change `.tool-versions`, then `rm -rf node_modules && npm ci`.
- **web-ext:** `npm install --save-dev web-ext@<version>`, then `npm audit fix`. Never `--force`, which can downgrade web-ext.
- Then run step 3 in full, and check the zip lists the same files as before.
- Commit the update on its own: `chore: update Node to <version> and web-ext to <version>`.
