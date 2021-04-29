# Stratis file based webserver and API generator

A simple web template engine for fast APIs and websites. Very low memory and cpu print that fits docker and kubernetes pods, or can run parallel to your application.

1. Fast html template with either Jinja (Python) or EJS (NodeJs).
1. Command line server startup.
1. Built-in REST API.
1. Build-in Websocket API.
1. NodeJS implementation (using [express.js](https://expressjs.com/)).
1. Python implementation (using [sanic] (https://github.com/sanic-org/sanic)).
1. Live update for changes in the file contents.

# ALPHA

### WARNING

This project is undergoing structural changes and should be used with care.

# TL;DR

Example of a NodeJS implementation; on the server we define.

1. index.html - Html EJS template to be compiled and run on client.
2. index.code.js - The API code for index.html, exposed to the client.

<table>
<tr>
<td>index.html
</td>
<td>index.code.js
</td>
</tr>
<tr>
  <td>

```html
<html>
  <head>
    <!-- EJS template, render the stratis tag -->
    <%- render_stratis_script_tag() %>
    <script lang="javascript">
      // stratis object added to browser, with
      // auto generated attached API calls.
      stratis.test_remote_call(40).then(val => {
          document.getElementById("content_box").innerHTML=val
      })
    </script>
  </head>
  <body>
    <div id="content_box">
      <!-- will show 42 after client responds -->
    </div>
  </body>
</html>
```

</td>
  <td>

```javascript
async function test_remote_call(x, req, rsp) {
  return x + 2
}

module.exports = {
  test_remote_call: test_remote_call,
}
```

  </td>
<tr>
</table>

Or when using REST,

```url
http://[my_domain]/index.html?API=v1&x=40
```

Notice, `*.code.js` in NodeJS or `*.code.py` in python are unauthorized to all callers.

# Core principles

1. Uses file extensions to determine the role of each file in the webserver.
1. Serves a folder, and exposes all of the files in the folder to web requests.
1. The file extension `[filename].code.[js or py]` represents code files.
1. Configurable file extensions represent template files. eg. `.html`

### Types of files

1. code files - file that expose python or node functions to `REST API`, `JS API` or `Websocket API` requests.
1. template files - templated sources. All template files can be imported into one another.

### Default file extensions and behaviors

1. `html`, `htm`, `.html`, `.htm`, `.xhtml`, `.js`, `.css` , `.API.yaml`, `.API.json` - files to read as templates (either Jinja in python or EJS in NodeJS)
1. [filepath].code.js - Code files in NodeJS
1. [filepath].code.py - Code files in Python

You can access the API for any of the template files via, 
```ini
[src-uri][file-sub-path]?api=v1&arg0=&arg1=
```

NOTE: the `.API.yaml` and `.API.json` are intended to provide an human/machine readable API definition that can be exposed to the outside world. These are not auto generated, and must be written. You can use the internal method, `render_stratis_API_description` to auto generate it. e.g.

`my_API.API.yaml`

```yaml
<%- render_stratis_API_description(true) %>
```

### Operation and object types

A list of operation and object types that can be defined in a code-file.

1. `API_METHOD` - A method that is exposed as an API call. In browser, a method will appear in the javascript code under `startis.[method name](...args)`. See section about API calls.
1. `PUSH_NOTIFICATION` - A method, available only when connecting through a websocket, that will send a push notification to the remote websocket. See section about API calls.
1. `TEMPLATE_ARG` - An argument, that will be available when rendering the template.
1. `REQUEST_HANDLER` - A request handler, that is called before the execution of the stratis API, with `(requet,response,next)=>{}`. If next function is called the API, and any following request handlers are skipped.

### Built in

Template objects (Overrideable),

1. `session` - The session = `req.session` if exists otherwise an empty dictionary.
1. `req` - the http request object.
1. `res` - the http response object.

Appended to request(Cannot be overridden)

1. `req.stratis` - the stratis API.
1. `req.stratis_info` - the stratis API parsed request info.
1. `req.stratis_env` - the stratis API rendered environment.

Methods (Cannot be overridden),

1. `render_stratis_script_tag()` - renders the stratis build in script tag for browser use.
1. `render_stratis_script()` - renders the stratis script for browsers.
1. `render_stratis_API_description(as_yaml=true)` - renders the stratis API description as yaml or json. For javascript, in strict

# Using the browser side auto generated `stratis` class

In the html template, at the head tag, (use `{{}}` for python jinja) (following is EJS)

```html
<html>
  <head>
    <%- render_stratis_script_tag() %>
    <script lang="javascript">
      stratis.my_remote_method("a value")
    </script>
  </head>
  <body></body>
</html>
```

# API specifications

There are two types of API calls.

1. Http requests [`GET`, `DELETE`, `PUT`, `POST`, `PATCH`] - both the body and search params are parsed to arguments and content. Search params will override arguments in body.
1. Websocket requests - The websocket message is the body.

### API body structure

```json
{
  "rid" : null,
  "call": "[method name]",
  "args": []
}
["char(30) = ▲"]["binary payload"]
```

Where, `rid` is the request random id, used by websocket connections to return the function response and `char(30)` is the record separator char.

When a payload exists, it is attached to the request object as `req.payload`.
##### WARNING! The JSON body cannot have the record separator char. That would produce a read error.

### REST request API call structure

When sending an http request call,

```ini
[url]?api=[API_version]&call=[method name]&arg0=[val]&arg1=[val]...
```

Where the body will be parsed as call arguments.

### Websocket connections

The websocket call is the same as the call to the filepath with an `Upgrade=websocket` header. i.e. To reach the API @ "/index.html" from a browser,

```javascript
const ws = new WebSocket('/index.html')
```

# Contribution

Feel free to ping me in issues or directly on LinkedIn to contribute.

# Licence

Copyright ©
`Zav Shotan` and other [contributors](graphs/contributors).
It is free software, released under the MIT licence, and may be redistributed under the terms specified in `LICENSE`.
