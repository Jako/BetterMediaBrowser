# BetterMediaBrowser

**BetterMediaBrowser** extends the MODX browser with drag-and-drop functionality
for moving one or more files within the tree, deleting/downloading multiple
files, and searching for files in the currently active media source. It also
installs the BetterMediaSource media source type with faster and cached folder
lists in the media browser.

## Features

- Move files directly from the right-hand media view to a folder in the left-hand tree
- Move multiple selected files to another folder at once using drag-and-drop
- Select multiple files using Ctrl/Cmd or Shift and download or delete them all at once
- Remember the most recently used subfolders of a media source and restore them the next time the source is opened
- Keep the toolbar and the media source selector of the directory tree visible while scrolling the tree
- Search using a search icon in the media source’s toolbar
- Fast searches with a cached file index per media source, which is cleared automatically on file changes and with the Clear media browser cache menu entry
- Display search results with thumbnails for images, file icons for other files and relative paths
- A search hit opens the target folder in the file view, opens the folder in the directory tree, and sets the path when a file is selected
- BetterMediaSource media source type with faster and cached folder lists in the media browser
- Compatible with MODX 2.8.x and 3.x

## BetterMediaSource

BetterMediaBrowser installs the media source type _BetterMediaSource_. It works
like the file system media source with the same properties, permissions and
policies, and adds:

- **Faster folder lists** (MODX 3): The media browser tree and file view are built up to 30 times faster.
- **Cached folder lists**: The media browser tree and file view are cached per user, context and manager language. The lifetime is set with the `bettermediabrowser.list_cache_lifetime` system setting.
- **Cache clearing in the media source**: The cache of the media source is cleared after each file change in the media source itself, even if the BetterMediaBrowser plugin is disabled or a file is changed by other code that does not fire the file manager events.

To use it, change the type of an existing file system media source to
_BetterMediaSource_ or create a new media source of this type. When
BetterMediaBrowser is uninstalled, all BetterMediaSource media sources are
converted back to file system media sources.

## Security

The search performs the following checks on the server side:

- The `file_list` manager permission
- The `list` media source policy
- The working context of the requested media source

Drag-and-drop in the MODX browser uses the *Core Directory Sort Processor* with the current user's permissions.

Deleting and Downloading multiple files in the MODX browser use the *Core Remove Processor* or the *Core Download Processor* with the current user's permissions.

## Installation

MODX Package Management

## System Settings

_BetterMediaBrowser_ contains some _system settings_ in the `bettermediabrowser` namespace.

| Key                                    | Name                | Description                                                                                                          | Default                                          |
|----------------------------------------|---------------------|----------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| bettermediabrowser.debug               | Debug               | Log debug information in the MODX error log.                                                                         | No                                               |
| bettermediabrowser.enabled             | Enabled             | Enable the BetterMediaBrowser extension.                                                                             | Yes                                              |
| bettermediabrowser.drag_drop_enabled   | Enable Drag & Drop  | Enable drag-and-drop for files in the MODX Browser.                                                                  | Yes                                              |
| bettermediabrowser.search_enabled      | Enable Search       | Enable the BetterMediaBrowser file search.                                                                           | Yes                                              |
| bettermediabrowser.search_min_length   | Min Length          | Minimum length of the search string before a search is executed.                                                     | 2                                                |
| bettermediabrowser.search_max_results  | Max Results         | Maximum count of files in the search results.                                                                        | 500                                              |
| bettermediabrowser.excluded_folders    | Excluded Folders    | Comma-separated list of folders to be excluded from the search results.                                              | `.*/,_*/,core/,components/,connectors/,manager/` |
| bettermediabrowser.list_cache_lifetime | List Cache Lifetime | Seconds, that the BetterMediaSource media source caches the folder lists of the media browser. 0 disables the cache. | 300                                              |

## License

GPL-2.0-or-later

Copyright 2026 visions.ch gmbh & Treehill Studio
