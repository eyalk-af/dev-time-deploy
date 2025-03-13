// noinspection DuplicatedCode

'use strict';
exports.__esModule = true;

const path = require('path');
const fs = require('fs');
const {
    readLine, findFileInParents, findFirstFile, wrapInGreen, wrapInRed, wrapInOrange, wrapInPink, wrapInBlue,
} = require('./modules/script_utils');
const {spawn} = require('child_process');
const {execSync} = require('child_process');
const os = require("os");
const {Environments} = require("./modules/environments");
const {SelectionMenu} = require("./modules/selection-menu");

// Visuals
const MOVE_CURSOR_UP = "\x1b[1A";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const COLOR_GREEN = "\x1b[32m";
const COLOR_RESET = "\x1b[0m";
const STEP_DELAY = 100;
const SEPARATOR = "---------------------------------------------------------";

// DeployStatus
const DeployStatus_Running = 'Running';
const DeployStatus_Success = 'Success';
const DeployStatus_Error = 'Error';

// Actions
const Action_Deploy = "Deploy";
const Action_SendExitSignal = "Reset to CI/CD latest";
const Action_TestStatus = "Test deployment status";
const Action_PortForward = "Port forward";
const Action_ListPods = "List current pods";
let Actions = [
    Action_Deploy,
    Action_SendExitSignal,
    Action_TestStatus,
    Action_ListPods,
    Action_PortForward];

// Deploy files.
let deployId = Date.now();// Array.from({ length: 5 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
let tool_root = `/tmp/dev_time_deploy_tool/${deployId}`;
fs.mkdirSync(tool_root, {recursive: true});

const dev_time_deploy = 'dev_time_deploy';
const zipFile = `${tool_root}/${dev_time_deploy}.zip`;
const zipFileRemote = `/tmp/dev_time_deploy_requests/dev_time_deploy_app_${deployId}.zip`;
const statusFileRemote = `/tmp/dev_time_deploy_status_${deployId}.json`;

let selectedService = null;
let selectedEnv;
let selectedAction = null;
let context;

let pods;
let podNames = [];
let startTime;
let isRemoteMode = true;
let deployData;

let configuration = {
    runCount: 0, services: [], environment: ''
}

let logFile;

async function main() {
    startTime = Date.now();

    await showIntroAnimation();
    await initTool();

    await sleep(250);

    await selectService();
    await selectEnvironment();
    await selectAction();

    await testKubectlConnection();
    await sleep(STEP_DELAY);
    //
    if (selectedAction === Action_Deploy) {
        startTime = Date.now();
        await compileProject();
        await sleep(STEP_DELAY);

        await creteDeployPackage();
        await sleep(STEP_DELAY);

        await fetchServicePods();
        await sleep(STEP_DELAY);

        await copyDeployPackageToPods();
        await sleep(STEP_DELAY);

        await pollDeployStatus();
        // await pollDeployStatus2();
        await sleep(STEP_DELAY);
    }

    if (selectedAction === Action_SendExitSignal) {
        await fetchServicePods();
        await sleep(STEP_DELAY);

        await runRolloutServiceOnK8s();
        await sleep(STEP_DELAY);
    }

    if (selectedAction === Action_TestStatus) {
        await fetchServicePods();
        await sleep(STEP_DELAY);

        await getPodsStatus();
        await sleep(STEP_DELAY);
    }

    if (selectedAction === Action_PortForward) {
        await fetchServicePods();
        await runPortForward();
        await sleep(STEP_DELAY);
    }

    if (selectedAction === Action_ListPods) {
        await fetchServicePods();
        await sleep(STEP_DELAY);

        await printPods();
        await sleep(STEP_DELAY);
    }


    process.exit(0);
}


async function showIntroAnimation() {
    process.stdout.write(HIDE_CURSOR);

    // Make way
    for (let i = 0; i < 20; i++) {
        console.log("");
    }

    // Go back
    for (let i = 0; i < 20; i++) {
        process.stdout.write(MOVE_CURSOR_UP);
    }

    process.stdout.write(COLOR_GREEN);
    console.log("==================================================");
    console.log("☀️Dev Time Deploy                              ☀️");
    console.log("==================================================");
    process.stdout.write(SHOW_CURSOR);
    process.stdout.write(COLOR_RESET);
}

async function initTool() {
    initLogging();
    console.log("");
    console.log("");

    readConfiguration();
    configuration.runCount++;
    saveConfiguration();
}

function initLogging() {
    let logFilePath = `${tool_root}/log.txt`;
    logFile = fs.createWriteStream(logFilePath, {flags: 'a'});
    const originalLog = console.log;
    console.log = (...args) => {
        const message = args.map(String).join(' ') + '\n'; // Convert all args to string
        originalLog(...args);
        logFile.write(message);
    }

    console.log(`logs at: ${logFilePath}`);
}

async function selectService2() {
    let menu = new SelectionMenu("Services", configuration.services, 'name');
    let index = Environments.findIndex(e => e.name === configuration.environment);
    menu.setSelectedIndex(index);
    menu.setSelectedIndex(index);
    menu.setSelectedValue(index);
    menu.setInputProcessor(function (text) {

    });
    let env = await menu.show();
}

async function selectService() {
    async function promptService() {
        let services = configuration.services;
        console.log(SEPARATOR);
        console.log("   Recent Services:");
        console.log(SEPARATOR);

        let answer;
        if (services.length === 0) {
            console.log("-- No recent services --");
            answer = (await readLine('Enter service directory path: ')).trim();
        } else {
            for (let i = 0; i < services.length; i++) {
                const service = services[i];
                let selected = i === 0 ? ">>" : "  ";

                let message = `${selected}${lz(i + 1)}. ${service.name}`;
                if (i === 0) {
                    message = wrapInGreen(message);
                }
                console.log(message);
            }
            console.log(SEPARATOR);
            answer = (await readLine("Select a service or enter directory path: ")).trim();
        }

        let index = parseInt(answer);
        if (isNaN(index)) {
            if (answer === '') {
                index = 0;
            } else {
                return buildServiceData(answer);
            }
        } else {
            index--;
        }

        if (index >= 0 && index <= services.length - 1) {
            return services[index];
        } else {
            throw new Error("Invalid service number");
        }
    }

    let service = null;
    while (!service) {
        try {
            service = await promptService();
            process.stdout.write(MOVE_CURSOR_UP);
            console.log("Selected service: " + wrapInGreen(service.name));
            console.log(SEPARATOR);
            console.log("");
        } catch (e) {
            console.log(e.message);
            console.log("Press any key to retry");
            await readLine();
            console.log();
            console.log();
        }
    }

    let index = configuration.services.findIndex(x => x.name === service.name);
    if (index !== -1) {
        configuration.services.splice(index, 1);
    }
    configuration.services.unshift(service);
    saveConfiguration();

    selectedService = service;
}

async function selectAction() {
    async function promptAction() {
        console.log(SEPARATOR);
        console.log("   Actions:");
        console.log(SEPARATOR);
        for (let i = 0; i < Actions.length; i++) {
            const action = Actions[i];
            let message = `${i + 1}. ${action}`;
            if (i === 0) {
                message = wrapInGreen(message);
            }
            console.log(message);
        }

        console.log(SEPARATOR);
        const answer = (await readLine('What do you want to do: ')).trim();
        let index = parseInt(answer);

        if (!isNaN(index)) {
            index--;
        } else {
            if (answer === '') {
                index = 0;
            } else {
                index = -1;
            }
        }

        if (index >= 0 && index <= Actions.length - 1) {
            return Actions[index];
        } else {
            throw new Error("Invalid action number");
        }
    }

    selectedAction = null;
    while (!selectedAction) {
        try {
            selectedAction = await promptAction();
            process.stdout.write(MOVE_CURSOR_UP);
            console.log("Selected action: " + wrapInGreen(selectedAction));
            console.log(SEPARATOR);
            console.log("");
        } catch (e) {
            console.log(e.message);
            console.log("Press any key to retry");
            await readLine();
            console.log();
            console.log();
        }
    }
}

async function selectEnvironment() {
    if (!isRemoteMode) {
        return;
    }

    async function promptEnvironment() {
        console.log(SEPARATOR);
        console.log("   Environments: ");
        console.log(SEPARATOR);
        let selectedIndex = -1;
        for (let i = 0; i < Environments.length; i++) {
            const env = Environments[i];
            let selected;
            if (env.name === configuration.environment) {
                selected = ">>";
                selectedIndex = i;
            } else {
                selected = "  ";
            }
            let message = `${selected}${lz(i + 1)}. ${env.name}`;
            if (env.name === configuration.environment) {
                message = wrapInGreen(message);
            }
            console.log(message);
        }

        console.log(SEPARATOR);
        const answer = (await readLine("Select an environment: ")).trim();
        let index = parseInt(answer);
        if (isNaN(index)) {
            if (answer === '') {
                index = selectedIndex;
            } else {
                throw new Error("Invalid environment number");
            }
        } else {
            index--;
        }

        if (index >= 0 && index <= Environments.length - 1) {
            return Environments[index];
        } else {
            throw new Error("Invalid environment number");
        }
    }

    selectedEnv = null;
    while (!selectedEnv) {
        try {
            selectedEnv = await promptEnvironment();
            process.stdout.write(MOVE_CURSOR_UP);
            console.log("Selected environment: " + wrapInGreen(selectedEnv.name));
            console.log(SEPARATOR);
            console.log();
        } catch (e) {
            console.log(e.message);
            console.log("Press any key to retry");
            await readLine();
            console.log();
            console.log();
        }
    }
    context = `--context=${selectedEnv.eks_context}`;

    configuration.environment = selectedEnv.name;
    saveConfiguration();
}

function buildServiceData(aPath) {
    if (!aPath.startsWith('/')) {
        throw new Error("Invalid path - not absolute");
    }

    const packageJsonFile = findFileInParents(aPath, 'package.json');
    if (packageJsonFile == null) {
        throw new Error("Invalid project directory - unable to find package.json");
    }

    let projectDir = path.dirname(packageJsonFile);
    let ciFile = projectDir + '/ci/ci.Dockerfile';
    if (!fs.existsSync(ciFile)) {
        throw new Error(`Missing CI file at: ${ciFile}`);
    }

    let valuesDefaultFile = findFirstFile(projectDir, 'values-default.yaml');
    if (valuesDefaultFile == null) {
        throw new Error(`Missing 'values-default.yaml' in ${projectDir}`);
    }

    let serviceName;
    let valuesDefaultText = fs.readFileSync(valuesDefaultFile, 'utf8');
    for (let line of valuesDefaultText.split("\n")) {
        line = line.trim();
        const NAME_OVERRIDE = "nameOverride:";
        let pos = line.indexOf(NAME_OVERRIDE);
        if (pos !== -1) {
            serviceName = line.substring(pos + NAME_OVERRIDE.length).trim();
            break;
        }
    }

    if (serviceName == null) {
        throw new Error(`Could not determine service name from: ${valuesDefaultFile}}`);
    }

    return {name: serviceName, path: projectDir};
}


async function testKubectlConnection() {
    if (!isRemoteMode) {
        return;
    }

    let TIMEOUT = 10;
    let versionFile = `/tmp/kubectl_version.txt`;
    try {
        console_write("Testing kubectl connectivity... ");
        if (isRemoteMode) {
            execSyncWithLog(`kubectl ${context} version --request-timeout=${TIMEOUT}s > ${versionFile} 2>&1`).toString();
            console.log("Connected");
        } else {
            console.log("Running in local mode :)");
        }
        console.log("");
    } catch (e) {
        console_write(wrapInOrange(`\nCould not connect after ${TIMEOUT} seconds - are you connected to EKS?`));
        await sleep(STEP_DELAY * 2);
        console.log("\n\n");
    }
}

async function compileProject() {
    let projectDir = selectedService.path;
    let name = path.basename(projectDir);
    console.log(`Compiling project ${wrapInGreen(name)}`);
    let duration = Date.now();
    let command = `tsc -b ${projectDir}`;
    console.log(command);

    try {
        execSyncWithLog(command);
        duration = Math.ceil((Date.now() - duration) / 1000);
        console.log("Compilation completed (time taken: " + duration + "s)");
    } catch (e) {
        console.log(wrapInRed("Compile Error") + "\n" + e.message);
        process.exit(1);
    }
    console.log("");
}

function getToolConfigFile() {
    return toolUserRoot() + '/config.json';
}

async function creteDeployPackage() {
    const projectDir = selectedService.path;

    console.log("Creating deploy package");
    try {
        // Adding deploy_data.json to the package
        deployData = {deployId, skipRunningProcess: false};
        fs.writeFileSync(projectDir + '/dist/deploy_data.json', JSON.stringify(deployData));

        // Zipping
        const zipCommand = `cd ${projectDir}  &&  zip -r ${zipFile} dist`;
        console.log(zipCommand);
        execSyncWithLog(zipCommand);

        console.log("File: " + zipFile);
        console.log("");
    } catch (e) {
        console.error(`Error zipping package`);
        console.error(`Error: ${e.stack}`);
        process.exit(1);
    }
}

function toolUserRoot() {
    let root = os.homedir() + '/.dev_time_deploy';
    fs.mkdirSync(root, {recursive: true});
    return root;
}

function readConfiguration() {
    let toolConfigFile = getToolConfigFile();
    try {
        configuration = JSON.parse(fs.readFileSync(toolConfigFile, 'utf8'));
    } catch (e) {
    }
}

function saveConfiguration() {
    let toolConfigFile = getToolConfigFile();
    log("saving " + toolConfigFile);
    fs.writeFileSync(toolConfigFile, JSON.stringify(configuration));
    // console.log(JSON.stringify(configuration));
}


async function fetchPodsDeploymentStatus() {
    console.log("Checking pods:");

    let devTimeDeployedCount = 0;
    for (let i = 0; i < podNames.length; i++) {
        const podName = podNames[i];
        console_write(` ${i + 1}. pod ${podName} is... `);
        try {
            const marker = '/tmp/dev_time_deploy_completed.txt'
            if (isRemoteFileExists(podName, marker)) {
                console.log("still running with dev-time-deploy");
                devTimeDeployedCount++;
            } else {
                console.log(wrapInGreen("running with latest CI/CID"));
            }
        } catch (e) {
            log(e.stack);
            console.log(`${wrapInRed('Error: ')} ${e.message}`);
        }
        console.log();
    }

    return devTimeDeployedCount;
}

async function printPods() {
    for (const podName of podNames) {
        console.log(podName);
    }
}


function console_write(text) {
    process.stdout.write(text);
}

function lz(number) {
    if (number < 10) {
        return " " + number;
    } else {
        return "" + number;
    }
}


async function fetchServicePods() {
    try {
        process.stdout.write(`Finding service pods... `);
        if (isRemoteMode) {
            let command = `kubectl ${context} get pods -l name=${selectedService.name} -o json`;
            const podsJson = execSyncWithLog(command).toString();
            pods = JSON.parse(podsJson);
        } else {
            pods = {items: [{metadata: {name: 'local_machine_dummy_pod'}}]};
        }
        console.log("Done");
        console.log("");
    } catch (error) {
        console.error('Error getting pods \nError:' + error.stack);
        process.exit(1);
    }

    for (const pod of pods.items) {
        try {
            const podName = pod.metadata.name;
            podNames.push(podName);
        } catch (e) {
            console.log(`Could not find pod name`);
            process.exit(1);
        }
    }

    if (podNames.length === 0) {
        console.log(wrapInRed(`Found 0 pods for service ${selectedService.name}`));
        process.exit(1);
    }
}

async function copyDeployPackageToPods() {
    console.log(`Sending deploy package to the following ${podNames.length} ${podNames.length === 1 ? 'pod' : 'pods'}:`);
    await sleep(STEP_DELAY);

    for (let i = 0; i < podNames.length; i++) {
        const podName = podNames[i];
        try {
            process.stdout.write(` ${i + 1}. pod ${wrapInBlue(podName)} ... `);
            if (isRemoteMode) {
                execSyncWithLog(`kubectl ${context} cp ${zipFile} ${podName}:${zipFileRemote}`);
            } else {
                execSyncWithLog(`cp ${zipFile} ${zipFileRemote}`);
            }
            await sleep(STEP_DELAY / 2);
            console_write("delivered.");
            await sleep(STEP_DELAY);
            console.log();
        } catch (e) {
            console.log(`Could not send deploy package to pod ${podName} \nError:${e.stack}`);
            process.exit(1);
        }
    }
    console.log();
}

async function pollDeployStatus() {
    const statusByPod = {};
    for (const podName of podNames) {
        statusByPod[podName] = {status: DeployStatus_Running, message: ''};
    }
    const checkStartTime = Date.now();

    while (true) {
        console.log("Checking for deployments status:");
        for (let i = 0; i < podNames.length; i++) {
            const podName = podNames[i];

            await sleep(STEP_DELAY / 2);
            console_write(`${i + 1}. ${wrapInGreen(podName)} `);

            let deployStatus = statusByPod[podName];
            if (deployStatus.status !== DeployStatus_Running) {
                console.log(' - ' + formatDeployMessage(deployStatus));
                continue;
            }

            statusByPod[podName] = deployStatus = fetchDeployStatus(podName);
            await sleep(STEP_DELAY / 4);

            console.log(' - ' + formatDeployMessage(deployStatus));
        }

        await sleep(STEP_DELAY / 2);
        let runningCount = Object.values(statusByPod).filter(x => x.status === DeployStatus_Running).length;
        if (runningCount > 0) {
            console_write(`Deployment is still running`);
            let seconds = isRemoteMode ? 60 : 100000;
            let isTimeout = Date.now() - checkStartTime >= seconds * 1000;
            if (isTimeout) {
                console.log(` - Deployment is probably stuck, aborting after ${seconds} seconds`);
                break;
            } else {
                const seconds = 2;
                console.log(` - Polling status again in ${seconds} seconds.`);
                await sleep(seconds * 1000);
            }
        } else {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            const successCount = Object.values(statusByPod).filter(x => x.status === DeployStatus_Success).length;
            const errorCount = Object.values(statusByPod).filter(x => x.status === DeployStatus_Error).length
            if (errorCount === 0) {
                console.log();
                console.log();
                console.log();
                console.log(wrapInPink("Successfully deployed package on all pods!") + `      time: ${duration} seconds`);
                // startTracker();
                console.log();
            } else if (successCount === 0) {
                console.log(`All pods failed to deployed`);
            } else {
                console.log(`Partial success pod deployment, success:${successCount}, errors:${errorCount}`);
            }

            await sleep(STEP_DELAY);
            break;
        }
        console.log("");
    }
}

function startTracker() {
    if (!isRemoteMode) {
        return;
    }

    const args = {
        deployId: deployId,
        pods: podNames,
        service: selectedService.name,
        environmentName: selectedEnv.name,
        environmentEksContext: selectedEnv.eks_context
    };

    let argFile = tool_root + '/' + 'tracker_args.json';
    fs.writeFileSync(argFile, JSON.stringify(args));

    const newProcess = spawn("deploy-tracker.sh", [argFile], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
    });
    newProcess.unref();
}

async function runRolloutServiceOnK8s() {
    console.log('Resetting the service to the latest version from the CI/CD pipeline');
    await sleep(STEP_DELAY);
    console.log(`Rolling out restart to: ${wrapInGreen(selectedService.name)}`);

    try {
        execSyncWithLog(`kubectl ${context} rollout restart deployment ${selectedService.name}`);
    } catch (e) {
        console.log("Error running kubectl rollout " + e.stack);
        process.exit(1);
    }

    // Track

    while (true) {
        let devTimeDeployedCount = await fetchPodsDeploymentStatus();
        if (devTimeDeployedCount > 0) {
            const delay = 10;
            console.log(`Some pods still run on dev-time-deploy, will check again in ${delay} seconds`);
            await sleep(delay * 1000);
        } else {
            console.log(`All pods run on CI/CI image`);
            return;
        }
    }

}

async function getPodsStatus() {
    let devTimeDeployedCount = await fetchPodsDeploymentStatus();
    if (devTimeDeployedCount > 0) {
        console.log(`Some pods are running on dev-time-deploy`);
    } else {
        console.log(`All pods run on CI/CI image`);
    }
}

async function runPortForward() {
    let s = await readLine("Type enter for port 2233 or type other port: ");
    if (!s) {
        s = "2233";
    }
    let port = Number(s);
    let command = `kubectl ${context} port-forward svc/${selectedService.name} ${port}:5000`;
    console.log("Running command:");
    console.log(command);
    execSyncWithLog(command).toString();
}

function isRemoteFileExists(podName, remoteFile) {
    let testCommand = `test -f ${remoteFile} && echo "1" || (echo "0" && true)`;
    let fileExistsBashCommand = `sh -c '${testCommand}'`;

    let output;
    if (isRemoteMode) {
        output = execSyncWithLog(`kubectl ${context} exec ${podName} -- ${fileExistsBashCommand}`).toString();
    } else {
        output = execSyncWithLog(testCommand).toString();
    }
    if (output.trim() === "1") {
        return true;
    }
    if (output.trim() === "0") {
        return false;
    }

    throw new Error(`Cannot determine if ${remoteFile} is on ${podName}`);
}


function formatDeployMessage(deployStatus) {
    if (deployStatus.status === DeployStatus_Success) {
        return wrapInGreen("Success");
    }
    if (deployStatus.status === DeployStatus_Error) {
        return wrapInRed("Error") + "\n" + deployStatus.message;
    }
    return "Running - " + deployStatus.message;
}


function fetchDeployStatus(podName) {
    try {
        if (!isRemoteFileExists(podName, statusFileRemote)) {
            return {status: DeployStatus_Running, message: 'Waiting for initial response'};
        }

        const resultFile = `${tool_root}/status_${podName}.txt`;
        if (isRemoteMode) {
            execSyncWithLog(`kubectl ${context} cp ${podName}:${statusFileRemote} ${resultFile}`).toString();
        } else {
            execSyncWithLog(`cp ${statusFileRemote} ${resultFile}`).toString();
        }

        let text = fs.readFileSync(resultFile, 'utf8');
        let lines = text.split("\n");
        let status = lines.shift();
        return {status, message: lines.join("\n")}
    } catch (error) {
        return {status: DeployStatus_Error, message: error.stack}
    }
}

function execSyncWithLog(command) {
    let message = "Running command: " + command;
    log(message);
    //console.log(message);

    return execSync(command);
}


async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message) {
    if (message instanceof Error) {
        logFile.write(message.message + "\n");
        if (message.stack) {
            logFile.write(message.stack + "\n");
        }
    } else {
        logFile.write(message + "\n");
    }
}


(async () => {
    await main();
})();