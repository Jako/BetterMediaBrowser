<?php
/**
 * Abstract plugin, that invalidates the file search cache of a media source
 *
 * @package bettermediabrowser
 * @subpackage plugin
 */

namespace Visions\BetterMediaBrowser\Plugins;

/**
 * Class ClearSearchCache
 */
abstract class OnFileManagerEvent extends Plugin
{
    public function process()
    {
        // OnFileManagerMoveObject provides the target Media Source as toSource,
        // if a file is moved to another Media Source
        foreach (['source', 'toSource'] as $key) {
            $source = isset($this->scriptProperties[$key]) ? $this->scriptProperties[$key] : null;
            if (is_object($source)) {
                $this->bettermediabrowser->getSearchCache()->clear($source->get('id'));
            }
        }
    }
}
