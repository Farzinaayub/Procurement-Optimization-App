from pulp import LpProblem, LpMinimize, LpVariable, LpStatus, value


def optimize_procurement(
    demand_x=100,
    demand_y=80,
    supplier_a_capacity=40,
    supplier_b_capacity=180,
    max_average_delivery=3.5,
    x_cost_a=10,
    x_cost_b=15,
    y_cost_a=12,
    y_cost_b=10,
    shipping_a=300,
    shipping_b=100,
    delivery_a=5,
    delivery_b=2,
):
    # Total demand
    total_demand = demand_x + demand_y

    # Model
    model = LpProblem("Procurement_Optimisation", LpMinimize)

    # Decision variables
    X_A = LpVariable("X_from_A", lowBound=0, cat="Integer")
    X_B = LpVariable("X_from_B", lowBound=0, cat="Integer")

    Y_A = LpVariable("Y_from_A", lowBound=0, cat="Integer")
    Y_B = LpVariable("Y_from_B", lowBound=0, cat="Integer")

    # Supplier activation variables
    S_A = LpVariable("Shipping_A", cat="Binary")
    S_B = LpVariable("Shipping_B", cat="Binary")

    # Objective
    model += (
        x_cost_a * X_A
        + x_cost_b * X_B
        + y_cost_a * Y_A
        + y_cost_b * Y_B
        + shipping_a * S_A
        + shipping_b * S_B
    ), "Total_Cost"

    # Demand constraints
    model += X_A + X_B == demand_x, "X_Demand"
    model += Y_A + Y_B == demand_y, "Y_Demand"

    # Supplier capacity constraints + activation
    model += X_A + Y_A <= supplier_a_capacity * S_A, "Capacity_A"
    model += X_B + Y_B <= supplier_b_capacity * S_B, "Capacity_B"

    # Average delivery time constraint
    model += (
        delivery_a * (X_A + Y_A) + delivery_b * (X_B + Y_B)
        <= max_average_delivery * total_demand
    ), "Average_Delivery"

    # Solve
    model.solve()

    status = LpStatus[model.status]

    # If infeasible or otherwise not optimal
    if status != "Optimal":
        return {"status": status, "message": "No feasible optimal solution was found."}

    # Extract allocation
    allocation_a = X_A.value() + Y_A.value()
    allocation_b = X_B.value() + Y_B.value()

    # Calculate metrics
    purchase_cost = (
        x_cost_a * X_A.value()
        + x_cost_b * X_B.value()
        + y_cost_a * Y_A.value()
        + y_cost_b * Y_B.value()
    )

    shipping_cost = shipping_a * S_A.value() + shipping_b * S_B.value()

    total_cost = value(model.objective)

    average_delivery = (
        delivery_a * allocation_a + delivery_b * allocation_b
    ) / total_demand

    return {
        "status": status,
        "allocation": {
            "supplier_a": {"x": X_A.value(), "y": Y_A.value(), "total": allocation_a},
            "supplier_b": {"x": X_B.value(), "y": Y_B.value(), "total": allocation_b},
        },
        "cost": {
            "purchase": purchase_cost,
            "shipping": shipping_cost,
            "total": total_cost,
        },
        "delivery": {
            "average_days": average_delivery,
            "maximum_allowed_days": max_average_delivery,
        },
        "supplier_usage": {"supplier_a": S_A.value(), "supplier_b": S_B.value()},
    }
