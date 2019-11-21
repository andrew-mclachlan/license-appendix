const checker = require("license-checker");
const fs = require("fs");
const path = require("path");
const program = require("commander");
const prompts = require("prompts");

const developLicenses = require('./lib/create-licenses').developLicenses;
const fetchLicensesFromRepo = require('./lib/fetch-licenses').fetchLicensesFromRepo;

program
    .version("0.1.1")
    .option("-j, --json", "output appendix in JSON format")
    .option("-p, --path [directory]", "package to scan")
    .option("-o, --output [file path]", "output appendix file path")
    .option("-a, --auth [oauth token]", "github personal access token")
    .option("-q, --quiet", "do not generate log file")
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


const updateFixedLicenses = (pkgs, fixedLicenses) => {
  for (let i = 0; i < pkgs.length; i++) {
    const pkg = pkgs[i];
    let match = fixedLicenses.find(license => license.name === pkg.name);

    if (match) {
      let keys = Object.keys(match);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        pkg[key] = match[key];
      }
      pkg.hasValidLicense = true;
    }
  }
};

const extractLicenses = pkgs => {
  let copyrightRegex = new RegExp(/copyright/i);
  let extracted = [];

  for (let i = 0; i < pkgs.length; i++) {
    let pkg = pkgs[i];
    let matches = pkg.licenseText.match(new RegExp(/.{0,}\n{0,}#{1,}\s{0,}licen(c|s)e\s{1,}(.[^#]*)/i));
    let licenseText = (matches && matches[2]) || '';
    licenseText = licenseText.trim();
    if (
      licenseText.length && copyrightRegex.test(licenseText) &&
      licenseText.split('\n').length >= 2
    ) {
      extracted.push({
        name: pkg.name,
        version: pkg.version,
        licenseText: licenseText
      });
    }
  }

  return extracted;
};

const getPkgNameAndVersion = ele => {
  return `${ele.name}@${ele.version}`;
};

const fixLicenseErrors = async (errPkgs, authToken) => {
  let pkgs = JSON.parse(JSON.stringify(errPkgs));
  let fixesLog = {};

  // extract license from license text
  let extractedLicenses = extractLicenses(pkgs);
  fixesLog.extracted = extractedLicenses.map(getPkgNameAndVersion);
  updateFixedLicenses(pkgs, extractedLicenses);

  // search in Github for license files - some packages might have added license file
  if (authToken) {
    let githubLicenses = await fetchLicensesFromRepo(
      pkgs.filter(pkg => !pkg.hasValidLicense), authToken
    ) || [];
    fixesLog.github = githubLicenses.map(getPkgNameAndVersion);
    updateFixedLicenses(pkgs, githubLicenses);
  }

  //fill incomplete licenses
  let developedLicenses = developLicenses(pkgs.filter(pkg => !pkg.hasValidLicense))
  fixesLog.generated = developedLicenses.map(getPkgNameAndVersion);
  updateFixedLicenses(pkgs, developedLicenses);

  pkgs = pkgs.filter(pkg => pkg.hasValidLicense);
  return {fixedLicenses: pkgs, fixesLog};
};

const includeFixes = (licenses, fixedLicenses) => {
  for (let i = 0; i < fixedLicenses.length; i++) {
    const fixedLicense = fixedLicenses[i];
    const licenseIndex = licenses.findIndex(license => license.name === fixedLicense.name);
    let license = licenses[licenseIndex];
    license.licenseText = fixedLicense.licenseText
    // Remove license-checker guesses
    if (typeof license.licenses === 'string' && license.licenses.endsWith('*')) {
      license.licenses = license.licenses.substr(0, license.licenses.length-1);
    }
  }
};

const listToString = list => {
  return list.reduce((acc, ele, index) => {
    return acc + `  ${index+1}.${ele}\n`;
  }, '') + '\n';
};

const generateLog = (allErrors, fixesLog, allFixes) => {
  let logStr = ``;

  logStr += `${allErrors.length} packages found having incorrect licenses.\n`;
  if (allFixes.length) {
    logStr += `Licenses fixed for ${allFixes.length} packages totally. See below for details.\n`;
  }

  logStr += '\n';
  if (fixesLog.extracted && fixesLog.extracted.length) {
    logStr += `Licenses extracted from README file for ${fixesLog.extracted.length} packages,\n`;
    logStr += listToString(fixesLog.extracted);
  }
  if (fixesLog.github && fixesLog.github.length) {
    logStr += `Licenses fetched from Github for ${fixesLog.github.length} packages,\n`;
    logStr += listToString(fixesLog.github);
  }
  if (fixesLog.generated && fixesLog.generated.length) {
    logStr += `Licenses generated for ${fixesLog.generated.length} packages,\n`;
    logStr += listToString(fixesLog.generated);
  }

  let errors = allErrors.filter(pkg => !allFixes.find(name => name === pkg.name));
  if (errors.length) {
    logStr += `Licenses couldn't be fixed for ${errors.length} packages,\n`;
    logStr += listToString(errors.map(getPkgNameAndVersion));
  }
  return logStr;
}

checker.init({ start: program.path, production: true, customFormat: customFormat }, async (error, packages) => {
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

        /* attempt to fix broken licenses
        * Most likely packages that contain README(.MD) as the license-file will have erroneous license-text
        */
        let licenseErrors = licenses.filter(license => {
          let licenseFile = license.licenseFile.toLowerCase();
          return licenseFile.indexOf('not found') !== -1 || licenseFile.indexOf('readme') !== -1;
        });
        console.log(`${licenseErrors.length} packages found with incorrect licenses.`);

        let shouldFixLicenses = licenseErrors.length && await (async () => {
          let validAnswers = ['y', 'n', 'yes', 'no'];
          let attemptOptions = ['yes', 'y'];

          const response = await prompts({
            type: 'text',
            name: 'value',
            message: `Do you want license-appendix to attempt to fix licenses? Type y(es)/n(o)`,
            validate: (value = '') => {
              if (validAnswers.indexOf(value.trim().toLowerCase()) !== -1) {
                return true;
              }
              return 'Please enter a valid value.';
            }
          });
         
          return attemptOptions.indexOf(response.value.trim().toLowerCase()) !== -1;
        })();

        let fixedLicenses = [], fixesLog = {};
        if (shouldFixLicenses) {
          let results = await fixLicenseErrors(licenseErrors, program.auth);
          fixedLicenses = results.fixedLicenses;
          fixesLog = results.fixesLog;
          includeFixes(licenses, fixedLicenses);
          console.log(`${fixedLicenses.length} licenses fixed`);
        } else {
          console.log('Licenses not fixed');
        }

        if (!program.quiet) {
          let outputFileName = path.parse(outputFile).name;
          let logFileName = path.resolve(`${process.cwd()}/${outputFileName}.log`);
          let logStr = generateLog(licenseErrors, fixesLog, fixedLicenses.map(ele => ele.name));
          console.log(`Log file generated, see ${logFileName} for details`);
          fs.writeFileSync(logFileName, logStr);
        } else {
          console.log('Log file not generated');
        }

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
