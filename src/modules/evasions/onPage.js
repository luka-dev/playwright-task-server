(function () {
//Utils
    /**
     * A set of shared utility functions specifically for the purpose of modifying native browser APIs without leaving traces.
     *
     * Meant to be passed down in puppeteer and used in the context of the page (everything in here runs in NodeJS as well as a browser).
     *
     * Note: If for whatever reason you need to use this outside of `puppeteer-extra`:
     * Just remove the `module.exports` statement at the very bottom, the rest can be copy pasted into any browser context.
     *
     * Alternatively take a look at the `extract-stealth-evasions` package to create a finished bundle which includes these utilities.
     *
     */
    const utils = {}

    /**
     * Wraps a JS Proxy Handler and strips it's presence from error stacks, in case the traps throw.
     *
     * The presence of a JS Proxy can be revealed as it shows up in error stack traces.
     *
     * @param {object} handler - The JS Proxy handler to wrap
     */
    utils.stripProxyFromErrors = (handler = {}) => {
        const newHandler = {}
        // We wrap each trap in the handler in a try/catch and modify the error stack if they throw
        const traps = Object.getOwnPropertyNames(handler)
        traps.forEach(trap => {
            newHandler[trap] = function () {
                try {
                    // Forward the call to the defined proxy handler
                    return handler[trap].apply(this, arguments || [])
                } catch (err) {
                    // Stack traces differ per browser, we only support chromium based ones currently
                    if (!err || !err.stack || !err.stack.includes(`at `)) {
                        throw err
                    }

                    // When something throws within one of our traps the Proxy will show up in error stacks
                    // An earlier implementation of this code would simply strip lines with a blacklist,
                    // but it makes sense to be more surgical here and only remove lines related to our Proxy.
                    // We try to use a known "anchor" line for that and strip it with everything above it.
                    // If the anchor line cannot be found for some reason we fall back to our blacklist approach.

                    const stripWithBlacklist = stack => {
                        const blacklist = [
                            `at Reflect.${trap} `, // e.g. Reflect.get or Reflect.apply
                            `at Object.${trap} `, // e.g. Object.get or Object.apply
                            `at Object.newHandler.<computed> [as ${trap}] ` // caused by this very wrapper :-)
                        ]
                        return (
                            err.stack
                                .split('\n')
                                // Always remove the first (file) line in the stack (guaranteed to be our proxy)
                                .filter((line, index) => index !== 1)
                                // Check if the line starts with one of our blacklisted strings
                                .filter(line => !blacklist.some(bl => line.trim().startsWith(bl)))
                                .join('\n')
                        )
                    }

                    const stripWithAnchor = stack => {
                        const stackArr = stack.split('\n')
                        const anchor = `at Object.newHandler.<computed> [as ${trap}] ` // Known first Proxy line in chromium
                        const anchorIndex = stackArr.findIndex(line =>
                            line.trim().startsWith(anchor)
                        )
                        if (anchorIndex === -1) {
                            return false // 404, anchor not found
                        }
                        // Strip everything from the top until we reach the anchor line
                        // Note: We're keeping the 1st line (zero index) as it's unrelated (e.g. `TypeError`)
                        stackArr.splice(1, anchorIndex)
                        return stackArr.join('\n')
                    }

                    // Try using the anchor method, fallback to blacklist if necessary
                    err.stack = stripWithAnchor(err.stack) || stripWithBlacklist(err.stack)

                    throw err // Re-throw our now sanitized error
                }
            }
        })
        return newHandler
    }

    /**
     * Strip error lines from stack traces until (and including) a known line the stack.
     *
     * @param {object} err - The error to sanitize
     * @param {string} anchor - The string the anchor line starts with
     */
    utils.stripErrorWithAnchor = (err, anchor) => {
        const stackArr = err.stack.split('\n')
        const anchorIndex = stackArr.findIndex(line => line.trim().startsWith(anchor))
        if (anchorIndex === -1) {
            return err // 404, anchor not found
        }
        // Strip everything from the top until we reach the anchor line (remove anchor line as well)
        // Note: We're keeping the 1st line (zero index) as it's unrelated (e.g. `TypeError`)
        stackArr.splice(1, anchorIndex)
        err.stack = stackArr.join('\n')
        return err
    }

    /**
     * Replace the property of an object in a stealthy way.
     *
     * Note: You also want to work on the prototype of an object most often,
     * as you'd otherwise leave traces (e.g. showing up in Object.getOwnPropertyNames(obj)).
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
     *
     * @example
     * replaceProperty(WebGLRenderingContext.prototype, 'getParameter', { value: "alice" })
     * // or
     * replaceProperty(Object.getPrototypeOf(navigator), 'languages', { get: () => ['en-US', 'en'] })
     *
     * @param {object} obj - The object which has the property to replace
     * @param {string} propName - The property name to replace
     * @param {object} descriptorOverrides - e.g. { value: "alice" }
     */
    utils.replaceProperty = (obj, propName, descriptorOverrides = {}) => {
        return Object.defineProperty(obj, propName, {
            // Copy over the existing descriptors (writable, enumerable, configurable, etc)
            ...(Object.getOwnPropertyDescriptor(obj, propName) || {}),
            // Add our overrides (e.g. value, get())
            ...descriptorOverrides
        })
    }

    /**
     * Preload a cache of function copies and data.
     *
     * For a determined enough observer it would be possible to overwrite and sniff usage of functions
     * we use in our internal Proxies, to combat that we use a cached copy of those functions.
     *
     * This is evaluated once per execution context (e.g. window)
     */
    utils.preloadCache = () => {
        if (utils.cache) {
            return
        }
        utils.cache = {
            // Used in our proxies
            Reflect: {
                get: Reflect.get.bind(Reflect),
                apply: Reflect.apply.bind(Reflect)
            },
            // Used in `makeNativeString`
            nativeToStringStr: Function.toString + '' // => `function toString() { [native code] }`
        }
    }

    /**
     * Utility function to generate a cross-browser `toString` result representing native code.
     *
     * There's small differences: Chromium uses a single line, whereas FF & Webkit uses multiline strings.
     * To future-proof this we use an existing native toString result as the basis.
     *
     * The only advantage we have over the other team is that our JS runs first, hence we cache the result
     * of the native toString result once, so they cannot spoof it afterwards and reveal that we're using it.
     *
     * Note: Whenever we add a `Function.prototype.toString` proxy we should preload the cache before,
     * by executing `utils.preloadCache()` before the proxy is applied (so we don't cause recursive lookups).
     *
     * @example
     * makeNativeString('foobar') // => `function foobar() { [native code] }`
     *
     * @param {string} [name] - Optional function name
     */
    utils.makeNativeString = (name = '') => {
        // Cache (per-window) the original native toString or use that if available
        utils.preloadCache()
        return utils.cache.nativeToStringStr.replace('toString', name || '')
    }

    /**
     * Helper function to modify the `toString()` result of the provided object.
     *
     * Note: Use `utils.redirectToString` instead when possible.
     *
     * There's a quirk in JS Proxies that will cause the `toString()` result to differ from the vanilla Object.
     * If no string is provided we will generate a `[native code]` thing based on the name of the property object.
     *
     * @example
     * patchToString(WebGLRenderingContext.prototype.getParameter, 'function getParameter() { [native code] }')
     *
     * @param {object} obj - The object for which to modify the `toString()` representation
     * @param {string} str - Optional string used as a return value
     */
    utils.patchToString = (obj, str = '') => {
        utils.preloadCache()

        const toStringProxy = new Proxy(Function.prototype.toString, {
            apply: function (target, ctx) {
                // This fixes e.g. `HTMLMediaElement.prototype.canPlayType.toString + ""`
                if (ctx === Function.prototype.toString) {
                    return utils.makeNativeString('toString')
                }
                // `toString` targeted at our proxied Object detected
                if (ctx === obj) {
                    // We either return the optional string verbatim or derive the most desired result automatically
                    return str || utils.makeNativeString(obj.name)
                }
                // Check if the toString protype of the context is the same as the global prototype,
                // if not indicates that we are doing a check across different windows., e.g. the iframeWithdirect` test case
                const hasSameProto = Object.getPrototypeOf(
                    Function.prototype.toString
                ).isPrototypeOf(ctx.toString) // eslint-disable-line no-prototype-builtins
                if (!hasSameProto) {
                    // Pass the call on to the local Function.prototype.toString instead
                    return ctx.toString()
                }
                return target.call(ctx)
            }
        })
        utils.replaceProperty(Function.prototype, 'toString', {
            value: toStringProxy
        })
    }

    /**
     * Make all nested functions of an object native.
     *
     * @param {object} obj
     */
    utils.patchToStringNested = (obj = {}) => {
        return utils.execRecursively(obj, ['function'], utils.patchToString)
    }

    /**
     * Redirect toString requests from one object to another.
     *
     * @param {object} proxyObj - The object that toString will be called on
     * @param {object} originalObj - The object which toString result we wan to return
     */
    utils.redirectToString = (proxyObj, originalObj) => {
        utils.preloadCache()

        const toStringProxy = new Proxy(Function.prototype.toString, {
            apply: function (target, ctx) {
                // This fixes e.g. `HTMLMediaElement.prototype.canPlayType.toString + ""`
                if (ctx === Function.prototype.toString) {
                    return utils.makeNativeString('toString')
                }

                // `toString` targeted at our proxied Object detected
                if (ctx === proxyObj) {
                    const fallback = () =>
                        originalObj && originalObj.name
                            ? utils.makeNativeString(originalObj.name)
                            : utils.makeNativeString(proxyObj.name)

                    // Return the toString representation of our original object if possible
                    return originalObj + '' || fallback()
                }

                // Check if the toString protype of the context is the same as the global prototype,
                // if not indicates that we are doing a check across different windows., e.g. the iframeWithdirect` test case
                const hasSameProto = Object.getPrototypeOf(
                    Function.prototype.toString
                ).isPrototypeOf(ctx.toString) // eslint-disable-line no-prototype-builtins
                if (!hasSameProto) {
                    // Pass the call on to the local Function.prototype.toString instead
                    return ctx.toString()
                }

                return target.call(ctx)
            }
        })
        utils.replaceProperty(Function.prototype, 'toString', {
            value: toStringProxy
        })
    }

    /**
     * All-in-one method to replace a property with a JS Proxy using the provided Proxy handler with traps.
     *
     * Will stealthify these aspects (strip error stack traces, redirect toString, etc).
     * Note: This is meant to modify native Browser APIs and works best with prototype objects.
     *
     * @example
     * replaceWithProxy(WebGLRenderingContext.prototype, 'getParameter', proxyHandler)
     *
     * @param {object} obj - The object which has the property to replace
     * @param {string} propName - The name of the property to replace
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.replaceWithProxy = (obj, propName, handler) => {
        utils.preloadCache()
        const originalObj = obj[propName]
        const proxyObj = new Proxy(obj[propName], utils.stripProxyFromErrors(handler))

        utils.replaceProperty(obj, propName, {value: proxyObj})
        utils.redirectToString(proxyObj, originalObj)

        return true
    }

    /**
     * All-in-one method to mock a non-existing property with a JS Proxy using the provided Proxy handler with traps.
     *
     * Will stealthify these aspects (strip error stack traces, redirect toString, etc).
     *
     * @example
     * mockWithProxy(chrome.runtime, 'sendMessage', function sendMessage() {}, proxyHandler)
     *
     * @param {object} obj - The object which has the property to replace
     * @param {string} propName - The name of the property to replace or create
     * @param {object} pseudoTarget - The JS Proxy target to use as a basis
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.mockWithProxy = (obj, propName, pseudoTarget, handler) => {
        utils.preloadCache()
        const proxyObj = new Proxy(pseudoTarget, utils.stripProxyFromErrors(handler))

        utils.replaceProperty(obj, propName, {value: proxyObj})
        utils.patchToString(proxyObj)

        return true
    }

    /**
     * All-in-one method to create a new JS Proxy with stealth tweaks.
     *
     * This is meant to be used whenever we need a JS Proxy but don't want to replace or mock an existing known property.
     *
     * Will stealthify certain aspects of the Proxy (strip error stack traces, redirect toString, etc).
     *
     * @example
     * createProxy(navigator.mimeTypes.__proto__.namedItem, proxyHandler) // => Proxy
     *
     * @param {object} pseudoTarget - The JS Proxy target to use as a basis
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.createProxy = (pseudoTarget, handler) => {
        utils.preloadCache()
        const proxyObj = new Proxy(pseudoTarget, utils.stripProxyFromErrors(handler))
        utils.patchToString(proxyObj)

        return proxyObj
    }

    /**
     * Helper function to split a full path to an Object into the first part and property.
     *
     * @example
     * splitObjPath(`HTMLMediaElement.prototype.canPlayType`)
     * // => {objName: "HTMLMediaElement.prototype", propName: "canPlayType"}
     *
     * @param {string} objPath - The full path to an object as dot notation string
     */
    utils.splitObjPath = objPath => ({
        // Remove last dot entry (property) ==> `HTMLMediaElement.prototype`
        objName: objPath
            .split('.')
            .slice(0, -1)
            .join('.'),
        // Extract last dot entry ==> `canPlayType`
        propName: objPath.split('.').slice(-1)[0]
    })

    /**
     * Convenience method to replace a property with a JS Proxy using the provided objPath.
     *
     * Supports a full path (dot notation) to the object as string here, in case that makes it easier.
     *
     * @example
     * replaceObjPathWithProxy('WebGLRenderingContext.prototype.getParameter', proxyHandler)
     *
     * @param {string} objPath - The full path to an object (dot notation string) to replace
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.replaceObjPathWithProxy = (objPath, handler) => {
        const {objName, propName} = utils.splitObjPath(objPath)
        const obj = eval(objName) // eslint-disable-line no-eval
        return utils.replaceWithProxy(obj, propName, handler)
    }

    /**
     * Traverse nested properties of an object recursively and apply the given function on a whitelist of value types.
     *
     * @param {object} obj
     * @param {array} typeFilter - e.g. `['function']`
     * @param {Function} fn - e.g. `utils.patchToString`
     */
    utils.execRecursively = (obj = {}, typeFilter = [], fn) => {
        function recurse(obj) {
            for (const key in obj) {
                if (obj[key] === undefined) {
                    continue
                }
                if (obj[key] && typeof obj[key] === 'object') {
                    recurse(obj[key])
                } else {
                    if (obj[key] && typeFilter.includes(typeof obj[key])) {
                        fn.call(this, obj[key])
                    }
                }
            }
        }

        recurse(obj)
        return obj
    }

    /**
     * Everything we run through e.g. `page.evaluate` runs in the browser context, not the NodeJS one.
     * That means we cannot just use reference variables and functions from outside code, we need to pass everything as a parameter.
     *
     * Unfortunately the data we can pass is only allowed to be of primitive types, regular functions don't survive the built-in serialization process.
     * This utility function will take an object with functions and stringify them, so we can pass them down unharmed as strings.
     *
     * We use this to pass down our utility functions as well as any other functions (to be able to split up code better).
     *
     * @see utils.materializeFns
     *
     * @param {object} fnObj - An object containing functions as properties
     */
    utils.stringifyFns = (fnObj = {hello: () => 'world'}) => {
        // Object.fromEntries() ponyfill (in 6 lines) - supported only in Node v12+, modern browsers are fine
        // https://github.com/feross/fromentries
        function fromEntries(iterable) {
            return [...iterable].reduce((obj, [key, val]) => {
                obj[key] = val
                return obj
            }, {})
        }

        return (Object.fromEntries || fromEntries)(
            Object.entries(fnObj)
                .filter(([key, value]) => typeof value === 'function')
                .map(([key, value]) => [key, value.toString()]) // eslint-disable-line no-eval
        )
    }

    /**
     * Utility function to reverse the process of `utils.stringifyFns`.
     * Will materialize an object with stringified functions (supports classic and fat arrow functions).
     *
     * @param {object} fnStrObj - An object containing stringified functions as properties
     */
    utils.materializeFns = (fnStrObj = {hello: "() => 'world'"}) => {
        return Object.fromEntries(
            Object.entries(fnStrObj).map(([key, value]) => {
                if (value.startsWith('function')) {
                    // some trickery is needed to make oldschool functions work :-)
                    return [key, eval(`() => ${value}`)()] // eslint-disable-line no-eval
                } else {
                    // arrow functions just work
                    return [key, eval(value)] // eslint-disable-line no-eval
                }
            })
        )
    };


//window.chrome
    try {
        if (!window.chrome) {
            Object.defineProperty(window, 'chrome', {
                writable: true,
                enumerable: true,
                configurable: false, // note!
                value: {} // We'll extend that later
            })
        }

    } catch (e) {
        console.log(e.toString());
    }

//window.chrome.app
    try {
        // That means we're running headful and don't need to mock anything
        if ('app' in window.chrome) {
            throw new Error('app exist')// Nothing to do here
        }

        const makeError = {
            ErrorInInvocation: fn => {
                const err = new TypeError(`Error in invocation of app.${fn}()`)
                return utils.stripErrorWithAnchor(
                    err,
                    `at ${fn} (eval at <anonymous>`
                )
            }
        }

        // There's a some static data in that property which doesn't seem to change,
        // we should periodically check for updates: `JSON.stringify(window.app, null, 2)`
        const STATIC_DATA = {
            isInstalled: false,
            InstallState: {
                DISABLED: "disabled",
                INSTALLED: "installed",
                NOT_INSTALLED: "not_installed"
            },
            RunningState: {
                CANNOT_RUN: "cannot_run",
                READY_TO_RUN: "ready_to_run",
                RUNNING: "running"
            }
        };

        window.chrome.app = {
            ...STATIC_DATA,

            get isInstalled() {
                return false;
            },

            getDetails: function getDetails() {
                if (arguments.length) {
                    throw makeError.ErrorInInvocation(`getDetails`);
                }
                return null;
            },
            getIsInstalled: function getDetails() {
                if (arguments.length) {
                    throw makeError.ErrorInInvocation(`getIsInstalled`);
                }
                return false;
            },
            runningState: function getDetails() {
                if (arguments.length) {
                    throw makeError.ErrorInInvocation(`runningState`);
                }
                return 'cannot_run';
            }
        }
        utils.patchToStringNested(window.chrome.app);

    } catch (e) {
        console.log(e.toString());
    }

//window.chrome.csi
    try {

        // That means we're running headful and don't need to mock anything
        if ('csi' in window.chrome) {
            throw new Error('Nothing to do here')// Nothing to do here
        }

        // Check that the Navigation Timing API v1 is available, we need that
        if (!window.performance || !window.performance.timing) {
            throw new Error('Nothing to do here');
        }

        const {timing} = window.performance

        window.chrome.csi = function () {
            return {
                onloadT: timing.domContentLoadedEventEnd,
                startE: timing.navigationStart,
                pageT: Date.now() - timing.navigationStart,
                tran: 15 // Transition type or something
            }
        }
        utils.patchToString(window.chrome.csi);
    } catch (e) {
        console.log(e.toString());
    }

//window.chrome.loadTimes
    try {
        // That means we're running headful and don't need to mock anything
        if ('loadTimes' in window.chrome) {
            throw new Error('loadTimes exist')// Nothing to do here
        }

        // Check that the Navigation Timing API v1 + v2 is available, we need that
        if (
            !window.performance ||
            !window.performance.timing ||
            !window.PerformancePaintTiming
        ) {
            throw new Error('Timing API v1 + v2 isn\'t available');
        }

        const {performance} = window

        // Some stuff is not available on about:blank as it requires a navigation to occur,
        // let's harden the code to not fail then:
        const ntEntryFallback = {
            nextHopProtocol: 'h2',
            type: 'other'
        }

        // The API exposes some funky info regarding the connection
        const protocolInfo = {
            get connectionInfo() {
                const ntEntry =
                    performance.getEntriesByType('navigation')[0] || ntEntryFallback
                return ntEntry.nextHopProtocol
            },
            get npnNegotiatedProtocol() {
                // NPN is deprecated in favor of ALPN, but this implementation returns the
                // HTTP/2 or HTTP2+QUIC/39 requests negotiated via ALPN.
                const ntEntry =
                    performance.getEntriesByType('navigation')[0] || ntEntryFallback
                return ['h2', 'hq'].includes(ntEntry.nextHopProtocol)
                    ? ntEntry.nextHopProtocol
                    : 'unknown'
            },
            get navigationType() {
                const ntEntry =
                    performance.getEntriesByType('navigation')[0] || ntEntryFallback
                return ntEntry.type
            },
            get wasAlternateProtocolAvailable() {
                // The Alternate-Protocol header is deprecated in favor of Alt-Svc
                // (https://www.mnot.net/blog/2016/03/09/alt-svc), so technically this
                // should always return false.
                return false
            },
            get wasFetchedViaSpdy() {
                // SPDY is deprecated in favor of HTTP/2, but this implementation returns
                // true for HTTP/2 or HTTP2+QUIC/39 as well.
                const ntEntry =
                    performance.getEntriesByType('navigation')[0] || ntEntryFallback
                return ['h2', 'hq'].includes(ntEntry.nextHopProtocol)
            },
            get wasNpnNegotiated() {
                // NPN is deprecated in favor of ALPN, but this implementation returns true
                // for HTTP/2 or HTTP2+QUIC/39 requests negotiated via ALPN.
                const ntEntry =
                    performance.getEntriesByType('navigation')[0] || ntEntryFallback
                return ['h2', 'hq'].includes(ntEntry.nextHopProtocol)
            }
        }

        const {timing} = window.performance

        // Truncate number to specific number of decimals, most of the `loadTimes` stuff has 3
        function toFixed(num, fixed) {
            var re = new RegExp('^-?\\d+(?:.\\d{0,' + (fixed || -1) + '})?')
            return num.toString().match(re)[0]
        }

        const timingInfo = {
            get firstPaintAfterLoadTime() {
                // This was never actually implemented and always returns 0.
                return 0
            },
            get requestTime() {
                return timing.navigationStart / 1000
            },
            get startLoadTime() {
                return timing.navigationStart / 1000
            },
            get commitLoadTime() {
                return timing.responseStart / 1000
            },
            get finishDocumentLoadTime() {
                return timing.domContentLoadedEventEnd / 1000
            },
            get finishLoadTime() {
                return timing.loadEventEnd / 1000
            },
            get firstPaintTime() {
                const fpEntry = performance.getEntriesByType('paint')[0] || {
                    startTime: timing.loadEventEnd / 1000 // Fallback if no navigation occured (`about:blank`)
                }
                return toFixed(
                    (fpEntry.startTime + performance.timeOrigin) / 1000,
                    3
                )
            }
        }

        window.chrome.loadTimes = function () {
            return {
                ...protocolInfo,
                ...timingInfo
            }
        }
        utils.patchToString(window.chrome.loadTimes);
    } catch (e) {
        console.log(e.toString());
    }

//window.chrome.runtime
    try {
        let STATIC_DATA = {
            "OnInstalledReason": {
                "CHROME_UPDATE": "chrome_update",
                "INSTALL": "install",
                "SHARED_MODULE_UPDATE": "shared_module_update",
                "UPDATE": "update"
            },
            "OnRestartRequiredReason": {
                "APP_UPDATE": "app_update",
                "OS_UPDATE": "os_update",
                "PERIODIC": "periodic"
            },
            "PlatformArch": {
                "ARM": "arm",
                "ARM64": "arm64",
                "MIPS": "mips",
                "MIPS64": "mips64",
                "X86_32": "x86-32",
                "X86_64": "x86-64"
            },
            "PlatformNaclArch": {
                "ARM": "arm",
                "MIPS": "mips",
                "MIPS64": "mips64",
                "X86_32": "x86-32",
                "X86_64": "x86-64"
            },
            "PlatformOs": {
                "ANDROID": "android",
                "CROS": "cros",
                "LINUX": "linux",
                "MAC": "mac",
                "OPENBSD": "openbsd",
                "WIN": "win"
            },
            "RequestUpdateCheckStatus": {
                "NO_UPDATE": "no_update",
                "THROTTLED": "throttled",
                "UPDATE_AVAILABLE": "update_available"
            }
        };

        // That means we're running headful and don't need to mock anything
        const existsAlready = 'runtime' in window.chrome
        // `chrome.runtime` is only exposed on secure origins
        const isNotSecure = !window.location.protocol.startsWith('https')
        if (existsAlready || isNotSecure) {
            throw new Error('runtime exist')// Nothing to do here
        }

        window.chrome.runtime = {
            // There's a bunch of static data in that property which doesn't seem to change,
            // we should periodically check for updates: `JSON.stringify(window.chrome.runtime, null, 2)`
            ...STATIC_DATA,
            // `chrome.runtime.id` is extension related and returns undefined in Chrome
            get id() {
                return undefined
            },
            // These two require more sophisticated mocks
            connect: null,
            sendMessage: null
        }

        const makeCustomRuntimeErrors = (preamble, method, extensionId) => ({
            NoMatchingSignature: new TypeError(
                preamble + `No matching signature.`
            ),
            MustSpecifyExtensionID: new TypeError(
                preamble +
                `${method} called from a webpage must specify an Extension ID (string) for its first argument.`
            ),
            InvalidExtensionID: new TypeError(
                preamble + `Invalid extension id: '${extensionId}'`
            )
        })

        // Valid Extension IDs are 32 characters in length and use the letter `a` to `p`:
        // https://source.chromium.org/chromium/chromium/src/+/master:components/crx_file/id_util.cc;drc=14a055ccb17e8c8d5d437fe080faba4c6f07beac;l=90
        const isValidExtensionID = str =>
            str.length === 32 && str.toLowerCase().match(/^[a-p]+$/)

        /** Mock `chrome.runtime.sendMessage` */
        const sendMessageHandler = {
            apply: function (target, ctx, args) {
                const [extensionId, options, responseCallback] = args || []

                // Define custom errors
                const errorPreamble = `Error in invocation of runtime.sendMessage(optional string extensionId, any message, optional object options, optional function responseCallback): `
                const Errors = makeCustomRuntimeErrors(
                    errorPreamble,
                    `chrome.runtime.sendMessage()`,
                    extensionId
                )

                // Check if the call signature looks ok
                const noArguments = args.length === 0
                const tooManyArguments = args.length > 4
                const incorrectOptions = options && typeof options !== 'object'
                const incorrectResponseCallback =
                    responseCallback && typeof responseCallback !== 'function'
                if (
                    noArguments ||
                    tooManyArguments ||
                    incorrectOptions ||
                    incorrectResponseCallback
                ) {
                    throw Errors.NoMatchingSignature
                }

                // At least 2 arguments are required before we even validate the extension ID
                if (args.length < 2) {
                    throw Errors.MustSpecifyExtensionID
                }

                // Now let's make sure we got a string as extension ID
                if (typeof extensionId !== 'string') {
                    throw Errors.NoMatchingSignature
                }

                if (!isValidExtensionID(extensionId)) {
                    throw Errors.InvalidExtensionID
                }

                return undefined // Normal behavior
            }
        }
        utils.mockWithProxy(
            window.chrome.runtime,
            'sendMessage',
            function sendMessage() {
            },
            sendMessageHandler
        )

        /**
         * Mock `chrome.runtime.connect`
         *
         * @see https://developer.chrome.com/apps/runtime#method-connect
         */
        const connectHandler = {
            apply: function (target, ctx, args) {
                const [extensionId, connectInfo] = args || []

                // Define custom errors
                const errorPreamble = `Error in invocation of runtime.connect(optional string extensionId, optional object connectInfo): `
                const Errors = makeCustomRuntimeErrors(
                    errorPreamble,
                    `chrome.runtime.connect()`,
                    extensionId
                )

                // Behavior differs a bit from sendMessage:
                const noArguments = args.length === 0
                const emptyStringArgument = args.length === 1 && extensionId === ''
                if (noArguments || emptyStringArgument) {
                    throw Errors.MustSpecifyExtensionID
                }

                const tooManyArguments = args.length > 2
                const incorrectConnectInfoType =
                    connectInfo && typeof connectInfo !== 'object'

                if (tooManyArguments || incorrectConnectInfoType) {
                    throw Errors.NoMatchingSignature
                }

                const extensionIdIsString = typeof extensionId === 'string'
                if (extensionIdIsString && extensionId === '') {
                    throw Errors.MustSpecifyExtensionID
                }
                if (extensionIdIsString && !isValidExtensionID(extensionId)) {
                    throw Errors.InvalidExtensionID
                }

                // There's another edge-case here: extensionId is optional so we might find a connectInfo object as first param, which we need to validate
                const validateConnectInfo = ci => {
                    // More than a first param connectInfo as been provided
                    if (args.length > 1) {
                        throw Errors.NoMatchingSignature
                    }
                    // An empty connectInfo has been provided
                    if (Object.keys(ci).length === 0) {
                        throw Errors.MustSpecifyExtensionID
                    }
                    // Loop over all connectInfo props an check them
                    Object.entries(ci).forEach(([k, v]) => {
                        const isExpected = ['name', 'includeTlsChannelId'].includes(k)
                        if (!isExpected) {
                            throw new TypeError(
                                errorPreamble + `Unexpected property: '${k}'.`
                            )
                        }
                        const MismatchError = (propName, expected, found) =>
                            TypeError(
                                errorPreamble +
                                `Error at property '${propName}': Invalid type: expected ${expected}, found ${found}.`
                            )
                        if (k === 'name' && typeof v !== 'string') {
                            throw MismatchError(k, 'string', typeof v)
                        }
                        if (k === 'includeTlsChannelId' && typeof v !== 'boolean') {
                            throw MismatchError(k, 'boolean', typeof v)
                        }
                    })
                }
                if (typeof extensionId === 'object') {
                    validateConnectInfo(extensionId)
                    throw Errors.MustSpecifyExtensionID
                }

                // Unfortunately even when the connect fails Chrome will return an object with methods we need to mock as well
                return utils.patchToStringNested(makeConnectResponse())
            }
        }
        utils.mockWithProxy(
            window.chrome.runtime,
            'connect',
            function connect() {
            },
            connectHandler
        )

        function makeConnectResponse() {
            const onSomething = () => ({
                addListener: function addListener() {
                },
                dispatch: function dispatch() {
                },
                hasListener: function hasListener() {
                },
                hasListeners: function hasListeners() {
                    return false
                },
                removeListener: function removeListener() {
                }
            })

            const response = {
                name: '',
                sender: undefined,
                disconnect: function disconnect() {
                },
                onDisconnect: onSomething(),
                onMessage: onSomething(),
                postMessage: function postMessage() {
                    if (!arguments.length) {
                        throw new TypeError(`Insufficient number of arguments.`)
                    }
                    throw new Error(`Attempting to use a disconnected port object`)
                }
            }
            return response;
        }

    } catch (e) {
        console.log(e.toString());
    }

//navigator.language
//     try {
//         Object.defineProperty(Object.getPrototypeOf(navigator), 'language', {
//             get: () => 'en-US'
//         });
//     } catch (e) {
//         console.log(e.toString());
//     }
//
// //navigator.languages
//     try {
//         Object.defineProperty(Object.getPrototypeOf(navigator), 'languages', {
//             get: () => ['en-US', 'en']
//         });
//     } catch (e) {
//         console.log(e.toString());
//     }

//navigator.webdriver
    try {
        delete Object.getPrototypeOf(navigator).webdriver
    } catch (e) {
        console.log(e.toString());
    }

//iframe.contentWindow
//     try {
//         const addContentWindowProxy = iframe => {
//             const contentWindowProxy = {
//                 get(target, key) {
//                     // Now to the interesting part:
//                     // We actually make this thing behave like a regular iframe window,
//                     // by intercepting calls to e.g. `.self` and redirect it to the correct thing. :)
//                     // That makes it possible for these assertions to be correct:
//                     // iframe.contentWindow.self === window.top // must be false
//                     if (key === 'self') {
//                         return this
//                     }
//                     // iframe.contentWindow.frameElement === iframe // must be true
//                     if (key === 'frameElement') {
//                         return iframe
//                     }
//                     return Reflect.get(target, key)
//                 }
//             }
//
//             if (!iframe.contentWindow) {
//                 const proxy = new Proxy(window, contentWindowProxy)
//                 Object.defineProperty(iframe, 'contentWindow', {
//                     get() {
//                         return proxy
//                     },
//                     set(newValue) {
//                         return newValue // contentWindow is immutable
//                     },
//                     enumerable: true,
//                     configurable: false
//                 })
//             }
//         }
//
//         // Handles iframe element creation, augments `srcdoc` property so we can intercept further
//         const handleIframeCreation = (target, thisArg, args) => {
//             const iframe = target.apply(thisArg, args)
//
//             // We need to keep the originals around
//             const _iframe = iframe
//             const _srcdoc = _iframe.srcdoc
//
//             // Add hook for the srcdoc property
//             // We need to be very surgical here to not break other iframes by accident
//             Object.defineProperty(iframe, 'srcdoc', {
//                 configurable: true, // Important, so we can reset this later
//                 get: function () {
//                     return _iframe.srcdoc
//                 },
//                 set: function (newValue) {
//                     addContentWindowProxy(this)
//                     // Reset property, the hook is only needed once
//                     Object.defineProperty(iframe, 'srcdoc', {
//                         configurable: false,
//                         writable: false,
//                         value: _srcdoc
//                     })
//                     _iframe.srcdoc = newValue
//                 }
//             })
//             return iframe
//         }
//
//         // Adds a hook to intercept iframe creation events
//         const addIframeCreationSniffer = () => {
//             /* global document */
//             const createElementHandler = {
//                 // Make toString() native
//                 get(target, key) {
//                     return Reflect.get(target, key)
//                 },
//                 apply: function (target, thisArg, args) {
//                     const isIframe =
//                         args && args.length && `${args[0]}`.toLowerCase() === 'iframe'
//                     if (!isIframe) {
//                         // Everything as usual
//                         return target.apply(thisArg, args)
//                     } else {
//                         return handleIframeCreation(target, thisArg, args)
//                     }
//                 }
//             }
//             // All this just due to iframes with srcdoc bug
//             utils.replaceWithProxy(
//                 document,
//                 'createElement',
//                 createElementHandler
//             )
//         }
//
//         // Let's go
//         addIframeCreationSniffer();
//     } catch (e) {
//         console.log(e.toString());
//     }

//media.codecs
    try {
        /**
         * Input might look funky, we need to normalize it so e.g. whitespace isn't an issue for our spoofing.
         *
         * @example
         * video/webm; codecs="vp8, vorbis"
         * video/mp4; codecs="avc1.42E01E"
         * audio/x-m4a;
         * audio/ogg; codecs="vorbis"
         * @param {String} arg
         */
        const parseInput = arg => {
            const [mime, codecStr] = arg.trim().split(';')
            let codecs = []
            if (codecStr && codecStr.includes('codecs="')) {
                codecs = codecStr
                    .trim()
                    .replace(`codecs="`, '')
                    .replace(`"`, '')
                    .trim()
                    .split(',')
                    .filter(x => !!x)
                    .map(x => x.trim())
            }
            return {
                mime,
                codecStr,
                codecs
            }
        }

        const canPlayType = {
            // Intercept certain requests
            apply: function (target, ctx, args) {
                if (!args || !args.length) {
                    return target.apply(ctx, args)
                }
                const {mime, codecs} = parseInput(args[0])
                // This specific mp4 codec is missing in Chromium
                if (mime === 'video/mp4') {
                    if (codecs.includes('avc1.42E01E')) {
                        return 'probably'
                    }
                }
                // This mimetype is only supported if no codecs are specified
                if (mime === 'audio/x-m4a' && !codecs.length) {
                    return 'maybe'
                }

                // This mimetype is only supported if no codecs are specified
                if (mime === 'audio/aac' && !codecs.length) {
                    return 'probably'
                }
                // Everything else as usual
                return target.apply(ctx, args)
            }
        }

        /* global HTMLMediaElement */
        utils.replaceWithProxy(
            HTMLMediaElement.prototype,
            'canPlayType',
            canPlayType
        )
    } catch (e) {
        console.log(e.toString());
    }

//navigator.hardwareConcurrency
    try {
        Object.defineProperty(
            Object.getPrototypeOf(navigator),
            'hardwareConcurrency',
            {
                value: 4,
                writable: false
            }
        )
    } catch (e) {
        console.log(e.toString());
    }

//Notification
    try {
        window.Notification = Object.setPrototypeOf({permission: 'denied'}, EventTarget.prototype);
        console.log(window.Notification);
    } catch (e) {
        console.log(e.toString());
    }

//navigator.permissions
    try {
        const handler = {
            apply: function (target, ctx, args) {
                const param = (args || [])[0]

                //Notification.permission === 'denied'


                if (param && param.name && param.name === 'notifications') {
                    const result = Object.setPrototypeOf({state: "denied"}, PermissionStatus.prototype)
                    return Promise.resolve(result)
                }

                return utils.cache.Reflect.apply(...arguments)
            }
        }

        utils.replaceWithProxy(
            Object.getPrototypeOf(navigator.permissions),
            'query',
            handler
        );
    } catch (e) {
        console.log(e.toString());
    }


//navigator.vendor
    try {
        Object.defineProperty(Object.getPrototypeOf(navigator), 'vendor', {
            get: () => 'Google Inc.'
        })
    } catch (e) {
        console.log(e.toString());
    }

//window.outerdimensions
//     try {
//         if (window.outerWidth && window.outerHeight) {
//             throw new Error('window dimensions nothing to do'); // nothing to do here
//         }
//         const windowFrame = 85 // probably OS and WM dependent
//         window.outerWidth = window.innerWidth
//         window.outerHeight = window.innerHeight + windowFrame
//     } catch (e) {
//         console.log(e.toString());
//     }

//navigator.plugins
    try {
        const hasPlugins = navigator.plugins && navigator.plugins.length > 0;

        if (!hasPlugins) {
            const _mimeTypes = [
                {
                    type: 'application/pdf', suffixes: 'pdf', description: '', __pluginName: 'Chrome PDF Viewer'
                },
                {
                    type: 'application/x-google-chrome-pdf',
                    suffixes: 'pdf',
                    description: 'Portable Document Format',
                    __pluginName: 'Chrome PDF Plugin'
                },
                {
                    type: 'application/x-nacl',
                    suffixes: '',
                    description: 'Native Client Executable',
                    __pluginName: 'Native Client'
                },
                {
                    type: 'application/x-pnacl',
                    suffixes: '',
                    description: 'Portable Native Client Executable',
                    __pluginName: 'Native Client'
                }
            ];

            const _plugins = [
                {name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format'},
                {name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: ''},
                {name: 'Native Client', filename: 'internal-nacl-plugin', description: ''}
            ];

            const fn = (className, fnName) => function (x) {
                if (fnName === 'refresh') return undefined;
                if (!arguments.length) throw new TypeError(`Failed to execute '${fnName}' on '${className}': 1 argument required, but only 0 present.`);
                return this[x] || null;
            };

            // Mime Types
            const mimeTypeArray = _mimeTypes
                .map(x => ['type', 'suffixes', 'description'].reduce((a, k) => ({...a, [k]: x[k]}), {}))
                .map(x => Object.setPrototypeOf(x, MimeType.prototype))
                .map(x => ({...x, namedItem: fn('MimeTypeArray', 'namedItem'), item: fn('MimeTypeArray', 'item')}));

            mimeTypeArray.forEach(x => mimeTypeArray[x.type] = x);

            Object.setPrototypeOf(mimeTypeArray, MimeTypeArray.prototype);
            Object.defineProperty(Object.getPrototypeOf(navigator), 'mimeTypes', {get: () => mimeTypeArray});

            // Plugins
            const pluginArray = _plugins
                .map(x => ['name', 'filename', 'description'].reduce((a, k) => ({...a, [k]: x[k]}), {}))
                .map(x => {
                    const _mimeTypesSubset = _mimeTypes.filter(y => y.__pluginName === x.name);

                    _mimeTypesSubset.forEach((mime, i) => {
                        navigator.mimeTypes[mime.type].enabledPlugin = x;
                        x[mime.type] = navigator.mimeTypes[mime.type];
                        x[i] = navigator.mimeTypes[mime.type];
                    });

                    return {...x, length: _mimeTypesSubset.length};
                })
                .map(x => ({...x, namedItem: fn('Plugin', 'namedItem'), item: fn('Plugin', 'item')}))
                .map(x => Object.setPrototypeOf(x, Plugin.prototype));


            pluginArray.forEach(x => pluginArray[x.name] = x);

            ['namedItem', 'item', 'refresh'].forEach(x => pluginArray[x] = fn('PluginArray', x));

            Object.setPrototypeOf(pluginArray, PluginArray.prototype);
            Object.defineProperty(Object.getPrototypeOf(navigator), 'plugins', {get: () => pluginArray});
        }
    } catch (e) {
        console.log(e.toString());
    }

//Fake webGL vendor + renderer
    try {

        const getParameterProxyHandler = {
            apply: function (target, ctx, args) {
                const param = (args || [])[0]
                // UNMASKED_VENDOR_WEBGL
                if (param === 37445) {
                    return opts.vendor || 'Intel Inc.' // default in headless: Google Inc.
                }
                // UNMASKED_RENDERER_WEBGL
                if (param === 37446) {
                    return opts.renderer || 'Intel Iris OpenGL Engine' // default in headless: Google SwiftShader
                }
                return utils.cache.Reflect.apply(target, ctx, args)
            }
        }

        // There's more than one WebGL rendering context
        // https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext#Browser_compatibility
        // To find out the original values here: Object.getOwnPropertyDescriptors(WebGLRenderingContext.prototype.getParameter)
        const addProxy = (obj, propName) => {
            utils.replaceWithProxy(obj, propName, getParameterProxyHandler)
        }
        // For whatever weird reason loops don't play nice with Object.defineProperty, here's the next best thing:
        addProxy(WebGLRenderingContext.prototype, 'getParameter')
        addProxy(WebGL2RenderingContext.prototype, 'getParameter')

    } catch (e) {
        console.log(e.toString());
    }

    //webrtc
    try {
        navigator.mediaDevices.getUserMedia = navigator.webkitGetUserMedia = navigator.mozGetUserMedia = navigator.getUserMedia = webkitRTCPeerConnection = RTCPeerConnection = MediaStreamTrack = undefined;
    } catch (e) {
        console.log(e.toString());
    }

})();
