<?php
/**
 * @package bettermediabrowser
 * @subpackage plugin
 */

namespace Visions\BetterMediaBrowser\Plugins\Events;

use Visions\BetterMediaBrowser\Plugins\Plugin;

class OnSiteRefresh extends Plugin
{
    public function process()
    {
        $this->bettermediabrowser->getSearchCache()->clearAll();
    }
}
