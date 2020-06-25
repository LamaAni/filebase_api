import jinja2
import os

from typing import Dict, Callable
from jinja2.runtime import Macro

from zcommon.fs import relative_abspath, is_relative_path
from match_pattern import Pattern
from filebase_api.helpers import FilebaseTemplateServiceConfig


class FilebaseTemplateServiceException(Exception):
    pass


class FilebaseTemplateService(object):
    _macros: Dict[str, Macro] = None

    def __init__(
        self,
        root_path: str = None,
        on_event=None,
        load_config: bool = True,
        load_environment: bool = True,
        load_jinja_macros: bool = True,
        config: FilebaseTemplateServiceConfig = None,
    ):
        """Creates a template generation service, that has a predefined
        macro folder.

        Args:
            root_path (str, optional): The root path for the template engine, if None will
            use the current path of the caller. Defaults to None.
            on_event ([type], optional): [description]. Defaults to None.
            load_config (bool, optional): If true, loads configurations from the path. Defaults to True.
            load_environment (bool, optional): If true loads environment variables from the path. Defaults to True.
            load_jinja_macros (bool, optional): If true loads the jinja macros from the path. Defaults to True.
            config (FilebaseTemplateServiceConfig, optional): The configuration. Defaults to None.
        """
        root_path = root_path or relative_abspath(call_stack_offset=2)

        assert isinstance(root_path, str), ValueError("root_path must be a string")
        root_path = os.path.abspath(root_path)
        assert os.path.isdir(root_path), ValueError(
            "root_path must point to a path. Dose not exist or not a directory: " + root_path
        )

        self.root_path = root_path
        self._config = (
            config
            if isinstance(config, FilebaseTemplateServiceConfig)
            else FilebaseTemplateServiceConfig(**(config or {}))
        )
        if load_config:
            self._config.load_from_path(root_path)

        self._template_loader = jinja2.DictLoader({})
        self._jinja_environment: jinja2.Environment = jinja2.Environment(loader=self._template_loader)

        if load_environment:
            self.load_environment()

    @property
    def config(self) -> FilebaseTemplateServiceConfig:
        """The template service config.
        """
        return self._config

    @property
    def globals(self):
        """The jinja env globals.
        """
        return self.jinja_environment.globals

    @property
    def template_loader(self) -> jinja2.DictLoader:
        """The jinja env dict loader.
        """
        return self._template_loader

    @property
    def jinja_environment(self) -> jinja2.Environment:
        """The jinja env.
        """
        return self._jinja_environment

    def resolve_path(self, src: str) -> str:
        """Resolves an a jinja template relative path to an absolute path.
        """
        if is_relative_path(src) and self.config.src_subpath is not None:
            src = os.path.join(self.config.src_subpath, src)
        return relative_abspath(src, root_path=self.root_path)

    def import_file(self, file_path, as_jinja_template: bool = None):
        """Import a file from within one jinja template into another.

        Args:
            file_path (str): the path (relative) to import from.
            as_jinja_template (bool, optional): If true, this file will be processes as
                a jinja template. Defaults to None.

        Returns:
            str: The jinja template result.
        """
        fpath = self.resolve_path(file_path)
        assert os.path.isfile(fpath), ValueError(f"import file path dose not exist or is not a file @ {fpath}")
        if as_jinja_template is None:
            as_jinja_template = self.config.jinja_files.test(fpath)

        if as_jinja_template:
            return self.render_file(fpath)
        else:
            file_text = None
            with open(fpath, "R") as raw:
                file_text = raw.read()
            return file_text

    def attach_method(self, m: Callable = None, name: str = None):
        """Attach a method to the jinja globals.

        Args:
            m (Callable, optional): The method. Defaults to None.
            name (str, optional): The name to give the attached method. Defaults to to the method name.
        """
        name = name or m.__name__
        self.globals[name] = m

    def _load_globals(self):
        self.attach_method(self.import_file)
        self.attach_method(self.resolve_path)

    def load_environment(self):
        """Clears the current globals and loads the environment dependencies
        (macros and other config)
        """
        self.globals.clear()

        self._load_globals()

        src_path = os.path.abspath(os.path.join(self.root_path, self.config.macros_subpath))
        if os.path.isdir(src_path):
            macro_files = self.config.macro_files_pattern.scan_path(
                src_path, include_directories=False, include_files=True
            )

            for f in macro_files:
                with open(f, "r") as raw:
                    macro_text = raw.read()
                    template = self.jinja_environment.from_string(macro_text)
                # parsing the template macros.
                module = template.module

                for name in dir(module):
                    macro: Macro = getattr(module, name)
                    if not isinstance(macro, Macro):
                        continue

                    assert macro.name not in self.globals, FilebaseTemplateServiceException(
                        "A macro/variable with the same name exists in both"
                        + f" {self.globals[macro.name].__module__} and {module}"
                    )

                    self.globals[macro.name] = macro

    @classmethod
    def __compose_template_key(cls, template: str, name: str):
        return f"{cls.__name__}:{name or hash(template)}"

    @classmethod
    def __get_file_key(cls, src):
        changed_ts = os.path.getmtime(src)
        return cls.__compose_template_key(None, f"{src}@{changed_ts}")

    def __get_template_from_code(self, template: str, name: str):
        template_key = self.__compose_template_key(template, name)

        if template_key not in self._template_loader.mapping:
            self._template_loader.mapping[template_key] = template

        return self.jinja_environment.get_template(template_key)

    def _get_file_render_template(self, src: str):
        src = self.resolve_path(src)
        file_key = self.__get_file_key(src)

        if file_key in self._template_loader.mapping:
            return self.jinja_environment.get_template(file_key)

        code = ""
        with open(src, "r") as raw:
            code = raw.read()

        template = self.__get_template_from_code(code, file_key)

        return template

    def render_template(self, template: str, *args, name: str = None, **kwargs) -> str:
        """Render a template

        Args:
            template (str): The template to use
            name (str, optional): The global name of the template, if None uses the template
            hash value. Defaults to None.

        Returns:
            str: The rendered template.
        """
        template = self.__get_template_from_code(template, name)
        return template.render(*args, name=name, **kwargs)

    async def render_template_async(self, template: str, *args, name: str = None, **kwargs):
        """Render a template asyncronically.

        Args:
            template (str): The template to use
            name (str, optional): The global name of the template, if None uses the template
            hash value. Defaults to None.

        Returns:
            str: The rendered template.
        """
        template = self.__get_template_from_code(template, name)
        return await template.render_async(*args, name=name, **kwargs)

    def render_file(self, src: str, *args, **kwargs):
        """Render a file as template

        Args:
            src (str): The template file to use
            hash value. Defaults to None.

        Returns:
            str: The rendered template.
        """
        return self._get_file_render_template(src).render(*args, **kwargs)

    async def render_file_async(self, src: str, *args, **kwargs):
        """Render a file as template asynchronically.

        Args:
            src (str): The template file to use
            hash value. Defaults to None.

        Returns:
            str: The rendered template.
        """
        # dose async render is not supported in python 3.7. Therefore using regular render.
        return (self._get_file_render_template(src)).render(*args, **kwargs)
