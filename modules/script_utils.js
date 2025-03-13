const path = require('path');
const fs = require('fs');
const {spawn} = require('child_process');
const {execSync} = require('child_process');
const {spawnSync} = require('child_process');
const readline = require("readline");
const exec = require('child_process').exec;
const DIST_FOLDER = '/dist/';

function findFileInParents(startDirectory, searchedFileName) {
    let currentDir = startDirectory;
    while (currentDir) {
        const filePath = path.join(currentDir, searchedFileName);
        if (fs.existsSync(filePath)) {
            return filePath;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir !== currentDir) {
            currentDir = parentDir;
        } else {
            currentDir = null;
        }
    }
    return null;
}

function findFirstFile(directory, searchedFileName) {
    const children = fs.readdirSync(directory);
    for (const fileName of children) {
        if (isSearchExcluded(fileName)) {
            continue;
        }

        let file = path.join(directory, fileName);
        if (fileName === searchedFileName) {
            return file;
        }

        if (fs.statSync(file).isDirectory()) {
            file = findFirstFile(file, searchedFileName);
            if (file) {
                return file;
            }
        }
    }

    return null;

}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isSearchExcluded(fileName) {
    if (fileName.startsWith('.')) {
        return true;
    }
    if (fileName === 'node_modules') {
        return true;
    }
    if (fileName === 'dist') {
        return true;
    }
    return false;
}

function showMessage(text, showDuration = 10000) {
    exec(
        `osascript -e 'display dialog "${text}" with title "Message" buttons {"OK"} cancel button "OK" giving up after ${showDuration}'`,
    );
}

function showNotification(text, title = '') {
    exec(
        `osascript -e 'display notification "${text}" with title "${title}"'`
    );
}

async function getCurrentBranch(folder) {
    process.chdir(folder);
    let text = await executeProcessGetText("git", ["status"]);
    let line = text.split('\n')[0];
    let prefix = "On branch";
    let pos = line.indexOf(prefix);
    if (pos === -1) {
        throw new Error(`missing '${prefix}'`);
    }
    let branch = line.substring(pos + prefix.length);
    return branch.trim();
}


function replaceDistWithSrc(file) {
    if (file.includes(DIST_FOLDER)) {
        const split = file.split(DIST_FOLDER);
        file = split[0] + '/src/' + split[1];
    }
    return file;
}

function openInWebStorm(filePath) {
    exec(`/Applications/WebStorm.app/Contents/MacOS/webstorm ${filePath}`);
}

function openInIntelliJ(filePath) {
    exec(`/Applications/IntelliJ\\ IDEA.app/Contents/MacOS/idea ${filePath}`);
}

function wrapInRed(text) {
    return '\x1b[31m' + text + '\x1b[0m';
}

function wrapInGreen(text) {
    return '\x1b[32m' + text + '\x1b[0m';
}
function wrapInPink(text) {
    return '\x1b[95m' + text + '\x1b[0m';
}

function wrapInBlue(text) {
    return '\x1b[34m' + text + '\x1b[0m';
}

function wrapInOrange(text) {
    return '\x1b[38;2;255;165;0m' + text + '\x1b[0m';
}

function getSelectedText(path, selectionPositions_) {
    const text = fs.readFileSync(path, 'utf8');

    let selectionPositions = selectionPositions_.split("_");
    const SelectionStartLine = selectionPositions[0] - 1;
    const SelectionStartColumn = selectionPositions[1] - 1;
    const SelectionEndLine = selectionPositions[2] - 1;
    const SelectionEndColumn = selectionPositions[3] - 1;

    let offset1 = 0;
    let offset2 = 0;

    let lines = text.split('\n');
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        const line = lines[lineNumber];

        if (lineNumber < SelectionStartLine) {
            offset1 += line.length + 1; // +1 for \n
        } else if (lineNumber === SelectionStartLine) {
            offset1 += SelectionStartColumn;
        }

        if (lineNumber < SelectionEndLine) {
            offset2 += line.length + 1; // +1 for \n
        } else if (lineNumber === SelectionEndLine) {
            offset2 += SelectionEndColumn;
        }
    }

    return text.substring(offset1, offset2);
}

async function executeProcessWithOutput(command, args, onComplete = null) {
    return new Promise((resolve, reject) => {
        console.log(command + ' ' + args.join(' '));

        const aProcess = spawn(command, args);
        let output = "";
        // Listen to stdout (real-time output)
        aProcess.stdout.on('data', data => {
            console.log(`${data}`);
            output += data;
        });

        // Listen to stderr (real-time error output)
        aProcess.stderr.on('data', data => {
            console.error(`ERROR: ${data}`);
        });

        // Listen for when the process exits
        aProcess.on('close', code => {
            console.log(`Process exited with code ${code}`);
            if (onComplete) {
                onComplete(code, output);
            }
            resolve(output);
        });
    });
}

async function executeProcessGetText(command, args = [], verbose = false) {
    return new Promise((resolve, reject) => {
        if (verbose) {
            const join = args.join(' ');
            console.log(command + ' ' + join);
        }

        const aProcess = spawn(command, args);

        let output = "";
        // Listen to stdout (real-time output)
        aProcess.stdout.on('data', data => {
            if (verbose) {
                console.log(`${data}`);
            }
            output += data;
        });

        // Listen to stderr (real-time error output)
        aProcess.stderr.on('data', data => {
            if (verbose) {
                console.error(`ERROR: ${data}`);
            }
        });

        // Listen for when the process exits
        aProcess.on('close', code => {
            if (code === 0) {
                resolve(output.trim());
            } else {
                reject(new Error(`process exited with code ${code}`));
            }
        });
        return output;
    });
}


function findProjectDirectory(file) {
    let startDirectory;
    if (fs.statSync(file).isDirectory()) {
        startDirectory = file;
    } else {
        startDirectory = path.dirname(file);
    }
    const packageJsonFile = findFileInParents(startDirectory, 'package.json');
    const projectDirectory = path.dirname(packageJsonFile);
    return projectDirectory;
}


function scanPackageJsonFiles(dir, callback, isRoot = true) {
    const childrenNames = fs.readdirSync(dir);

    const isProject = childrenNames.indexOf('package.json') !== -1;
    if (isProject && !isRoot) {
        const projectPackageFile = path.join(dir, 'package.json');
        const text = fs.readFileSync(projectPackageFile, 'utf8');
        const packageData = JSON.parse(text);
        callback(projectPackageFile, packageData);
    } else {
        for (const file of childrenNames) {
            if (file.startsWith('.')) {
                continue;
            }
            if (file === 'node_modules') {
                return;
            }
            if (file === 'dist') {
                return;
            }

            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                scanPackageJsonFiles(fullPath, callback, false);
            }
        }
    }
}

function copyToClipboard(text) {
    execSync(`echo "${text}" | pbcopy`);
    spawnSync('pbcopy', {input: text});

}


function promptInput(promptText, defaultText = '') {
    return new Promise((resolve, reject) => {
        const script = `osascript -e 'Tell app "System Events" to display dialog "${promptText}" default answer "${defaultText}"' -e 'text returned of result'`;
        exec(script, (error, stdout, stderr) => {
            if (error) {
                resolve(null);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

function formatDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}_${month}_${day}__${hours}_${minutes}_${seconds}`;
}


function lz(number) {
    if (number < 10) {
        return " " + number;
    } else {
        return "" + number;
    }
}

/**
 * Reads a line from the console.
 * @param {string} prompt - The prompt message.
 * @returns {Promise<string>} - A promise that resolves to the user's input.
 */
async function readLine(prompt = '') {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer + "");
        });
    });
}

module.exports = {
    findFirstFile,
    findFileInParents,
    readLine,
    showMessage,
    getCurrentBranch,
    replaceDistWithSrc,
    openInWebStorm,
    openInIntelliJ,
    wrapInRed,
    wrapInGreen,
    wrapInBlue,
    wrapInPink,
    wrapInOrange,
    getSelectedText,
    executeProcessWithOutput,
    findProjectDirectory,
    scanPackageJsonFiles,
    copyToClipboard,
    executeProcessGetText,
    promptInput,
    showNotification,
    sleep,
    lz,
};
