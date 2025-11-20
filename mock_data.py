from datetime import datetime, timedelta
import random

# Mock Orders Data
MOCK_ORDERS = {
    "SH123": {
        "id": "SH123",
        "status": "Shipped",
        "customer_name": "Alice Smith",
        "items": "Widget A x2, Widget B x1",
        "total_price": 59.99,
        "shipping_address": "123 Main St, Springfield",
        "created_at": (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d"),
        "tracking_number": "1Z999AA1234567890"
    },
    "SH124": {
        "id": "SH124",
        "status": "Processing",
        "customer_name": "Bob Johnson",
        "items": "Widget C x3",
        "total_price": 39.99,
        "shipping_address": "456 Oak Ave, Metropolis",
        "created_at": (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d"),
        "tracking_number": None
    },
    "SH125": {
        "id": "SH125",
        "status": "Delivered",
        "customer_name": "Carol Lee",
        "items": "Widget D x1, Widget E x2",
        "total_price": 89.99,
        "shipping_address": "789 Pine Rd, Gotham",
        "created_at": (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d"),
        "tracking_number": "1Z999AA1234567891"
    }
}

# Mock Inventory Data
MOCK_INVENTORY = {
    "PROD001": {
        "id": "PROD001",
        "name": "Widget A",
        "quantity": 45,
        "price": 24.99,
        "sku": "WA-001"
    },
    "PROD002": {
        "id": "PROD002",
        "name": "Widget B",
        "quantity": 8,
        "price": 19.99,
        "sku": "WB-002"
    },
    "PROD003": {
        "id": "PROD003",
        "name": "Widget C",
        "quantity": 15,
        "price": 34.99,
        "sku": "WC-003"
    }
}

# Mock Support Tickets
MOCK_TICKETS = {}
ticket_counter = 1000

def generate_ticket_id():
    global ticket_counter
    ticket_counter += 1
    return f"TICK{ticket_counter}"

def create_mock_ticket(email: str, issue: str):
    ticket_id = generate_ticket_id()
    MOCK_TICKETS[ticket_id] = {
        "id": ticket_id,
        "email": email,
        "issue": issue,
        "status": "Open",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    return ticket_id

# Mock Analytics Data
class MockAnalytics:
    def __init__(self):
        self.queries = []
        self.response_times = []
        self.resolutions = []

    def add_interaction(self, query: str, response_time: float, resolved: bool):
        current_time = datetime.now()
        self.queries.append({
            "timestamp": current_time,
            "query": query,
            "response_time": response_time,
            "resolved": resolved
        })

    def get_analytics(self):
        if not self.queries:
            return {
                "total_queries": 0,
                "avg_response_time": 0,
                "resolution_rate": 0,
                "peak_hours": {},
                "common_issues": []
            }

        total_queries = len(self.queries)
        avg_response_time = sum(q["response_time"] for q in self.queries) / total_queries
        resolved_queries = sum(1 for q in self.queries if q["resolved"])
        resolution_rate = (resolved_queries / total_queries) * 100

        # Calculate peak hours
        hour_counts = {}
        for query in self.queries:
            hour = query["timestamp"].hour
            hour_counts[hour] = hour_counts.get(hour, 0) + 1

        # Get common issues (simplified)
        issue_counts = {}
        for query in self.queries:
            issue_counts[query["query"]] = issue_counts.get(query["query"], 0) + 1

        return {
            "total_queries": total_queries,
            "avg_response_time": round(avg_response_time, 2),
            "resolution_rate": round(resolution_rate, 2),
            "peak_hours": dict(sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:5]),
            "common_issues": sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        }

# Initialize mock analytics
mock_analytics = MockAnalytics()
