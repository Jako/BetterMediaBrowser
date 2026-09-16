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
        if ($this->modx->user && $this->modx->user->hasSessionContext('mgr')) {
            $assetsUrl = $this->bettermediabrowser->getOption('assetsUrl');
            $jsUrl = $this->bettermediabrowser->getOption('jsUrl') . 'mgr/';
            $jsSourceUrl = $assetsUrl . '../../../source/js/mgr/';
            $cssUrl = $this->bettermediabrowser->getOption('cssUrl') . 'mgr/';
            $cssSourceUrl = $assetsUrl . '../../../source/css/mgr/';

            $this->modx->controller->addLexiconTopic('bettermediabrowser:default');

            if ($this->bettermediabrowser->getOption('debug') && ($this->bettermediabrowser->getOption('assetsUrl') != MODX_ASSETS_URL . 'components/bettermediabrowser/')) {
                $this->modx->controller->addJavascript($jsSourceUrl . 'bettermediabrowser.js?v=v' . $this->bettermediabrowser->version);
                $this->modx->controller->addJavascript($jsSourceUrl . 'helper/api.js?v=v' . $this->bettermediabrowser->version);
            } else {
                $this->modx->controller->addJavascript($jsUrl . 'bettermediabrowser.min.js?v=v' . $this->bettermediabrowser->version);
            }
            $this->modx->controller->addHtml('<script type="text/javascript">
        Ext.onReady(function() {
            BetterMediaBrowser.config = ' . json_encode($this->bettermediabrowser->options, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . ';
        });
        </script>');
            if ($this->bettermediabrowser->getOption('debug') && ($this->bettermediabrowser->getOption('assetsUrl') != MODX_ASSETS_URL . 'components/bettermediabrowser/')) {
                $this->modx->controller->addCss($cssSourceUrl . 'bettermediabrowser.css?v=v' . $this->bettermediabrowser->version);
            } else {
                $this->modx->controller->addCss($cssUrl . 'bettermediabrowser.min.css?v=v' . $this->bettermediabrowser->version);
            }
        }
    }
}
