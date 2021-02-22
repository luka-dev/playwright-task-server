import AbstractEvasion from "./AbstractEvasion";
import {Protocol} from "playwright-chromium/types/protocol";
import setUserAgentOverrideParameters = Protocol.Emulation.setUserAgentOverrideParameters;
import UserAgentBrandVersion = Protocol.Emulation.UserAgentBrandVersion;
import {log} from "util";

export default class UserAgent extends AbstractEvasion {
    private userAgentString: string = '';

    private getUAVersion(): string {
        let data = this.userAgentString.includes('Chrome/')
            ? this.userAgentString.match(/Chrome\/([\d|.]+)/)
            : this.userAgentString.match(/\/([\d|.]+)/);

        if (data !== null && data.length >= 2) {
            return data[1];
        }
        return '99.9.9999.999';
    }

    private getPlatform(extended = false) {
        if (this.userAgentString.includes('Mac OS X')) {
            return extended ? 'Mac OS X' : 'MacIntel'
        } else if (this.userAgentString.includes('Android')) {
            return 'Android'
        } else if (this.userAgentString.includes('Linux')) {
            return 'Linux'
        } else {
            return extended ? 'Windows' : 'Win32'
        }
    }

    private getBrands(): UserAgentBrandVersion[] {
        const seed = this.getUAVersion().split('.')[0] // the major version number of Chrome

        const order = [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0]
        ][parseInt(seed) % 6];

        const escapedChars = [' ', ' ', ';']
        const greaseyBrand = `${escapedChars[order[0]]}Not${
            escapedChars[order[1]]
        }A${escapedChars[order[2]]}Brand`;


        const greasedBrandVersionList: UserAgentBrandVersion[] = []
        greasedBrandVersionList[order[0]] = {
            brand: greaseyBrand,
            version: '99'
        }
        greasedBrandVersionList[order[1]] = {
            brand: 'Chromium',
            version: seed
        }
        greasedBrandVersionList[order[2]] = {
            brand: 'Google Chrome',
            version: seed
        }

        return greasedBrandVersionList;
    }

    private getPlatformVersion() {
        let version = '';

        let rexep = null;

        if (this.userAgentString.includes('Mac OS X ')) {
            rexep = /Mac OS X ([^)]+)/;
        } else if (this.userAgentString.includes('Android ')) {
            rexep = /Android ([^;]+)/;
        } else if (this.userAgentString.includes('Windows ')) {
            rexep= /Windows .*?([\d|.]+);/;
        }

        if (rexep !== null) {
            let match = this.userAgentString.match(rexep);
            if (match !== null && match.length) {
                version = match[1];
            }
        }

        return version;
    };

    private isMobile() {
        return this.userAgentString.includes('Android')
    }

    private getPlatformModel() {
        if (this.isMobile()) {
            let platform = this.userAgentString.match(/Android.*?;\s([^)]+)/);
            if (platform !== null && platform.length >= 1) {
                return platform[1];
            }
        }

        return '';
    }

    private getPlatformArch() {
        return this.isMobile() ? '' : 'x86';
    }


    public async use() {

        this.userAgentString = await this.page.evaluate('navigator.userAgent');

        const override: setUserAgentOverrideParameters = {
            acceptLanguage: 'en-US,en',
            userAgent: this.userAgentString,
            platform: this.getPlatform(),
            userAgentMetadata: {
                brands: this.getBrands(),
                fullVersion: this.getUAVersion(),
                platform: this.getPlatform(true),
                platformVersion: this.getPlatformVersion(),
                architecture: this.getPlatformArch(),
                model: this.getPlatformModel(),
                mobile: this.isMobile()
            }
        };

        console.log('onuse');

        await this.cdpSession.send('Network.setUserAgentOverride', override);
    }
}