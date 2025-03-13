'use strict';
exports.__esModule = true;

const path = require('path');
const fs = require('fs');
const {
    readLine, findFileInParents, findFirstFile, wrapInGreen, wrapInRed, wrapInOrange, wrapInPink, wrapInBlue,
} = require('./modules/script_utils');

let root = JSON.parse(fs.readFileSync("/Users/eyalkatz/IdeaProjects/IAttentive/file_2.json").toString());
root = root[0];
let pmsViolationsList = root.violationsByPms;
let emrViolationsList = root.violationsByEm;

const pms = {};
const emr = {};

console.log("PMS");
for (const violation of pmsViolationsList) {
    pms[violation._id] = violation;
}
console.log("EM");
for (const violation of emrViolationsList) {
    emr[violation._id] = violation;
}

for (let i = 0; i < Object.keys(pms).length; i++) {
    const id = Object.keys(pms)[i];
    let v1 = pms[id];
    let v2 = emr[id];
    let match = JSON.stringify(v1) !== JSON.stringify(v2) ? "no match !!!!!" : "good";
    console.log(i + ` ${id} ` + match);
}