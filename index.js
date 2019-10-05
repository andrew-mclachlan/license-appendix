const checker = require("license-checker");
const fs = require("fs");
const path = require("path");
const program = require("commander");

program
    .version("0.1.1")
    .option("-j, --json", "output appendix in JSON format")
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
        if (program.json) {
            let licenses = Object.keys(packages).sort().map((key) => {
                const package = packages[key];
                const licenseFile = package.licenseFile ? path.basename(package.licenseFile) : "<<License File Not Found>>";
                const licenseText = package.licenseText || "<<License Text Not Found>>";
                const license = {
                    "name": package.name,
                    "version": package.version,
                    "description": package.description,
                    "licenses": package.licenses,
                    "license_file": licenseFile,
                    "license_text": licenseText.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t"),
                    "repository": package.repository || "<<License Repository Not Found>>",
                };
                return license;
            });
            fs.writeFileSync(outputFile, JSON.stringify(licenses, null, 2));
        }
        else {
            fs.writeFileSync(outputFile, "####Appendix of packages and their licenses ####\n\n");
            Object.keys(packages).sort().forEach((key) => {
                const package = packages[key];
                const licenseFile = package.licenseFile ? path.basename(package.licenseFile) : "<<License File Not Found>>";
                let str = "#####" + "\n";
                str += "name:\t" + package.name + "\n";
                str += "version:\t" + package.version + "\n";
                str += "description:\t" + package.description + "\n";
                str += "repository:\t" + (package.repository || "<<License Repository Not Found>>") + "\n";
                str += "license(s):\t" + package.licenses + "\n";
                str += "license file:\t" + licenseFile + "\n";
                str += "license text:\t" + (package.licenseText || "<<License Text Not Found>>") + "\n";
                str += "#####" + "\n";
                fs.appendFileSync(outputFile, str);
            });
        }
        console.log("Done.");
    }
});
