const fetch = require("node-fetch");

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
      version: pkg.version,
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
          version: pkg.version,
          licenseText: res
        });
      }
    }
    return results;
  } catch(err) {
      console.error(err);
      console.error('Error fetching license file');
  }
};

module.exports = {
  fetchLicensesFromRepo
};
