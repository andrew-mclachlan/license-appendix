const licensesTemplate = require('../load_licenses');
const copyrightSupportedLicenses = ['mit', 'isc', 'bsd-2-clause', 'bas-3-clause'];

const findCopyrightInfo = text => {
  // NOTE: use array indexes that return year, author details
  let validRegexList = [
    {
      regex: new RegExp(/(\(c\)|©)\s*([a-z&\-, ]*)\s*((\d*-)?\d*)/, 'i'),
      yearCaptureIndex: 3,
      authorCaptureIndex: 2
    },
    {
      regex: new RegExp(/(\(c\)|©)\s*((\d*-)?\d*)\s*([a-z&\-, ]*)/, 'i'),
      yearCaptureIndex: 2,
      authorCaptureIndex: 4
    },
    {
      regex: new RegExp(/copyright\s*([a-z&\-, ]*)\s*((\d*-)?\d*){1}/, 'i'),
      yearCaptureIndex: 2,
      authorCaptureIndex: 1,
      ignoreIfNoYearFound: true //if no year found for this regex, it would be mostly wrong
    },
    {
      regex: new RegExp(/copyright\s*((\d*-)?\d*){1}\s*([a-z&\-, ]*)/, 'i'),
      yearCaptureIndex: 1,
      authorCaptureIndex: 3,
      ignoreIfNoYearFound: true //if no year found for this regex, it would be mostly wrong
    },
  ];

  let allMatches = validRegexList.map(elem => {
    let match = text.match(elem.regex) || [];
    let year = match[elem.yearCaptureIndex];
    let author = match[elem.authorCaptureIndex];

    if (elem.ignoreIfNoYearFound && !year) {
      return [];
    }

    return [year, author].filter(ele => ele);
  });
  allMatches = allMatches.filter(ele => ele.length);

  let highestMatch = allMatches.sort((a, b) => {
    return b.length - a.length;
  })[0] || [];

  return {
    year: (highestMatch[0] || '').trim(),
    author: (highestMatch[1] || '').trim()
  };
};

const fixCopyrightInfo = (licenseText, copyrightInfo) => {
  licenseText = licenseText.split('\n');

  let copyrightText;
  if (!copyrightInfo.year && !copyrightInfo.author) {
    copyrightText = [''];
  } else {
    copyrightText = licenseText[0].replace(/>/g, '').split('<');
    copyrightText[1] = `${copyrightInfo.year} ` || '';
    copyrightText[2] = copyrightInfo.author || '';
  }

  licenseText[0] = copyrightText.join('');
  return licenseText.join('\n').trim();
};

const createLicense = (licenses, copyrightInfo) => {
  let license;
  if (Array.isArray(licenses)) {
    // NOTE: if multiple licenses are present, license text is created using the first license.
    license = licenses[0];
  } else {
    license = licenses;
  }

  let licenseText = licensesTemplate[license.toLowerCase()];
  if (!licenseText) {
    console.log(`${license} license not found in template. Please add and proceed.`);
    return;
  }

  if (!copyrightSupportedLicenses.find(ele => ele === license.toLowerCase())) {
    return licenseText;
  }
  return fixCopyrightInfo(licenseText, copyrightInfo);
};

const developLicenses = pkgs => {
  let developed = [];

  for (let i = 0; i < pkgs.length; i++) {
    const pkg = pkgs[i];

    // Remove * added to licenses field by license-checker
    let licenses = pkg.licenses;
    if (typeof licenses === 'string') {
      licenses = licenses.replace(/\*/g, '');
    } else {
      licenses = licenses.map(license => {
        return license.replace(/\*/g, '');
      });
    }

    let copyrightInfo = findCopyrightInfo(pkg.licenseText);
    let licenseText = createLicense(licenses, copyrightInfo);

    if (licenseText) {
      developed.push({
        ...pkg,
        licenses,
        licenseText: licenseText,
      });
    }

  }
  return developed;
};

module.exports = {
  developLicenses,
};
