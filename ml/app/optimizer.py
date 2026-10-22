"""Carbon-budget optimizer: cheapest shipping mix that meets demand within a CO2 budget (PuLP LP)."""
from typing import Dict, List, Optional

import pulp


def _solve(demands, options, capacities, budget, objective: str):
    prob = pulp.LpProblem("ecotrace_plan", pulp.LpMinimize)
    x = {o["id"]: pulp.LpVariable(f"x_{o['id']}", lowBound=0) for o in options}
    key = "cost_per_kg" if objective == "cost" else "co2_per_kg"
    prob += pulp.lpSum(o[key] * x[o["id"]] for o in options)
    for d_idx, d in enumerate(demands):
        prob += pulp.lpSum(x[o["id"]] for o in options if o["demand"] == d_idx) == d["weight_kg"], f"demand_{d_idx}"
    for src, cap in capacities.items():
        prob += pulp.lpSum(x[o["id"]] for o in options if o["source"] == src) <= cap, f"capacity_{src}"
    if budget is not None:
        prob += pulp.lpSum(o["co2_per_kg"] * x[o["id"]] for o in options) <= budget, "co2_budget"
    prob.solve(pulp.PULP_CBC_CMD(msg=False))
    return prob, x


def optimize(demands: List[Dict], options: List[Dict], capacities: Dict[str, float], co2_budget_kg: Optional[float]) -> Dict:
    prob, x = _solve(demands, options, capacities, co2_budget_kg, "cost")
    status = pulp.LpStatus[prob.status]
    if status != "Optimal":
        # Tell the user the lowest CO2 any feasible plan can reach.
        p2, _ = _solve(demands, options, capacities, None, "co2")
        min_co2 = pulp.value(p2.objective) if pulp.LpStatus[p2.status] == "Optimal" else None
        return {
            "status": "infeasible",
            "message": (
                f"No plan meets demand within {co2_budget_kg:,.0f} kg CO2e. The lowest possible is about {min_co2:,.0f} kg."
                if min_co2 is not None else "Demand cannot be met with the available vendor capacity and deadlines."
            ),
            "min_co2_kg": round(min_co2) if min_co2 is not None else None,
            "allocations": [],
        }
    by_id = {o["id"]: o for o in options}
    allocations = [
        {"id": oid, "weight_kg": var.value()}
        for oid, var in x.items() if var.value() and var.value() > 0.5
    ]
    total_co2 = sum(by_id[a["id"]]["co2_per_kg"] * a["weight_kg"] for a in allocations)
    total_cost = sum(by_id[a["id"]]["cost_per_kg"] * a["weight_kg"] for a in allocations)
    budget_dual = prob.constraints.get("co2_budget").pi if co2_budget_kg is not None else None
    return {
        "status": "optimal",
        "solver": "PuLP / CBC (linear programming)",
        "total_cost": round(total_cost),
        "total_co2_kg": round(total_co2),
        "co2_budget_kg": co2_budget_kg,
        # Shadow price: extra cost per extra kg of CO2 cut from the budget.
        "carbon_shadow_price": round(-budget_dual, 2) if budget_dual else 0,
        "allocations": allocations,
    }
