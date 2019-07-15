const checker = require("license-checker");
const fs = require("fs");
const path = require("path");
const program = require("commander");

program
    .version("0.1.0")
    .option("-p, --path [directory]", "package to scan")
    .option("-o, --output [file path]", "output appendix file path")
    .parse(process.argv);

function isDirSync(checkPath) {
    try {
        let dir = path.dirname(checkPath);
        return fs.statSync(dir).isDirectory();
    }
    catch (e) {
        if (e.code === "ENOENT") {
            return false;
        } else {
            throw e;
        }
    }
}

if (!program.output || !isDirSync(program.output)) {
    console.log("--output required and output directory much exist!");
    return;
}

const customFormat = {
    "name": "<<Unknown Name>>",
    "version": "<<Unknown Version>>",
    "description": "<<Unknown Description>>"
};

checker.init({ start: program.path, production: true, customFormat: customFormat }, (error, packages) => {
    if (error) {
        throw new Error(error);
    }
    else {
        const outputFile = program.output;
        console.log("processing: " + program.path);
        fs.writeFileSync(outputFile, "####Appendix of packages and their licenses ####\n\n");
        Object.keys(packages).sort().forEach((key) => {
            let package = packages[key];
            let str = "#####" + "\n";
            str += "name:\t" + package.name + "\n";
            str += "version:\t" + package.version + "\n";
            str += "description:\t" + package.description + "\n";
            str += "license(s):\t" + package.licenses + "\n";
            str += "license file:\t" + package.licenseFile + "\n";
            str += "license text:\t" + (package.licenseText || "<<Unknown License Text>>") + "\n";
            str += "#####" + "\n";
            fs.appendFileSync(outputFile, str);
        });
        console.log("Done.");
    }
});
