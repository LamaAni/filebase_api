# Stratis file based webserver and API generator

### BETA

A file based web template engine for fast APIs and websites. This repo favors very low memory and cpu that is tailored for docker containers and kubernetes pods. Stratis can run parallel/sidecar with your application.

1. Command line server startup.
1. Templating.
1. Built-in REST API.
1. Built-in WebSocket API.
1. Built-in Sessions (etcd/cookie).
1. Built-in OAuth2 and user permissions (Including websocket)
1. Live update (triggered by file changes).
1. Client side (browser) javascript api.
1. Binary distributions.

Implemented in,

1. NodeJS, with EJS backend and the express.js webserver.

See more info about planned language implementations [below](#future-implementation).

# TL;DR

On the server, if we have,

1. /www/index.html - Html EJS template.
1. /www/index.code.js - The API methods and templating objects for index.html.
1. /www/relative.html - Html EJS template.

Run command (using the cli) :

```shell
stratis /www
```

Or in code [example](examples/basic/stratis.test.js)

The page html definition `index.html`,

```html
<head>
  <%- render_stratis_script_tag() %>
  <script lang="javascript">
    stratis.print_x_plus_2({x: 40}).then(val => console.log(val))
    stratis.y().then(val => console.log(val))
  </script>
</head>
<body>
  <%- print_x_plus_2(40) %> <%- y %> <%- await include('./relative.html') %>
</body>
```

The page code api methods `index.code.js`,

```javascript
async function print_x_plus_2({ x }, context) {
  return x + 2
}

module.exports = {
  print_x_plus_2,
  y: 33,
}
```

`*.code.js` are always **private**.

To call the index.html api with REST,

```url
GET http://[my_domain]/index.html/my_api_function?arg1=...&arg2=...
```

```url
POST http://[my_domain]/index.html/my_api_function
payload: { "arg": "value" }
```

# Client-Side html page structure

If you add on the server-side html template (page),

```html
<head>
  <%- render_stratis_script_tag('stratis') %>
  <script lang="javascript">
    stratis.print_x_plus_2({x: 40}).then(val => console.log(val))
    stratis.y().then(val => console.log(val))
  </script>
</head>
<body>
  <%- print_x_plus_2(40) %> <%- y %> <%- await include('./relative.html') %>
</body>
```

A javascript object named `stratis` will be created in the client browser, that includes all the exposed page api function as defined in `[filepath].code.js`. See below website structure.

Note: you can change the name of the api object to whatever you like. Otherwise,

1. In main pages the default is `stratis`
1. On **included** templates the default is the `[filename]` of the template.

# Server website structure

Stratis uses file paths and extensions to specify application behavior (see Access control rules below). e.g.,

- `/public/index.html` or `/index.public.html` would be public files since they match the public path specifier.
- `/private/index.html` or `/index.private.html` would be private files since they match the private path specifier
- `/secure/index.html` or `/index.secure.html` would be secure files since they match
  the secure path specifier (Will trigger security_provider if defined).
- `/public/index.code.js` would be an api code file for html since it ends in `.code.js`
- `/public/my_api` would be an api description, it would only be available if a matching `.code.js` file is found
- `/public/my_api.code.js` would be an api code file for `my_api` since it ends in `.code.js`

## Access control

**public** files can be downloaded.
`*.code.js` files are **always** private.

Files that match the regex,

```regexp
([^\w]|^)(private|public|secure)([^\w]|$)
```

would be public, private or secure respectively, following,

1. If `private` appears the file/path is private.
1. Else if `secure` appears the file/path is secure.
1. Else if `public` appears the file/path is public.

### Access control defaults

All files are by default public unless the folder `[serve_path]/public` exists, then all files are by default private unless under the folder `public`.

## Pages (rendered templates)

Page files are rendered as templates if downloaded, and can have attached page code, remote methods and a rest api. Files with path `[filepath].[ext]` are considered page files if,

1. Match the extension: `.htm`, `.html`, `.css`, `.json`, `.yaml`
1. There exists a file named `[filepath without ext].code.js`.

Page files are rendered as templates using the `ejs` template engine.

## Code files

Code files define the methods/ejs objects/configuration of the page. A file will be a code file if its path ends with, `.code.js`. Where,

1. Code files are always **private**.
1. Code files match a page file with the same filename, e.g, the code file, `index.code.js` will match `index.html` and `index.htm`.

A example of a basic code file,

```javascript
async function print_server_date_with_prefix({ sent_from_client }, context) {
  // return value must json complient.
  return `${sent_from_client}, server date: ${new Date()}`
}

let api_static_info = {
  loaded_at: new Date(),
}

module.exports = {
  api_static_info,
  print_server_date_with_prefix,
}
```

And `context` is of type [StratisPageCallContext](src/webserver/pages.js). Some of its properties,

```javascript
{
  req: {}, // the http (express) request object.
  res: {}, // the http (express) response object.
  session: {}, // the http session.
  websocket: {}, // the stratis api websocket (if called through a websocket)
  ...
}
```

The above code file will expose,

1. A method called `print_server_date_with_prefix` that would be available in the browser or under `[page_url]/print_server_date_with_prefix`
1. An object (will be printed as json or string) that would be available in the browser or under `[page_url]/api_static_info`

## REST API calls

Code file methods are exposed as REST api, where both the payload and query string is parsed as the method
arguments. To call a page api,

```url
http(s)://mydomain.com/[filepath.ext]/[api_exposed_method_or_function]?arg1=..&arg2=...
```

Where the method first argument is the merge result of the dictionaries,

1. `query-string` - the dictionary of arguments.
1. `request payload` - If content type is not defined or content type includes the word 'json', parse as json args. Otherwise assume input stream in request. Websocket request are always json.

**NOTE!** See file upload example [here](examples/advanced/public/index.code.js).

## WebSocket API calls

Code files methods are exposed as WebSocket api. You can connect a websocket to the page api via,

```url
ws(s)://mydomain.com/[filepath.ext]
```

Where the WebSocket payload is,

```json
{
  "rid": "[the request id]",
  "name": "[the function or object name]",
  "args": {
    "send_from_client": "value"
  }
}
```

You cannot send files through the websocket api. Use the REST API instead (see above).

## Built in API methods

The following methods will be available on all pages, through the api or while rendering the template.

1. `render_stratis_script()` - renders the stratis script for browsers (Native)
1. `render_stratis_api_yaml_description()` - renders the stratis api description as yaml
1. `render_stratis_api_json_description()` - renders the stratis api description as json

## Built in EJS template objects

Template objects (Overridable),

1. `session` - The session = `req.session` if exists otherwise an empty dictionary.
1. `req` - the http request.
1. `res` - the http response.
1. `context` - `StratisPageCallContext`, holds information about the stratis render.

# Contribution

Feel free to ping me in issues or directly on LinkedIn to contribute.

# Future implementation

Implementing the stratis low-impact webserver and allowing multiple language code files (e.g. `code.py` or `code.go`) would very helpful for dockerized (or pod running) micros-services and processing jobs; it may provide an easy way to generate an interface for monitoring and interacting with running containers or allow web interfaces to be created for visual monitoring, with little to no impact on the required resources.

Looking for help on this subject.

# Licence

Copyright ©
`Zav Shotan` and other [contributors](graphs/contributors).
It is free software, released under the MIT licence, and may be redistributed under the terms specified in `LICENSE`.
