from streamlit.testing.v1 import AppTest

from ontology_agent.config import ROOT


def test_streamlit_app_renders_sample_without_agent_call():
    app = AppTest.from_file(str(ROOT / "streamlit_app.py")).run(timeout=10)

    assert not app.exception
    markdown = "\n".join(element.value for element in app.markdown)
    assert "Export readiness" in markdown
    assert "Pension Scheme" in markdown
    assert "greater than 0" in markdown
    assert "Ontology chat" in markdown
    assert len(app.text_area) == 1
