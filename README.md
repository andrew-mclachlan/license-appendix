# license-appendix
Create an appendix from the license-checker output.

## Example commands
**Attempt to fetch missing licenses from Github**

`node index.js --json --path '/d/workspace/my_app/source' -o 'test.json' -a <your_github_personal_acces_token>
`

[Visit this link](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line) to create your personal access token.


**Fix only locally, not connect to Github**
`node index.js --json --path '/d/workspace/my_app/source' -o 'test.json'`
