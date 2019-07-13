const program = require('commander');
const checker = require('license-checker');

program
  .version('0.1.0')  
  .option('-p, --path [directory]', 'package to scan')
  .option('-o, --output [file path]', 'output appendix file path')
  .parse(process.argv);

console.log("processing: " + program.path);

checker.init({
    start: program.path
}, (err, packages) => {
    if (err) {
        console.log(err);
    }
    else {
        
    }
});
