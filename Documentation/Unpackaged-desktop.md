# No-certificate desktop EXE port — checkpoint

## Requested outcome

NvGram must run as an ordinary unpackaged Windows desktop process, with no purchased certificate, no self-signed certificate trust step, no MSIX registration and no package identity dependency. A ZIP containing the EXE and required DLLs/assets is acceptable; a single-file EXE is not promised. Stable and Development must retain separate configuration, data directories, versions and updates. Unsigned executables can trigger Windows SmartScreen/unknown-publisher warnings.

**Status: foundation only; no runnable unpackaged EXE has been delivered.** Existing packaged builds and release publication remain unchanged. No user API values were written to source or configuration.

## Implemented checkpoint

- Extracted the existing `ISettingsStore` contract without changing its methods. The legacy project's explicit Compile list includes the extracted contract; modern SDK projects discover it automatically.
- Added `FileSettingsStore.Win32.cs`, compiled only by SDK desktop/modern projects that include Win32 files. It is **not selected at runtime yet**. Packaged `ApplicationDataSettingsStore.Local` is unchanged.
- Typed JSON preserves supported scalar/array types instead of converting all numbers to JSON doubles. Mutations persist immediately with a flushed temporary file and atomic replacement; failed saves roll back memory changes. An exclusive root lock refuses competing process writers. Invalid/corrupt files fail visibly without resetting passcode/settings. Child-container operations follow the existing interface; `Clear` clears values rather than deleting children. Returned mutable arrays are defensive copies.
- Added a package-independent .NET 10 executable regression harness linking the actual implementation and contract. No new test libraries or application dependencies were added.
- Added a credential-safe call-site inventory generator. It outputs file/line/category only, never source contents or local secret files.

Run:

```bash
dotnet run --project Tools/UnpackagedTests/UnpackagedTests.csproj --configuration Release
node Tools/Automation/unpackaged-inventory.mjs
```

The settings harness compiled and passed **59 assertions**, covering typed roundtrips, null values, mutable-array isolation, exclusive ownership, removal/container semantics, deleted/disposed handles, channel isolation, invalid types/nonfinite numbers, corrupted/unsupported schemas and temporary-file cleanup.

Inventory: **65 files**, with 41 storage, 22 identity, 1 activation, 57 resource and 9 integration candidate locations. These are not automatically confirmed runtime defects; UWP-only files and comments need contextual filtering. Generated report: `artifacts/unpackaged/inventory.json` (ignored build output).

## Next implementation gates

1. **Build host:** install/qualify VS2026 with UWP XAML tools, C++, .NET Native/MSIX tools, SDK 26100, CMake 4.4+, PHP; initialize pinned submodules and build TDLib. Local preflight confirms VS2026 is missing. Full desktop compilation cannot be validated with the installed VS2022.
2. **Storage seam:** route LocalFolder/TemporaryFolder uses through a desktop provider. Use per-user `%LOCALAPPDATA%` directories separated by channel, not executable-relative shared data. Keep packaged data untouched; migration must be explicit. Select/own/dispose the file settings store before `AppSettings` static initialization. Ensure single-instance coordination and crash-safe save behavior; settings files are not encryption for account tokens.
3. **Activation:** replace `AppInstance.GetActivatedEventArgs()` with desktop command-line/protocol activation and a real desktop launch path. `BootStrapper.Win32.Start(null)` currently logs an error, so bypassing the package call alone cannot launch the app.
4. **Resources:** qualify unpackaged PRI/ResourceLoader and WinUI 2/Win2D/native WinRT component activation; retain all XBF/resource/dependency files and add the required desktop compatibility manifest. Existing spike notes establish feasibility, not successful NvGram startup.
5. **Integrations:** qualify or explicitly disable/replace package-only background tasks, updates, startup registration, notifications, tiles, Store links, app services, capture permissions and file access. Never swallow failures simply to get an empty window.
6. **Build path:** add isolated output/intermediate folders and an opt-in unpackaged publish path only when the above startup seams compile. Do not disable package signing in the existing shipping workflow and call it an EXE port.
7. **Runtime acceptance:** on a clean Windows account, launch without package registration, log in using environment-provided Telegram app configuration, restart with persisted settings, exercise chat/media/calls/files/notifications, keyboard and screen-reader behavior, then install Stable/Development side by side with independent data and updates. Only afterward add unsigned EXE distribution to release workflows.

No full UI build, desktop startup, login, native component loading, Windows integration or performance claims are made at this checkpoint. The process-lifetime/storage strategy must be integrated before this backend can replace package storage safely.
