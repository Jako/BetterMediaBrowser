<?php

/**
 * Clear the BetterMediaBrowser cache of all media sources.
 *
 * Removes the cached file search indexes, the cached search results and the
 * cached folder lists of the BetterMediaSource media sources.
 *
 * @package bettermediabrowser
 */

use Visions\BetterMediaBrowser\Processors\Processor;

class BetterMediaBrowserCacheClearProcessor extends Processor
{
    /** @var string */
    public $permission = 'empty_cache';

    /**
     * @return array|string
     */
    public function process()
    {
        if (!$this->bettermediabrowser->getSearchCache()->clearAll()) {
            return $this->failure($this->modx->lexicon('bettermediabrowser.error_cache_clear'));
        }
        return $this->success($this->modx->lexicon('bettermediabrowser.msg_cache_cleared'));
    }
}

return 'BetterMediaBrowserCacheClearProcessor';
