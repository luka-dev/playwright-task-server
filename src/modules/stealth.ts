import {BrowserContext} from "playwright-core";
import * as fs from "fs";

export async function contextStealth(context: BrowserContext) {
    let evasionsScript = fs.readFileSync(__dirname + "/" + 'evasions.js').toString();
    await context.addInitScript(evasionsScript);
}
