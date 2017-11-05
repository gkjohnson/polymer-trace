# polymer-trace

[![npm version](https://badge.fury.io/js/%40gkjohnson%2Fpolymer-trace.svg)](https://www.npmjs.com/package/@gkjohnson/polymer-trace)

A debugging library that can be grafted onto any page with Polymer Elements to expose all the functions being called on Polymer elements over the course of its lifetime

Surrogate functions are created that wrap the ones defined on registered Polymer elements, as well as for the following built in Polymer functions:
- `async`
- `debounce`
- `addEventListener`
- `Polymer.dom.flush`

## Use
#### Loading it
Include the `polymer-trace.js` or `polymer-trace.html` file at the top of the page before any other elements have loaded:
```html
<link rel="import" href=".../polymer-trace.html"/>
```
```html
<script type="text/javascript" src="polymer-trace.js"></script>
```

These should be removed before deployment

#### Run time
Polymer-Trace will print out a collapsible polymer function call stack with timing, as well as tallys of functions called over the last frame

![example](/docs/example.png)

#### Property Type Validation
Property values are automatically validated against their types when they are set

For more robust value validation, an additional functiona parameter `isValid` can be added to a property definition, which takes the set value and type of the property, and should return `true` or `false` to indicate whether ot not the value is valid

#### Settings
Settings for Polymer-Trace live on `Polymer.debug` and can be used to control the verbosity of the print statements. All settings can be changed during run time.

```javascript
/* Settings */
{
  // Whether or not to print the stack traces
  enable: true,
  
  // Array of regex or strings used to test whether or not the 
  // registration of an element should have the debugger applied
  // Both the element name and script path are checked
  include: [/.*/g],
  exclude: [/\/node_modules\//, /\/bower_components\//],
  
  // Whether or not to capture the traces from Polymer functions
  printTrace: true,
  
  // Threshold in ms under which messages are not printed
  threshold: 1,
  
  // Whether or not to include a full call stack in the 
  // print messages. Disabling improves performance
  includeStack: true,
  
  // Whether or not to print out the tally of different
  // function calls over the last frame
  tallyCalls: true,
  
  // Whether or not to consume log functions including 'log', 'error',
  // 'warning', 'groupCollased', 'group', 'groupEnd', 'dir', 'time', 'timeEnd'
  // to be wrapped up into the stack trace
  consumeLogs: true,
   
  // Whether or not to print out type validation for Polymer properties
  validateProperties: true,
    
  // Colors to for printing
  colors: {
    light: '#90A4AE',
    dark: '#37474F',
    highlight: '#E91E63'
  }
}
```

## Gotchas
- 'Getter' functions can get called prematurely when being registered because we iterate over all keys to check if something is a function
- There is added overhead of tracking and printing function calls that should be kept in mind. Polymer-Trace is meant for coarse timing and understanding which functions are getting called when

## TODOs
- Traverse Polymer Behaviors so more function calls can be exposed
- Wrap more built in Polymer functions
  - `listen`
- If `includeStack` is enabled but the time threshold isn't long enough to display or it's a child, don't include it to improve perf
- Figure out how to wrap getter/setter functions
- Track down bugs related to wrapping some of the paper elements
- Polymer 2.x support
- temporarily wrap functions like `requestAnimationFrame` or `setInterval` so we can see the impact
