// for web requests
const axios = require('axios');
// importing the screenshot library
const screenshot = require('screenshot-desktop')
// importing the prompt library
const prompt = require('prompt-sync')();


Reset = "\x1b[0m"
Bright = "\x1b[1m"
Dim = "\x1b[2m"
Underscore = "\x1b[4m"
Blink = "\x1b[5m"
Reverse = "\x1b[7m"
Hidden = "\x1b[8m"

FgBlack = "\x1b[30m"
FgRed = "\x1b[31m"
FgGreen = "\x1b[32m"
FgYellow = "\x1b[33m"
FgBlue = "\x1b[34m"
FgMagenta = "\x1b[35m"
FgCyan = "\x1b[36m"
FgWhite = "\x1b[37m"
FgGray = "\x1b[90m"

const config = {
    method: 'POST',
    path: "/api/share",
    refreshRate: 1000
}


const group = Math.random().toString(36).substring(7);
const header = console.log(`
==============================
_       ___   _   _         
| |     / _ \\ | \\ | |        
| |    / /_\\ \\|  \\| |___ ___ 
| |    |  _  || . \` / __/ __|
| |____| | | || |\\  \\__ \\__ \\
\\_____/\\_| |_/\\_| \\_/___/___/
==============================

> Local Area Network Screen Sharing
> Version 1.0.0

Your group ID is: ${FgMagenta}${group}${Reset}
By: @flancast90
`);

// prompt for static server IP/URL
const serverIP = prompt(`${FgYellow}Enter the server IP/URL: ${Reset}`);
const clientPath = `//${serverIP}/api/share`;

// sending the screenshot to the server every config.refreshRate seconds
setInterval(() => {
    screenshot({ format: 'png' }).then((img) => {
        axios.post(clientPath, {
            group: group,
            image: img
        }).catch((err) => {
            console.log(`${FgRed}Error: ${err}${Reset}`);
        });
    })
}, config.refreshRate);