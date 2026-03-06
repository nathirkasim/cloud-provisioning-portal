from decimal import Decimal

class CostEstimator:
    PRICING = {
        "ec2": {"t2.micro": Decimal("0.0116")},
        "rds": {"db.t2.micro": Decimal("0.017")},
        "ebs": {"gp2": Decimal("0.10")},
        "lambda": {"requests": Decimal("0.20"), "duration": Decimal("0.0000166667")}
    }
    
    def estimate_cost(self, template_type: str, resources: dict, duration_days: int) -> dict:
        total_cost = Decimal("0")
        breakdown = {}
        hours_per_month = Decimal(str((duration_days / 30) * 730))
        
        if template_type == "web_app":
            if hours_per_month <= 750:
                ec2_cost = Decimal("0")
                breakdown["ec2"] = {"cost": 0, "note": "Free Tier"}
            else:
                billable_hours = hours_per_month - 750
                ec2_cost = billable_hours * self.PRICING["ec2"]["t2.micro"]
                breakdown["ec2"] = {"cost": float(ec2_cost)}
            total_cost += ec2_cost
            
            storage_gb = resources.get("storage_gb", 20)
            if storage_gb <= 30:
                breakdown["ebs"] = {"cost": 0, "note": "Free Tier"}
            else:
                storage_cost = (storage_gb - 30) * self.PRICING["ebs"]["gp2"]
                breakdown["ebs"] = {"cost": float(storage_cost)}
                total_cost += storage_cost
        
        elif template_type == "database":
            if hours_per_month <= 750:
                breakdown["rds"] = {"cost": 0, "note": "Free Tier"}
            else:
                rds_cost = (hours_per_month - 750) * self.PRICING["rds"]["db.t2.micro"]
                breakdown["rds"] = {"cost": float(rds_cost)}
                total_cost += rds_cost
            
            storage_gb = resources.get("storage_gb", 20)
            storage_cost = storage_gb * self.PRICING["ebs"]["gp2"]
            breakdown["rds_storage"] = {"cost": float(storage_cost)}
            total_cost += storage_cost
        
        elif template_type == "serverless":
            requests = resources.get("requests", 100000)
            if requests <= 1000000:
                breakdown["lambda"] = {"cost": 0, "note": "Free Tier"}
            else:
                lambda_cost = ((requests - 1000000) / 1000000) * self.PRICING["lambda"]["requests"]
                breakdown["lambda"] = {"cost": float(lambda_cost)}
                total_cost += lambda_cost
        
        total_cost *= Decimal("1.10")
        
        return {
            "estimated_monthly_cost": round(total_cost, 2),
            "estimated_total_cost": round(total_cost * Decimal(str(duration_days / 30)), 2),
            "breakdown": breakdown,
            "duration_days": duration_days,
            "free_tier_eligible": total_cost == 0
        }
