let fs = require('fs');
let path = require('path');

let licenseDir = './licenses';

let licenseFiles = fs.readdirSync(licenseDir);
let licenses = licenseFiles.map(filename => {
  return {
    licenseName: path.parse(filename).name,
    licenseText: fs.readFileSync(`${licenseDir}/${filename}`, 'utf8')
  };
});

licenses = licenses.reduce((acc, elem) => {
  acc[elem.licenseName] = elem.licenseText;
  return acc;
}, {});

module.exports = licenses;
