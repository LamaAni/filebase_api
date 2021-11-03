# Stratis file based webserver and API generator

### BETA

A file based web template engine for fast APIs and websites. This repo favors very low memory and cpu that is tailored for docker containers and kubernetes pods, that can run parallel/sidecar with your application.

1. Command line server startup.
2. Built-in REST API.
3. Build-in WebSocket API.
4. Live update (triggered by file changes).

Implemented in,

1. NodeJS, with EJS backend and the express.js webserver.

See more info about planned language implementations [below](#future-implementation).

# TL;DR

On the server, if we have,

1. /www/index.html - Html EJS template to be compiled and run on client.
2. /www/index.code.js - The API methods and templating objects for index.html.

Run command (using the cli):

```shell
stratis /www
```

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
      stratis.test_remote_call({x: 40}).then(val => {
          document.getElementById("content_box").innerHTML=val
      })
    </script>
  </head>
  <body>
    <div><%- div_text %></div>
    <div id="content_box">
      <!-- will show 42 after client responds -->
    </div>
  </body>
</html>
```

</td>
  <td>

```javascript
async function test_remote_call({ x }, req, res) {
  return x + 2
}

module.exports = {
  test_remote_call: test_remote_call,
  div_text: 'text to show in div', // can also be an object.
}
```

  </td>
<tr>
</table>

`*.code.js` are always **private**. To call the index.html api with REST,

```url
GET http://[my_domain]/index.html/my_api_function?arg1=...&arg2=...
```

```url
POST http://[my_domain]/index.html/my_api_function
payload: { "arg": "value" }
```

On POST the payload is mapped to the first value of the function, and json parsing is attempted.

# Server website structure

Stratis uses files paths and extensions to specify application behavior. e.g.,

- `/public/index.html` or `/lama.public.html` would be public files since they match
  the public path specifier.
- `/public/v1/api.js` would be an api code file, since it ends in `api.js`

## Access control

**public** files can be downloaded.
`*.code.js` files are always private.

Files that match the regex,

```regexp
[^\w](private|public)([^\w]|$)
```

would be public or private respectively. The regex can match multiple times. If a path matched `private` once it would be private.

### Access control defaults

All files are by default public unless the folder `[serve_path]/public` exists. This value can also be set via the command line interface.

## Pages (rendered templates)

Page files are rendered as templates if downloaded, and can have attached page code, remote methods and a rest api. Files with path `[filepath].[ext]` are considered page files if,

1. Match the ext: `html`, `htm`, `.html`, `.htm`, `.js`, `.css`
1. There exists a file named `[filepath].code.js`

Page files are rendered as templates using the `ejs` template engine.

## Code files

Code files define the methods/ejs objects/configuration of the page. A file will be a code file if its path ends with, `.code.js`. Where,

1. Code files are always **private**.
1. Code files match a page file with the same filename, e.g, the code file, `index.code.js` will match `index.html` and `index.htm`.

A example basic code file,

```javascript
async function called_from_client({ send_from_client }, context) {
  // return value must json complient.
  return `${sent_from_client}, server date: ${new Date()}`
}

let my_render_object = {
  loaded_at: new Date(),
}

module.exports = {
  // will be available during rendering.
  my_render_object,
  // will be available as client method.
  called_from_client,
}
```

## REST API calls

Code file methods are exposed as REST api, where both the payload and query string is parsed as the method
arguments. To call a page api,

```url
http(s)://mydomain.com/[filepath.ext]/[function_name]?arg1=..&arg2=...
```

Where the method first argument is the merge result of the dictionaries,

1. `query-string` - the dictionary of arguments.
1. `payload`:
   1. If the header `CONTENT_TYPE="application/json"`, parse to json dictionary and merge with previous.
   1. If anything else, then added as the key 'payload'.

And `context` is:

```javascript
{
  req: {}, // the http (express) request object.
  res: {}, // the http (express) response object.
  session: {}, // the http session.
  stratis: {}, // the stratis api.
}
```

## WebSocket API calls

Code files methods are exposed as WebSocket api. You can connect a websocket to the page api via,

```url
ws(s)://mydomain.com/[filepath.ext]
```

Where the WebSocket payload is,

```json
{
  "rid": "[the request id]",
  "invoke": "[the function name]",
  "args": {
    "send_from_client": "value"
  }
}
```

where the `args` are mapped to the first argument of the function, and `context` is,

```javascript
{
  ws: {}, // The websocket
  session: {}, // The http session.
  stratis: {}, // the stratis api.
}

```

## Built in API methods

The following methods will be available on all pages, through the api or while rendering the template.

1. `render_stratis_script()` - renders the stratis script for browsers (Native)
1. `render_stratis_api_yaml_description()` - renders the stratis api description as yaml
1. `render_stratis_api_json_description()` - renders the stratis api description as json

## Built in EJS template objects

Template objects (Overrideable),

1. `session` - The session = `req.session` if exists otherwise an empty dictionary.
2. `req` - the http request
3. `res` - the http response

Appended to request(Cannot be overridden)

1. `req.stratis` - the stratis API object.
1. `req.stratis_info` - the stratis API parsed request info (Native).
1. `req.stratis_env` - the stratis API rendered environment (Native).

# Contribution

Feel free to ping me in issues or directly on LinkedIn to contribute.

# Future implementation

Implementing the stratis low-impact webserver in multiple languages may prove
very helpful for dockerized (or pod running) micros-services and processing jobs; it may provide an easy way to
generate an interface for monitoring and interacting with running containers or allow
web interfaces to be created for visual monitoring, with little to no impact on the required resources.

## Currently under consideration

1. Python, using Jinja as template backend. This would prove very helpful for data science processing.
2. Go, using go templates as template backend. May prove helpful to monitor kubernetes services.

That said, other languages may be considered.

# Licence

Copyright ©
`Zav Shotan` and other [contributors](graphs/contributors).
It is free software, released under the MIT licence, and may be redistributed under the terms specified in `LICENSE`.
