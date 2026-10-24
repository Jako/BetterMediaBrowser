<?php
/**
 * Path helpers
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search;

/**
 * Class Path
 */
class Path
{
    /**
     * Normalize a path relative to the Media Source base path
     *
     * @param mixed $path
     * @param bool $directory Add a trailing slash
     * @return string Empty for an invalid path
     */
    public static function normalize($path, $directory = false)
    {
        $path = (string)$path;
        for ($i = 0; $i < 3; $i++) {
            $decoded = rawurldecode($path);
            if ($decoded === $path) {
                break;
            }
            $path = $decoded;
        }
        $path = str_replace(['\\', "\0"], ['/', ''], $path);

        $safe = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                return '';
            }
            $safe[] = $segment;
        }

        $path = implode('/', $safe);
        if ($directory && $path !== '') {
            $path .= '/';
        }
        return $path;
    }

    /**
     * Get the parent directory of a normalized path
     *
     * @param string $path
     * @return string Parent directory with trailing slash or empty for the root
     */
    public static function parent($path)
    {
        $path = rtrim($path, '/');
        $pos = strrpos($path, '/');
        return ($pos === false) ? '' : substr($path, 0, $pos + 1);
    }
}
