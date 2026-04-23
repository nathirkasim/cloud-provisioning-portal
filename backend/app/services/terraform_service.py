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
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e), "returncode": -1}

def prepare_workspace(ticket_number: str):
    """Ensure a dedicated workspace exists for the ticket and select it."""
    # Create the workspace (ignores error if it already exists)
    run_terraform_command(["terraform", "workspace", "new", ticket_number])
    # Select the specific workspace for this ticket
    run_terraform_command(["terraform", "workspace", "select", ticket_number])

def provision_environment(ticket_number: str, template_type: str, environment_name: str, owner_email: str, duration_days: int, department: str = "General", db_password: str = None) -> dict:

    """Run terraform apply for a ticket — provisions real infrastructure."""
    
    # Switch to ticket-specific workspace to isolate state 
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

    print(f"[TERRAFORM] Starting provisioning for {ticket_number} in its own workspace...")
    result = run_terraform_command(
        ["terraform", "apply", "-auto-approve"] + vars
    )

    if not result["success"]:
        print(f"[TERRAFORM] Apply failed for {ticket_number}: {result['stderr']}")
        return {"success": False, "error": result["stderr"]}

    # Get outputs for this specific workspace
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
    
    # Ensure we are in the correct workspace before destroying
    prepare_workspace(ticket_number)

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

    # Clean up: switch back to default and remove the ticket workspace
    run_terraform_command(["terraform", "workspace", "select", "default"])
    run_terraform_command(["terraform", "workspace", "delete", ticket_number])

    print(f"[TERRAFORM] Destroy complete for {ticket_number}")
    return {"success": True, "ticket_number": ticket_number}
