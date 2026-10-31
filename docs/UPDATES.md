# Updates

Audit uses a user-controlled update flow.

## What happens

1. The installed app checks the latest GitHub release in the background. The portable ZIP does not check.
2. If a newer version exists, the title bar shows an update button.
3. Nothing is downloaded until the user presses **Download update**.
4. After the download, the button changes state. The user can choose **Restart and install** or **Later**.
5. User data in `%APPDATA%\Audit` is not replaced by an update: the database, settings, themes and music files stay in place.

## Distribution requirements

Automatic installation only works for the Squirrel.Windows installed build. The release must contain:

- `AuditSetup.exe`
- `RELEASES`
- `Audit-<version>-full.nupkg`

The portable ZIP remains available, but it cannot update itself in place.

`update.electronjs.org` reads published, non-prerelease GitHub releases. Draft releases are invisible to it.

## Code signing

Windows updates should eventually be signed. Without a certificate the installer still works, but SmartScreen may warn and the update is less trustworthy. Do not treat unsigned updates as secure distribution for third parties.

## Progress

The Windows Squirrel flow exposes check, available, downloaded and error events, but not byte-by-byte progress. The first UI therefore uses an indeterminate download state. A percentage would require a different updater and installer stack.
