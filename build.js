const fs = require('fs');
const path = require('path');
const runner = require('child_process');
const {minify} = require('terser');
const sass = require('sass');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');

// Read package information dynamically from package.json
const packageJson = require('./package.json');
const version = packageJson.version;
const currentYear = new Date().getFullYear();
const startYear = parseInt(packageJson.startYear) || currentYear;
const yearRange = currentYear > startYear ? `${startYear}-${currentYear}` : `${startYear}`;
const dateStr = new Date().toISOString().split('T')[0];

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
function replaceInFile(filePath, regex, replacement, message = 'file') {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠ File not found: ${filePath}`);
        return;
    }
    let content = String(fs.readFileSync(filePath, 'utf8'));
    content = content.replace(regex, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Updated ${message}: ${filePath}`);
}

// Helper: Ensure directory structure exists
function ensureDirExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, {recursive: true});
    }
}

// Helper: Copy a file
function copyFile(src, dest) {
    const fullSource = path.resolve(__dirname, src);
    const fullTarget = path.resolve(__dirname, dest);
    if (!fs.existsSync(fullSource)) {
        console.warn(`⚠ Source file not found for copy: ${src}`);
        return;
    }
    const targetDir = path.dirname(fullTarget);
    ensureDirExists(targetDir)
    fs.copyFileSync(fullSource, fullTarget);
    console.log(`✓ Copied: ${src} -> ${dest}`);
}

// Helper: Copy folders recursively with an optional filter function
async function copyFolderRecursive(src, dest, filterFn = () => true) {
    if (!fs.existsSync(src)) {
        console.warn(`⚠ Source file not found for copy: ${src}`);
        return;
    }
    ensureDirExists(dest);
    const entries = fs.readdirSync(src, {withFileTypes: true});

    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyFolderRecursive(srcPath, destPath, filterFn);
        } else if (filterFn(entry.name, srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`✓ Copied: ${srcPath} -> ${destPath}`);
        }
    }
}

// Helper function to compile scripts
async function compileScripts(files, dest, filename) {
    console.log('Compiling scripts...');
    let combinedCode = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const minified = await minify(combinedCode, {
        mangle: true,
        compress: true
    });
    const finalCode = banner + minified.code;
    ensureDirExists(dest);
    filename = filename.replace(/(\.\w+)$/i, '.min$1');
    fs.writeFileSync(path.join(dest, filename), finalCode, 'utf8');
}

// Helper function to compile, autoprefix and minify Sass
async function compileSass(src, intermediate, dest, filename) {
    console.log('Compiling Sass & processing CSS...');
    const sassResult = sass.compile(src, {style: 'expanded'});
    ensureDirExists(intermediate);
    fs.writeFileSync(path.join(intermediate, filename), sassResult.css, 'utf8');
    const postcssResult = await postcss([
        autoprefixer(),
        cssnano({preset: ['default', {discardComments: {removeAll: true}}]})
    ]).process(sassResult.css, {from: undefined});
    const finalCss = postcssResult.css + '\n' + banner;
    ensureDirExists(dest);
    filename = filename.replace(/(\.\w+)$/i, '.min$1');
    fs.writeFileSync(path.join(dest, filename), finalCss, 'utf8');
}

async function taskBump() {
    console.log(`Bump (with version ${versionFull} and daterange: ${yearRange})...`);
    const copyrightFiles = [
        'core/components/bettermediabrowser/model/bettermediabrowser/bettermediabrowser.class.php',
        'core/components/bettermediabrowser/src/BetterMediaBrowser.php',
        'core/components/bettermediabrowser/docs/readme.md',
        'README.md',
    ];
    copyrightFiles.forEach(file => {
        replaceInFile(file, copyrightRegex, copyrightReplace, 'copyright in');
    });
    replaceInFile(
        '_build/build.transport.php',
        /PKG_VERSION = '\d+\.\d+\.\d+-?[0-9a-z]*'/ig,
        `PKG_VERSION = '${versionNumber}'`,
        'version in'
    );
    replaceInFile(
        '_build/build.transport.php',
        /PKG_RELEASE = '.*?'/ig,
        `PKG_RELEASE = '${versionRelease}'`,
        'release in'
    );
    replaceInFile(
        'core/components/bettermediabrowser/src/BetterMediaBrowser.php',
        /version = '\d+\.\d+\.\d+-?[0-9a-z]*'/ig,
        `version = '${versionFull}'`,
        'version in'
    );
    replaceInFile(
        'src/js/mgr/helper/api.js',
        apiRegex,
        apiReplace,
        'daterange in'
    );
    replaceInFile(
        'core/components/bettermediabrowser/composer.json',
        /"version": "\d+\.\d+\.\d+-?[0-9a-z]*"/ig,
        `"version": "${versionFull}"`,
        'version in'
    );
}

async function taskCopy() {
    console.log('Copy files...');
    const copyFiles = [
        ['LICENSE.md', 'core/components/bettermediabrowser/docs/license.md'],
        ['CHANGELOG.md', 'core/components/bettermediabrowser/docs/changelog.md']
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
        'src/js/mgr/helper/api.js',
    ], 'assets/components/bettermediabrowser/js/mgr/', 'bettermediabrowser.js');
}

async function taskSass() {
    await compileSass(
        'src/sass/mgr/bettermediabrowser.scss',
        'src/css/mgr/',
        'assets/components/bettermediabrowser/css/mgr/',
        'bettermediabrowser.css'
    );
}

async function taskImages() {
    console.log('Copying images...');
    const isImageFilter = (fileName) => /\.(png|jpg|gif|svg)$/i.test(fileName);
    await copyFolderRecursive('src/img', 'assets/components/bettermediabrowser/img', isImageFilter);
}

async function taskTransport() {
    console.log('Creating transport package...');
    const phpScriptPath = path.resolve(__dirname, '_build/build.transport.php');
    runner.exec("php " + phpScriptPath, function (err, phpResponse, stderr) {
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
    taskBump().then(() => taskScripts()).then(() => taskSass().then(() => taskCopy()).then(() => taskImages()).then(() => taskTransport()));
}

console.log('Done!');
