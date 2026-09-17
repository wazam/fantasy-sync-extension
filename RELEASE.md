# Release pipeline

Do these in order. Nothing here should run until everything's been tested
locally via `about:debugging` temporary install.

## 1. Bump the version

Bump these on every release. All of them must match:

- `manifest.json`: `"version": "X.Y.Z"` (bump on every release)
- `package.json`: `"version": "X.Y.Z"` (bump with `npm version X.Y.Z --no-git-tag-version`)
- `package-lock.json`: updated automatically by the `npm version` command above

Only required if this release also needs a newer minimum Firefox version
(skip otherwise):

- `manifest.json`: `browser_specific_settings.gecko.strict_min_version` (e.g.
  `"A.B"`, Firefox's own major.minor; independent of this extension's own
  X.Y.Z version above, bump only when a release actually relies on a newer
  Firefox API)

## 2. Commit and tag

If the release bundles more than one unrelated change, use a multi-line commit
message with one semantically-prefixed bullet per change (`feat:`/`fix:`/`docs:`/`chore:`), not a single summary line:

```bash
git add manifest.json package.json package-lock.json <other changed files>
git commit -m "$(cat <<'EOF'
feat: <describe a new feature>
fix: <describe a bug fix>
docs: <describe a docs/README change>
EOF
)"
git tag vX.Y.Z
```

## 3. Push to GitHub

```bash
git push origin main
git push origin vX.Y.Z
```

(or `git push origin main --tags` to push the branch and every local tag at once)

## 4. Build the extension package

```bash
npm run build
```

Runs `web-ext build`, which zips the extension into `web-ext-artifacts/fantasy_sync_assistant-X.Y.Z.zip`. This zip (not a `.xpi` yet) is what gets uploaded to Mozilla in the next step.

## 5. Submit to Mozilla (AMO) for signing

- Go to the submission page: <https://addons.mozilla.org/en-US/developers/addon/fantasy-sync-assistant/versions/submit/>
- Upload the `.zip` from `web-ext-artifacts/`
- Fill in release notes (what's new in this version)
- Submit for review

AMO's automated review usually signs it within minutes; a manual review (if
flagged) can take longer. Check email for the approval notice.

## 6. Download the signed .xpi from Mozilla

- Once approved, go to the versions page: <https://addons.mozilla.org/en-US/developers/addon/fantasy-sync-assistant/versions/>
- Find the new version and download the signed `.xpi` Mozilla generated (the
  exact filename may not exactly match the `.zip` you uploaded). This is the
  officially signed file, distinct from the raw build output, and is what
  goes on GitHub in the next step.

## 7. Create the GitHub Release with the signed .xpi attached

```bash
gh release create vX.Y.Z path/to/downloaded-signed.xpi \
  --title "vX.Y.Z" \
  --notes "$(cat <<'EOF'
**What's New**

- ...

**Bug Fixes**

- ...
EOF
)"
```

Or without the CLI: create the release at <https://github.com/wazam/fantasy-sync-extension/releases/new>, select the new tag, paste in notes, and drag the signed `.xpi` into the assets area.

## 8. Verify

- AMO listing shows the new version live: <https://addons.mozilla.org/en-US/firefox/addon/fantasy-sync-assistant/>
- GitHub Release page shows the `.xpi` attached and downloadable: <https://github.com/wazam/fantasy-sync-extension/releases>
- No manual README changes needed for the badges: the version/users/rating/downloads badges and the "Latest Release" badge are all shields.io endpoints pulling live from AMO/GitHub, so they update on their own once both of the above are live.
- If this release changed the UI, double-check README's feature list and any screenshots are still accurate; unlike the badges, those are static and won't update themselves.
