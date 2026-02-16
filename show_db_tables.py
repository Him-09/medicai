"""Display all database tables with their data"""
from medicai.storage.postgres import get_conn
import json

def show_all_tables():
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get all tables
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """)
            tables = cur.fetchall()
            
            print("=" * 100)
            print("DATABASE TABLES OVERVIEW")
            print("=" * 100)
            
            for (table_name,) in tables:
                print(f"\n{'='*100}")
                print(f"📊 TABLE: {table_name.upper()}")
                print(f"{'='*100}")
                
                # Get column info
                cur.execute(f"""
                    SELECT column_name, data_type 
                    FROM information_schema.columns
                    WHERE table_name = '{table_name}'
                    ORDER BY ordinal_position;
                """)
                columns = cur.fetchall()
                col_names = [col[0] for col in columns]
                
                print(f"\nColumns: {', '.join(col_names)}")
                
                # Get row count
                cur.execute(f"SELECT COUNT(*) FROM {table_name}")
                count = cur.fetchone()[0]
                print(f"Row count: {count}")
                
                if count > 0:
                    # Show sample data
                    limit = min(5, count)
                    cur.execute(f"SELECT * FROM {table_name} LIMIT {limit}")
                    rows = cur.fetchall()
                    
                    print(f"\nSample data (showing {limit} of {count} rows):")
                    print("-" * 100)
                    
                    for i, row in enumerate(rows, 1):
                        print(f"\n  Row {i}:")
                        for col_name, value in zip(col_names, row):
                            # Format value based on type
                            if isinstance(value, dict) or isinstance(value, list):
                                value_str = json.dumps(value, indent=2)[:200] + "..." if len(str(value)) > 200 else json.dumps(value, indent=2)
                            elif value is None:
                                value_str = "NULL"
                            elif isinstance(value, str) and len(value) > 100:
                                value_str = value[:100] + "..."
                            else:
                                value_str = str(value)
                            
                            print(f"    {col_name}: {value_str}")
                else:
                    print("\n  (No data)")
            
            print("\n" + "=" * 100)
            print("END OF DATABASE OVERVIEW")
            print("=" * 100)

if __name__ == "__main__":
    show_all_tables()
