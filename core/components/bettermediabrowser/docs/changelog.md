# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.1.0 – 2026-10-25

### Added

- Cache a file index per media source for faster searches
- Clear the search cache on file changes and when the MODX cache is cleared
- Keep the toolbar and the media source selector of the media browser tree visible while scrolling the tree
- Dutch, French and Russian translations

### Changed

- Faster scanning of local and MODX 3 media sources
- Sort the search results before limiting them
- Show a file icon instead of a thumbnail for files that are not images in the file search window

### Fixed

- Show an error message for all fatal errors in the file search, without exposing server paths
- Use the search_enabled system setting to enable the file search
- Use the enabled system setting to enable BetterMediaBrowser
- Use the working context of the media browser for the thumbnails in the file search window

## 1.0.3 – 2026-10-21

### Added

- Use the default MODX thumbnail generation in the file search window

## 1.0.2 – 2026-10-19

### Added

- The cache of the search list uses also the file-type filter
- An empty search result is also cached in the search list cache

### Fixed

- Match excluded folders from the media source root, so that folders with the same name in subfolders are not excluded anymore

## 1.0.1 – 2026-10-10

### Added

- Add an error message, when a timeout occurs in the file search window

## 1.0.0 – 2026-09-16

### Added

- Initial Version
