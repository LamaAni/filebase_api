#!/usr/bin/env python3

import logging
from zcommon.shell import logger
from zcommon.fs import relative_abspath
from filebase_api import WebServer

logger.setLevel(logging.DEBUG)
logger.info("Starting global server...")
global_server = WebServer.start_global_web_server(relative_abspath("."))
logger.info("Started.")
global_server.join()
