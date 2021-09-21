function getRandomInt(min: number, max: number) {
    return Math.floor(Math.random() * max);
}

function getRandomBool() {
    return getRandomInt(0, 1) > 0;
}

function getRandomChar() {
    const list = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return list[getRandomInt(0, list.length - 1)];
}

export default class ChromeRandomUserAgent {
    private readonly systemInformationTypes = ['Linux', 'X11', 'Macintosh', 'Windows', 'iPod', 'iPhone', 'iPad'];

    private systemInformationType: string;
    private systemInformation: string;

    private platform: string;
    private extensions: string;

    public constructor() {
        this.systemInformationType = this.systemInformationTypes[getRandomInt(0, this.systemInformationTypes.length - 1)];

        this.systemInformation = this.generateSystemInformation(this.systemInformationType);
        this.platform = this.generatePlatform();
        this.extensions = this.generateExtensions(this.systemInformationType);
    }

    private generateSystemInformation(systemInformationType: string) {
        let systemInformation = `${systemInformationType}; `;

        if (systemInformationType === 'Linux') {
            systemInformation += `Android ${getRandomInt(6, 12)}.${getRandomInt(0, 4)}; `

            const prefixLength = getRandomInt(2, 4);
            for (let i = 0; i < prefixLength; i++) {
                systemInformation += getRandomChar().toUpperCase();
            }

            systemInformation += '-';

            const modelLength = getRandomInt(2, 6);
            for (let i = 0; i < modelLength; i++) {
                systemInformation += getRandomChar().toUpperCase();
            }

            //Generate Build
            if (getRandomBool()) {
                systemInformation += ` Build/`;
                const buildLength = getRandomInt(4, 10);
                for (let i = 0; i < buildLength; i++) {
                    systemInformation += getRandomBool() ? getRandomInt(0, 9) : getRandomChar();
                }
                //wv mark
                if (getRandomBool()) {
                    systemInformation += '; wv'
                }
            }
        } else if (this.systemInformationType === 'X11') {
            //Specify Linux OS
            if (getRandomBool()) {
                const linuxSystems = ['Ubuntu', 'Fedora'];
                systemInformation += `${linuxSystems[getRandomInt(0, linuxSystems.length - 1)]}; `;
            }

            systemInformation += `Linux ${getRandomBool() ? 'i686' : 'x86_64'}`;

            //rv generator
            if (getRandomBool()) {
                systemInformation += `; rv:${getRandomInt(50, 90)}`;
                const delimetrLength = getRandomInt(1, 2);
                for (let i = 0; i < delimetrLength; i++) {
                    systemInformation += `.${getRandomInt(0, 9)}`;
                }
            }
        } else if (systemInformationType === 'Macintosh') {
            systemInformation += `Intel Mac OS X ${getRandomInt(5, 20)}_${getRandomInt(5, 20)}_${getRandomInt(5, 20)}`;
        } else if (systemInformationType === 'iPod' || systemInformationType === 'iPhone' || systemInformationType === 'iPad') {
            systemInformation += `CPU OS ${getRandomInt(5, 20)}_${getRandomInt(5, 20)}`;

            if (getRandomBool()) {
                systemInformation += `_${getRandomInt(5, 20)}`;
            }

            systemInformation += ` like Mac OS X`;
        } else { //Windows
            systemInformation += `Win64; x64`;
        }

        return systemInformation;
    }

    private generatePlatform() {
        return `AppleWebKit/${getRandomInt(500, 700)}.${getRandomInt(0, 99)}`;
    }

    private generateExtensions(systemInformationType: string) {
        let extensions = `Chrome/${getRandomInt(70,99)}.0.${getRandomInt(1000,9999)}.0`;
        if (systemInformationType === 'Linux' || systemInformationType === 'iPod' || systemInformationType === 'iPhone' || systemInformationType === 'iPad')
        {
            extensions += ' Mobile'
        }

        extensions += ` Safari/${getRandomInt(500, 700)}.${getRandomInt(0, 99)}`;
        return extensions;
    }

    public getUserAgent(): string {
        return `Mozilla/5.0 (${this.systemInformation}) ${this.platform} (KHTML, like Gecko) ${this.extensions}`;
    }
}