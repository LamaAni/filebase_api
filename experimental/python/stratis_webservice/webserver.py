import asyncio

from sanic import Sanic
from sanic.log import logger as sanic_logger
from sanic.log import access_logger as sanic_access_logger

from zcommon.shell import logger, style
from zcommon.textops import random_string
from zthreading.events import EventHandler, get_active_loop
from zthreading.tasks import Task
from filebase_api.webservice import FilebaseApi


class WebServer(EventHandler):
    _server_task: Task = None
    _sanic: Sanic = None
    _global_web_server: "WebServer" = None

    def __init__(
        self,
        root_path: str,
        port: int = 8080,
        host: str = "localhost",
        serve_path: str = "",
        server_id: str = None,
        on_event=None,
    ):
        super().__init__(on_event=on_event)
        self.server_id = server_id or f"{self.__class__.__name__}-{id(self)}"
        self.server_port = port
        self.server_host = host
        self.log_level = "WARNING"

        self._asyncio_server: asyncio.AbstractServer = None
        self._asyncio_server_task: asyncio.Task = None

        self._sanic = Sanic(self.server_id, configure_logging=False)

        self._filebaseapi_service = FilebaseApi(root_path)
        self._filebaseapi_service.register(self._sanic)

    @property
    def sanic(self) -> Sanic:
        """The sanic server"""
        return self._sanic

    @property
    def is_running(self):
        """True if the sanic server task is running"""
        return self._server_task is not None and self._server_task.is_running

    @property
    def uri(self):
        """The serve uri"""
        return f"http://{self.server_host}:{self.server_port}"

    def _web_server_task(self, register_sys_signals: bool = False):
        sanic_access_logger.setLevel(self.log_level)
        sanic_logger.setLevel(self.log_level)
        logger.info(f"Web server {style.GREEN(self.server_id)} is available @ {style.GREEN(self.uri)}")

        self._asyncio_server = self.sanic.create_server(
            host=self.server_host, port=self.server_port, return_asyncio_server=True
        )

        # change the event policy to asyncio
        asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())

        loop = get_active_loop()
        self._asyncio_server_task = loop.create_task(self._asyncio_server)

        # running the asyncio loop
        loop.run_forever()

        # self.sanic.run(host=self.server_host, port=self.server_port, register_sys_signals=register_sys_signals)
        logger.info(f"Web server {self.server_id} was stopped.")

    def start(self, run_async: bool = True) -> "WebServer":
        """Start the webserver if not started

        Args:
            run_async {bool} - if true, starts the server in a different thread.

        Returns:
            [type]: [description]
        """
        if self.is_running:
            return
        if not run_async:
            self._web_server_task(register_sys_signals=True)
        else:
            self._server_task = Task(
                action=lambda: self._web_server_task(),
                thread_name=f"WebServer-{self.server_id}-{random_string(4)}",
                use_async_loop=False,
            ).start()

        return self

    def stop(self, clean_stop_timeout: float = 0.5):
        """Stops the server if running

        Args:
            clean_stop_timeout (float, optional): If not none, will attempt to let the sanic server
            stop cleanly for x seconds. Defaults to 0.5 seconds.

        """
        if not self.is_running:
            return False
        self.sanic.stop()
        self._server_task.join(0.5)
        if self.is_running:
            logger.warning(
                f"Web server {self.server_id} did not cleanly stop within {clean_stop_timeout} seconds. "
                + f"Force stopping thread {self._server_task._action_thread.name} "
                + f"({self._server_task._action_thread.ident})"
            )
            return self._server_task.stop()

    def join(self, timeout: float = None):
        """Wait for the server task to complete.

        Args:
            timeout (float, optional): Throw error if over the timeout. Defaults to None.
        """
        if not self.is_running:
            raise Exception("Cannot join a non running  server")
        return self._server_task.join(timeout)

    @classmethod
    def start_global_web_server(
        cls, root_path: str, host: str = "localhost", port: int = 8080, throw_error_if_running: bool = False
    ):
        """A helper method. Start a server with the above default params.

        Args:
            root_path (str): The path to server root folder
            host (str, optional): The host. Defaults to "localhost".
            port (int, optional): The port. Defaults to 8080.
            throw_error_if_running (bool, optional): Throw an error if a global server 
            is already running. Defaults to False.

        Raises:
            Exception: [description]

        Returns:
            WebServer: the global webserver 
        """
        if throw_error_if_running:
            assert not cls.is_global_webserver_running(), Exception("The global web server is already running.")

        if cls.is_global_webserver_running():
            return cls._global_web_server

        server = (
            cls._global_web_server
            if hasattr(cls, "_global_web_server") and cls._global_web_server is not None
            else cls(root_path=root_path, host=host, server_id="global", port=port)
        )
        cls._global_web_server = server
        if not server.is_running:
            server.start(True)
        elif throw_error_if_running:
            raise Exception("Global server already running")
        return server

    @classmethod
    def is_global_webserver_running(cls):
        return cls._global_web_server is not None and cls._global_web_server.is_running
