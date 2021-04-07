import inspect
from types import ModuleType
from typing import List, Dict, Callable
from enum import Enum

from sanic.websocket import WebSocketConnection
from sanic.request import Request

from match_pattern import Pattern
from zcommon.textops import create_unique_string_id
from zcommon.fs import load_config_files_from_path, relative_abspath
from zcommon.modules import try_load_module_dynamic_with_timestamp
from zcommon.textops import json_dump_with_types
from zcommon.collections import SerializableDict
from zthreading.events import AsyncEventHandler

FILEBASE_API_REMOTE_METHOD_MARKER_ATTRIB_NAME = "__filebase_api_remote_method"
FILEBASE_API_REMOTE_METHOD_MARKER_CONFIG_ATTRIB_NAME = FILEBASE_API_REMOTE_METHOD_MARKER_ATTRIB_NAME + "_config"
FILEBASE_API_WEBSOCKET_MARKER = "__filebase_api_websocket"
FILEBASE_API_CORE_ROUTES_MARKER = "__filebase_api_core"
FILEBASE_API_REMOTE_METHODS_COLLECTION_MARKER = "__filebase_api_websocket_methods.js"
FILEBASE_API_PAGE_TYPE_MARKER = "__filebase_pt"


class FilebaseTemplateServiceConfig(SerializableDict):
    def __init__(self, **kwargs):
        super().__init__()
        self.update(kwargs)

    def load_from_path(self, src_path: str, pattern: Pattern = None):
        """Loads a configuration from path into the current object.
        """
        self.update(load_config_files_from_path(src_path, pattern or "filebase.yaml|filebase.yml|filebase.json"))

    @classmethod
    def load_config_from_path(cls, src_path: str, pattern: Pattern = None, **kwargs):
        """Loads the configuration from a path and creates a new config object.
        """
        val = cls(**kwargs)
        val.load_config_from_path(src_path, pattern)
        return val

    @classmethod
    def _parse_pattern(cls, pattern, default_pattern: str = "*") -> Pattern:
        """Internal, parse a string to pattern.
        Returns:
            Pattern: [description]
        """
        pattern = pattern or default_pattern
        if pattern is None:
            return None

        return Pattern(pattern)

    @property
    def jinja_files(self) -> Pattern:
        """The pattern to match files that require jinja templeting.
        """
        return self._parse_pattern(self.get("jinja_files", None))

    @jinja_files.setter
    def jinja_files(self, val: Pattern):
        """Sets the pattern to match files that require jinja templeting.
        """
        self["jinja_files"] = str(val)

    @property
    def macros_subpath(self) -> str:
        """The suboath to the macros directory.
        """
        return self.get("macros_subpath", "macros")

    @macros_subpath.setter
    def macros_subpath(self, val: str):
        """The suboath to the macros directory.
        """
        self["macros_subpath"] = val

    @property
    def macro_files_pattern(self) -> Pattern:
        """The pattern to match files that are macro files.
        """
        return self._parse_pattern(self.get("macro_files_pattern", None))

    @macro_files_pattern.setter
    def macro_files_pattern(self, val: Pattern):
        """The pattern to match files that are macro files.
        """
        self["macro_files_pattern"] = str(val)

    @property
    def src_subpath(self) -> str:
        """The subpath to the template source directory.
        """
        val = self.get("src_subpath", "public").strip()
        if len(val) > 0:
            return val
        return None

    @src_subpath.setter
    def src_subpath(self, val: str):
        """The subpath to the template source directory.
        """
        self["src_subpath"] = val

    def save(self, config_path):
        """Save this configuration to file.
        """
        raise NotImplementedError()


class FilebaseApiConfigMimeTypes(SerializableDict):
    def __init__(self, **kwargs):
        """A dictionary of file types to mime types.
        """
        super().__init__()

        init_types = {
            "*.html": "text/html",
            "*.csv": "text/csv",
            "*.css": "text/css",
            "*.js": "text/javascript",
            "*.zip|*.rar|*.gzip|*.tar|*.tar.gz": "application/zip",
            "*.apng": "image/apng",
            "*.bmp": "image/bmp",
            "*.gif": "image/gif",
            "*.ico|*.cur": "image/x-icon",
            "*.jpg|*.jpeg,": "image/jpeg",
            "*.png": "image/png",
            "*.svg": "image/svg+xml",
            "*.tif, .tiff": "image/tiff",
            "*.webp": "image/webp",
        }

        init_types.update(kwargs)

        self.update(init_types)

    def match_mime_type(self, src: str):
        """Match the mime type file pattern to the mime type.

        Args:
            src (str): [description]

        Returns:
            [type]: [description]
        """
        for key in self.keys():
            if Pattern.test(key, src):
                return self[key]
        return "text/plain"


class FilebaseApiConfig(FilebaseTemplateServiceConfig):
    @property
    def index_files(self) -> List[str]:
        """A list of index files to search for in the root directory"""
        return self.get("index_files", ["index.html", "index.htm"])

    @index_files.setter
    def index_files(self, val: List[str]):
        self["index_files"] = val

    @property
    def mime_types(self) -> FilebaseApiConfigMimeTypes:
        """The collection of mime types to file patterns"""
        mime_types = self.get("mime_types", {})
        if not isinstance(mime_types, FilebaseApiConfigMimeTypes):
            mime_types = FilebaseApiConfigMimeTypes(**mime_types)
            self["mime_types"] = mime_types
        return mime_types

    @property
    def jinja_files(self) -> Pattern:
        """The pattern to match files that require jinja templeting.
        """
        return self._parse_pattern(self.get("jinja_files", "*.htm?|*.css"))

    @jinja_files.setter
    def jinja_files(self, val: Pattern):
        self["jinja_files"] = str(val)

    @property
    def public_files(self) -> Pattern:
        """The pattern to match files which are public.
        """
        return self._parse_pattern(self.get("public_files", None))

    @public_files.setter
    def public_files(self, val: Pattern):
        self["public_files"] = str(val)

    @property
    def private_files(self) -> Pattern:
        """The pattern to match files which are private. Defaults to *.py.
        """
        return self._parse_pattern(self.get("private_files", "*,py"))

    @private_files.setter
    def private_files(self, val: Pattern):
        self["private_files"] = str(val)

    # -----
    @property
    def private_path_marker(self) -> Pattern:
        """The pattern to match files which are forced private by file name. Defaults to "*.private.*"
        """
        return self._parse_pattern(self.get("private_path_marker", "*.private.*"))

    @private_path_marker.setter
    def private_path_marker(self, val: Pattern):
        self["private_path_marker"] = str(val)

    @property
    def public_path_marker(self) -> Pattern:
        """The pattern to match files which are forced public by file name. Defaults to "*.public.*"
        """
        return self._parse_pattern(self.get("public_path_marker", "*.public.*"))

    @public_path_marker.setter
    def public_path_marker(self, val: Pattern):
        self["public_path_marker"] = str(val)

    @property
    def module_file_marker(self) -> Pattern:
        """The pattern to match websocket code files (module files)"
        """
        return self.get("module_file_marker", ".code.py")

    @module_file_marker.setter
    def module_file_marker(self, val: Pattern):
        self["module_file_marker"] = val

    def is_private(self, path: str) -> bool:
        """Helper, check if a path is private.
        """
        return self.private_files.test(path)

    def is_public(self, path: str) -> bool:
        """Helper, check if a path is public.
        """
        return self.public_files.test(path)

    def is_remote_access_allowed(self, path: str):
        """Helper, check if remote access is allowed for this file.
        """
        return self.public_path_marker.test(path) or self.is_public(path) and not self.is_private(path)


class FilebaseApiRemoteMethodConfig(SerializableDict):
    @property
    def expose_js_method(self) -> bool:
        return self.get("expose_js_method", True)


class FilebaseApiCoreRoutes(SerializableDict):
    def __init__(self):
        super().__init__()
        self.load_core_object("filebase_api_client.js")

    def load_core_object(self, src):
        fullpath = relative_abspath(src)
        with open(fullpath, "r") as raw:
            self[src] = Pattern.format(
                raw.read(),
                custom_start_pattern="{!%",
                custom_end_pattern="%!}",
                FILEBASE_API_CORE_ROUTES_MARKER=FILEBASE_API_CORE_ROUTES_MARKER,
                FILEBASE_API_WEBSOCKET_MARKER=FILEBASE_API_WEBSOCKET_MARKER,
                FILEBASE_API_REMOTE_METHODS_COLLECTION_MARKER=FILEBASE_API_REMOTE_METHODS_COLLECTION_MARKER,
                FILEBASE_API_PAGE_TYPE_MARKER=FILEBASE_API_PAGE_TYPE_MARKER,
            )


class FilebaseApiWebSocket(AsyncEventHandler):
    def __init__(self, websocket: WebSocketConnection, on_event=None):
        super().__init__(on_event=on_event)
        self.websocket = websocket
        self.register_handler_events = True

    async def send(self, messge, as_json=False):
        if self.websocket.closed is True:
            return
        if as_json:
            messge = json_dump_with_types(messge)
        try:
            await self.websocket.send(str(messge))
        except Exception:
            pass

    async def send_event(self, name: str, *args, **kwargs):
        await self.send({"__event_name": name, "args": args, "dis": kwargs}, True)


class FilebaseApiModuleInfo:
    def __init__(self, module: ModuleType):
        super().__init__()

        # The associated code module.
        self._module = module
        self._websocket_command_functions: dict = None
        self._websocket_javascript_command_functions: dict = None

    @property
    def module(self) -> ModuleType:
        return self._module

    @property
    def websocket_command_functions(self) -> Dict[str, Callable]:
        """A collection of command functions to be exposed.
        """
        if self._websocket_command_functions is None:
            self._websocket_command_functions = dict()

            for cmnd_name in dir(self.module):
                cmnd = self.get_module_command_handler(cmnd_name)
                if cmnd is not None:
                    self._websocket_command_functions[cmnd_name] = cmnd

        return self._websocket_command_functions

    @property
    def websocket_javascript_command_functions(self) -> Dict[str, str]:
        """A collection of javascript functions to be printed on the client page javascript"""

        if self._websocket_javascript_command_functions is None:
            self._websocket_javascript_command_functions = dict()
            for name in self.websocket_command_functions.keys():
                if name.startswith("on_"):
                    continue
                config = self.get_module_command_handler_config(name) or FilebaseApiRemoteMethodConfig()
                if not config.expose_js_method:
                    continue
                signature = inspect.signature(self.websocket_command_functions[name])
                args = []
                input_args = []
                for arg_name in list(signature.parameters.keys())[1:]:
                    if signature.parameters[arg_name].default != inspect._empty:
                        input_args.append(arg_name + "=null")
                    else:
                        input_args.append(arg_name)
                    args.append(arg_name)
                js_code = f"""
async function fapi_{name}({','.join(input_args)}) {{
    return (await filebase_api.exec({{
        {name}:[{','.join(args)}]
    }})).{name}
}}
"""
                self._websocket_javascript_command_functions[name] = js_code.strip()

        return self._websocket_javascript_command_functions

    def get_module_command_handler(self, name: str) -> Callable:
        """Returns a command handler for the module by the name.

        Args:
            name (str): The command name

        Returns:
            Callable: The callable function. (page, ...)
        """
        if self.module is None:
            return
        cmnd = getattr(self.module, name, None)
        if cmnd is None or not (callable(cmnd) and hasattr(cmnd, FILEBASE_API_REMOTE_METHOD_MARKER_ATTRIB_NAME)):
            return None
        return cmnd

    def get_module_command_handler_config(self, name: str):
        """Returns the config of the command handler for the module by the name.

        Args:
            name (str): The command name
        """
        handler = self.get_module_command_handler(name)
        if handler is None or not hasattr(handler, FILEBASE_API_REMOTE_METHOD_MARKER_CONFIG_ATTRIB_NAME):
            return None

        return getattr(handler, FILEBASE_API_REMOTE_METHOD_MARKER_CONFIG_ATTRIB_NAME)

    @classmethod
    def load_from_path(cls, module_path: str) -> "FilebaseApiModuleInfo":
        """Loads a module from a module path.

        Returns:
            FilebaseApiModuleInfo
        """
        module = try_load_module_dynamic_with_timestamp(module_path)
        if module is None:
            return None

        if not hasattr(module, "__filebase_api_module_info"):
            # thread blocking command
            module.__filebase_api_module_info = cls(module)

        return module.__filebase_api_module_info


class FilebaseApiPage(AsyncEventHandler, dict):
    __inproc_cache: Dict[str, "FilebaseApiPage"] = dict()
    expose_client_js_bindings: bool = True

    def __init__(
        self,
        api: "FilebaseApi",  # noqa: F821
        sub_path: str,
        module_info: FilebaseApiModuleInfo,
        request: Request,
        page_id: str = None,
    ):
        """A page object, associate with the current executing websocket or page render.

        Args:
            api (FilebaseApi): The filebase api.
            module_info (FilebaseApiModuleInfo): The associated module (code)
            request (Request): The sanic request.
            page_id (str, optional): The page id. Defaults to None.
        """
        super().__init__(on_event=None)
        self._page_id = page_id or f"{sub_path}-{create_unique_string_id()}"
        self._api = api
        self._request = request
        self._sub_path = sub_path
        self._ws: FilebaseApiWebSocket = None
        self._bind_events = dict()
        self._ws_command_functions = None
        self._module_info = module_info

    def __hash__(self):
        return self.page_id.__hash__()

    @property
    def page_id(self) -> str:
        """The page id
        """
        return self._page_id

    @property
    def request(self) -> Request:
        """The sanic request
        """
        return self._request

    @property
    def api(self) -> "FilebaseApi":  # noqa: F821
        """The assciated filebase api.
        """
        return self._api

    @property
    def sub_path(self) -> str:
        """The public route subpath (if any)
        """
        return self._sub_path

    @property
    def websocket(self) -> FilebaseApiWebSocket:
        """The associated websocket if this is a websocket call (if any)
        """
        return self._ws

    @property
    def is_websocket_state(self) -> bool:
        """True if this is a websocket call.
        """
        return self.websocket is not None

    @property
    def module_info(self) -> FilebaseApiModuleInfo:
        """The code module information and value.
        """
        return self._module_info

    @property
    def has_code_module(self) -> bool:
        """If true has a code module.
        """
        return self.module_info is not None

    @property
    def websocket_command_functions(self) -> Dict[str, Callable]:
        """The associated list of all command functons in the code module.
        """
        return self.module_info.websocket_command_functions

    @property
    def websocket_javascript_command_functions(self) -> Dict[str, str]:
        """The associated collection of client side js
        functions that match the command functions
        """
        return self.module_info.websocket_javascript_command_functions

    def register_event_if_exists(self, name: str, event_handler: AsyncEventHandler):
        """Registers a new event for the command handlers in the modules, if the handler exists.

        Args:
            name (str): the event name (load,) ....
            event_handler (AsyncEventHandler): The event handler.
        """
        handler = self.module_info.get_module_command_handler("on_" + name)
        if handler is None:
            return
        event_handler.on(name, handler)

    def bind_event(self, name: str, skip_args_list: bool = False):
        """Binds events between client and server. An event on the server will
        be triggered also on the client (webpage)

        Args:
            name (str): the event to bind.
            skip_args_list (bool, optional): If true event arguments are not passed. Defaults to False.
        """
        assert self.is_websocket_state, Exception("Cannot bind events in non websocket state. See is_websocket_state")

        if isinstance(name, Enum):
            name = str(name)

        assert isinstance(name, str), ValueError("The event name must be a string or enum.")

        self._bind_events[name] = skip_args_list

    def clear_bound_event(self, name: str):
        """Removes a bound event. see bind_events
        """
        assert self.is_websocket_state, Exception("Cannot bind events in non websocket state. See is_websocket_state")

        if isinstance(name, Enum):
            name = str(name)

        assert isinstance(name, str), ValueError("The event name must be a string or enum.")

        if name in self._bind_events:
            del self._bind_events[name]

    async def emit(self, name: str, *args, **kwargs):
        """Emmits a new event, bound events are also transmitted to the client (browser js).

        Args:
            name (str): The event name
        """
        rt_value = await super().emit(name, *args, **kwargs)
        if self.websocket is not None and name in self._bind_events:
            if self._bind_events[name]:
                args = []
                kwargs = {}
            await self.websocket.send_event(name, *args, **kwargs)
        return rt_value
