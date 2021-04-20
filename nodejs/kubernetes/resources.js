class KubeResourceKind {
  constructor(
    name,
    api_version,
    {
      name, //: str,
      api_version, //: str,
      parse_kind_state, //: Callable = None,
      auto_include_in_watch, //: bool = True,
    }
  ) {}
}

module.exports = {
  KubeResourceKind,
}
