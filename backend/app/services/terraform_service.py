import subprocess
import json
import os
from pathlib import Path

TERRAFORM_DIR = Path(__file__).parent.parent.parent / "terraform"

def run_terraform_command(command: list, cwd: str = None) -> dict:
    """Run a terraform command and return stdout, stderr, return code."""
    try:
        result = subprocess.run(
            command,
            cwd=cwd or str(TERRAFORM_DIR),
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "stdout": "",
            "stderr": "Terraform command timed out after 5 minutes",
            "returncode": -1
        }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "returncode": -1
        }

def provision_environment(ticket_number: str, template_type: str, environment_name: str, owner_email: str, duration_days: int, department: str = "Engineering", db_password: str = "Portal@123") -> dict:
    """Run terraform apply for a ticket — provisions real infrastructure."""

    vars = [
        f"-var=template_type={template_type}",
        f"-var=environment_name={environment_name}",
        f"-var=ticket_number={ticket_number}",
        f"-var=owner_email={owner_email}",
        f"-var=duration_days={duration_days}",
    ]

    if template_type == "database":
        vars.append(f"-var=db_password={db_password}")

    # Run terraform apply
    print(f"[TERRAFORM] Starting provisioning for {ticket_number}...")
    result = run_terraform_command(
        ["terraform", "apply", "-auto-approve"] + vars
    )

    if not result["success"]:
        print(f"[TERRAFORM] Apply failed for {ticket_number}: {result['stderr']}")
        return {"success": False, "error": result["stderr"]}

    print(f"[TERRAFORM] Apply complete for {ticket_number}")

    # Get outputs
    output_result = run_terraform_command(
        ["terraform", "output", "-json"]
    )

    outputs = {}
    if output_result["success"] and output_result["stdout"].strip():
        try:
            raw = json.loads(output_result["stdout"])
            outputs = {k: v.get("value") for k, v in raw.items() if v.get("value")}
        except json.JSONDecodeError:
            pass

    return {
        "success": True,
        "outputs": outputs,
        "ticket_number": ticket_number
    }

def destroy_environment(ticket_number: str, template_type: str, environment_name: str, owner_email: str, duration_days: int) -> dict:
    """Run terraform destroy for a ticket — tears down infrastructure."""

    vars = [
        f"-var=template_type={template_type}",
        f"-var=environment_name={environment_name}",
        f"-var=ticket_number={ticket_number}",
        f"-var=owner_email={owner_email}",
        f"-var=duration_days={duration_days}",
    ]

    print(f"[TERRAFORM] Starting destroy for {ticket_number}...")
    result = run_terraform_command(
        ["terraform", "destroy", "-auto-approve"] + vars
    )

    if not result["success"]:
        print(f"[TERRAFORM] Destroy failed for {ticket_number}: {result['stderr']}")
        return {"success": False, "error": result["stderr"]}

    print(f"[TERRAFORM] Destroy complete for {ticket_number}")
    return {"success": True, "ticket_number": ticket_number}
