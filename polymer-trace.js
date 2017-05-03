/* global Polymer */
(function() {
    /* Settings */
    const settings = {
        get includeStack(){
            return Polymer.debug.enable && Polymer.debug.includeStack
        },

        get enabled() {
            return Polymer.debug ? Polymer.debug.enable : false
        },

        get threshold() {
            return Polymer.debug ? Polymer.debug.threshold : 0
        },

        get filename() {
            return `polymer-trace.js`
        },

        // Returns the color associated with the
        // color setting
        getColor: type => `font-weight: normal; color:${PolymerTrace.debug.colors[type]}`,
    }

    /* Utility Functions */
    const util = {
        // Test the string against all regex functions
        // in the regexarr array
        testRegex: (regexarr, str, def) => {
            let res = def || false
            regexarr.forEach(r => res |= r instanceof RegExp ? r.test(str) : r === str)
            return res 
        },

        // returns a string with 'count' iterations
        // of 'char'
        pad: (char, count) => {
            let res = ''
            for (let i = 0; i < count; i++) res += char
            return res
        },

        // returns the call stack with all PolymerTrace info removed
        getCleanCallingStack: () => {
            // get the remaining lines after 'Error'
            const stack = new Error().stack.split('\n')
            stack.shift()

            // remove lines referring to this file
            const paths = []
            stack.forEach(s => {
                if (s.indexOf(settings.filename) === -1) {
                    const line = s.replace(/^\s*/, '')
                    paths.push(line)
                }
            })

            return paths
        },
    
        // returns the path of the script that called the
        // Polymer registration function
        getCallingPath: () => {
            const stack = util.getCleanCallingStack()

            let line = stack.pop()
            line = line.replace(/^\s*at\s*/, '')

            const matches = line.match(/\((.*)\)$/)
            const linePath = (matches ? matches[1] : line).replace(/:\d*:\d*$/, '')

            return linePath
        }
    }

    /* Stack Printing */
    const stackTracer = (function() {
        const times = []
        const stack = []
        const calls = {}

        const _stackBegin = () => {
            times.push(window.performance.now())
        }

        const _stackEnd = (is, key, options) => {
            const includeStack = settings.includeStack && times.length === 1
            const delta = window.performance.now() - times.pop()

            const callsKey = `${is}.${key}`
            calls[callsKey] = calls[callsKey] || { tally: 0, time: 0 }
            calls[callsKey].tally ++
            calls[callsKey].time += delta

            const obj = Object.assign({
                is: is,
                key, 
                delta,
                depth: times.length,
                msg: '',
                stack: includeStack ? util.getCleanCallingStack().join('\n') : ''
            }, options)

            stack.push(obj)

            if (times.length === 0) printStack()
        }

        /* Trace Print Functions */
        // prints a collapseable stack trace with ms timing
        const printStack = () => {
            const threshold = PolymerTrace.debug.threshold

            // reset the stack and return if we're
            // not supposed to print anything
            if (!settings.enabled) {
                stack.length = 0
                return
            }

            const revStack = []

            // iterate over all the calls
            let curr = stack.pop()
            const colors = [settings.getColor('light'), settings.getColor('dark'), settings.getColor('highlight'), settings.getColor('dark')]
            while (curr) {
                const delta = curr.delta.toFixed(3)
                const doPrint = delta > threshold || revStack.length > 0

                // print if we're above our timing threshold or
                // the parent in the stack trace has been printed
                if (doPrint) {

                    // create the print message
                    let grp = `%c${curr.is}.%c${curr.key}`
                    grp += util.pad(' ', 60 - grp.length) + `%c${delta}ms`
                    grp += util.pad(' ', 80 - grp.length) + `%c${curr.msg}`

                    const nextCurr = stack[stack.length - 1] || null
                    const printingTrace = curr.stack && curr.depth === 0
                    const printingChildren = nextCurr && nextCurr.depth > curr.depth

                    if (printingChildren || settings.printStack) {

                        console.groupCollapsed(grp, ...colors)

                        if (curr.stack) {
                            console.groupCollapsed('%cstack', settings.getColor('highlight'))
                            console.log(`%c${curr.stack}`, settings.getColor('highlight'))
                            console.groupEnd()
                        }

                        revStack.push({ depth: curr.depth })
                    } else {
                        console.log(grp, ...colors)
                    }
                }

                // update curr
                curr = stack.pop()

                // close the remaining groups if our stack is
                // finished or until we finish the children of
                // the last group
                while (revStack.length > 0 && (!curr || revStack[revStack.length - 1].depth >= curr.depth)) {
                    console.groupEnd()
                    revStack.pop()
                }

            }
        }

        // Prints out function calls that happened over the last frame
        const _flushCalls = () => {
            const enabled = settings.enabled
            const threshold = settings.threshold
            const keys = Object.keys(calls)
            if (keys.length > 0) {
                const arr = []
                keys.forEach(key => {
                    calls[key].key = key
                    if (calls[key].time > threshold) {
                        arr.push(calls[key])
                    }
                    delete calls[key]
                })
                arr.sort((a, b) => b.time - a.time)

                if (arr.length > 0) {
                    if (enabled) {
                        console.groupCollapsed(`${arr.length} function calls intercepted last frame`)
                    }
                    arr.forEach(i => {
                        const key = i.key
                        const delta = i.time.toFixed(3)
                        const tally = i.tally
                        let log = '%c' + key.replace('.', '%c.')
                        log += util.pad(' ', 50 - log.length) + `%ccalled %c${tally} times for a total of %c${delta}ms`

                        if (enabled) {
                            console.log(log, settings.getColor('light'), settings.getColor('dark'), settings.getColor('light'), settings.getColor('dark'), settings.getColor('highlight'))
                        }
                    })
                    console.groupEnd()
                }
            }
            requestAnimationFrame(_flushCalls)
        }
        _flushCalls()

        return {
            begin: _stackBegin,
            end: _stackEnd
        }
    })()

    if (!window.Polymer) {
        console.error('Polymer not loaded')
        return
    }

    /* Variables */
    const origPolymer = Polymer

    

    /* Surrogate Function Application */
    // Creates a proxy function for the provided key
    // on the provided object with the given key

    // A function is called before and after the original
    // function is called with the original arguments.
    // A preprocess function can be provided to run on the arguments
    const applySurrogate = (obj, key, pre, post, argpreprocess) => {
        if (!(key in obj) || !(obj[key] instanceof Function)) return

        const origFunc = obj[key]
        obj[key] = function() {
            const processedArgs = argpreprocess ? argpreprocess.call(this, ...arguments) : arguments

            if (pre) pre.call(this, ...arguments)
            const res = origFunc.call(this, ...processedArgs)
            if (post) post.call(this, ...arguments)

            return res
        }
    }

    // override the debounce function so we can time the callback
    const applyDebounceSurrogate = (is, obj) => {

        const debounceCalls = {}
        applySurrogate(obj, 'debounce', stackTracer.begin, (key, func, time) => {
            debounceCalls[key] = debounceCalls[key] || { tally: 0, time: 0 }

            const obj = stackTracer.end(is, 'debounce', {
                msg: `function with '${key}' will be called in ${time}ms. Called ${debounceCalls[key]} times before`
            })

            debounceCalls[key].tally ++
            debounceCalls[key].time = window.performance.now()
        }, function() {
            const key = arguments[0]
            const func = arguments[1]
            const time = arguments[2] || 0

            arguments[1] = () => {
                const delta = (window.performance.now() - debounceCalls[key].time).toFixed(3)
                const tally = debounceCalls[key].tally
                delete debounceCalls[key]

                stackTracer.begin()
                func.call(this)

                const obj = stackTracer.end(is, `debounce('${key}')`, {
                    msg: `debounce callback with '${key}' getting called after ${delta}ms after requesting ${time}ms. Called ${tally} times before firing`
                })

                printStack()
            }

            return arguments
        })
    }

    // Override the async function so we can watch when
    // functions are called after being requested asynchronously
    const applyAsyncSurrogate = (is, obj) => {
        const applyCalls = new WeakMap()

        applySurrogate(obj, 'async', stackTracer.begin, (func, time) => {
            const obj = stackTracer.end(is, 'async', { msg: `async function will be called in ${time}ms` })
            applyCalls.set(func, window.performance.now())

            if (times.length === 0) printStack()
        }, function() {
            const func = arguments[0]
            const time = arguments[1] || 0

            arguments[0] = function() {
                const delta = (window.performance.now() - applyCalls.get(func)).toFixed(3)
                applyCalls.delete(func)

                stackTracer.begin()
                func.call(this)

                const obj = stackTracer.end(is, `async callback`, { msg: `async function called after ${delta}ms after requesting ${time}ms` })
                printStack()
            }

            return arguments
        })
    }

    // Applies the debutg logic to the particular Polymer Template
    const applyDebug = temp => {

        applySurrogate(temp, 'created', function() {
            applyDebounceSurrogate(temp.is, this)
            applyAsyncSurrogate(temp.is, this)

            stackTracer.begin()
        }, () => {
            stackTracer.end(temp.is, 'created')
        })

        Object.keys(temp).forEach(key => {
            let item = null
            try {
                // TODO : remove this try / catch
                // this is here because 'getter' functions
                // might get called here, but are not ready
                // to be called, yet, throwing errors
                item = temp[key]
            } catch (e) {
                return
            }

            if (!(item instanceof Function)) return

            applySurrogate(temp, key, stackTracer.begin, () => {
                stackTracer.end(temp.is, key)
            })
        })
    }

    /* Intialization */
    const PolymerTrace = function(obj) {
        const scriptPath = util.getCallingPath()
        const elementName = obj.is
        console.log(scriptPath)
        if (
            (util.testRegex(PolymerTrace.debug.include, scriptPath, true) ||
            util.testRegex(PolymerTrace.debug.include, elementName, true)) &&

            !util.testRegex(PolymerTrace.debug.exclude, scriptPath, false) &&
            !util.testRegex(PolymerTrace.debug.exclude, elementName, false)
        ) {
            console.log(`applying to ${obj.is}`)
            applyDebug(obj)
        } else {
            console.log(`skipping ${obj.is}`)
        }

        return PolymerTrace.__proto__(...arguments)
    }

    PolymerTrace.__proto__ = origPolymer
    window.Polymer = PolymerTrace
})()

/* Default Settings */
Polymer.debug = {
    enable: true,
        
    include: [/.*/g],
    exclude: [/\/node_modules\//, /\/bower_components\//],
        
    threshold: 1,
    includeStack: true,

    colors: {
        light: '#90A4AE',
        dark: '#37474F',
        highlight: '#E91E63'
    }
}