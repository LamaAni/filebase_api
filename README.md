# Stratis file based webserver and api generator

A simple web template engine for fast apis and websites. Very low memory and cpu print that fits docker and kubernetes pods, or can run parallel to your application.

1. Fast html template with either Jinja (Python) or EJS (NodeJs).
1. Command line server startup.
1. Built-in REST api.
1. Build-in Websocket api.
1. NodeJS implementation (using [express.js](https://expressjs.com/)).
1. Python implementation (using [sanic] (https://github.com/sanic-org/sanic)).
1. Live update for changes in the file contents.

# ALPHA

### WARNING

This project is undergoing structural changes and should be used with care.

# Core principle of operation

1. Uses file extensions to determine the role of each file in the webserver.
1. Serves a folder, and exposes all of the files in the folder to web requests.
1. The file extension `[filename].code.[js or py]` represents code files.
1. Configurable file extensions represent template files. eg. `.html`

### Types of files

1. code files - file that expose python or node functions to `REST API`, `JS API` or `Websocket API` requests.
1. template files - templated sources. All template files can be imported into one another.

### Default file extensions and behaviors

1. `html`, `htm`, `.html`, `.htm`, `.xhtml`, `.js`, `.css` - files to read as templates (either Jinja in python or EJS in NodeJS)
1. [filename].code.js - Code files in NodeJS
1. [filename].code.js - Code files in Python

# Contribution

Feel free to ping me in issues or directly on LinkedIn to contribute.

# Licence

Copyright ©
`Zav Shotan` and other [contributors](https://github.com/LamaAni/postgres-xl-helm/graphs/contributors).
It is free software, released under the MIT licence, and may be redistributed under the terms specified in `LICENSE`.
