import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.skipif(shutil.which("docker") is None, reason="Docker Compose is unavailable")
def test_production_compose_strips_quotes_from_credentials(tmp_path: Path) -> None:
    env_file = tmp_path / "crm.env"
    env_file.write_text(
        "FQ_CRM_PASSWORDS='admin:synthetic-only'\nFQ_CRM_ADMINS=admin\n",
        encoding="utf-8",
    )
    env = os.environ.copy()
    env.update(
        {
            "CRM_ENV_FILE": str(env_file),
            "CRM_DATA_ROOT": str(tmp_path / "data"),
            "SHOP_DATA_SOURCE": str(tmp_path / "shop"),
            "MEMBER_DATA_SOURCE": str(tmp_path / "member"),
        }
    )

    rendered = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            "docker-compose.yml",
            "-f",
            "deploy/wsl/compose.production.yml",
            "config",
            "--format",
            "json",
        ],
        cwd=REPO_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert rendered.returncode == 0, rendered.stderr
    backend_env = json.loads(rendered.stdout)["services"]["backend"]["environment"]
    assert backend_env["FQ_CRM_PASSWORDS"] == "admin:synthetic-only"
