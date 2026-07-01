from app.utils.file_utils import create_job_workspace, safe_slug, unique_path


def test_safe_slug_normalizes_text():
    assert safe_slug(" My Video: Test! ") == "my-video-test"
    assert safe_slug("...") == "video"


def test_unique_path_adds_counter(tmp_path):
    first = unique_path(tmp_path, "Clip", ".mp4")
    first.write_text("x")
    second = unique_path(tmp_path, "Clip", ".mp4")
    assert second.name == "clip-2.mp4"


def test_create_job_workspace(tmp_path):
    workspace = create_job_workspace(tmp_path, "job 1")
    assert workspace.exists()
    assert workspace.name == "job-1"
