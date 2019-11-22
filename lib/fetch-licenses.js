const fetch = require("node-fetch");

const isValidResponse = res => {
  if (res.status === 401) {
    throw Error('Either token invalid or 5000 requests/hour quota expired');
  }
  return (res.status <= 400 && res.statusText === 'OK');
};

const getHeader = authToken => {
  return {
    headers: {
      Authorization: 'Bearer ' + authToken
    }
  };
};

const getLicenseFileUrl = async (repoUrl, authToken) => {
  let res = await fetch(repoUrl, getHeader(authToken));
  if (!isValidResponse(res)) {
    return;
  }
  let licenseRegex = new RegExp(/^(license|licence)(.txt){0,}$/i);
  let response = await res.text();
  response = JSON.parse(response);
  let licenseFile = response.find(elem => elem.type !== 'dir' && licenseRegex.test(elem.name));

  return licenseFile && licenseFile.url;
};

const fetchThisUrl = async (url, authToken) => {
  let res = await fetch(url, getHeader(authToken));
  if (!isValidResponse(res)) {
    return;
  }
  res = await res.text();
  res = JSON.parse(res);
  return Buffer.from(res.content, res.encoding).toString('ascii');
};

const getRepoLicense = async(url, authToken) => {
  let pkgJson = await fetchThisUrl(url+'package.json', authToken) || {};
  let license;
  try {
    license = JSON.parse(pkgJson).license;
  } catch (err) {
    license = 'invalid';
  };
  return license || '';
};

const doesLicenseMatch = async(pkg, repoUrl, authToken) => {
  let license = pkg.licenses; 
  if (Array.isArray(license)) {
    license = license.sort().join('-');
  }
  license = license.replace(/\*/g, '');
  let repoLicense = await getRepoLicense(repoUrl, authToken);

  if (!repoLicense) {
    return true;
  }

  if (Array.isArray(repoLicense)) {
    repoLicense = repoLicense.sort().join('-');
  }

  return repoLicense.toLowerCase() === license.toLowerCase();
}

const fetchLicense = async (pkg, authToken) => {
  let repoUrl = 'https://api.github.com/repos/' + pkg.path + '/contents/';
  let licenseFileUrl = await getLicenseFileUrl(repoUrl, authToken);
  if (licenseFileUrl) {
    if (!await doesLicenseMatch(pkg, repoUrl, authToken)) {
      return;
    }

    let license = await fetchThisUrl(licenseFileUrl, authToken);
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
      version: pkg.version,
      licenses: pkg.licenses,
      repository: pkg.repository,
      path: pkg.repository.match(new RegExp(/https:\/\/github.com\/(.*)/))[1]
    };
  });

  try {
    let results = [];
    let responses = await Promise.all(validPkgs.map(pkg => fetchLicense(pkg, authToken)));

    for (let i = 0; i < validPkgs.length; i++) {
      let res = responses[i];
      let pkg = validPkgs[i];
      if (res) {
        results.push({
          name: pkg.name,
          version: pkg.version,
          licenseText: res
        });
      }
    }
    return results;
  } catch(err) {
    console.error('Error fetching license file');
    console.error(err);
  }
};

module.exports = {
  fetchLicensesFromRepo
};
