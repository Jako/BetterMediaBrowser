## How it works

BetterMediaBrowser extends the MODX browser with drag & drop functionality
for moving one or more files within the tree, deleting/downloading multiple
files, and searching for files in the currently active media source. It also
remembers the most recently used subfolders of a media source and restores them
the next time the source is opened.

![Search window](img/bettermediabrowser-search.png)

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
