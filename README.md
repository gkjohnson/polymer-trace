# polymer-trace
A debugging library that can be grafted onto any page with Polymer Elements to expose all the functions being called on Polymer elements over the course of its lifetime

Surrogate functions are created that wrap the ones defined on registered Polymer elements, as well as for the following built in Polymer functions:
- `async`
- `debounce`
- `addEventListener`

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
  
  // Threshold in ms under which messages are not printed
  threshold: 1,
  
  // Whether or not to include a full call stack in the 
  // print messages. Disabling improves performance
  includeStack: true,
  
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
- Add option to automatically create observers for properties and validate their type with `joi`
- Wrap more built in Polymer functions
  - `listen`
- If `includeStack` is enabled but the time threshold isn't long enough to display or it's a child, don't include it to improve perf
- Figure out how to wrap getter/setter functions
- Track down bugs related to wrapping some of the paper elements
