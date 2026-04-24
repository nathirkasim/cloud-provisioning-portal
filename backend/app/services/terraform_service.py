import subprocess
import json
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

TERRAFORM_DIR = Path(__file__).parent.parent.parent / "terraform"

def run_terraform_command(command: list, cwd: str = None) -> dict:
    """Run a terraform command and return stdout, stderr, return code."""
    try:
        result = subprocess.run(
            command,
            cwd=cwd or str(TERRAFORM_DIR),
            capture_output=True,
            text=True,
            timeout=300
        )
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e), "returncode": -1}

def prepare_workspace(ticket_number: str):
    """Ensure a dedicated workspace exists for the ticket and select it."""
    run_terraform_command(["terraform", "workspace", "new", ticket_number])
    run_terraform_command(["terraform", "workspace", "select", ticket_number])

def provision_environment(ticket_number: str, template_type: str, environment_name: str, owner_email: str, duration_days: int, department: str = "General", db_password: str = None) -> dict:
    """Run terraform apply for a ticket — provisions real infrastructure."""

    prepare_workspace(ticket_number)

    vars = [
        f"-var=template_type={template_type}",
        f"-var=environment_name={environment_name}",
        f"-var=ticket_number={ticket_number}",
        f"-var=owner_email={owner_email}",
        f"-var=duration_days={duration_days}",
    ]

    if template_type == "database":
        if not db_password:
            import secrets
            db_password = secrets.token_urlsafe(16)
        vars.append(f"-var=db_password={db_password}")

    logger.info("Starting provisioning for %s in its own workspace", ticket_number)
    result = run_terraform_command(
        ["terraform", "apply", "-auto-approve"] + vars
    )

    if not result["success"]:
        logger.error("Apply failed for %s: %s", ticket_number, result["stderr"])
        return {"success": False, "error": result["stderr"]}

    output_result = run_terraform_command(["terraform", "output", "-json"])
    outputs = {}
    if output_result["success"] and output_result["stdout"].strip():
        try:
            raw = json.loads(output_result["stdout"])
            outputs = {k: v.get("value") for k, v in raw.items() if v.get("value")}
        except json.JSONDecodeError:
            pass

    return {"success": True, "outputs": outputs, "ticket_number": ticket_number}

def destroy_environment(ticket_number: str, template_type: str, environment_name: str, owner_email: str, duration_days: int) -> dict:
    """Run terraform destroy for a ticket — tears down infrastructure."""

    prepare_workspace(ticket_number)

    vars = [
        f"-var=template_type={template_type}",
        f"-var=environment_name={environment_name}",
        f"-var=ticket_number={ticket_number}",
        f"-var=owner_email={owner_email}",
        f"-var=duration_days={duration_days}",
    ]

    logger.info("Starting destroy for %s", ticket_number)
    result = run_terraform_command(
        ["terraform", "destroy", "-auto-approve"] + vars
    )

    if not result["success"]:
        logger.error("Destroy failed for %s: %s", ticket_number, result["stderr"])
        return {"success": False, "error": result["stderr"]}

    run_terraform_command(["terraform", "workspace", "select", "default"])
    run_terraform_command(["terraform", "workspace", "delete", ticket_number])

    logger.info("Destroy complete for %s", ticket_number)
    return {"success": True, "ticket_number": ticket_number}
