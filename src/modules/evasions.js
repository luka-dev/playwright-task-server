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


//UA Entropy values
    try {
        navigator.userAgentData.getHighEntropyValues([
            "platform",
            "platformVersion",
            "architecture",
            "model",
            "uaFullVersion"
        ]);
    } catch (e) {}

// Fake webGL vendor + renderer
    try {
        // Remove traces of our Proxy ;-)
        let stripErrorStack = stack =>
            stack
                .split('\n')
                .filter(line => !line.includes(`at Object.apply`))
                .filter(line => !line.includes(`at Object.get`))
                .join('\n')

        const getParameterProxyHandler = {
            get(target, key) {
                try {
                    // Mitigate Chromium bug (#130)
                    if (typeof target[key] === 'function') {
                        return target[key].bind(target)
                    }
                    return Reflect.get(target, key)
                } catch (err) {
                    err.stack = stripErrorStack(err.stack)
                    throw err
                }
            },
            apply: function (target, thisArg, args) {
                const param = (args || [])[0]
                // UNMASKED_VENDOR_WEBGL
                if (param === 37445) {
                    return 'Intel Inc.'
                }
                // UNMASKED_RENDERER_WEBGL
                if (param === 37446) {
                    return 'Intel Iris OpenGL Engine'
                }
                try {
                    return Reflect.apply(target, thisArg, args)
                } catch (err) {
                    err.stack = stripErrorStack(err.stack)
                    throw err
                }
            }
        }

        const proxy = new Proxy(
            WebGLRenderingContext.prototype.getParameter,
            getParameterProxyHandler
        )
        // To find out the original values here: Object.getOwnPropertyDescriptors(WebGLRenderingContext.prototype.getParameter)
        Object.defineProperty(WebGLRenderingContext.prototype, 'getParameter', {
            configurable: true,
            enumerable: false,
            writable: false,
            value: proxy
        })
    } catch (e) {}

//overwrite acceptable languages
    try {
        Object.defineProperty(navigator, "languages", {
            get: function () {
                return ["en-GB", "en"];
            }
        });
    } catch (e) {}

//overwrite the `plugins` property to use a custom getter
//todo https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth/evasions/navigator.plugins
    try {
        Object.defineProperty(navigator, 'plugins', {
            get: function () {
                // this just needs to have `length > 0`, but we could mock the plugins too
                return [1, 2, 3, 4, 5];
            },
        });
    } catch (e) {}

// Fake hairline feature, see https://github.com/Niek/playwright-addons/issues/2
    try {
        const _osH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
        Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', {
            ..._osH,
            get: function () {
                return this.id === 'modernizr' ? 1 : _osH.get.apply(this);
            }
        })
    } catch (e) {}


//window.chrome + .app
    try {
        if (!window.chrome) {
            // Use the exact property descriptor found in headful Chrome
            // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
            Object.defineProperty(window, 'chrome', {
                writable: true,
                enumerable: true,
                configurable: false, // note!
                value: {} // We'll extend that later
            })
        }

        // That means we're running headful and don't need to mock anything
        if ('app' in window.chrome) {
            return // Nothing to do here
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
    } catch (e) {}

//window.chrome.csi
    try {
        if (!window.chrome) {
            // Use the exact property descriptor found in headful Chrome
            // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
            Object.defineProperty(window, 'chrome', {
                writable: true,
                enumerable: true,
                configurable: false, // note!
                value: {} // We'll extend that later
            })
        }

        // That means we're running headful and don't need to mock anything
        if ('csi' in window.chrome) {
            return // Nothing to do here
        }

        // Check that the Navigation Timing API v1 is available, we need that
        if (!window.performance || !window.performance.timing) {
            return
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
    } catch (e) {}

//window.chrome.loadTimes
    try {
        if (!window.chrome) {
            // Use the exact property descriptor found in headful Chrome
            // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
            Object.defineProperty(window, 'chrome', {
                writable: true,
                enumerable: true,
                configurable: false, // note!
                value: {} // We'll extend that later
            })
        }

        // That means we're running headful and don't need to mock anything
        if ('loadTimes' in window.chrome) {
            return // Nothing to do here
        }

        // Check that the Navigation Timing API v1 + v2 is available, we need that
        if (
            !window.performance ||
            !window.performance.timing ||
            !window.PerformancePaintTiming
        ) {
            return
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
    } catch (e) {}

//iframe content window
    try {
        const addContentWindowProxy = iframe => {
            const contentWindowProxy = {
                get(target, key) {
                    // Now to the interesting part:
                    // We actually make this thing behave like a regular iframe window,
                    // by intercepting calls to e.g. `.self` and redirect it to the correct thing. :)
                    // That makes it possible for these assertions to be correct:
                    // iframe.contentWindow.self === window.top // must be false
                    if (key === 'self') {
                        return this
                    }
                    // iframe.contentWindow.frameElement === iframe // must be true
                    if (key === 'frameElement') {
                        return iframe
                    }
                    return Reflect.get(target, key)
                }
            }

            if (!iframe.contentWindow) {
                const proxy = new Proxy(window, contentWindowProxy)
                Object.defineProperty(iframe, 'contentWindow', {
                    get() {
                        return proxy
                    },
                    set(newValue) {
                        return newValue // contentWindow is immutable
                    },
                    enumerable: true,
                    configurable: false
                })
            }
        }

        // Handles iframe element creation, augments `srcdoc` property so we can intercept further
        const handleIframeCreation = (target, thisArg, args) => {
            const iframe = target.apply(thisArg, args)

            // We need to keep the originals around
            const _iframe = iframe
            const _srcdoc = _iframe.srcdoc

            // Add hook for the srcdoc property
            // We need to be very surgical here to not break other iframes by accident
            Object.defineProperty(iframe, 'srcdoc', {
                configurable: true, // Important, so we can reset this later
                get: function () {
                    return _iframe.srcdoc
                },
                set: function (newValue) {
                    addContentWindowProxy(this)
                    // Reset property, the hook is only needed once
                    Object.defineProperty(iframe, 'srcdoc', {
                        configurable: false,
                        writable: false,
                        value: _srcdoc
                    })
                    _iframe.srcdoc = newValue
                }
            })
            return iframe
        }

        // Adds a hook to intercept iframe creation events
        const addIframeCreationSniffer = () => {
            /* global document */
            const createElementHandler = {
                // Make toString() native
                get(target, key) {
                    return Reflect.get(target, key)
                },
                apply: function (target, thisArg, args) {
                    const isIframe =
                        args && args.length && `${args[0]}`.toLowerCase() === 'iframe'
                    if (!isIframe) {
                        // Everything as usual
                        return target.apply(thisArg, args)
                    } else {
                        return handleIframeCreation(target, thisArg, args)
                    }
                }
            }
            // All this just due to iframes with srcdoc bug
            utils.replaceWithProxy(
                document,
                'createElement',
                createElementHandler
            )
        }

        // Let's go
        addIframeCreationSniffer();
    } catch (e) {}

//media.codecs
    try {
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
            apply: function(target, ctx, args) {
                if (!args || !args.length) {
                    return target.apply(ctx, args)
                }
                const { mime, codecs } = parseInput(args[0])
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
    } catch (e) {}

//navigator.hardwareConcurrency
    try {
        const patchNavigator = (name, value) =>
            utils.replaceProperty(Object.getPrototypeOf(navigator), name, {
                get() {
                    return value
                }
            })

        patchNavigator('hardwareConcurrency', 4);
    } catch (e) {}

//navigator.language
    try {
        Object.defineProperty(Object.getPrototypeOf(navigator), 'languages', {
            get: () => ['en-US', 'en']
        });
    } catch (e) {}

//navigator.permissions
    try {
        const handler = {
            apply: function(target, ctx, args) {
                const param = (args || [])[0]

                if (param && param.name && param.name === 'notifications') {
                    const result = { state: Notification.permission }
                    Object.setPrototypeOf(result, PermissionStatus.prototype)
                    return Promise.resolve(result)
                }

                return utils.cache.Reflect.apply(...arguments)
            }
        }

        utils.replaceWithProxy(
            window.navigator.permissions.__proto__,
            'query',
            handler
        )
    } catch (e) {}

//navigator.vendor
    try {
        Object.defineProperty(Object.getPrototypeOf(navigator), 'vendor', {
            get: () => 'Google Inc.'
        })
    } catch (e) {}

//navigator.webdriver
    try {
        delete Object.getPrototypeOf(navigator).webdriver;
    } catch (e) {}

})();
