"""
Test script to demonstrate persistent conversation memory with the medical agent.

This shows how the agent maintains context across multiple calls using the same
consultation_id (thread_id).
"""

import os
from medicai.agent.core_agent import create_medical_agent

# Setup database connection
db_uri = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/medicai"
)

# Create the agent
print("Creating medical agent with persistent memory...")
graph, run = create_medical_agent(db_uri=db_uri)

print("\n" + "="*70)
print("DEMONSTRATING PERSISTENT CONVERSATION MEMORY")
print("="*70)

# Call 1: Store information about the consultation
print("\n📝 Call 1: Setting consultation context")
print("-" * 70)
response1 = run(
    query="Remember that this consultation is about anemia",
    patient_id="p1",
    consultation_id="c123"
)
print(f"Agent: {response1}")

# Call 2: Retrieve the remembered information (same consultation_id)
print("\n🔍 Call 2: Retrieving consultation context")
print("-" * 70)
response2 = run(
    query="What is this consultation about?",
    patient_id="p1",
    consultation_id="c123"
)
print(f"Agent: {response2}")

# Call 3: Different consultation_id should NOT have the memory
print("\n🆕 Call 3: Different consultation (new thread)")
print("-" * 70)
response3 = run(
    query="What is this consultation about?",
    patient_id="p1",
    consultation_id="c456"  # Different consultation_id
)
print(f"Agent: {response3}")

print("\n" + "="*70)
print("✅ Memory Test Complete")
print("="*70)
print("""
Expected behavior:
- Call 1: Agent acknowledges and stores the information
- Call 2: Agent recalls that the consultation is about anemia
- Call 3: Agent doesn't have memory (different consultation_id)
""")
