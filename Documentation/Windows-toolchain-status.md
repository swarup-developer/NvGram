# Local Windows toolchain status — 2026-10-04

## Inspected

- VS2022 Build Tools 17.14 is installed and usable.
- VS2026 Community 18.6 is registered but incomplete, nonlaunchable, and marked as cancelled. Its required MSBuild executable does not exist. Earlier shorthand describing VS2026 as missing meant no usable installation, not absence of an installer record.
- Windows SDK 10.0.26100.0 and .NET SDK 10.0.301 are present.
- CMake and PHP are not available on PATH.
- Nine pinned Git submodules are uninitialized.
- Available space at inspection: C: 43.4 GiB, D: 97.3 GiB, E: 16.8 GiB. This checkout is on E:; native/vcpkg build storage should be planned before large restores.

## Administrator installation blocked

An explicit elevation request to complete the existing VS2026 installation with .NET desktop, C++ desktop, UWP/XAML, SDK26100, ATL/MFC/Spectre, MSIX, vcpkg and CMake components was **denied**. No alternate privileged route was attempted, no installation was performed, and no reboot was requested. VS2022 was not removed or modified.

Complete VS2026 manually through Visual Studio Installer, or explicitly authorize the installation in a later task. Confirm the required component IDs are available in the current VS2026 catalog. CMake must support the Visual Studio 18 generator (project documentation requires 4.4+); PHP is also needed for TDLib preparation. Do not assume Visual Studio's bundled CMake meets the required version.

## Actual evaluation/build results

Read-only Win32 project evaluation with VS2022 succeeded. It reported MSBuild 17.14.40 and VC targets v170, not the VS2026/v145 toolchain required by the native projects. `WindowsPackageType` was empty in the unrestored evaluation; this is not proof of a working unpackaged build.

An actual native prerequisite build failed before compilation with:

> This project references NuGet package(s) that are missing on this computer. The missing file is ..\\packages\\Microsoft.Windows.CppWinRT.3.0.260715.1\\build\\native\\Microsoft.Windows.CppWinRT.props.

This is a missing restore input, not an established C++ source defect. The command's nonzero exit status was preserved. No compiler diagnostics were fabricated, no toolset downgrade or suppressions were added, and no successful Win32 build is claimed.

Logs are preserved in ignored build output:

- `artifacts/toolchain/win32-vs2022-evaluation.txt`
- `artifacts/toolchain/native-prerequisite-failure.txt`

## Resume criteria

1. Obtain approval for, or manually complete, VS2026. Verify `vswhere` reports a complete instance with MSBuild, UWP/XAML and v145 x64 compiler components.
2. Install/verify CMake 4.4+ and PHP, preferably locally where possible, without unrelated system changes.
3. Check build-drive capacity; initialize the pinned submodules and restore NuGet packages.config/PackageReference inputs.
4. Build pinned vcpkg and TDLib dependencies, preserving logs.
5. Compile the Win32 host and fix only actual reproduced compiler errors, then rerun compilation and regression checks.

The user approval boundary currently blocks completion. Application sources and existing user credentials were not modified during this toolchain attempt. No commits, pushes, releases or remote settings changes were performed.
