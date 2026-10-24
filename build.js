const fs = require('fs').promises;
const path = require('path');
const runner = require('child_process');
const { minify } = require('terser');
const sass = require('sass');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');

// Read package information dynamically from package.json
const packageJson = require('./package.json');
const version = packageJson.version;
const phpversion = packageJson.phpversion;
const modxversion = packageJson.modxversion;
const currentYear = new Date().getFullYear();
const startYear = parseInt(packageJson.startYear) || currentYear;
const yearRange = currentYear > startYear ? `${startYear}-${currentYear}` : `${startYear}`;
const dateStr = new Date().toISOString()
    .split('T')[0];

const copyrightRegex = new RegExp(`Copyright ${startYear}(-\\d{4})? by`, 'g');
const copyrightReplace = `Copyright ${yearRange} by`;
const apiRegex = new RegExp(`&copy; ${startYear}(-\\d{4})?`, 'g');
const apiReplace = `&copy; ${yearRange}`;
const banner = `/*!\n * ${packageJson.fullname} - ${packageJson.description}\n * Version: ${packageJson.version}\n * Build date: ${dateStr}\n */\n`;

let versionParts = version.split('-');
let versionNumber = versionParts[0];
let versionRelease = versionParts[1] || 'pl';
let versionFull = versionNumber + '-' + versionRelease;

// Helper: Replace string/regex in a file
async function replaceInFile(filePath, replacements, message = 'file') {
    try {
        let content = await fs.readFile(filePath, 'utf8');
        replacements.forEach(({ search, replace }) => {
            content = content.replace(search, replace);
        });
        await fs.writeFile(filePath, content, 'utf8');
        console.log(`✓ Updated ${message}: ${filePath}`);
    } catch (e) {
        console.warn(`⚠ Error updating ${filePath}`);
    }
}

// Helper: Ensure directory structure exists
async function ensureDirExists(dirPath) {
    await fs.mkdir(path.dirname(dirPath), { recursive: true });
}

// Helper: Copy a file
async function copyFile(src, dest) {
    try {
        const fullSource = path.resolve(__dirname, src);
        const fullTarget = path.resolve(__dirname, dest);
        const targetDir = path.dirname(fullTarget);
        await ensureDirExists(targetDir);
        await fs.copyFile(fullSource, fullTarget);
        console.log(`✓ Copied: ${src} -> ${dest}`);
    } catch (e) {
        console.warn(`⚠ Error copying ${src} -> ${dest}`);
    }
}

// Helper: Copy folders recursively with an optional filter function
async function copyFolderRecursive(src, dest, filterFn = (fileName) => true) {
    await ensureDirExists(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyFolderRecursive(srcPath, destPath, filterFn);
        } else if (filterFn(entry.name)) {
            try {
                await fs.copyFile(srcPath, destPath);
                console.log(`✓ Copied: ${srcPath} -> ${destPath}`);
            } catch (e) {
                console.warn(`⚠ Error copying ${srcPath} -> ${destPath}`);
            }
        }
    }
}

// Helper function to compile scripts
async function compileScripts(files, dest, filename) {
    console.log('Compiling scripts...');
    const fileContents = await Promise.all(
        files.map(f => fs.readFile(f, 'utf8'))
    );
    const minified = await minify(fileContents.join('\n'), {
        mangle: true,
        compress: true,
        format: {
            comments: false,
        },
    });
    const finalCode = banner + minified.code;
    await ensureDirExists(dest);
    filename = filename.replace(/(\.\w+)$/i, '.min$1');
    await fs.writeFile(path.join(dest, filename), finalCode, 'utf8');
}

// Helper function to compile, autoprefix and minify Sass
async function compileSass(files, intermediate, dest, filename) {
    console.log('Compiling Sass & processing CSS...');
    let concatenatedCss = '';
    for (const file of files) {
        const sassResult = await sass.compile(file, { style: 'expanded' });
        const postcssResult = await postcss([
            autoprefixer()
        ])
            .process(sassResult.css, { from: undefined });
        concatenatedCss += postcssResult.css + '\n';
    }
    concatenatedCss = concatenatedCss.replace(/\/\*[\s\(\S\)]*?\*\/\n*/g, '');
    await ensureDirExists(intermediate);
    await fs.writeFile(path.join(intermediate, filename), concatenatedCss, 'utf8');
    const postcssResult = await postcss([
        autoprefixer(),
        cssnano({ preset: ['default', { discardComments: { removeAll: true } }] })
    ])
        .process(concatenatedCss, { from: undefined });
    const finalCss = postcssResult.css + '\n' + banner;
    await ensureDirExists(dest);
    filename = filename.replace(/(\.\w+)$/i, '.min$1');
    await fs.writeFile(path.join(dest, filename), finalCss, 'utf8');
}

async function taskBump() {
    console.log(`Bump (with version ${versionFull} and daterange: ${yearRange})...`);
    const copyrightFiles = [
        'core/components/bettermediabrowser/model/bettermediabrowser/bettermediabrowser.class.php',
        'core/components/bettermediabrowser/src/BetterMediaBrowser.php',
        'core/components/bettermediabrowser/docs/readme.md',
        'README.md',
    ];
    for (const file of copyrightFiles) {
        await replaceInFile(file, [{
            search: copyrightRegex,
            replace: copyrightReplace
        }], 'copyright in');
    }
    replaceInFile('core/components/bettermediabrowser/src/BetterMediaBrowser.php', [{
        search: /version = '\d+\.\d+\.\d+-?[0-9a-z]*'/ig,
        replace: `version = '${version}'`
    }], 'version in');
    const scriptFiles = [
        'src/js/mgr/widgets/search.window.js'
    ];
    for (const file of scriptFiles) {
        await replaceInFile(file, [{
            search: apiRegex,
            replace: apiReplace
        }], 'daterange in');
    }
    const docFiles = [
        'zensical.toml',
    ];
    for (const file of docFiles) {
        await replaceInFile(file, [{
            search: apiRegex,
            replace: apiReplace
        }], 'daterange in');
    }
    await replaceInFile('docs/index.md', [{
        search: /[*-] MODX Revolution \d.\d.*/g,
        replace: '* MODX Revolution ' + modxversion + '+'
    }, {
        search: /[*-] PHP (v)?\d.\d.*/g,
        replace: '* PHP ' + phpversion + '+'
    }], 'requirements in');
    await replaceInFile('_build/build.transport.php', [{
        search: /PKG_VERSION = '\d+\.\d+\.\d+-?[0-9a-z]*'/ig,
        replace: `PKG_VERSION = '${versionNumber}'`
    }, {
        search: /PKG_RELEASE = '.*?'/ig,
        replace: `PKG_RELEASE = '${versionRelease}'`
    }], 'version in');
    await replaceInFile('_build/build.transport.php', [{
        search: /'php' => '>=\d+(\.\d+){1,2}'/ig,
        replace: `'php' => '>=${phpversion}'`
    }, {
        search: /'modx' => '>=\d+(\.\d+){1,2}'/ig,
        replace: `'modx' => '>=${modxversion}'`
    }], 'requirements in');
    await replaceInFile('core/components/bettermediabrowser/composer.json', [{
        search: /"php": "\d.\d.*?"/g,
        replace: '"php": "' + phpversion + '"'
    }, {
        search: /"php": ">=\d.\d.*?"/g,
        replace: '"php": ">=' + phpversion + '"'
    }], 'requirements in');
    await replaceInFile('core/components/bettermediabrowser/composer.json', [{
        search: /"version": "\d+\.\d+\.\d+-?[0-9a-z]*"/ig,
        replace: `"version": "${version}"`
    }], 'version in');
}

async function taskCopy() {
    console.log('Copy files...');
    const copyFiles = [
        ['LICENSE.md', 'core/components/bettermediabrowser/docs/license.md'],
        ['CHANGELOG.md', 'core/components/bettermediabrowser/docs/changelog.md'],
    ];
    copyFiles.forEach(([source, destination]) => {
        if (source && destination) {
            copyFile(source, destination);
        } else {
            console.warn('⚠ copyFiles: Invalid file pair detected.');
        }
    });
}

async function taskScripts() {
    await compileScripts([
        'src/js/mgr/bettermediabrowser.js',
        'src/js/mgr/helper/util.js',
        'src/js/mgr/helper/dragdrop.js',
        'src/js/mgr/helper/selection.js',
        'src/js/mgr/helper/lastfolder.js',
        'src/js/mgr/helper/browser.js',
        'src/js/mgr/widgets/search.grid.js',
        'src/js/mgr/widgets/search.window.js',
        'src/js/mgr/helper/search.js',
        'src/js/mgr/helper/api.js',
    ], 'assets/components/bettermediabrowser/js/mgr/', 'bettermediabrowser.js');
}

async function taskSass() {
    await compileSass([
            'src/sass/mgr/bettermediabrowser.scss',
        ], 'src/css/mgr/', 'assets/components/bettermediabrowser/css/mgr/', 'bettermediabrowser.css',
    );
}

async function taskImages() {
    console.log('Copying images...');
    const isImage = function (fileName) {
        return /\.(png|jpg|gif|svg)$/i.test(fileName);
    };
    await copyFolderRecursive('src/img', 'assets/components/bettermediabrowser/img', isImage);
}

async function taskTransport() {
    console.log('Creating transport package...');
    const phpScriptPath = path.resolve(__dirname, '_build/build.transport.php');
    runner.exec('php ' + phpScriptPath, function (err, phpResponse, stderr) {
        if (err) {
            console.log(err);
        }
        console.log(phpResponse);
    });
}

const action = process.argv[2];
if (action === 'bump') {
    taskBump();
} else if (action === 'copy') {
    taskCopy();
} else if (action === 'scripts') {
    taskScripts();
} else if (action === 'sass') {
    taskSass();
} else if (action === 'images') {
    taskImages();
} else if (action === 'transport') {
    taskTransport();
} else {
    // Default: Beides ausführen
    taskBump()
        .then(() => taskScripts())
        .then(() => taskSass())
        .then(() => taskCopy())
        .then(() => taskImages())
        .then(() => taskTransport());
}

console.log('Done!');
