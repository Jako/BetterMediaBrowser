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
        $source = isset($this->scriptProperties['source']) ? $this->scriptProperties['source'] : null;
        if (is_object($source)) {
            $this->bettermediabrowser->getSearchCache()->clear($source->get('id'));
        }
    }
}
