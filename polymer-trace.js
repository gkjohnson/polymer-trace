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

        get tallyCalls() {
            return Polymer.debug ? Polymer.debug.tallyCalls && Polymer.debug.enable : false
        },

        // Returns the color associated with thecolor setting
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
    // Manager of the polymer function stack
    // stack is kept as a tree of nodes
    const stackTracer = (function() {
        let curr = null
        const stack = []
        const calls = {}

        // pushes an item on to the stack
        const _push = item => {
            if(curr) curr.children.push(item)
            curr = item
            stack.push(item)
        }

        // pops a layer off of the stack
        const _pop = () => {
            const obj = stack.pop()
            curr = stack[stack.length - 1] || null
            return obj
        }

        // tallys the amount of times the given
        // function (key) has been called
        const _tallyCall = (key, deltaTime) => {
            calls[key] = calls[key] || { tally: 0, time: 0 }
            calls[key].tally ++
            calls[key].time += deltaTime
        }

        // Marks the beginning of a stack
        // Should be matched with _stackEnd
        const _stackBegin = (is, key) => {
            // Throw the call on the stack
            const includeStack = settings.includeStack && stack.length === 0
            const obj = {
                is,
                key,
                startTime: window.performance.now(),
                delta: -1,
                msg: '',
                stack: includeStack ? util.getCleanCallingStack().join('\n') : '',
                children: []
            }

            _push(obj)
        }

        // Marks the end of a stack call
        const _stackEnd = (options) => {
            const item = _pop()
            const delta = window.performance.now() - item.startTime
            const obj = Object.assign(item, { delta }, options)

            _tallyCall(`${item.is}.${item.key}`, delta)

            if (stack.length === 0) _printItem(obj)
        }

        // Prints the given item as a collapsible group with
        // its children
        const _printItem = item => {
            if (!settings.enabled) return
            const threshold = settings.threshold
            const delta = item.delta.toFixed(3)
            const asGroup = item.children.length !== 0 || item.stack
            const doPrint = delta > threshold

            const colors = [settings.getColor('light'), settings.getColor('dark'), settings.getColor('highlight'), settings.getColor('dark')]

            if(doPrint) {
                let groupText = `%c${item.is}.%c${item.key}`
                groupText += util.pad(' ', 60 - groupText.length) + `%c${delta}ms`
                groupText += util.pad(' ', 80 - groupText.length) + `%c${item.msg}`
                if(asGroup) {
                    console.groupCollapsed(groupText, ...colors)

                    if (item.stack) {
                        console.groupCollapsed('%cstack', settings.getColor('highlight'))
                        console.log(`%c${item.stack}`, settings.getColor('highlight'))
                        console.groupEnd()
                    }

                    item.children.forEach(c => _printItem(c))

                    console.groupEnd()
                } else {
                    console.log(groupText, ...colors)
                }
            }
        }

        // Prints out function calls that happened over the last frame
        const _flushCalls = () => {
            const doTallyCalls = settings.tallyCalls
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
                    if (doTallyCalls) {
                        console.groupCollapsed(`${arr.length} function calls intercepted last frame`)
                    }
                    arr.forEach(i => {
                        const key = i.key
                        const delta = i.time.toFixed(3)
                        const tally = i.tally
                        let log = '%c' + key.replace('.', '%c.')
                        log += util.pad(' ', 50 - log.length) + `%ccalled %c${tally} times for a total of %c${delta}ms`

                        if (doTallyCalls) {
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

    /* Surrogate Function Application */
    // Returns a surrogate function that, when called,
    // will call the function 'cb' with the given
    // functions and the expected args
    const getSurrogate = (origFunc, cb, is, key) => {
        cb = cb || function(func, args) {
            stackTracer.begin(is, key)
            func(...args)
            stackTracer.end()
        }

        return function() {
            let res = null
            let called = 0

            cb.call(this, (function() {
                called++
                res = origFunc.call(this, ...arguments)
            }).bind(this), arguments)

            if (called > 1) throw new Error('Function called too many times')
            if (called < 1) throw new Error('Function called too few times')

            return res
        }
    }

    // Adds a basic surrogate function to the given object
    // with "this" bound appropriately
    const applySurrogate = (obj, key, cb) => {
        if (!(key in obj) || !(obj[key] instanceof Function)) return

        const origFunc = obj[key]
        const newFunc = getSurrogate(origFunc, cb, obj.is, key)

        obj[key] = function() {
            const res = newFunc.call(this, ...arguments)
            return res
        }
    }

    // override the debounce function so we can time the callback
    const applyDebounceSurrogate = (is, obj) => {
        const debounceCalls = {}
        applySurrogate(obj, 'debounce', function(func, args) {
            const key = args[0]

            // track the debounce tally
            debounceCalls[key] = debounceCalls[key] || { tally: 0, time: 0 }
            debounceCalls[key].tally ++
            debounceCalls[key].time = window.performance.now()

            // preprocess the arguments
            const time = args[2] || 0
            args[1] = getSurrogate(args[1], dbcb => {
                const delta = (window.performance.now() - debounceCalls[key].time).toFixed(3)
                const tally = debounceCalls[key].tally

                stackTracer.begin(is, `debounce('${key}')`)
                dbcb.call(this)
                stackTracer.end({
                    msg: `debounce callback with '${key}' getting called after ${delta}ms after requesting ${time}ms. Called ${tally} times before firing`
                })
            })

            // call the functions
            stackTracer.begin(is, 'debounce')
            func(...args)
            stackTracer.end({
                msg: `function with '${key}' will be called in ${time}ms. Called ${debounceCalls[key].tally} times before`
            })
        })
    }

    // Override the async function so we can watch when
    // functions are called after being requested asynchronously
    const applyAsyncSurrogate = (is, obj) => {
        const applyCalls = new WeakMap()

        applySurrogate(obj, 'async', function(func, args) {
            const time = args[1] || 0

            args[0] = getSurrogate(args[0], cb => {
                const delta = (window.performance.now() - applyCalls.get(func)).toFixed(3)
                applyCalls.delete(func)

                stackTracer.begin(is, 'async callback')
                cb.call(this)
                stackTracer.end({ msg: `async function called after ${delta}ms after requesting ${time}ms` })
            })

            stackTracer.begin(is, 'async')
            func(...args)
            stackTracer.end({ msg: `async function will be called in ${time}ms` })

        })
    }

    // wraps the addEventListener Function
    const applyAddEventListener = (is, obj) => {
        applySurrogate(obj, 'addEventListener', function(func, args) {
            const evname = args[0]
            
            args[1] = getSurrogate(args[1], function(func, args) {
                func.call(this, ...args)
            })

            stackTracer.begin(is, 'addEventListener')
            func(...args)
            stackTracer.end()
        })
    }

    // Applies the debutg logic to the particular Polymer Template
    const applyDebug = temp => {

        applySurrogate(temp, 'created', function(func, args) {
            applyDebounceSurrogate(temp.is, this)
            applyAsyncSurrogate(temp.is, this)
            applyAddEventListener(temp.is, this)

            stackTracer.begin(temp.is, 'created')
            func(...args)
            stackTracer.end()
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

            applySurrogate(temp, key)
        })
    }

    /* Intialization */
    // Hijack the original polymer functions
    Polymer.dom.flush = getSurrogate(Polymer.dom.flush, func => {
        stackTracer.begin('Polymer.dom', 'flush')
        func()
        stackTracer.end()
    })

    const PolymerTrace = function(obj) {
        const scriptPath = util.getCallingPath()
        const elementName = obj.is
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

    const origPolymer = Polymer
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
    tallyCalls: true,

    colors: {
        light: '#90A4AE',
        dark: '#37474F',
        highlight: '#E91E63'
    }
}