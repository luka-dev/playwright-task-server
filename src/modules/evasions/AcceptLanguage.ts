import AbstractEvasion from "./AbstractEvasion";
import * as config from '../../config.json';

export default class AcceptLanguage extends AbstractEvasion {
    private static contextFlagged: boolean = false;

    public async use() {
        if (!AcceptLanguage.contextFlagged) {
            await this.context.setExtraHTTPHeaders({
                'Accept-Language': config.RUN_OPTIONS.ACCEPT_LANGUAGE
            });
            AcceptLanguage.contextFlagged = true;
        }

        await this.page.setExtraHTTPHeaders({
            'Accept-Language': config.RUN_OPTIONS.ACCEPT_LANGUAGE
        });
    }
}