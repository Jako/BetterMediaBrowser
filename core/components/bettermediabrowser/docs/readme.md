# BetterMediaBrowser

**BetterMediaBrowser** extends the MODX browser with drag-and-drop functionality for moving one or more files within the tree, deleting/downloading multiple files, and searching for files in the currently active media source.

## Features

- Move files directly from the right-hand media view to a folder in the left-hand tree
- Move multiple selected files to another folder at once using drag-and-drop
- Select multiple files using Ctrl/Cmd or Shift and download or delete them all at once
- Remember the most recently used subfolders of a media source and restore them the next time the source is opened
- Search using a search icon in the media source’s toolbar
- Display search results with thumbnails and relative paths
- A search hit opens the target folder in the file view, opens the folder in the directory tree, and sets the path when a file is selected
- Compatible with MODX 2.8.x and 3.x

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

| Key                                   | Name               | Description                                                             | Default                                      |
|---------------------------------------|--------------------|-------------------------------------------------------------------------|----------------------------------------------|
| bettermediabrowser.debug              | Debug              | Log debug information in the MODX error log.                            | Nein                                         |         
| bettermediabrowser.enabled            | Enabled            | Enable the BetterMediaBrowser extension.                                | Ja                                           |         
| bettermediabrowser.drag_drop_enabled  | Enable Drag & Drop | Enable drag-and-drop for files in the MODX Browser.                     | Ja                                           |         
| bettermediabrowser.search_enabled     | Enable Search      | Enable the BetterMediaBrowser file search.                              | Ja                                           |         
| bettermediabrowser.search_min_length  | Min Length         | Minimum length of the search string before as search is executed.       | 2                                            |         
| bettermediabrowser.search_max_results | Max Results        | Maximum count of files in the search results.                           | 500                                          |         
| bettermediabrowser.excluded_folders   | Excluded Folders   | Comma-separated list of folders to be excluded from the search results. | `.*/,core/,components/,connectors/,manager/` |         

## License

GPL-2.0-or-later

Copyright 2026 visions.ch gmbh & Treehill Studio
