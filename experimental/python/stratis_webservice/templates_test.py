import pytest
from filebase_api import templates


def test_render_time_vars():
    TEMPALTE = """{{my_var}}"""

    service = templates.FilebaseTemplateService()
    assert service.render_template(TEMPALTE, my_var="test") == "test"


if __name__ == "__main__":
    pytest.main(["-x", __file__])
