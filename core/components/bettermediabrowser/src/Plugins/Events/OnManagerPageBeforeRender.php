<?php
/**
 * @package bettermediabrowser
 * @subpackage plugin
 */

namespace Visions\BetterMediaBrowser\Plugins\Events;

use Visions\BetterMediaBrowser\Plugins\Plugin;

class OnManagerPageBeforeRender extends Plugin
{
    public function process()
    {
        if ($this->bettermediabrowser->getOption('enabled') && $this->modx->user && $this->modx->user->hasSessionContext('mgr')) {
            $assetsUrl = $this->bettermediabrowser->getOption('assetsUrl');
            $jsUrl = $this->bettermediabrowser->getOption('jsUrl') . 'mgr/';
            $jsSourceUrl = $assetsUrl . '../../../src/js/mgr/';
            $cssUrl = $this->bettermediabrowser->getOption('cssUrl') . 'mgr/';
            $cssSourceUrl = $assetsUrl . '../../../src/css/mgr/';

            $this->modx->controller->addLexiconTopic('bettermediabrowser:default');

            if ($this->bettermediabrowser->getOption('debug') && ($this->bettermediabrowser->getOption('assetsUrl') != MODX_ASSETS_URL . 'components/bettermediabrowser/')) {
                // Same order as in the build script
                $scripts = [
                    'bettermediabrowser.js',
                    'helper/util.js',
                    'helper/dragdrop.js',
                    'helper/selection.js',
                    'helper/lastfolder.js',
                    'helper/browser.js',
                    'widgets/search.grid.js',
                    'widgets/search.window.js',
                    'helper/search.js',
                    'helper/api.js',
                ];
                foreach ($scripts as $script) {
                    $this->modx->controller->addJavascript($jsSourceUrl . $script . '?v=v' . $this->bettermediabrowser->version);
                }
            } else {
                $this->modx->controller->addJavascript($jsUrl . 'bettermediabrowser.min.js?v=v' . $this->bettermediabrowser->version);
            }
            // Set the config immediately, so that it is available when the script initializes on Ext.onReady
            $this->modx->controller->addHtml('<script type="text/javascript">
        BetterMediaBrowser.config = ' . json_encode($this->bettermediabrowser->options, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . ';
        </script>');
            if ($this->bettermediabrowser->getOption('debug') && ($this->bettermediabrowser->getOption('assetsUrl') != MODX_ASSETS_URL . 'components/bettermediabrowser/')) {
                $this->modx->controller->addCss($cssSourceUrl . 'bettermediabrowser.css?v=v' . $this->bettermediabrowser->version);
            } else {
                $this->modx->controller->addCss($cssUrl . 'bettermediabrowser.min.css?v=v' . $this->bettermediabrowser->version);
            }
        }
    }
}
