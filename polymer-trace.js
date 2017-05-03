/* global Polymer */
(function() {
    if (!window.Polymer) {
        console.error('Polymer not loaded')
        return
    }

    /* Variables */
    const origPolymer = Polymer
    
    // used for stripping lines from
    // stack traces
    const filename = `polymer-trace.js`
    
    // variables for keeping track of
    // functions calls
    const times = []    // start timing on each function called. Doubles as stack depth
    const stack = []    // stack of objects with info about each function call
    const calls = {}    // map to keep track of how many times a function was called

    /* Context Functions */
    // returns the call stack with all PolymerTrace info removed
    const getCleanCallingStack = () => {
        // get the remaining lines after 'Error'
        const stack = new Error().stack.split('\n')
        stack.shift()

        // remove lines referring to this file
        const paths = []
        stack.forEach(s => {
            if (s.indexOf(filename) === -1) {
                const line = s.replace(/^\s*/, '')
                paths.push(line)
            }
        })

        return paths
    }

    // returns the path of the script that called the
    // Polymer registration function
    const getCallingPath = () => {
        const stack = getCleanCallingStack()

        let line = stack.pop()
        line = line.replace(/^\s*at\s*/, '')

        const matches = line.match(/\((.*)\)$/)
        const linePath = (matches ? matches[1] : line).replace(/:\d*:\d*$/, '')

        return linePath
    }

    /* Utilities */
    // Returns the color associated with the
    // color setting
    const col = type => `font-weight: normal; color:${PolymerTrace.debug.colors[type]}`

    // Test the string against all regex functions
    // in the regexarr array
    const testRegex = (regexarr, str, def) => {
        let res = def || false
        regexarr.forEach(r => res |= r instanceof RegExp ? r.test(str) : r === str)
        return res 
    }

    // returns a string with 'count' iterations
    // of 'char'
    const pad = (char, count) => {
        let res = ''
        for (let i = 0; i < count; i++) res += char
        return res
    }

    /* Trace Print Functions */
    // Only prints if all times have been popped off
    // meaning we're back to the top of the stack
    const tryPrint = () => times.length === 0 && printStack()

    // prints a collapseable stack trace with ms timing
    const printStack = () => {
        const enabled = PolymerTrace.debug.enable
        const threshold = PolymerTrace.debug.threshold

        // reset the stack and return if we're
        // not supposed to print anything
        if (!enabled) {
            stack.length = 0
            return
        }

        const revStack = []

        // iterate over all the calls
        let curr = stack.pop()
        const colors = [col('light'), col('dark'), col('highlight'), col('dark')]
        while (curr) {
            const delta = curr.delta.toFixed(3)
            const doPrint = delta > threshold || revStack.length > 0

            // print if we're above our timing threshold or
            // the parent in the stack trace has been printed
            if (doPrint) {

                // create the print message
                let grp = `%c${curr.is}.%c${curr.key}`
                grp += pad(' ', 60 - grp.length) + `%c${delta}ms`
                grp += pad(' ', 80 - grp.length) + `%c${curr.msg}`

                const nextCurr = stack[stack.length - 1] || null
                const printingTrace = curr.stack && curr.depth === 0
                const printingChildren = nextCurr && nextCurr.depth > curr.depth

                if (printingChildren || printingTrace) {

                    console.groupCollapsed(grp, ...colors)

                    if (curr.stack) {
                        console.groupCollapsed('%cstack', col('highlight'))
                        console.log(`%c${curr.stack}`, col('highlight'))
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
    const flushCalls = () => {
        const enabled = PolymerTrace.debug.enable
        const threshold = PolymerTrace.debug.threshold
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
                    log += pad(' ', 50 - log.length) + `%ccalled %c${tally} times for a total of %c${delta}ms`

                    if (enabled) {
                        console.log(log, col('light'), col('dark'), col('light'), col('dark'), col('highlight'))
                    }
                })
                console.groupEnd()
            }
        }
        requestAnimationFrame(flushCalls)
    }

    /* Surrogate Function Helpers */
    // The general pre-run function for surrogate functions
    // which adds a start time to the func
    const preFunc = () => times.push(window.performance.now())

    // This needs to get called once for ever time 'prefunc'
    // is called to pop time off the times array
    // Returns an object that can be pushed onto the stack
    // to add to the hierarchy
    const getPostFuncObj = (is, key) => {
        const includeStack = PolymerTrace.debug.includeStack && times.length === 1
        const delta = window.performance.now() - times.pop()

        const callsKey = `${is}.${key}`
        calls[callsKey] = calls[callsKey] || { tally: 0, time: 0 }
        calls[callsKey].tally ++
        calls[callsKey].time += delta

        return {
            is: is,
            key, 
            delta,
            depth: times.length,
            msg: '',
            stack: includeStack ? getCleanCallingStack().join('\n') : ''
        }
    }

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
        applySurrogate(obj, 'debounce', preFunc, (key, func, time) => {
            const obj = getPostFuncObj(is, 'debounce')
            debounceCalls[key] = debounceCalls[key] || { tally: 0, time: 0 }

            obj.msg = `function with '${key}' will be called in ${time}ms. Called ${debounceCalls[key]} times before`
            stack.push(obj)

            debounceCalls[key].tally ++
            debounceCalls[key].time = window.performance.now()

            tryPrint()
        }, function() {
            const key = arguments[0]
            const func = arguments[1]
            const time = arguments[2] || 0

            arguments[1] = () => {
                const delta = (window.performance.now() - debounceCalls[key].time).toFixed(3)
                const tally = debounceCalls[key].tally
                delete debounceCalls[key]

                preFunc()
                func.call(this)

                const obj = getPostFuncObj(is, `debounce('${key}')`)
                obj.msg = `debounce callback with '${key}' getting called after ${delta}ms after requesting ${time}ms. Called ${tally} times before firing`
                stack.push(obj)
                printStack()
            }

            return arguments
        })
    }

    // Override the async function so we can watch when
    // functions are called after being requested asynchronously
    const applyAsyncSurrogate = (is, obj) => {
        const applyCalls = new WeakMap()

        applySurrogate(obj, 'async', preFunc, (func, time) => {
            const obj = getPostFuncObj(is, 'async')
            applyCalls.set(func, window.performance.now())

            obj.msg = `async function will be called in ${time}ms`
            stack.push(obj)

            if (times.length === 0) printStack()
        }, function() {
            const func = arguments[0]
            const time = arguments[1] || 0

            arguments[0] = function() {
                const delta = (window.performance.now() - applyCalls.get(func)).toFixed(3)
                applyCalls.delete(func)

                preFunc()
                func.call(this)

                const obj = getPostFuncObj(is, `async callback`)
                obj.msg = `async function called after ${delta}ms after requesting ${time}ms`
                stack.push(obj)
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

            preFunc()
        }, () => {
            stack.push(getPostFuncObj(temp.is, 'created'))
            tryPrint()
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

            applySurrogate(temp, key, preFunc, () => {
                stack.push(getPostFuncObj(temp.is, key))
                tryPrint()
            })
        })
    }

    /* Intialization */
    const PolymerTrace = function(obj) {
        const scriptPath = getCallingPath()
        const elementName = obj.is
        console.log(scriptPath)
        if (
            (testRegex(PolymerTrace.debug.include, scriptPath, true) ||
            testRegex(PolymerTrace.debug.include, elementName, true)) &&

            !testRegex(PolymerTrace.debug.exclude, scriptPath, false) &&
            !testRegex(PolymerTrace.debug.exclude, elementName, false)
        ) {
            console.log(`applying to ${obj.is}`)
            applyDebug(obj)
        } else {
            console.log(`skipping ${obj.is}`)
        }

        return PolymerTrace.__proto__(...arguments)
    }

    // settings
    PolymerTrace.debug = {
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

    PolymerTrace.__proto__ = origPolymer
    window.Polymer = PolymerTrace

    // kick off background task of
    // collecting function calls
    flushCalls()
})()
