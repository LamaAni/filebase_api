import os
import json
import traceback
import inspect
import asyncio
import jinja2
import sanic.response as response

from weakref import WeakSet
from typing import Set

from sanic import Sanic
from sanic.request import Request
from sanic.websocket import WebSocketConnection, ConnectionClosed
from sanic.exceptions import SanicException
from sanic.exceptions import NotFound, ServerError
from concurrent.futures import CancelledError

from zcommon.shell import logger
from zcommon.fs import strip_path_extension
from zcommon.textops import json_dump_with_types
from zthreading.events import AsyncEventHandler

from filebase_api.helpers import (
    FilebaseApiModuleInfo,
    FilebaseApiConfig,
    FilebaseApiWebSocket,
    FilebaseApiPage,
    FilebaseApiCoreRoutes,
    FILEBASE_API_CORE_ROUTES_MARKER,
    FILEBASE_API_WEBSOCKET_MARKER,
    FILEBASE_API_API_METHODS_COLLECTION_MARKER,
    FILEBASE_API_PAGE_TYPE_MARKER,
)

from filebase_api.templates import FilebaseTemplateService


class FilebaseApi(FilebaseTemplateService, AsyncEventHandler):
    _active_pages: WeakSet = None

    def __init__(
        self,
        root_path: str,
        uri: str = "",
        name: str = "",
        config: FilebaseApiConfig = None,
        load_config_from_directory: bool = True,
    ):
        """Creates a webapi service that servers files and websocket enabled files.

        Args:
            root_path (str): The root path for the service.
            uri (str, optional): The host base uri (added before the filebase api uris). Defaults to "".
            name (str, optional): The service name. Defaults to "".
            config (FilebaseApiConfig, optional): the service config. Defaults to None.
            load_config_from_directory (bool, optional): If true, load configurations from the
            service directory. Defaults to True.
        """
        config = config if isinstance(config, FilebaseApiConfig) else FilebaseApiConfig(**(config or {}))
        AsyncEventHandler.__init__(self)
        super().__init__(root_path, config=config)

        self._uri = uri.strip().strip("/")
        self._name = name
        self._active_pages = WeakSet()
        self._core_routes = FilebaseApiCoreRoutes()

    @property
    def config(self) -> FilebaseApiConfig:
        """The config"""
        return super().config

    @property
    def core_routes(self) -> FilebaseApiCoreRoutes:
        """The service core routes"""
        return self._core_routes

    @property
    def active_pages(self) -> Set[FilebaseApiWebSocket]:
        """The currently active pages in memory (weak ref set)"""
        return self._active_pages

    @jinja2.contextfunction
    def _print_filebase_api_scripts(self, context):
        scripts = self.core_routes.keys()

        def make_script(filepath: str, info: str = None):
            return '<script language="javascript" ' + f'src="/{FILEBASE_API_CORE_ROUTES_MARKER}/{filepath}"></script>'

        scripts = [make_script(filepath) for filepath in scripts]
        return "\n".join(scripts)

    def _load_globals(self):
        super()._load_globals()
        self.attach_method(self._print_filebase_api_scripts, "filebase_api")

    def _load_module_info_from_subpath(self, sub_path: str) -> FilebaseApiModuleInfo:
        if sub_path is None:
            return None

        sub_path = sub_path.strip().lstrip("/")

        if not sub_path.endswith(self.config.module_file_marker):
            file_path = self.resolve_path(strip_path_extension(sub_path) + self.config.module_file_marker)
        else:
            if not self.config.is_remote_access_allowed(sub_path):
                return None

            file_path = self.resolve_path(sub_path)

        if not os.path.isfile(file_path):
            return None

        # loading the websocket commands
        return FilebaseApiModuleInfo.load_from_path(file_path)

    def _get_page_from_request(self, rqst: Request, sub_path: str = None):
        sub_path = dict(rqst.query_args).get(FILEBASE_API_PAGE_TYPE_MARKER) or sub_path
        if sub_path is None:
            return None
        return FilebaseApiPage(self, sub_path, self._load_module_info_from_subpath(sub_path), rqst)

    async def _process_filebase_request(self, rqst: Request, sub_path: str = None):
        page = self._get_page_from_request(rqst, sub_path)
        rsp = await self._process_filebase_page(page, sub_path)
        return rsp

    async def _process_filebase_page(self, page: FilebaseApiPage, sub_path: str) -> response.HTTPResponse:
        if page is None:
            for index_path in self.config.index_files:
                if os.path.exists(self.resolve_path(index_path)):
                    return response.redirect(index_path)
            raise NotFound("Not found or blocked uri")

        if sub_path.startswith(FILEBASE_API_CORE_ROUTES_MARKER + "/"):
            sub_path = sub_path[len(FILEBASE_API_CORE_ROUTES_MARKER + "/") :]  # noqa: 203
            mime_type = self.config.mime_types.match_mime_type(sub_path)

            core_route_raw = None

            if sub_path == FILEBASE_API_API_METHODS_COLLECTION_MARKER:
                core_route_raw = (
                    "\n".join(page.websocket_javascript_command_functions.values())
                    if page.has_code_module and page.expose_client_js_bindings
                    else "// no available bindings"
                )
            elif sub_path in self._core_routes:
                core_route_raw = self._core_routes[sub_path]

            if core_route_raw is None:
                raise NotFound("Core route not found")
            return response.text(core_route_raw, content_type=mime_type)

        file_path = self.resolve_path(sub_path)
        mime_type = self.config.mime_types.match_mime_type(file_path)

        if (
            not os.path.isfile(file_path)
            or self.config.private_path_marker.test(sub_path)
            or not self.config.is_remote_access_allowed(sub_path)
        ):
            raise NotFound("Not found or blocked uri")

        if page.has_code_module and "on_load" in page.websocket_command_functions:
            page.websocket_command_functions.get("on_load")(page)

        # regular files.
        if not self.config.jinja_files.test(file_path):
            return await response.file(file_path, mime_type=mime_type)

        return response.text(self.render_file(file_path, page=page), content_type=mime_type)

    async def _process_websocket_request(self, rqst: Request, websocket: WebSocketConnection):
        page = None
        ws = None
        try:
            ws = FilebaseApiWebSocket(websocket)
            page = self._get_page_from_request(rqst, None)

            if not page.has_code_module:
                raise NotFound("Websocket unavailable")

            page._ws = ws

            async def process_command(page: FilebaseApiPage, data):
                command_id = ""
                try:
                    data = json.loads(data)
                    assert isinstance(data, dict), ValueError("A websocket command must use json to communicate")

                    possible_commands = []
                    valid_commands = dict()

                    for command_name in data.keys():
                        if command_name == "__command_id":
                            command_id = data[command_name]
                            continue
                        possible_commands.append(command_name)

                    for command_name in possible_commands:
                        assert command_name in page.websocket_command_functions, Exception(
                            "Command not found: " + command_name
                        )
                        args = []
                        if not isinstance(data[command_name], (dict, list)):
                            if data[command_name] is not None:
                                args = [data[command_name]]
                        else:
                            args = data[command_name]
                        valid_commands[command_name] = args

                    rsp = dict()

                    for command_name in valid_commands:
                        command = page.websocket_command_functions[command_name]
                        args = valid_commands[command_name]
                        kwargs = {}

                        if isinstance(args, dict):
                            kwargs = args
                            args = []

                        if inspect.iscoroutinefunction(command):
                            rslt = await command(page, *args, **kwargs)
                        else:
                            rslt = command(page, *args, **kwargs)

                        rsp[command_name] = rslt

                    rsp["__command_id"] = command_id

                    await ws.send(json_dump_with_types(rsp))
                except Exception as ex:
                    await self.emit("websocket_error", ex)
                    await ws.send(json_dump_with_types({"__error": str(ex), "__command_id": command_id}))
                    traceback.print_exception(type(ex), ex, ex.__traceback__)
                    logger.error(str(ex))

            if page.has_code_module and "on_ws_open" in page.websocket_command_functions:
                on_ws_open = page.websocket_command_functions["on_ws_open"]
                if inspect.iscoroutinefunction(on_ws_open):
                    await on_ws_open(page)
                else:
                    on_ws_open(page)

            if ws.register_handler_events:
                page.register_event_if_exists("message", page)
                page.register_event_if_exists("close", page)

            page.on("message", process_command)
            page.pipe(ws)

            self._active_pages.add(page)

            while True:
                data = None
                try:
                    data = await websocket.recv()
                except ConnectionClosed:
                    break
                except asyncio.CancelledError:
                    break
                except CancelledError:
                    break
                except Exception as ex:
                    # Close by server
                    await page.emit("close", page)
                    raise ex

                if data is None:
                    # completed. Needs closing...
                    break
                await page.emit("message", page, data)

        except Exception as ex:
            traceback.print_exc()
            logger.error(ex)
            if page is not None:
                await page.emit("error", ex)
            elif ws is not None:
                await ws.emit("error", ex)
            raise ex
        finally:
            if ws is not None:
                del ws
            if page is not None:
                del page

    def register(self, sanic: Sanic):
        """Register this service to a sanic server.

        Args:
            sanic (Sanic): The sanic server.
        """
        async def invoke_websocket(*args, **kwargs):
            return await self._process_websocket_request(*args, **kwargs)

        async def invoke_request(*args, **kwargs):
            try:
                rsp = await self._process_filebase_request(*args, **kwargs)
            except asyncio.CancelledError:
                return response.empty()
            except SanicException as ex:
                raise ex
            except Exception as ex:
                logger.error(ex)
                raise ServerError("Internal server error")
            return rsp

        sanic.add_websocket_route(invoke_websocket, uri="/" + FILEBASE_API_WEBSOCKET_MARKER)

        for uri in [self._uri, self._uri + "/<sub_path:" + r"/?.+" + ">"]:
            common_uri = "/" + uri.strip().strip("/")
            sanic.add_route(invoke_request, uri=common_uri, methods=["GET", "HEAD"])
