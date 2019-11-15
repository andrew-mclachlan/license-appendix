const checker = require("license-checker");
const fs = require("fs");
const path = require("path");
const program = require("commander");
const fetch = require("node-fetch");

program
    .version("0.1.1")
    .option("-j, --json", "output appendix in JSON format")
    .option("-p, --path [directory]", "package to scan")
    .option("-o, --output [file path]", "output appendix file path")
    .option("-a, --auth [oauth token]", "github personal access token")
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

const getLicenseFileUrl = async (repoUrl, authToken) => {
  let res = await fetch(repoUrl, {
    headers: {
      Authorization: 'Bearer ' + authToken
    }
  });
  let licenseRegex = new RegExp(/^(license|licence)(.txt){0,}$/i);
  if (res.status === 401) {
    throw Error('Either token invalid or 5000 requests/hour quota expired');
  }
  if (res.status <= 400 && res.statusText === 'OK') {
    let response = await res.text();
    response = JSON.parse(response);
    let licenseFile = response.find(elem => elem.type !== 'dir' && licenseRegex.test(elem.name));
    return licenseFile && licenseFile.url;
  }
};

const getLicenseFile = async (url, authToken) => {
  let res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + authToken
    }
  });
  res = await res.text();
  res = JSON.parse(res);
  return Buffer.from(res.content, res.encoding).toString('ascii');
};

const fetchLicense = async (repoPath, authToken) => {
  let repoUrl = 'https://api.github.com/repos/' + repoPath + '/contents/';
  let licenseFileUrl = await getLicenseFileUrl(repoUrl, authToken);
  if (licenseFileUrl) {
    let license = await getLicenseFile(licenseFileUrl, authToken);
    return license;
  }
};

const fetchLicensesFromRepo = async (pkgs, authToken) =>  {
  let validUrlRegex = new RegExp(/^http(s)?:\/\/github.com\/\w.*/);

  let validPkgs = pkgs.filter(pkg => {
    return validUrlRegex.test(pkg.repository);
  }).map(pkg => {
    return {
      name: pkg.name,
      repository: pkg.repository,
      path: pkg.repository.match(new RegExp(/https:\/\/github.com\/(.*)/))[1]
    };
  });

  try {
    let results = [];
    let responses = await Promise.all(validPkgs.map(pkg => fetchLicense(pkg.path, authToken)));

    for (let i = 0; i < validPkgs.length; i++) {
      let res = responses[i];
      let pkg = validPkgs[i];
      if (res) {
        results.push({
          name: pkg.name,
          repository: pkg.repository,
          licenseText: res
        });
      }
    }
    console.log('found github licenses for ', results.length, 'packages');
    return results;
  } catch(err) {
      console.error(err);
      console.error('Error fetching license file');
  }
};

const updateGithubLicenses = (pkgs, githubLicenses) => {
  for (let i = 0; i < pkgs.length; i++) {
    const pkg = pkgs[i];
    let matchingGithubLicense = githubLicenses.find(license => license.name === pkg.name);
    if (matchingGithubLicense) {
      pkg.licenseText = matchingGithubLicense.licenseText;
      pkg.hasValidLicense = true;
    }
  }
};

const fixLicenseErrors = async (pkgsInfo, authToken) => {
  // extract license from license text
  let pkgs = [];
  let copyrightRegex = new RegExp(/copyright/i);
  for (let i = 0; i < pkgsInfo.length; i++) {
    const pkg = {
      ...pkgsInfo[i]
    };
    let matches = pkg.licenseText.match(new RegExp(/(.|\\n){0,}#{1,}\s{0,}license\s{1,}(.[^#]*)/i));
    let licenseText = (matches && matches[2]) || '';
    licenseText = licenseText.trim();
    if (licenseText.length) {
      if (copyrightRegex.test(licenseText) && licenseText.split('\n').length >= 2) {
        pkg.licenseText = licenseText;
        pkg.hasValidLicense = true;
      } else {
        // TODO: to be used
        pkg.extractedLicense = licenseText;
      }
    }
    pkgs.push(pkg);
  }

  // search in Github for license files - some packages might have added license file
  if (authToken) {
    let githubLicenses = await fetchLicensesFromRepo(
      pkgs.filter(pkg => !pkg.hasValidLicense), authToken
    ) || [];
    updateGithubLicenses(pkgs, githubLicenses);
  }

  //TODO: fill incomplete licenses

  pkgs = pkgs.filter(pkg => pkg.hasValidLicense);
  return pkgs;
};

const updateFixedLicenses = (licenses, fixedLicenses) => {
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

        let fixedLicenses = await fixLicenseErrors(licenseErrors, program.auth);
        updateFixedLicenses(licenses, fixedLicenses);

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
