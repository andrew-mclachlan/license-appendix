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

        let licenses = Object.keys(packages).sort().map((key) => {
            const package = packages[key];
            const licenseFile = package.licenseFile ? path.basename(package.licenseFile) : "<<License File Not Found>>";
            const licenseText = package.licenseText || "<<License Text Not Found>>";
            const license = {
                name: package.name,
                version: package.version,
                description: package.description,
                licenses: package.licenses,
                licenseFile: licenseFile,
                licenseText: licenseText,
                repository: package.repository || "<<License Repository Not Found>>",
            };
            return license;
        });

        if (program.json) {
            licenses = licenses.map(licenseElem => {
              let license = { ...licenseElem };

              // camel case to hiphen case
              license.license_file = license.licenseFile;
              license.license_text = license.licenseText.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
              delete license.licenseFile;
              delete license.licenseText;

              return license;
            });
            fs.writeFileSync(outputFile, JSON.stringify(licenses, null, 2));
        }
        else {
            let str = "####Appendix of packages and their licenses ####\n\n";
            str = licenses.reduce((acc, license) => {
              let licenseStr = "#####" + "\n";
              licenseStr += "name:\t" + license.name + "\n";
              licenseStr += "version:\t" + license.version + "\n";
              licenseStr += "description:\t" + license.description + "\n";
              licenseStr += "repository:\t" + license.repository + "\n";
              licenseStr += "license(s):\t" + license.licenses + "\n";
              licenseStr += "license file:\t" + license.licenseFile + "\n";
              licenseStr += "license text:\t" + license.licenseText + "\n";
              licenseStr += "#####" + "\n";

              return acc + licenseStr;
            }, str);
            fs.writeFileSync(outputFile, str);
        }
        console.log("Done.");
    }
});
