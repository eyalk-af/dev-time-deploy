const fs = require('fs');

const {showMessage} = require("./modules/script_utils");

const {execSync} = require('child_process');

let args = {};
args.deployId = undefined;
args.pods = undefined;
args.service = undefined;
args.environmentName = undefined;
args.environmentEksContext = undefined;

let deployId = args.deployId;
let trackedPods = args.pods;
let service = args.service;
let environmentName = args.environmentName;
let environmentEksContext = args.environmentEksContext;

let logFile;

function main() {
    try {
        let argFile = process.argv[2];
        if (!argFile) {
            console.log("Missing input - args file path");
            process.exit(1);
            return;
        }
        log("Reading: " + argFile);

        args = JSON.parse(fs.readFileSync(argFile, 'utf8').toString());
        deployId = args.deployId;
        trackedPods = args.pods;
        service = args.service;
        environmentName = args.environmentName;
        environmentEksContext = args.environmentEksContext;

        logFile = '/tmp/dev_time_deploy/tracker/logs';
        fs.mkdirSync(logFile, {recursive: true});
        logFile = `${logFile}/log_${deployId}`;

        setTimeout(checkServicePods, 1000);
    } catch (e) {
        log("Can't start tracker\n" + e.stack);
        process.exit(1);
    }
}

main();

function checkServicePods() {
    try {
        let pods = getPodsDeployIds();

        for (const pod of pods) {
            if (pod.error) {
                warnAndExit(`Error tracking pods\n${pod.error}`);
            }

            if (trackedPods.includes(pod.name)) {
                if (!pod.deployId) {
                    warnAndExit(`A pod was restarted - ${pod.name}`);
                }

                if (deployId !== pod.deployId) {
                    log(`A pod ${pod.name}reports a new deploy Id ${pod.deployId}`);
                    process.exit(0);
                }
            } else {
                warnAndExit(`A new pod has been added ${pod.name}`);
            }
        }

        setTimeout(checkServicePods, 10000);
    } catch (e) {
        warnAndExit(`Error getting pods\n${e.message}`);
    }
}


function warnAndExit(message) {
    showMessage(`Service ${service} on ${environmentName} should be reset\n${message}`);
    process.exit(0);
}

function getPodsDeployIds() {
    const context = `--context=${environmentEksContext}`;
    let command = `kubectl ${context} get pods -l name=${service} -o json`;
    const podsJson = execSync(command,{timeout:10000}).toString();
    let pods = JSON.parse(podsJson);
    let pods2 = [];
    for (const pod of pods) {
        let podName = pod.metadata.name;
        let podDeployId = '/tmp/current_dev_time_deploy_id.txt';
        let tempFile = `/tmp/current_dev_time_deploy_id_${Date.now()}.txt`;

        try {
            execSync(`kubectl ${context} cp ${podName}:${podDeployId} ${tempFile}`, {timeout: 10000}).toString();
            let deployId = fs.readFileSync(tempFile).toString();
            fs.unlinkSync(tempFile)
            pods2.push({name: podName, deployId});
        } catch (e) {
            pods2.push({name: podName, deployId, error: e.message});
        }
    }
    return pods2;
}

function log(message) {
    console.log(message);
    if (logFile) {
        fs.appendFileSync(logFile, message + '\n');
    }
}